import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { employees } from '@/modules/employee/schema';
import { auditLogs } from '@/platform/schema/audit';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { mapColumns } from '@/modules/employee/service/import-columns';
import { testSession } from './helpers/session';

/** Builds the `mapping` a wizard would have the user confirm for a header that resolves
 * entirely deterministically (every fixture/test CSV below uses canonical field names as
 * headers) — mirrors what employee.suggestColumnMapping would hand back unchanged in that
 * case, without needing to mock a model call in this file too. */
function confirmedMapping(header: string[]): { column: string; field: string | null }[] {
  const { fieldByIndex } = mapColumns(header);
  return header.map((column, i) => ({ column, field: fieldByIndex[i] }));
}

function csvRequest(csv: string): { source: { kind: 'csv'; csv: string }; mapping: { column: string; field: string | null }[] } {
  const header = csv.split(/\r?\n/)[0].split(',');
  return { source: { kind: 'csv', csv }, mapping: confirmedMapping(header) };
}

function base64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

describe('employee import (CSV/xlsx/attachment) and bulk upsert', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;
  let hrSession: ReturnType<typeof testSession>;
  let employeeSession: ReturnType<typeof testSession>;

  async function countEmployees(): Promise<number> {
    const db = getBootstrapDb();
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.companyId, companyId)));
    return rows.length;
  }

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Employee Import Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Employee Import Test Co', legalName: 'Employee Import Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('importPreview validates rows, classifies CREATE vs UPDATE, and writes nothing', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'IMP-EXIST', firstName: 'Existing', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);

    const before = await countEmployees();

    const csv =
      'employeeNo,firstName,lastName,hireDate\n' +
      'IMP-NEW,New,Hire,2025-02-02\n' +
      'IMP-EXIST,Existing,Updated,2025-01-01\n' +
      'IMP-BAD,,Missing First Name,2025-01-01\n';

    const preview = await executeAction('employee.importPreview', csvRequest(csv), { session: hrSession });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const data = preview.data as {
      rows: { rowNumber: number; employeeNo: string | null; operation: string; errors: string[] }[];
      summary: { toCreate: number; toUpdate: number; withErrors: number };
    };
    expect(data.summary).toEqual({ toCreate: 1, toUpdate: 1, withErrors: 1 });
    expect(data.rows.find((r) => r.employeeNo === 'IMP-NEW')?.operation).toBe('CREATE');
    expect(data.rows.find((r) => r.employeeNo === 'IMP-EXIST')?.operation).toBe('UPDATE');
    expect(data.rows.find((r) => r.employeeNo === 'IMP-BAD')?.operation).toBe('ERROR');

    const after = await countEmployees();
    expect(after).toBe(before);
  });

  it('importPreview ignores a column the confirmed mapping leaves unmapped (field: null), and errors when no column maps to employeeNo', async () => {
    const withUnmappedColumn = await executeAction(
      'employee.importPreview',
      {
        source: { kind: 'csv', csv: 'employeeNo,firstName,lastName,hireDate,Favorite Color\nIMP-COL1,A,B,2025-01-01,blue\n' },
        mapping: [
          { column: 'employeeNo', field: 'employeeNo' },
          { column: 'firstName', field: 'firstName' },
          { column: 'lastName', field: 'lastName' },
          { column: 'hireDate', field: 'hireDate' },
          { column: 'Favorite Color', field: null },
        ],
      },
      { session: hrSession },
    );
    expect(withUnmappedColumn.ok).toBe(true);
    if (withUnmappedColumn.ok) {
      const data = withUnmappedColumn.data as { rows: { operation: string }[] };
      expect(data.rows[0]?.operation).toBe('CREATE');
    }

    const withoutEmployeeNo = await executeAction(
      'employee.importPreview',
      {
        source: { kind: 'csv', csv: 'firstName,lastName,hireDate\nA,B,2025-01-01\n' },
        mapping: [
          { column: 'firstName', field: 'firstName' },
          { column: 'lastName', field: 'lastName' },
          { column: 'hireDate', field: 'hireDate' },
        ],
      },
      { session: hrSession },
    );
    expect(withoutEmployeeNo.ok).toBe(false);
    if (!withoutEmployeeNo.ok) expect(withoutEmployeeNo.error.code).toBe('VALIDATION_ERROR');
  });

  it('importPreview rejects a mapping claiming a field that is not real, even though the shape otherwise looks legitimate', async () => {
    const result = await executeAction(
      'employee.importPreview',
      {
        source: { kind: 'csv', csv: 'employeeNo,pay\nEMP-1,50000\n' },
        mapping: [
          { column: 'employeeNo', field: 'employeeNo' },
          { column: 'pay', field: 'salary' },
        ],
      },
      { session: hrSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('importPreview rejects a mapping whose columns do not match the file actually submitted (stale mapping from a different file)', async () => {
    const result = await executeAction(
      'employee.importPreview',
      {
        source: { kind: 'csv', csv: 'employeeNo,firstName\nEMP-1,A\n' },
        mapping: [
          { column: 'Employee Number', field: 'employeeNo' },
          { column: 'firstName', field: 'firstName' },
        ],
      },
      { session: hrSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('importCommit is all-or-nothing: one bad row in a 3-row file writes zero rows', async () => {
    const before = await countEmployees();

    const csv =
      'employeeNo,firstName,lastName,hireDate\n' +
      'IMP-ATOMIC-1,Good,One,2025-01-01\n' +
      'IMP-ATOMIC-2,Good,Two,2025-01-02\n' +
      'IMP-ATOMIC-3,,Missing First Name,2025-01-03\n';

    const commit = await executeAction('employee.importCommit', csvRequest(csv), { session: hrSession });
    expect(commit.ok).toBe(false);
    if (!commit.ok) expect(commit.error.code).toBe('VALIDATION_ERROR');

    const after = await countEmployees();
    expect(after).toBe(before);

    const stillMissing = await executeAction('employee.list', { search: 'IMP-ATOMIC' }, { session: hrSession });
    expect(stillMissing.ok).toBe(true);
    if (stillMissing.ok) {
      const data = stillMissing.data as { employees: unknown[] };
      expect(data.employees).toHaveLength(0);
    }
  });

  it('importCommit rejects a duplicate employeeNo within the same file, on the later row', async () => {
    const csv =
      'employeeNo,firstName,lastName,hireDate\n' +
      'IMP-DUP,First,Row,2025-01-01\n' +
      'IMP-DUP,Second,Row,2025-01-02\n';

    const commit = await executeAction('employee.importCommit', csvRequest(csv), { session: hrSession });
    expect(commit.ok).toBe(false);
    if (!commit.ok) expect(commit.error.code).toBe('VALIDATION_ERROR');

    const list = await executeAction('employee.list', { search: 'IMP-DUP' }, { session: hrSession });
    expect(list.ok).toBe(true);
    if (list.ok) expect((list.data as { employees: unknown[] }).employees).toHaveLength(0);
  });

  it('importCommit creates and updates in one transaction, and audits the import', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'IMP-COMMIT-EXIST', firstName: 'Before', lastName: 'Update', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);

    const csv =
      'employeeNo,firstName,lastName,hireDate\n' +
      'IMP-COMMIT-NEW,New,Hire,2025-03-03\n' +
      'IMP-COMMIT-EXIST,After,Update,2025-01-01\n';

    const commit = await executeAction('employee.importCommit', csvRequest(csv), { session: hrSession });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    const result = commit.data as { created: number; updated: number; employeeNumbers: string[] };
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.employeeNumbers.sort()).toEqual(['IMP-COMMIT-EXIST', 'IMP-COMMIT-NEW']);

    const list = await executeAction('employee.list', { search: 'IMP-COMMIT-NEW' }, { session: hrSession });
    expect(list.ok).toBe(true);
    if (list.ok) expect((list.data as { employees: unknown[] }).employees).toHaveLength(1);

    const updated = await executeAction('employee.list', { search: 'IMP-COMMIT-EXIST' }, { session: hrSession });
    expect(updated.ok).toBe(true);

    const db = getBootstrapDb();
    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.actionId, 'employee.importCommit'));
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('an EMPLOYEE role is FORBIDDEN from employee.importPreview/importCommit/bulkUpsert', async () => {
    const csv = 'employeeNo,firstName,lastName,hireDate\nEMP-X,A,B,2025-01-01\n';
    const preview = await executeAction('employee.importPreview', csvRequest(csv), { session: employeeSession });
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.error.code).toBe('FORBIDDEN');

    const commit = await executeAction('employee.importCommit', csvRequest(csv), { session: employeeSession });
    expect(commit.ok).toBe(false);
    if (!commit.ok) expect(commit.error.code).toBe('FORBIDDEN');

    const bulk = await executeAction(
      'employee.bulkUpsert',
      { employees: [{ employeeNo: 'EMP-X', firstName: 'A', lastName: 'B', hireDate: '2025-01-01' }] },
      { session: employeeSession },
    );
    expect(bulk.ok).toBe(false);
    if (!bulk.ok) expect(bulk.error.code).toBe('FORBIDDEN');
  });

  it('importCommit cannot touch another tenant’s employee sharing the same employeeNo', async () => {
    const db = getBootstrapDb();
    const [otherTenant] = await db.insert(tenants).values({ name: 'Employee Import Isolation Tenant', status: 'active' }).returning();
    const [otherCompany] = await db
      .insert(companies)
      .values({ tenantId: otherTenant.id, name: 'Other Co', legalName: 'Other Co Legal' })
      .returning();
    const [otherEmployee] = await db
      .insert(employees)
      .values({
        tenantId: otherTenant.id,
        companyId: otherCompany.id,
        employeeNo: 'IMP-ISO-SHARED',
        firstName: 'Other Tenant',
        lastName: 'Employee',
        hireDate: '2025-01-01',
        status: 'ACTIVE',
      })
      .returning();

    try {
      const csv = 'employeeNo,firstName,lastName,hireDate\nIMP-ISO-SHARED,My Tenant,Employee,2025-01-01\n';
      const commit = await executeAction('employee.importCommit', csvRequest(csv), { session: hrSession });
      // Same employeeNo, but a different tenant+company: must be treated as CREATE (no
      // existing row visible), never as an update of the other tenant's row.
      expect(commit.ok).toBe(true);
      if (!commit.ok) return;
      expect((commit.data as { created: number }).created).toBe(1);

      const [reloadedOther] = await db.select().from(employees).where(eq(employees.id, otherEmployee.id)).limit(1);
      expect(reloadedOther?.firstName).toBe('Other Tenant');

      const mine = await executeAction('employee.list', { search: 'IMP-ISO-SHARED' }, { session: hrSession });
      expect(mine.ok).toBe(true);
      if (mine.ok) {
        const data = mine.data as { employees: { firstName: string }[] };
        expect(data.employees).toHaveLength(1);
        expect(data.employees[0]?.firstName).toBe('My Tenant');
      }
    } finally {
      await db.delete(employees).where(eq(employees.tenantId, otherTenant.id));
      await db.delete(companies).where(eq(companies.tenantId, otherTenant.id));
      await db.delete(tenants).where(eq(tenants.id, otherTenant.id));
    }
  });

  it('importPreview/importCommit accept an .xlsx source, resolving the same as the equivalent CSV', async () => {
    const buffer = readFileSync(join(process.cwd(), 'docs/samples/employees-clean.xlsx'));
    const header = [
      'employeeNo',
      'firstName',
      'middleName',
      'lastName',
      'hireDate',
      'sex',
      'civilStatus',
      'mobile',
      'emailPersonal',
      'biometricId',
    ];

    const preview = await executeAction(
      'employee.importPreview',
      { source: { kind: 'xlsx', contentBase64: buffer.toString('base64'), sheet: 'Employees' }, mapping: confirmedMapping(header) },
      { session: hrSession },
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const data = preview.data as { summary: { toCreate: number; toUpdate: number; withErrors: number } };
    expect(data.summary).toEqual({ toCreate: 5, toUpdate: 0, withErrors: 0 });

    const commit = await executeAction(
      'employee.importCommit',
      { source: { kind: 'xlsx', contentBase64: buffer.toString('base64') }, mapping: confirmedMapping(header) },
      { session: hrSession },
    );
    expect(commit.ok).toBe(true);
    if (commit.ok) expect((commit.data as { created: number }).created).toBe(5);
  });

  it('importPreview reports an unknown sheet name for an .xlsx source', async () => {
    const buffer = readFileSync(join(process.cwd(), 'docs/samples/employees-clean.xlsx'));
    const result = await executeAction(
      'employee.importPreview',
      {
        source: { kind: 'xlsx', contentBase64: buffer.toString('base64'), sheet: 'DoesNotExist' },
        mapping: [{ column: 'employeeNo', field: 'employeeNo' }],
      },
      { session: hrSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('importPreview accepts a staged chat attachment as the source', async () => {
    const csv = 'employeeNo,firstName,lastName,hireDate\nIMP-ATT-1,New,Hire,2025-05-05\n';
    const staged = await executeAction(
      'ai.createAttachment',
      { filename: 'roster.csv', contentBase64: base64(csv) },
      { session: hrSession },
    );
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    const attachmentId = (staged.data as { id: string }).id;

    const preview = await executeAction(
      'employee.importPreview',
      { source: { kind: 'attachment', attachmentId }, mapping: confirmedMapping(csv.split('\n')[0].split(',')) },
      { session: hrSession },
    );
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      const data = preview.data as { summary: { toCreate: number } };
      expect(data.summary.toCreate).toBe(1);
    }
  });

  it('importPreview over docs/samples/employees-messy.csv reports the exact defect for each row and writes nothing', async () => {
    const csv = readFileSync(join(process.cwd(), 'docs/samples/employees-messy.csv'), 'utf8');
    const before = await countEmployees();

    // Non-canonical headers on purpose (README.md alongside the fixture) — this is the
    // client-confirmed mapping a wizard user would produce after the mapping step, not
    // something mapColumns resolves on its own.
    const mapping = [
      { column: 'Emp No.', field: 'employeeNo' },
      { column: 'Given Name', field: 'firstName' },
      { column: 'Middle', field: 'middleName' },
      { column: 'Surname', field: 'lastName' },
      { column: 'Date Hired', field: 'hireDate' },
      { column: 'Gender', field: 'sex' },
      { column: 'Status', field: 'civilStatus' },
      { column: 'Contact No', field: 'mobile' },
      { column: 'E-mail', field: 'emailPersonal' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ];

    const preview = await executeAction('employee.importPreview', { source: { kind: 'csv', csv }, mapping }, { session: hrSession });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const data = preview.data as {
      rows: { rowNumber: number; employeeNo: string | null; operation: string; errors: string[] }[];
    };

    const byRow = new Map(data.rows.map((row) => [row.rowNumber, row]));

    // Row 2: EMP-3001, entirely valid.
    expect(byRow.get(2)?.operation).toBe('CREATE');
    expect(byRow.get(2)?.errors).toEqual([]);

    // Row 3: EMP-3002, missing first name.
    expect(byRow.get(3)?.operation).toBe('ERROR');
    expect(byRow.get(3)?.errors.some((e) => e.includes('firstName'))).toBe(true);

    // Row 4: EMP-3003, hireDate "15/07/2025" — not ISO, never silently reinterpreted.
    expect(byRow.get(4)?.operation).toBe('ERROR');
    expect(byRow.get(4)?.errors.some((e) => e.includes('hireDate'))).toBe(true);

    // Row 5: EMP-3001 again — duplicate employeeNo within the file, flagged on the later row.
    expect(byRow.get(5)?.operation).toBe('ERROR');
    expect(byRow.get(5)?.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);

    // Row 6: EMP-3005 — blank hireDate and a malformed email, both reported; the
    // biometricId collision with row 2 is a DB-level constraint this dry-run preview
    // never reaches (nothing is written), so it is not expected among this row's errors.
    expect(byRow.get(6)?.operation).toBe('ERROR');
    expect(byRow.get(6)?.errors.some((e) => e.includes('hireDate'))).toBe(true);
    expect(byRow.get(6)?.errors.some((e) => e.includes('emailPersonal'))).toBe(true);

    // All-or-nothing: a preview of a file with any bad row must write nothing at all.
    const after = await countEmployees();
    expect(after).toBe(before);
  });

  it('importCommit over docs/samples/employees-messy.csv fails atomically, and over employees-clean.csv succeeds', async () => {
    const messyCsv = readFileSync(join(process.cwd(), 'docs/samples/employees-messy.csv'), 'utf8');
    const messyMapping = [
      { column: 'Emp No.', field: 'employeeNo' },
      { column: 'Given Name', field: 'firstName' },
      { column: 'Middle', field: 'middleName' },
      { column: 'Surname', field: 'lastName' },
      { column: 'Date Hired', field: 'hireDate' },
      { column: 'Gender', field: 'sex' },
      { column: 'Status', field: 'civilStatus' },
      { column: 'Contact No', field: 'mobile' },
      { column: 'E-mail', field: 'emailPersonal' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ];

    const before = await countEmployees();
    const messyCommit = await executeAction(
      'employee.importCommit',
      { source: { kind: 'csv', csv: messyCsv }, mapping: messyMapping },
      { session: hrSession },
    );
    expect(messyCommit.ok).toBe(false);
    if (!messyCommit.ok) expect(messyCommit.error.code).toBe('VALIDATION_ERROR');
    expect(await countEmployees()).toBe(before);

    const cleanCsv = readFileSync(join(process.cwd(), 'docs/samples/employees-clean.csv'), 'utf8');
    const cleanCommit = await executeAction('employee.importCommit', csvRequest(cleanCsv), { session: hrSession });
    expect(cleanCommit.ok).toBe(true);
    // The earlier .xlsx-source test in this file already committed these same
    // EMP-2001..EMP-2005 rows once, so a second run against the identical .csv twin
    // updates rather than creates them — either way, all 5 rows resolve cleanly.
    if (cleanCommit.ok) {
      const result = cleanCommit.data as { created: number; updated: number };
      expect(result.created + result.updated).toBe(5);
    }
  });

  it('bulkUpsert creates/updates in one all-or-nothing batch, is confirmation-previewable, and is audited', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'BULK-EXIST', firstName: 'Before', lastName: 'Bulk', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);

    const bulk = await executeAction(
      'employee.bulkUpsert',
      {
        employees: [
          { employeeNo: 'BULK-NEW', firstName: 'New', lastName: 'Bulk', hireDate: '2025-04-04' },
          { employeeNo: 'BULK-EXIST', firstName: 'After', lastName: 'Bulk', hireDate: '2025-01-01' },
        ],
      },
      { session: adminSession },
    );
    expect(bulk.ok).toBe(true);
    if (!bulk.ok) return;
    const result = bulk.data as { created: number; updated: number; employeeNumbers: string[] };
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);

    const db = getBootstrapDb();
    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.actionId, 'employee.bulkUpsert'));
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('bulkUpsert rejects a duplicate employeeNo within the batch and writes nothing for that call', async () => {
    const before = await countEmployees();

    const bulk = await executeAction(
      'employee.bulkUpsert',
      {
        employees: [
          { employeeNo: 'BULK-DUP', firstName: 'First', lastName: 'Row', hireDate: '2025-01-01' },
          { employeeNo: 'BULK-DUP', firstName: 'Second', lastName: 'Row', hireDate: '2025-01-02' },
        ],
      },
      { session: adminSession },
    );
    expect(bulk.ok).toBe(false);
    if (!bulk.ok) expect(bulk.error.code).toBe('VALIDATION_ERROR');

    const after = await countEmployees();
    expect(after).toBe(before);
  });

  it('bulkUpsert is capped at 50 items', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      employeeNo: `BULK-CAP-${i}`,
      firstName: 'A',
      lastName: 'B',
      hireDate: '2025-01-01',
    }));
    const bulk = await executeAction('employee.bulkUpsert', { employees: tooMany }, { session: adminSession });
    expect(bulk.ok).toBe(false);
    if (!bulk.ok) expect(bulk.error.code).toBe('VALIDATION_ERROR');
  });
});
