import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/identity/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { getRedis } from '@/platform/redis';
import { cleanupTenant } from './helpers/cleanup';

// 02-identity-auth.md criteria 5: no user enumeration (identical error + comparable
// timing for "unknown email" vs "wrong password") and rate limiting after 5 attempts.
describe('identity.login', () => {
  let tenantId: string;
  let companyId: string;
  let userId: string;
  const email = 'login-test-user@example.com';
  const correctPassword = 'Correct-Horse-Battery-9';

  beforeAll(async () => {
    // Defensive: clear any rate-limit lockout a prior interrupted run might have left,
    // so this run starts from a known state.
    const redis = getRedis();
    await redis.del(`identity:login-fail:${await sha256('no-such-user-anywhere@example.com')}`);
    await redis.del(`identity:login-fail:${await sha256(email)}`);
    await redis.del(`identity:login-fail:${await sha256('rate-limit-test@example.com')}`);

    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Login Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Login Test Co', legalName: 'Login Test Co Legal' })
      .returning();
    companyId = company.id;

    const passwordHash = await hashPassword(correctPassword);
    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        companyId,
        email,
        name: 'Login Test User',
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
    // Clear this test's rate-limit keys so a re-run doesn't inherit a prior lockout.
    const redis = getRedis();
    await redis.del(`identity:login-fail:${await sha256('no-such-user-anywhere@example.com')}`);
    await redis.del(`identity:login-fail:${await sha256(email)}`);
    await redis.del(`identity:login-fail:${await sha256('rate-limit-test@example.com')}`);
  });

  async function sha256(value: string): Promise<string> {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  it('succeeds with the correct password, returns roles, and sets a session cookie', async () => {
    let cookie: string | null | undefined;
    const result = await executeAction(
      'identity.login',
      { email, password: correctPassword },
      { onSetCookie: (token) => (cookie = token) },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { user: { id: string; roles: string[] }; mustChangePassword: boolean };
      expect(data.user.id).toBe(userId);
      expect(data.user.roles).toEqual(['EMPLOYEE']);
      expect(data.mustChangePassword).toBe(false);
    }
    expect(cookie).toBeTruthy();
  });

  it('never distinguishes "unknown email" from "wrong password" in the error message', async () => {
    const unknownEmailResult = await executeAction('identity.login', {
      email: 'no-such-user-anywhere@example.com',
      password: 'whatever-password',
    });
    const wrongPasswordResult = await executeAction('identity.login', {
      email,
      password: 'definitely-the-wrong-password',
    });

    expect(unknownEmailResult.ok).toBe(false);
    expect(wrongPasswordResult.ok).toBe(false);
    if (!unknownEmailResult.ok && !wrongPasswordResult.ok) {
      expect(unknownEmailResult.error.code).toBe(wrongPasswordResult.error.code);
      expect(unknownEmailResult.error.message).toBe(wrongPasswordResult.error.message);
    }
  });

  it('takes comparably long for "unknown email" and "wrong password" (dummy-hash timing defense)', async () => {
    async function timeIt(email_: string, password: string): Promise<number> {
      const start = performance.now();
      await executeAction('identity.login', { email: email_, password });
      return performance.now() - start;
    }

    // A validation error (short-circuits before any argon2 call at all) is the "fast"
    // baseline both real login-attempt paths must be much slower than.
    const validationStart = performance.now();
    await executeAction('identity.login', { email: 'not-an-email', password: 'x' });
    const validationDuration = performance.now() - validationStart;

    const unknownEmailDuration = await timeIt('no-such-user-anywhere@example.com', 'whatever-password');
    const wrongPasswordDuration = await timeIt(email, 'definitely-the-wrong-password');

    // Both real attempts run a full argon2 verify (real or dummy hash) and so should be
    // meaningfully slower than a request that never reaches password verification.
    expect(unknownEmailDuration).toBeGreaterThan(validationDuration * 2);
    expect(wrongPasswordDuration).toBeGreaterThan(validationDuration * 2);

    // The two real attempts should cost about the same — neither should be a tiny
    // fraction of the other, which is what an attacker could use to enumerate emails.
    const ratio = Math.min(unknownEmailDuration, wrongPasswordDuration) / Math.max(unknownEmailDuration, wrongPasswordDuration);
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('locks out after 5 failed attempts, with a distinct lockout message', async () => {
    const lockoutEmail = 'rate-limit-test@example.com';
    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await executeAction('identity.login', { email: lockoutEmail, password: 'wrong' });
      expect(lastResult.ok).toBe(false);
    }

    const sixthAttempt = await executeAction('identity.login', { email: lockoutEmail, password: 'wrong' });
    expect(sixthAttempt.ok).toBe(false);
    if (!sixthAttempt.ok && lastResult && !lastResult.ok) {
      // The first 5 attempts got the generic "invalid credentials" message (each one
      // individually still checked, not yet locked); the 6th is refused purely on the
      // lockout, which is allowed to say so distinctly (only "unknown email" vs "wrong
      // password" must be indistinguishable — see the test above).
      expect(sixthAttempt.error.message).not.toBe(lastResult.error.message);
      expect(sixthAttempt.error.message.toLowerCase()).toContain('too many');
    }
  });
});
