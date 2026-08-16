import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { users, userRoles } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { testSession } from './helpers/session';

// Proves the "identify an employee by employeeNo instead of a UUID" fix
// (src/platform/id-or-key.ts, consumed by src/modules/employee/service/employee-selector.ts)
// applies uniformly to every employee.* action that used to take a bare `employeeId`:
// get, update, updateGovernmentIds, setStatus, linkUserAccount. `employeeNo` has no other
// role on any of these actions (immutable after creation — see update-employee.ts), so
// every one of them gets full "both supplied must agree" reconciliation, unlike org's
// update actions where `code` doubles as a mutable field.
describe('employee id-or-employeeNo selector', () => {
  let tenantId: string;
  let companyId: string;
  let hrSession: ReturnType<typeof testSession>;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Employee Id-Or-No Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Employee Id-Or-No Test Co', legalName: 'Employee Id-Or-No Test Co Legal' })
      .returning();
    companyId = company.id;
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('employee.get: by employeeId, by employeeNo, and both together (consistent) all work', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'QA-0001', firstName: 'Maria', lastName: 'Santos', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const byId = await executeAction('employee.get', { employeeId }, { session: hrSession });
    expect(byId.ok).toBe(true);

    const byNo = await executeAction('employee.get', { employeeNo: 'QA-0001' }, { session: hrSession });
    expect(byNo.ok).toBe(true);
    if (byNo.ok) expect((byNo.data as { id: string }).id).toBe(employeeId);

    const both = await executeAction(
      'employee.get',
      { employeeId, employeeNo: 'QA-0001' },
      { session: hrSession },
    );
    expect(both.ok).toBe(true);
    if (both.ok) expect((both.data as { id: string }).id).toBe(employeeId);
  });

  it('employee.get: supplying neither is rejected, and an unknown employeeNo gives a clear NOT_FOUND', async () => {
    const neither = await executeAction('employee.get', {}, { session: hrSession });
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error.code).toBe('VALIDATION_ERROR');

    const unknown = await executeAction('employee.get', { employeeNo: 'NO-SUCH-NO' }, { session: hrSession });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.code).toBe('NOT_FOUND');
      expect(unknown.error.message).toContain('NO-SUCH-NO');
    }
  });

  it('employee.get: employeeId and employeeNo pointing at two different employees is rejected', async () => {
    const a = await executeAction(
      'employee.create',
      { employeeNo: 'QA-0002', firstName: 'A', lastName: 'One', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    const b = await executeAction(
      'employee.create',
      { employeeNo: 'QA-0003', firstName: 'B', lastName: 'Two', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const result = await executeAction(
      'employee.get',
      { employeeId: (a.data as { id: string }).id, employeeNo: 'QA-0003' },
      { session: hrSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.field).toBe('employeeNo');
    }
  });

  it('employee.update / employee.updateGovernmentIds / employee.setStatus by employeeNo', async () => {
    const created = await executeAction(
      'employee.create',
      { employeeNo: 'QA-0004', firstName: 'Update', lastName: 'Target', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const updated = await executeAction(
      'employee.update',
      { employeeNo: 'QA-0004', mobile: '09171234567' },
      { session: hrSession },
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect((updated.data as { id: string }).id).toBe(employeeId);

    const govIds = await executeAction(
      'employee.updateGovernmentIds',
      { employeeNo: 'QA-0004', sssNo: '01-2345678-9' },
      { session: hrSession },
    );
    expect(govIds.ok).toBe(true);
    if (govIds.ok) expect((govIds.data as { employeeId: string }).employeeId).toBe(employeeId);

    const status = await executeAction(
      'employee.setStatus',
      { employeeNo: 'QA-0004', status: 'ON_LEAVE' },
      { session: hrSession },
    );
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.data).toMatchObject({ id: employeeId, status: 'ON_LEAVE' });

    const detail = await executeAction('employee.get', { employeeNo: 'QA-0004' }, { session: hrSession });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const data = detail.data as { mobile: string | null; status: string; governmentIds: { sssNo: string | null } | null };
      expect(data.mobile).toBe('09171234567');
      expect(data.status).toBe('ON_LEAVE');
      expect(data.governmentIds?.sssNo).toBe('01-2345678-9');
    }
  });

  it('employee.linkUserAccount by employeeNo (high-risk, still audited)', async () => {
    const db = getBootstrapDb();
    const passwordHash = await hashPassword('LinkByNo!2345');
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email: 'link-by-no@example.com',
        name: 'Link By No',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'EMPLOYEE' });

    const created = await executeAction(
      'employee.create',
      { employeeNo: 'QA-0005', firstName: 'Link', lastName: 'ByNo', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const linked = await executeAction(
      'employee.linkUserAccount',
      { employeeNo: 'QA-0005', userEmail: 'link-by-no@example.com' },
      { session: adminSession },
    );
    expect(linked.ok).toBe(true);
    if (linked.ok) expect((linked.data as { employeeId: string }).employeeId).toBe(employeeId);
  });
});
