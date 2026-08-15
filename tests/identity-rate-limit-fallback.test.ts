import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

// HIGH finding: isLoginLocked used to catch any Redis error and unconditionally return
// `false` (unlimited login attempts for the duration of any Redis outage/restart/blip).
// It must now fall back to counting the durable `login_attempts` trail. Mocking
// '@/platform/redis' here (rather than requiring a real Redis outage) simulates that
// failure deterministically; this file's module graph is isolated from every other test
// file, so it does not affect the Redis-healthy lockout test in identity-login.test.ts.
vi.mock('@/platform/redis', () => ({
  getRedis: () => {
    throw new Error('simulated Redis outage for this test');
  },
}));

import '@/modules/identity/actions/register';
import { loginAttempts } from '@/modules/identity/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';

describe('identity.login rate limiting falls back to login_attempts when Redis is unavailable', () => {
  // No such user needs to exist — the no-enumeration path already runs the full
  // fail-recording flow (recordFailedLogin + recordLoginAttempt) for an unknown email,
  // exactly like a wrong password for a real one.
  const email = 'rate-limit-fallback-test@example.com';

  afterAll(async () => {
    const db = getBootstrapDb();
    const { sha256Hex } = await import('@/modules/identity/service/hash');
    await db.delete(loginAttempts).where(eq(loginAttempts.emailHash, sha256Hex(email)));
  });

  it('still locks out after 5 failed attempts, purely from the durable login_attempts count', async () => {
    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await executeAction('identity.login', { email, password: 'wrong' });
      expect(lastResult.ok).toBe(false);
    }

    const sixthAttempt = await executeAction('identity.login', { email, password: 'wrong' });
    expect(sixthAttempt.ok).toBe(false);
    if (!sixthAttempt.ok && lastResult && !lastResult.ok) {
      expect(sixthAttempt.error.message).not.toBe(lastResult.error.message);
      expect(sixthAttempt.error.message.toLowerCase()).toContain('too many');
    }
  });
});
