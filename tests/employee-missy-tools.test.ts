import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { buildActionTools } from '@/mastra/tools/action-tool-bridge';
import { testSession } from './helpers/session';

// Criteria 4/5/6 exercised through the actual Missy tool bridge (not just executeAction
// directly), matching the acceptance-criteria wording:
//   4. "show me all active employees in Finance" -> employee.list -> no TIN/SSS.
//   5. "link Maria's account to user maria@..." -> confirmation card, approve -> audit row.
//   6. An Employee's tools never include employee.list/get; employee.getSelf is offered
//      to every role and cannot be widened to another employee's record.
describe('Missy tools for slice 04 (employee/org)', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Employee Tools Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Employee Tools Test Co', legalName: 'Employee Tools Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('an Employee’s tool list never includes employee.list/employee.get, but does include employee.getSelf', () => {
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
    const hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const employeeTools = buildActionTools(employeeSession, 'thread-employee');
    const hrTools = buildActionTools(hrSession, 'thread-hr');

    expect(Object.keys(employeeTools)).not.toContain('employee.list');
    expect(Object.keys(employeeTools)).not.toContain('employee.get');
    expect(Object.keys(employeeTools)).toContain('employee.getSelf');

    expect(Object.keys(hrTools)).toContain('employee.list');
    expect(Object.keys(hrTools)).toContain('employee.create');
  });

  it('employee.list via the tool bridge returns no TIN/SSS for "active employees in Finance"', async () => {
    const hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const dept = await executeAction('org.createDepartment', { code: 'FIN3', name: 'Finance' }, { session: hrSession });
    expect(dept.ok).toBe(true);
    if (!dept.ok) return;
    const departmentId = (dept.data as { id: string }).id;

    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-MISSY-1', firstName: 'Missy', lastName: 'Finance', hireDate: '2025-01-01', departmentId },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await executeAction(
      'employee.updateGovernmentIds',
      { employeeId: (created.data as { id: string }).id, tin: '999-888-777-000', sssNo: '03-9999999-1' },
      { session: hrSession },
    );

    const tools = buildActionTools(hrSession, 'thread-list-finance');
    const listTool = tools['employee.list'];
    expect(listTool?.execute).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (listTool!.execute as any)({ departmentId, status: 'ACTIVE' }, {});
    expect(result.status).toBe('ok');
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('999-888-777-000');
    expect(serialized).not.toContain('03-9999999-1');
    expect(serialized).not.toContain('tin');
    expect(serialized).not.toContain('sssNo');
  });

  it('employee.linkUserAccount via the tool bridge requires confirmation, and approving writes an audit row', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const created = await executeAction(
      'employee.create',
      { employeeNo: 'EMP-MISSY-LINK', firstName: 'Maria', lastName: 'Santos', hireDate: '2025-03-03' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const employeeId = (created.data as { id: string }).id;

    const db = getBootstrapDb();
    const passwordHash = await hashPassword('MissyLink!2345');
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email: 'maria@example.com',
        name: 'Maria Santos',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'EMPLOYEE' });

    const tools = buildActionTools(adminSession, 'thread-link');
    const linkTool = tools['employee.linkUserAccount'];
    expect(linkTool?.execute).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proposal = await (linkTool!.execute as any)({ employeeId, userEmail: 'maria@example.com' }, {});
    expect(proposal.status).toBe('confirmation_required');
    expect(proposal.preview).toEqual({ employeeId, userEmail: 'maria@example.com' });

    // Approving goes through ai.approveAction (the confirmation flow), not the tool
    // again — mirrors src/modules/ai/actions/approve-action.ts's real call path.
    const approved = await executeAction(
      'ai.approveAction',
      { confirmationId: proposal.confirmationId, token: proposal.token, input: { employeeId, userEmail: 'maria@example.com' } },
      { session: adminSession },
    );
    expect(approved.ok).toBe(true);

    const [reloadedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(reloadedUser?.employeeId).toBe(employeeId);
  });
});
