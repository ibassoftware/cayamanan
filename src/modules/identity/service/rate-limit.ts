// Login rate limiting (docs/plan/02-identity-auth.md: "Five bad password attempts
// trigger it"). Redis holds the live counter/lockout (fast, TTL-based) and is the
// primary decision path. `login_attempts` (see schema.ts) is the durable trail, written
// independently of Redis — normally just forensics, but also this module's fallback gate:
// if Redis is unreachable, `isLoginLocked` falls back to counting recent failed rows in
// `login_attempts` for the email within the rolling window, so a Redis outage degrades
// the lockout to "coarser and slower" (a DB round trip instead of a cache hit, no exact
// sub-window TTL semantics) rather than removing it. If even that fallback query fails
// (e.g. the database itself is unreachable), this fails *closed* (treated as locked) —
// an auth gate should never end up silently absent.
import { and, count, eq, gte } from 'drizzle-orm';

import { withNoTenantContext } from '@/platform/db';
import { loginAttempts } from '@/modules/identity/schema';
import { getRedis } from '@/platform/redis';

export const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

function keyFor(emailHash: string): string {
  return `identity:login-fail:${emailHash}`;
}

/**
 * Durable-trail fallback for `isLoginLocked` when Redis can't answer: counts failed
 * `login_attempts` rows for this email within the rolling window. Coarser than Redis
 * (no TTL-precise window start, and a success doesn't retroactively clear it), but that
 * only ever makes lockout trigger sooner/stricter, never later/looser.
 */
async function countRecentFailedAttempts(emailHash: string): Promise<number> {
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000);
  const [row] = await withNoTenantContext(async (noTenantDb) =>
    noTenantDb
      .select({ value: count() })
      .from(loginAttempts)
      .where(
        and(eq(loginAttempts.emailHash, emailHash), eq(loginAttempts.success, false), gte(loginAttempts.at, windowStart)),
      ),
  );
  return row ? Number(row.value) : 0;
}

/** True if this email is currently locked out from prior failed attempts. */
export async function isLoginLocked(emailHash: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const raw = await redis.get(keyFor(emailHash));
    return raw !== null && Number(raw) >= MAX_FAILED_ATTEMPTS;
  } catch (error) {
    console.error('[identity] rate-limit check failed, falling back to login_attempts count:', (error as Error).message);
    try {
      const failedCount = await countRecentFailedAttempts(emailHash);
      return failedCount >= MAX_FAILED_ATTEMPTS;
    } catch (fallbackError) {
      console.error(
        '[identity] rate-limit fallback query also failed, failing closed (treating as locked):',
        (fallbackError as Error).message,
      );
      return true;
    }
  }
}

/** Records a failed attempt, starting/renewing a rolling window. */
export async function recordFailedLogin(emailHash: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = keyFor(emailHash);
    const attempts = await redis.incr(key);
    if (attempts === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
  } catch (error) {
    console.error('[identity] rate-limit record failed:', (error as Error).message);
  }
}

/** Clears the failure counter on a successful login. */
export async function clearLoginFailures(emailHash: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(keyFor(emailHash));
  } catch (error) {
    console.error('[identity] rate-limit clear failed:', (error as Error).message);
  }
}
