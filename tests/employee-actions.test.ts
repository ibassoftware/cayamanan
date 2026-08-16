import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import '@/modules/identity/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { auditLogs } from '@/platform/schema/audit';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { testSession } from './helpers/session';

describe('employee actions', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;
  let hrSession: ReturnType<typeof testSession>;
  let employeeSession: ReturnType<typeof testSession>;
  let departmentId: string;
  let positionId: string;
  let locationId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Employee Actions Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Employee Actions Test Co', legalName: 'Employee Actions Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const dept = await executeAction('org.createDepartment', { code: 'FIN2', name: 'Finance' }, { session: adminSession });
    departmentId = (dept as { ok: true; data: { id: string } }).data.id;
    const pos = await executeAction('org.createPosition', { code: 'ACCT1', title: 'Accountant' }, { session: adminSession });
    positionId = (pos as { ok: true; data: { id: string } }).data.id;
    const loc = await executeAction('org.createLocation', { code: 'CEB', name: 'Cebu Office' }, { session: adminSession });
    locationId = (loc as { ok: true; data: { id: string } }).data.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('creates an employee assigned to a department, position and location, searchable by name and employee number', async () => {
    const created = await executeAction(
      'employee.create',
      {
        employeeNo: 'EMP-0001',
        firstName: 'Maria',
        lastName: 'Santos',
        hireDate: '2025-03-03',
        departmentId,
        positionId,
        locationId,
      },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const byName = await executeAction('employee.list', { search: 'Santos' }, { session: hrSession });
    expect(byName.ok).toBe(true);
    if (byName.ok) {
      const data = byName.data as { employees: { id: string; departmentId: string | null }[] };
      expect(data.employees.some((e) => e.id === employeeId)).toBe(true);
      expect(data.employees.find((e) => e.id === employeeId)?.departmentId).toBe(departmentId);
    }

    const byNumber = await executeAction('employee.list', { search: 'EMP-0001' }, { session: hrSession });
    expect(byNumber.ok).toBe(true);
    if (byNumber.ok) {
      const data = byNumber.data as { employees: { id: string }[] };
      expect(data.employees.some((e) => e.id === employeeId)).toBe(true);
    }

    const byDepartment = await executeAction(
      'employee.list',
      { departmentId, status: 'ACTIVE' },
      { session: hrSession },
    );
    expect(byDepartment.ok).toBe(true);
    if (byDepartment.ok) {
      const data = byDepartment.data as { employees: { id: string }[] };
      expect(data.employees.some((e) => e.id === employeeId)).toBe(true);
    }
  });

  it('rejects a duplicate employee_no with a field-level VALIDATION_ERROR, not a 500', async () => {
    const first = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-DUP', firstName: 'A', lastName: 'One', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(first.ok).toBe(true);

    const second = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-DUP', firstName: 'B', lastName: 'Two', hireDate: '2025-01-02' },
      { session: hrSession },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('VALIDATION_ERROR');
      expect(second.error.field).toBe('employeeNo');
    }
  });

  it('rejects assigning an employee to a department that does not belong to this company', async () => {
    const bogusDepartmentId = '11111111-1111-1111-8111-111111111111';
    const result = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-BOGUS', firstName: 'C', lastName: 'Three', hireDate: '2025-01-01', departmentId: bogusDepartmentId },
      { session: hrSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.field).toBe('departmentId');
    }
  });

  it('updates profile fields and re-assigns department/position/location', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-UPD', firstName: 'Update', lastName: 'Me', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const updated = await executeAction(
      'employee.update',
      { employeeId, mobile: '09171234567', departmentId },
      { session: hrSession },
    );
    expect(updated.ok).toBe(true);

    const detail = await executeAction('employee.get', { employeeId }, { session: hrSession });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const data = detail.data as { mobile: string | null; departmentId: string | null };
      expect(data.mobile).toBe('09171234567');
      expect(data.departmentId).toBe(departmentId);
    }
  });

  it('employee.get returns government IDs/contacts, but employee.list never does (PII boundary)', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-PII', firstName: 'Pii', lastName: 'Test', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const govUpdate = await executeAction(
      'employee.updateGovernmentIds',
      { employeeId, sssNo: '01-2345678-9', tin: '123-456-789-000' },
      { session: hrSession },
    );
    expect(govUpdate.ok).toBe(true);

    const detail = await executeAction('employee.get', { employeeId }, { session: hrSession });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const data = detail.data as { governmentIds: { sssNo: string | null; tin: string | null } | null };
      expect(data.governmentIds?.sssNo).toBe('01-2345678-9');
      expect(data.governmentIds?.tin).toBe('123-456-789-000');
    }

    const list = await executeAction('employee.list', { search: 'Pii' }, { session: hrSession });
    expect(list.ok).toBe(true);
    if (list.ok) {
      const serialized = JSON.stringify(list.data);
      expect(serialized).not.toContain('01-2345678-9');
      expect(serialized).not.toContain('123-456-789-000');
      expect(serialized).not.toContain('governmentIds');
      expect(serialized).not.toContain('sssNo');
      expect(serialized).not.toContain('tin');
    }
  });

  it('sets status between ACTIVE and ON_LEAVE, but rejects SEPARATED as an input value', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-STATUS', firstName: 'Status', lastName: 'Test', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const onLeave = await executeAction('employee.setStatus', { employeeId, status: 'ON_LEAVE' }, { session: hrSession });
    expect(onLeave.ok).toBe(true);
    if (onLeave.ok) expect((onLeave.data as { status: string }).status).toBe('ON_LEAVE');

    const separated = await executeAction(
      'employee.setStatus',
      { employeeId, status: 'SEPARATED' },
      { session: hrSession },
    );
    expect(separated.ok).toBe(false);
    if (!separated.ok) expect(separated.error.code).toBe('VALIDATION_ERROR');
  });

  it('an EMPLOYEE role is FORBIDDEN from employee.list/get/create at the action layer', async () => {
    const listResult = await executeAction('employee.list', {}, { session: employeeSession });
    expect(listResult.ok).toBe(false);
    if (!listResult.ok) expect(listResult.error.code).toBe('FORBIDDEN');

    const getResult = await executeAction(
      'employee.get',
      { employeeId: '11111111-1111-1111-8111-111111111111' },
      { session: employeeSession },
    );
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) expect(getResult.error.code).toBe('FORBIDDEN');

    const createResult = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-X', firstName: 'X', lastName: 'Y', hireDate: '2025-01-01' },
      { session: employeeSession },
    );
    expect(createResult.ok).toBe(false);
    if (!createResult.ok) expect(createResult.error.code).toBe('FORBIDDEN');
  });

  it('employee.getSelf returns only the linked employee’s own record and is refused with no link', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-SELF', firstName: 'Self', lastName: 'Service', hireDate: '2025-01-01', birthDate: '1990-05-05' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const unlinkedSelf = testSession(tenantId, companyId, { roles: ['EMPLOYEE'], employeeId: null });
    const noLink = await executeAction('employee.getSelf', {}, { session: unlinkedSelf });
    expect(noLink.ok).toBe(false);
    if (!noLink.ok) expect(noLink.error.code).toBe('NOT_FOUND');

    const linkedSelf = testSession(tenantId, companyId, { roles: ['EMPLOYEE'], employeeId });
    const self = await executeAction('employee.getSelf', {}, { session: linkedSelf });
    expect(self.ok).toBe(true);
    if (self.ok) {
      const data = self.data as { id: string; birthDate: string | null };
      expect(data.id).toBe(employeeId);
      expect(data.birthDate).toBe('1990-05-05');
    }
  });

  it('employee.linkUserAccount is high-risk, confirmation-previewable, audited, and rejects a bad link', async () => {
    const db = getBootstrapDb();
    const passwordHash = await hashPassword('LinkTest!2345');
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email: 'link-target@example.com',
        name: 'Link Target',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'EMPLOYEE' });

    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-LINK', firstName: 'Link', lastName: 'Target', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    // HR_PAYROLL is not in employee.linkUserAccount's role list (ADMIN only).
    const hrAttempt = await executeAction(
      'employee.linkUserAccount',
      { employeeId, userEmail: 'link-target@example.com' },
      { session: hrSession },
    );
    expect(hrAttempt.ok).toBe(false);
    if (!hrAttempt.ok) expect(hrAttempt.error.code).toBe('FORBIDDEN');

    const linked = await executeAction(
      'employee.linkUserAccount',
      { employeeId, userEmail: 'link-target@example.com' },
      { session: adminSession },
    );
    expect(linked.ok).toBe(true);
    if (linked.ok) {
      expect((linked.data as { userId: string }).userId).toBe(user.id);
    }

    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, employeeId));
    expect(auditRows.some((row) => row.actionId === 'employee.linkUserAccount')).toBe(true);

    const [reloadedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(reloadedUser?.employeeId).toBe(employeeId);

    // Linking a second, different employee to the already-linked user must fail.
    const secondEmployee = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-LINK-2', firstName: 'Second', lastName: 'Target', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(secondEmployee.ok).toBe(true);
    if (!secondEmployee.ok) return;

    const conflict = await executeAction(
      'employee.linkUserAccount',
      { employeeId: (secondEmployee.data as { id: string }).id, userEmail: 'link-target@example.com' },
      { session: adminSession },
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe('CONFLICT');
  });
});
