import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/identity/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { sessions, userRoles, users } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { resolveSessionFromCookie } from '@/modules/identity/service/session';
import { testSession } from './helpers/session';
import { cleanupTenant } from './helpers/cleanup';

// 02-identity-auth.md criteria 3 and 6: session revocation takes effect on the next
// request (not just at expiry), and a tampered cookie must invalidate, never escalate.
describe('session resolution', () => {
  let tenantId: string;
  let companyId: string;
  let userId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Session Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Session Test Co', legalName: 'Session Test Co Legal' })
      .returning();
    companyId = company.id;

    const passwordHash = await hashPassword('whatever-the-password-is-1');
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email: 'session-test-user@example.com',
        name: 'Session Test User',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .returning();
    userId = user.id;
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'ADMIN' });
  });

  afterAll(async () => {
    await cleanupTenant(tenantId);
  });

  async function loginAndGetCookie(): Promise<string> {
    let cookie: string | null | undefined;
    const result = await executeAction(
      'identity.login',
      { email: 'session-test-user@example.com', password: 'whatever-the-password-is-1' },
      { onSetCookie: (token) => (cookie = token) },
    );
    expect(result.ok).toBe(true);
    if (!cookie) throw new Error('login did not set a cookie');
    return cookie;
  }

  it('resolves a fresh, valid cookie to the right session', async () => {
    const cookie = await loginAndGetCookie();
    const resolved = await resolveSessionFromCookie(cookie);
    expect(resolved).not.toBeNull();
    expect(resolved?.userId).toBe(userId);
    expect(resolved?.tenantId).toBe(tenantId);
    expect(resolved?.companyId).toBe(companyId);
    expect(resolved?.roles).toEqual(['ADMIN']);
  });

  it('rejects a cookie with an altered signature (never escalates)', async () => {
    const cookie = await loginAndGetCookie();
    const [sessionId] = cookie.split('.');
    const tampered = `${sessionId}.thisisnotarealsignaturebutlongenoughtolooklikeone`;
    const resolved = await resolveSessionFromCookie(tampered);
    expect(resolved).toBeNull();
  });

  it('rejects a cookie whose session id was swapped for a different (still validly-signed-looking) one', async () => {
    const cookie = await loginAndGetCookie();
    const [, signature] = cookie.split('.');
    const swapped = `00000000-0000-0000-0000-000000000000.${signature}`;
    const resolved = await resolveSessionFromCookie(swapped);
    expect(resolved).toBeNull();
  });

  it('rejects a completely malformed cookie value', async () => {
    expect(await resolveSessionFromCookie('not-a-cookie-at-all')).toBeNull();
    expect(await resolveSessionFromCookie('')).toBeNull();
    expect(await resolveSessionFromCookie(undefined)).toBeNull();
  });

  it('a revoked session is refused on the very next resolution, before expiry', async () => {
    const cookie = await loginAndGetCookie();
    expect(await resolveSessionFromCookie(cookie)).not.toBeNull();

    const [sessionId] = cookie.split('.');
    const db = getBootstrapDb();
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));

    expect(await resolveSessionFromCookie(cookie)).toBeNull();
  });

  it("deactivating a user invalidates that user's live session on the next request", async () => {
    const cookie = await loginAndGetCookie();
    expect(await resolveSessionFromCookie(cookie)).not.toBeNull();

    // A second ADMIN deactivates the session's owner.
    const secondAdminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const deactivateResult = await executeAction(
      'identity.deactivateUser',
      { userId },
      { session: secondAdminSession },
    );
    expect(deactivateResult.ok).toBe(true);

    expect(await resolveSessionFromCookie(cookie)).toBeNull();
  });
});
