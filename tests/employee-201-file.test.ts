import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { employeeEducation, employees } from '@/modules/employee/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

// Covers the 201-file additions on top of the slice-04 employee master data: extended
// profile fields (birthPlace/nationality/religion/bloodType/permanentAddress), the widened
// employee_contacts table (DEPENDENT kind + email/address/birthDate/isPrimary), and the
// four new child tables (education, work history, training, requirements checklist).
describe('employee 201-file actions', () => {
  let tenantId: string;
  let companyId: string;
  // HR_PAYROLL is the role these actions are actually written for, and EMPLOYEE proves the
  // denial path — an ADMIN session would only re-cover what hrSession already does here.
  let hrSession: ReturnType<typeof testSession>;
  let employeeSession: ReturnType<typeof testSession>;
  let employeeAId: string;
  let employeeBId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: '201-File Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: '201-File Test Co', legalName: '201-File Test Co Legal' })
      .returning();
    companyId = company.id;
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const empA = await executeAction(
      'employee.create',
      { employeeNo: '201-EMP-A', firstName: 'Alpha', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(empA.ok).toBe(true);
    if (!empA.ok) return;
    employeeAId = (empA.data as { id: string }).id;

    const empB = await executeAction(
      'employee.create',
      { employeeNo: '201-EMP-B', firstName: 'Beta', lastName: 'Employee', hireDate: '2025-01-01' },
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

  it('extends employee.update with the new profile fields and returns them via employee.get', async () => {
    const updated = await executeAction(
      'employee.update',
      {
        employeeId: employeeAId,
        birthPlace: 'Cebu City',
        nationality: 'Filipino',
        religion: 'Roman Catholic',
        bloodType: 'O+',
        permanentAddress: { line1: '123 Provincial Rd' },
      },
      { session: hrSession },
    );
    expect(updated.ok).toBe(true);

    const detail = await executeAction('employee.get', { employeeId: employeeAId }, { session: hrSession });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const data = detail.data as {
        birthPlace: string | null;
        nationality: string | null;
        religion: string | null;
        bloodType: string | null;
        permanentAddress: unknown;
      };
      expect(data.birthPlace).toBe('Cebu City');
      expect(data.nationality).toBe('Filipino');
      expect(data.religion).toBe('Roman Catholic');
      expect(data.bloodType).toBe('O+');
      expect(data.permanentAddress).toEqual({ line1: '123 Provincial Rd' });
    }
  });

  it('round-trips add/update/remove for education, work history, training, contacts and requirements', async () => {
    const education = await executeAction(
      'employee.addEducation',
      { employeeId: employeeAId, level: 'COLLEGE', school: 'University of the Philippines', degree: 'BS Accountancy' },
      { session: hrSession },
    );
    expect(education.ok).toBe(true);
    if (!education.ok) return;
    const educationId = (education.data as { id: string }).id;

    const workHistory = await executeAction(
      'employee.addWorkHistory',
      { employeeId: employeeAId, employer: 'Acme Corp', position: 'Analyst' },
      { session: hrSession },
    );
    expect(workHistory.ok).toBe(true);
    if (!workHistory.ok) return;
    const workHistoryId = (workHistory.data as { id: string }).id;

    const training = await executeAction(
      'employee.addTraining',
      { employeeId: employeeAId, title: 'Basic Occupational Safety', hours: '8.00' },
      { session: hrSession },
    );
    expect(training.ok).toBe(true);
    if (!training.ok) return;
    const trainingId = (training.data as { id: string }).id;

    const contact = await executeAction(
      'employee.addContact',
      { employeeId: employeeAId, kind: 'DEPENDENT', name: 'Junior Employee', relationship: 'Child', birthDate: '2015-06-01' },
      { session: hrSession },
    );
    expect(contact.ok).toBe(true);
    if (!contact.ok) return;
    const contactId = (contact.data as { id: string }).id;

    const requirement = await executeAction(
      'employee.setRequirement',
      { employeeId: employeeAId, requirement: 'NBI Clearance', status: 'PENDING' },
      { session: hrSession },
    );
    expect(requirement.ok).toBe(true);

    const detailAfterAdd = await executeAction('employee.get', { employeeId: employeeAId }, { session: hrSession });
    expect(detailAfterAdd.ok).toBe(true);
    if (detailAfterAdd.ok) {
      const data = detailAfterAdd.data as {
        education: { id: string; school: string }[];
        workHistory: { id: string; employer: string }[];
        training: { id: string; title: string; hours: string | null }[];
        contacts: { id: string; kind: string; name: string }[];
        requirements: { id: string; requirement: string; status: string }[];
      };
      expect(data.education.some((row) => row.id === educationId && row.school === 'University of the Philippines')).toBe(true);
      expect(data.workHistory.some((row) => row.id === workHistoryId && row.employer === 'Acme Corp')).toBe(true);
      expect(data.training.some((row) => row.id === trainingId && row.hours === '8.00')).toBe(true);
      expect(data.contacts.some((row) => row.id === contactId && row.kind === 'DEPENDENT')).toBe(true);
      expect(data.requirements.some((row) => row.requirement === 'NBI Clearance' && row.status === 'PENDING')).toBe(true);
    }

    // Updates
    const eduUpdate = await executeAction(
      'employee.updateEducation',
      { employeeId: employeeAId, id: educationId, honors: 'Cum Laude' },
      { session: hrSession },
    );
    expect(eduUpdate.ok).toBe(true);

    const workUpdate = await executeAction(
      'employee.updateWorkHistory',
      { employeeId: employeeAId, id: workHistoryId, reasonForLeaving: 'Career growth' },
      { session: hrSession },
    );
    expect(workUpdate.ok).toBe(true);

    const trainingUpdate = await executeAction(
      'employee.updateTraining',
      { employeeId: employeeAId, id: trainingId, hours: '16.00' },
      { session: hrSession },
    );
    expect(trainingUpdate.ok).toBe(true);

    const contactUpdate = await executeAction(
      'employee.updateContact',
      { employeeId: employeeAId, id: contactId, isPrimary: true },
      { session: hrSession },
    );
    expect(contactUpdate.ok).toBe(true);

    const requirementUpdate = await executeAction(
      'employee.setRequirement',
      { employeeId: employeeAId, requirement: 'NBI Clearance', status: 'SUBMITTED', submittedOn: '2026-01-15' },
      { session: hrSession },
    );
    expect(requirementUpdate.ok).toBe(true);
    if (requirementUpdate.ok) {
      expect((requirementUpdate.data as { status: string }).status).toBe('SUBMITTED');
    }

    const detailAfterUpdate = await executeAction('employee.get', { employeeId: employeeAId }, { session: hrSession });
    expect(detailAfterUpdate.ok).toBe(true);
    if (detailAfterUpdate.ok) {
      const data = detailAfterUpdate.data as {
        education: { id: string; honors: string | null }[];
        workHistory: { id: string; reasonForLeaving: string | null }[];
        training: { id: string; hours: string | null }[];
        contacts: { id: string; isPrimary: boolean }[];
        requirements: { requirement: string; status: string; submittedOn: string | null }[];
      };
      expect(data.education.find((row) => row.id === educationId)?.honors).toBe('Cum Laude');
      expect(data.workHistory.find((row) => row.id === workHistoryId)?.reasonForLeaving).toBe('Career growth');
      expect(data.training.find((row) => row.id === trainingId)?.hours).toBe('16.00');
      expect(data.contacts.find((row) => row.id === contactId)?.isPrimary).toBe(true);
      expect(data.requirements.find((row) => row.requirement === 'NBI Clearance')?.status).toBe('SUBMITTED');
      expect(data.requirements.find((row) => row.requirement === 'NBI Clearance')?.submittedOn).toBe('2026-01-15');
    }

    // Removes
    const eduRemove = await executeAction('employee.removeEducation', { employeeId: employeeAId, id: educationId }, { session: hrSession });
    expect(eduRemove.ok).toBe(true);
    const workRemove = await executeAction('employee.removeWorkHistory', { employeeId: employeeAId, id: workHistoryId }, { session: hrSession });
    expect(workRemove.ok).toBe(true);
    const trainingRemove = await executeAction('employee.removeTraining', { employeeId: employeeAId, id: trainingId }, { session: hrSession });
    expect(trainingRemove.ok).toBe(true);
    const contactRemove = await executeAction('employee.removeContact', { employeeId: employeeAId, id: contactId }, { session: hrSession });
    expect(contactRemove.ok).toBe(true);
    const requirementRemove = await executeAction(
      'employee.removeRequirement',
      { employeeId: employeeAId, requirement: 'NBI Clearance' },
      { session: hrSession },
    );
    expect(requirementRemove.ok).toBe(true);

    const detailAfterRemove = await executeAction('employee.get', { employeeId: employeeAId }, { session: hrSession });
    expect(detailAfterRemove.ok).toBe(true);
    if (detailAfterRemove.ok) {
      const data = detailAfterRemove.data as {
        education: unknown[];
        workHistory: unknown[];
        training: unknown[];
        contacts: unknown[];
        requirements: unknown[];
      };
      expect(data.education).toHaveLength(0);
      expect(data.workHistory).toHaveLength(0);
      expect(data.training).toHaveLength(0);
      expect(data.contacts).toHaveLength(0);
      expect(data.requirements).toHaveLength(0);
    }
  });

  it('employee.list never returns any 201-file field (PII boundary)', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: '201-EMP-LIST', firstName: 'Listed', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const listedEmployeeId = (created.data as { id: string }).id;

    await executeAction(
      'employee.update',
      { employeeId: listedEmployeeId, birthPlace: 'Davao City', nationality: 'Filipino', bloodType: 'AB-' },
      { session: hrSession },
    );
    await executeAction(
      'employee.addEducation',
      { employeeId: listedEmployeeId, level: 'COLLEGE', school: 'Secret University' },
      { session: hrSession },
    );
    await executeAction(
      'employee.addContact',
      { employeeId: listedEmployeeId, kind: 'EMERGENCY', name: 'Emergency Contact Name', mobile: '09171112222' },
      { session: hrSession },
    );

    const list = await executeAction('employee.list', { search: 'Listed' }, { session: hrSession });
    expect(list.ok).toBe(true);
    if (list.ok) {
      const serialized = JSON.stringify(list.data);
      expect(serialized).not.toContain('Davao City');
      expect(serialized).not.toContain('AB-');
      expect(serialized).not.toContain('Secret University');
      expect(serialized).not.toContain('Emergency Contact Name');
      expect(serialized).not.toContain('09171112222');
      expect(serialized).not.toContain('birthPlace');
      expect(serialized).not.toContain('nationality');
      expect(serialized).not.toContain('bloodType');
      expect(serialized).not.toContain('education');
      expect(serialized).not.toContain('contacts');
      expect(serialized).not.toContain('requirements');
    }
  });

  it('an EMPLOYEE role is FORBIDDEN from every 201-file write action', async () => {
    const attempts: Array<Promise<Awaited<ReturnType<typeof executeAction>>>> = [
      executeAction('employee.addEducation', { employeeId: employeeAId, level: 'COLLEGE', school: 'X' }, { session: employeeSession }),
      executeAction('employee.addWorkHistory', { employeeId: employeeAId, employer: 'X' }, { session: employeeSession }),
      executeAction('employee.addTraining', { employeeId: employeeAId, title: 'X' }, { session: employeeSession }),
      executeAction('employee.addContact', { employeeId: employeeAId, kind: 'EMERGENCY', name: 'X' }, { session: employeeSession }),
      executeAction('employee.setRequirement', { employeeId: employeeAId, requirement: 'X' }, { session: employeeSession }),
    ];
    const results = await Promise.all(attempts);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('update/remove actions refuse a row id belonging to a different employee', async () => {
    const education = await executeAction(
      'employee.addEducation',
      { employeeId: employeeAId, level: 'COLLEGE', school: 'Owned By A' },
      { session: hrSession },
    );
    expect(education.ok).toBe(true);
    if (!education.ok) return;
    const educationId = (education.data as { id: string }).id;

    const crossUpdate = await executeAction(
      'employee.updateEducation',
      { employeeId: employeeBId, id: educationId, school: 'Hijacked' },
      { session: hrSession },
    );
    expect(crossUpdate.ok).toBe(false);
    if (!crossUpdate.ok) expect(crossUpdate.error.code).toBe('NOT_FOUND');

    const crossRemove = await executeAction(
      'employee.removeEducation',
      { employeeId: employeeBId, id: educationId },
      { session: hrSession },
    );
    expect(crossRemove.ok).toBe(false);
    if (!crossRemove.ok) expect(crossRemove.error.code).toBe('NOT_FOUND');

    // The row must be untouched and still belong to employee A.
    const detail = await executeAction('employee.get', { employeeId: employeeAId }, { session: hrSession });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const data = detail.data as { education: { id: string; school: string }[] };
      expect(data.education.find((row) => row.id === educationId)?.school).toBe('Owned By A');
    }
  });
});

describe('employee 201-file cross-tenant isolation', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length === 0) return;
    const db = getBootstrapDb();
    for (const tenantId of createdTenantIds) {
      // Children before parents: employee_education (and every other 201-file child
      // table) FKs to employees with no cascade — see this migration's rollback note.
      await db.delete(employeeEducation).where(eq(employeeEducation.tenantId, tenantId));
      await db.delete(employees).where(eq(employees.tenantId, tenantId));
      await db.delete(companies).where(eq(companies.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it('tenant A cannot read or mutate tenant B’s 201-file rows', async () => {
    const db = getBootstrapDb();

    const [tenantA] = await db.insert(tenants).values({ name: '201-File Iso Test A', status: 'active' }).returning();
    createdTenantIds.push(tenantA.id);
    const [companyA] = await db
      .insert(companies)
      .values({ tenantId: tenantA.id, name: '201-File Iso Test A Co', legalName: '201-File Iso Test A Co Legal' })
      .returning();
    const hrSessionA = testSession(tenantA.id, companyA.id, { roles: ['HR_PAYROLL'] });

    const [tenantB] = await db.insert(tenants).values({ name: '201-File Iso Test B', status: 'active' }).returning();
    createdTenantIds.push(tenantB.id);
    const [companyB] = await db
      .insert(companies)
      .values({ tenantId: tenantB.id, name: '201-File Iso Test B Co', legalName: '201-File Iso Test B Co Legal' })
      .returning();
    const hrSessionB = testSession(tenantB.id, companyB.id, { roles: ['HR_PAYROLL'] });

    const employeeB = await executeAction(
      'employee.create',
      { employeeNo: '201-ISO-B', firstName: 'Iso', lastName: 'B', hireDate: '2025-01-01' },
      { session: hrSessionB },
    );
    expect(employeeB.ok).toBe(true);
    if (!employeeB.ok) return;
    const employeeBId = (employeeB.data as { id: string }).id;

    const educationB = await executeAction(
      'employee.addEducation',
      { employeeId: employeeBId, level: 'COLLEGE', school: 'Tenant B School' },
      { session: hrSessionB },
    );
    expect(educationB.ok).toBe(true);
    if (!educationB.ok) return;
    const educationBId = (educationB.data as { id: string }).id;

    // Tenant A has no employee with this id at all — resolving the employee selector
    // itself must fail before the education row is even looked at.
    const readAttempt = await executeAction(
      'employee.get',
      { employeeId: employeeBId },
      { session: hrSessionA },
    );
    expect(readAttempt.ok).toBe(false);
    if (!readAttempt.ok) expect(readAttempt.error.code).toBe('NOT_FOUND');

    const employeeA = await executeAction(
      'employee.create',
      { employeeNo: '201-ISO-A', firstName: 'Iso', lastName: 'A', hireDate: '2025-01-01' },
      { session: hrSessionA },
    );
    expect(employeeA.ok).toBe(true);
    if (!employeeA.ok) return;
    const employeeAId = (employeeA.data as { id: string }).id;

    // Even naming an in-tenant-A employee, tenant B's row id must not resolve under RLS.
    const updateAttempt = await executeAction(
      'employee.updateEducation',
      { employeeId: employeeAId, id: educationBId, school: 'Hijacked From Tenant A' },
      { session: hrSessionA },
    );
    expect(updateAttempt.ok).toBe(false);
    if (!updateAttempt.ok) expect(updateAttempt.error.code).toBe('NOT_FOUND');

    const removeAttempt = await executeAction(
      'employee.removeEducation',
      { employeeId: employeeAId, id: educationBId },
      { session: hrSessionA },
    );
    expect(removeAttempt.ok).toBe(false);
    if (!removeAttempt.ok) expect(removeAttempt.error.code).toBe('NOT_FOUND');

    // Tenant B still sees its own row, untouched.
    const detailB = await executeAction('employee.get', { employeeId: employeeBId }, { session: hrSessionB });
    expect(detailB.ok).toBe(true);
    if (detailB.ok) {
      const data = detailB.data as { education: { id: string; school: string }[] };
      expect(data.education.find((row) => row.id === educationBId)?.school).toBe('Tenant B School');
    }
  });
});
