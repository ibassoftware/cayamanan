import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/identity/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { auditLogs } from '@/platform/schema/audit';
import { hashPassword } from '@/modules/identity/service/password';
import { testSession } from './helpers/session';
import { cleanupTenant } from './helpers/cleanup';

// 02-identity-auth.md criterion 4: audit_logs has rows for create/role-change/deactivate
// — and none for logging in or viewing the user list.
describe('identity audit coverage', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Identity Audit Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Identity Audit Test Co', legalName: 'Identity Audit Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    await cleanupTenant(tenantId);
  });

  async function auditCountFor(actionId: string) {
    const db = getBootstrapDb();
    const [row] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, actionId)));
    return row?.n ?? 0;
  }

  it('identity.createUser audits exactly once, without leaking the password', async () => {
    const before = await auditCountFor('identity.createUser');
    const result = await executeAction(
      'identity.createUser',
      { email: 'audited-user@example.com', name: 'Audited User', initialPassword: 'Password1234', roles: ['EMPLOYEE'] },
      { session: adminSession },
    );
    expect(result.ok).toBe(true);
    expect(await auditCountFor('identity.createUser')).toBe(before + 1);

    const db = getBootstrapDb();
    const [row] = await db
      .select({ after: auditLogs.after })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, 'identity.createUser')))
      .orderBy(auditLogs.occurredAt)
      .limit(1);
    expect(JSON.stringify(row?.after)).not.toContain('Password1234');
  });

  it('identity.setUserRoles audits exactly once', async () => {
    const db = getBootstrapDb();
    const passwordHash = await hashPassword('some-password-1234');
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email: 'role-change-user@example.com',
        name: 'Role Change User',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'EMPLOYEE' });

    const before = await auditCountFor('identity.setUserRoles');
    const result = await executeAction(
      'identity.setUserRoles',
      { userId: user.id, roles: ['HR_PAYROLL'] },
      { session: adminSession },
    );
    expect(result.ok).toBe(true);
    expect(await auditCountFor('identity.setUserRoles')).toBe(before + 1);
  });

  it('identity.deactivateUser audits exactly once', async () => {
    const db = getBootstrapDb();
    const passwordHash = await hashPassword('some-password-1234');
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email: 'deactivate-user@example.com',
        name: 'Deactivate User',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'EMPLOYEE' });

    const before = await auditCountFor('identity.deactivateUser');
    const result = await executeAction('identity.deactivateUser', { userId: user.id }, { session: adminSession });
    expect(result.ok).toBe(true);
    expect(await auditCountFor('identity.deactivateUser')).toBe(before + 1);
  });

  it('identity.login writes no audit row', async () => {
    const db = getBootstrapDb();
    const passwordHash = await hashPassword('login-audit-password-1');
    await db.insert(users).values({
      tenantId,
      companyId,
      email: 'login-audit-user@example.com',
      name: 'Login Audit User',
      passwordHash,
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    const before = await auditCountFor('identity.login');
    await executeAction('identity.login', {
      email: 'login-audit-user@example.com',
      password: 'login-audit-password-1',
    });
    expect(await auditCountFor('identity.login')).toBe(before);
  });

  it('identity.listUsers writes no audit row', async () => {
    const before = await auditCountFor('identity.listUsers');
    const result = await executeAction('identity.listUsers', {}, { session: adminSession });
    expect(result.ok).toBe(true);
    expect(await auditCountFor('identity.listUsers')).toBe(before);
  });
});
