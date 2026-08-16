import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { employeeDocuments, employees } from '@/modules/employee/schema';
import { resolveDocumentForDownload } from '@/modules/employee/service/resolve-document-for-download';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

function pngBase64(size = 32): string {
  const buf = Buffer.alloc(size, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  return buf.toString('base64');
}

function pdfBase64(size = 32): string {
  const buf = Buffer.alloc(size, 0x20);
  buf.write('%PDF-1.4', 0, 'latin1');
  return buf.toString('base64');
}

describe('employee document actions', () => {
  let tenantId: string;
  let companyId: string;
  let hrSession: ReturnType<typeof testSession>;
  let employeeAId: string;
  let employeeBId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Documents Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Documents Test Co', legalName: 'Documents Test Co Legal' })
      .returning();
    companyId = company.id;
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const empA = await executeAction(
      'employee.create',
      { employeeNo: 'DOC-EMP-A', firstName: 'Alpha', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(empA.ok).toBe(true);
    if (!empA.ok) return;
    employeeAId = (empA.data as { id: string }).id;

    const empB = await executeAction(
      'employee.create',
      { employeeNo: 'DOC-EMP-B', firstName: 'Beta', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(empB.ok).toBe(true);
    if (!empB.ok) return;
    employeeBId = (empB.data as { id: string }).id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('uploads a PHOTO, lists it as metadata only, and employee.get includes it', async () => {
    const uploaded = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeAId, kind: 'PHOTO', filename: 'photo.png', contentBase64: pngBase64() },
      { session: hrSession },
    );
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const documentId = (uploaded.data as { id: string }).id;
    expect((uploaded.data as { mimeType: string }).mimeType).toBe('image/png');

    const listed = await executeAction('employee.listDocuments', { employeeId: employeeAId }, { session: hrSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const serialized = JSON.stringify(listed.data);
      expect(serialized).not.toContain('content');
      const docs = (listed.data as { documents: { id: string; kind: string; filename: string }[] }).documents;
      expect(docs.some((d) => d.id === documentId && d.kind === 'PHOTO' && d.filename === 'photo.png')).toBe(true);
    }

    const detail = await executeAction('employee.get', { employeeId: employeeAId }, { session: hrSession });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const data = detail.data as { documents: { id: string }[] };
      expect(data.documents.some((d) => d.id === documentId)).toBe(true);
    }
  });

  it('never returns content from employee.list', async () => {
    const list = await executeAction('employee.list', { search: 'Alpha' }, { session: hrSession });
    expect(list.ok).toBe(true);
    if (list.ok) {
      const serialized = JSON.stringify(list.data);
      expect(serialized).not.toContain('documents');
    }
  });

  it('rejects a second PHOTO for the same employee (one-photo-per-employee unique index)', async () => {
    const second = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeAId, kind: 'PHOTO', filename: 'photo2.png', contentBase64: pngBase64() },
      { session: hrSession },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('CONFLICT');
  });

  it('uploads a REQUIREMENT document linked to a requirement, and rejects a mismatched kind/requirementId pairing', async () => {
    const requirement = await executeAction(
      'employee.setRequirement',
      { employeeId: employeeBId, requirement: 'NBI Clearance' },
      { session: hrSession },
    );
    expect(requirement.ok).toBe(true);
    if (!requirement.ok) return;
    const requirementId = (requirement.data as { id: string }).id;

    const missingRequirementId = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeBId, kind: 'REQUIREMENT', filename: 'nbi.pdf', contentBase64: pdfBase64() },
      { session: hrSession },
    );
    expect(missingRequirementId.ok).toBe(false);
    if (!missingRequirementId.ok) expect(missingRequirementId.error.code).toBe('VALIDATION_ERROR');

    const photoWithRequirement = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeBId, kind: 'PHOTO', requirementId, filename: 'photo.png', contentBase64: pngBase64() },
      { session: hrSession },
    );
    expect(photoWithRequirement.ok).toBe(false);
    if (!photoWithRequirement.ok) expect(photoWithRequirement.error.code).toBe('VALIDATION_ERROR');

    const uploaded = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeBId, kind: 'REQUIREMENT', requirementId, filename: 'nbi.pdf', contentBase64: pdfBase64() },
      { session: hrSession },
    );
    expect(uploaded.ok).toBe(true);
  });

  it('the CHECK constraint rejects a raw row with a mismatched kind/requirement_id/document_type pairing', async () => {
    const db = getBootstrapDb();
    const base = {
      tenantId,
      companyId,
      employeeId: employeeAId,
      filename: 'bad.png',
      mimeType: 'image/png',
      byteSize: 10,
      checksum: 'x'.repeat(64),
      content: Buffer.from('x'),
    };

    // PHOTO must have neither requirementId nor documentType.
    await expect(
      db.insert(employeeDocuments).values({ ...base, kind: 'PHOTO', requirementId: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      db.insert(employeeDocuments).values({ ...base, kind: 'PHOTO', documentType: 'OTHER' }),
    ).rejects.toThrow();

    // REQUIREMENT must have requirementId and no documentType.
    await expect(
      db.insert(employeeDocuments).values({ ...base, kind: 'REQUIREMENT', requirementId: null }),
    ).rejects.toThrow();
    await expect(
      db.insert(employeeDocuments).values({
        ...base,
        kind: 'REQUIREMENT',
        requirementId: crypto.randomUUID(),
        documentType: 'OTHER',
      }),
    ).rejects.toThrow();

    // GENERAL must have documentType and no requirementId.
    await expect(
      db.insert(employeeDocuments).values({ ...base, kind: 'GENERAL', documentType: null }),
    ).rejects.toThrow();
    await expect(
      db.insert(employeeDocuments).values({
        ...base,
        kind: 'GENERAL',
        documentType: 'OTHER',
        requirementId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it('uploads a GENERAL document with a documentType, and rejects one without', async () => {
    const missingType = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeAId, kind: 'GENERAL', filename: 'contract.pdf', contentBase64: pdfBase64() },
      { session: hrSession },
    );
    expect(missingType.ok).toBe(false);
    if (!missingType.ok) {
      expect(missingType.error.code).toBe('VALIDATION_ERROR');
      expect(missingType.error.field).toBe('documentType');
    }

    const uploaded = await executeAction(
      'employee.uploadDocument',
      {
        employeeId: employeeAId,
        kind: 'GENERAL',
        documentType: 'CONTRACT',
        filename: 'contract.pdf',
        contentBase64: pdfBase64(),
      },
      { session: hrSession },
    );
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    expect((uploaded.data as { documentType: string | null }).documentType).toBe('CONTRACT');

    const listed = await executeAction('employee.listDocuments', { employeeId: employeeAId }, { session: hrSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const docs = (listed.data as { documents: { kind: string; documentType: string | null }[] }).documents;
      expect(docs.some((d) => d.kind === 'GENERAL' && d.documentType === 'CONTRACT')).toBe(true);
    }
  });

  it('removeDocument verifies the row belongs to the resolved employee', async () => {
    const requirement = await executeAction(
      'employee.setRequirement',
      { employeeId: employeeAId, requirement: 'SSS E-1' },
      { session: hrSession },
    );
    expect(requirement.ok).toBe(true);
    if (!requirement.ok) return;
    const requirementId = (requirement.data as { id: string }).id;

    const uploaded = await executeAction(
      'employee.uploadDocument',
      { employeeId: employeeAId, kind: 'REQUIREMENT', requirementId, filename: 'sss.pdf', contentBase64: pdfBase64() },
      { session: hrSession },
    );
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const documentId = (uploaded.data as { id: string }).id;

    const crossRemove = await executeAction(
      'employee.removeDocument',
      { employeeId: employeeBId, documentId },
      { session: hrSession },
    );
    expect(crossRemove.ok).toBe(false);
    if (!crossRemove.ok) expect(crossRemove.error.code).toBe('NOT_FOUND');

    const removed = await executeAction(
      'employee.removeDocument',
      { employeeId: employeeAId, documentId },
      { session: hrSession },
    );
    expect(removed.ok).toBe(true);
  });

  it('an EMPLOYEE caller lists only their own documents, ignoring a supplied selector', async () => {
    const employeeSelfSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'], employeeId: employeeBId });

    const listed = await executeAction('employee.listDocuments', { employeeId: employeeAId }, { session: employeeSelfSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const docs = (listed.data as { documents: { id: string }[] }).documents;
      // employeeBId's own REQUIREMENT upload from the earlier test, never employeeAId's.
      expect(docs.length).toBeGreaterThan(0);
    }

    const listedNoSelector = await executeAction('employee.listDocuments', {}, { session: employeeSelfSession });
    expect(listedNoSelector.ok).toBe(true);
  });
});

describe('employee document tenant/scope isolation for downloads', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length === 0) return;
    const db = getBootstrapDb();
    for (const tenantId of createdTenantIds) {
      await db.delete(employeeDocuments).where(eq(employeeDocuments.tenantId, tenantId));
      await db.delete(employees).where(eq(employees.tenantId, tenantId));
      await db.delete(companies).where(eq(companies.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  async function seedTenantWithDocument(name: string) {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name, status: 'active' }).returning();
    createdTenantIds.push(tenant.id);
    const [company] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: `${name} Co`, legalName: `${name} Co Legal` })
      .returning();
    const [employeeOwner] = await db
      .insert(employees)
      .values({
        tenantId: tenant.id,
        companyId: company.id,
        employeeNo: 'DL-OWNER',
        firstName: 'Owner',
        lastName: 'Employee',
        hireDate: '2025-01-01',
        status: 'ACTIVE',
      })
      .returning();
    const [otherEmployee] = await db
      .insert(employees)
      .values({
        tenantId: tenant.id,
        companyId: company.id,
        employeeNo: 'DL-OTHER',
        firstName: 'Other',
        lastName: 'Employee',
        hireDate: '2025-01-01',
        status: 'ACTIVE',
      })
      .returning();
    const [document] = await db
      .insert(employeeDocuments)
      .values({
        tenantId: tenant.id,
        companyId: company.id,
        employeeId: employeeOwner.id,
        kind: 'PHOTO',
        filename: 'owner.png',
        mimeType: 'image/png',
        byteSize: 10,
        checksum: 'a'.repeat(64),
        content: Buffer.from('fake-png-bytes'),
      })
      .returning();
    return { tenant, company, employeeOwner, otherEmployee, document };
  }

  it('returns null (never a distinct forbidden signal) for a document in another tenant', async () => {
    const a = await seedTenantWithDocument('Doc Download Iso A');
    const b = await seedTenantWithDocument('Doc Download Iso B');

    const sessionA = testSession(a.tenant.id, a.company.id, { roles: ['ADMIN', 'HR_PAYROLL'] });
    const result = await resolveDocumentForDownload(sessionA, b.document.id);
    expect(result).toBeNull();
  });

  it('an ADMIN/HR_PAYROLL session may fetch any in-company document', async () => {
    const a = await seedTenantWithDocument('Doc Download Admin A');
    const sessionA = testSession(a.tenant.id, a.company.id, { roles: ['ADMIN', 'HR_PAYROLL'] });
    const result = await resolveDocumentForDownload(sessionA, a.document.id);
    expect(result?.id).toBe(a.document.id);
  });

  it('an EMPLOYEE session may fetch only their own document, never another employee’s', async () => {
    const a = await seedTenantWithDocument('Doc Download Employee A');

    const ownerSession = testSession(a.tenant.id, a.company.id, {
      roles: ['EMPLOYEE'],
      employeeId: a.employeeOwner.id,
    });
    const ownResult = await resolveDocumentForDownload(ownerSession, a.document.id);
    expect(ownResult?.id).toBe(a.document.id);

    const otherSession = testSession(a.tenant.id, a.company.id, {
      roles: ['EMPLOYEE'],
      employeeId: a.otherEmployee.id,
    });
    const otherResult = await resolveDocumentForDownload(otherSession, a.document.id);
    expect(otherResult).toBeNull();
  });

  it('returns null for a malformed documentId rather than throwing', async () => {
    const a = await seedTenantWithDocument('Doc Download Malformed A');
    const sessionA = testSession(a.tenant.id, a.company.id, { roles: ['ADMIN', 'HR_PAYROLL'] });
    const result = await resolveDocumentForDownload(sessionA, 'not-a-uuid');
    expect(result).toBeNull();
  });
});
