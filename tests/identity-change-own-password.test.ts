import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/identity/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { resolveSessionFromCookie } from '@/modules/identity/service/session';
import { testSession } from './helpers/session';
import { cleanupTenant } from './helpers/cleanup';

// HIGH finding: a successful self password change is the standard "I think my account
// is compromised" reflex, so it must revoke every *other* live session for that user
// (stolen-session mitigation) while keeping the session/browser the caller just used it
// from still working.
describe('identity.changeOwnPassword revokes other sessions', () => {
  let tenantId: string;
  let companyId: string;
  let userId: string;
  const email = 'change-own-password-test@example.com';
  const currentPassword = 'Correct-Horse-Battery-9';
  const newPassword = 'New-Correct-Horse-10';

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Change Own Password Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Change Own Password Test Co', legalName: 'Change Own Password Test Co Legal' })
      .returning();
    companyId = company.id;

    const passwordHash = await hashPassword(currentPassword);
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email,
        name: 'Change Own Password Test User',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    userId = user.id;
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'EMPLOYEE' });
  });

  afterAll(async () => {
    await cleanupTenant(tenantId);
  });

  async function login(password: string): Promise<string> {
    let cookie: string | null | undefined;
    const result = await executeAction(
      'identity.login',
      { email, password },
      { onSetCookie: (token) => (cookie = token) },
    );
    expect(result.ok).toBe(true);
    if (!cookie) throw new Error('login did not set a cookie');
    return cookie;
  }

  it('revokes a different pre-existing session while the calling session stays valid', async () => {
    // Two independent "browsers" logged in as the same user.
    const otherCookie = await login(currentPassword);
    const currentCookie = await login(currentPassword);

    const otherResolved = await resolveSessionFromCookie(otherCookie);
    const currentResolved = await resolveSessionFromCookie(currentCookie);
    expect(otherResolved).not.toBeNull();
    expect(currentResolved).not.toBeNull();

    const [currentSessionId] = currentCookie.split('.');

    const changeResult = await executeAction(
      'identity.changeOwnPassword',
      { currentPassword, newPassword },
      { session: testSession(tenantId, companyId, { userId, roles: ['EMPLOYEE'], sessionId: currentSessionId }) },
    );
    expect(changeResult.ok).toBe(true);

    // The other (different) session is dead...
    expect(await resolveSessionFromCookie(otherCookie)).toBeNull();
    // ...but the calling session is still alive.
    expect(await resolveSessionFromCookie(currentCookie)).not.toBeNull();
  });
});
