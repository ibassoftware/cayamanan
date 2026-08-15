// Signed session cookie — the cookie carries only a session id (a uuid), HMAC-signed so
// tampering with the payload is detectable (docs/plan/02-identity-auth.md: "signed
// httpOnly cookie holding only a session id"). Deliberately plain Node `crypto` (already
// a dependency of everything) rather than adding `jose`/JWT — a signed opaque id is all
// the plan requires, and a JWT would tempt embedding claims (roles, tenant) that would
// then go stale until the JWT expired, defeating "revocation takes effect on the next
// request".
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'cayamanan_session';

const SEPARATOR = '.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing required environment variable: SESSION_SECRET');
  }
  return secret;
}

function sign(sessionId: string): string {
  return createHmac('sha256', requireSecret()).update(sessionId).digest('base64url');
}

/** Builds the raw cookie value to hand to the browser: `${sessionId}.${signature}`. */
export function signSessionCookie(sessionId: string): string {
  return `${sessionId}${SEPARATOR}${sign(sessionId)}`;
}

/**
 * Verifies the cookie's HMAC signature and returns the session id, or `null` if the
 * cookie is missing, malformed, or its signature doesn't match — any of which must be
 * treated as "no session" (never escalate, never partially trust a tampered value).
 * Constant-time comparison so a byte-by-byte signature guess can't be timed out.
 */
export function verifySessionCookie(cookieValue: string | undefined | null): string | null {
  if (!cookieValue) return null;
  const separatorIndex = cookieValue.lastIndexOf(SEPARATOR);
  if (separatorIndex <= 0) return null;

  const sessionId = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  if (!UUID_RE.test(sessionId)) return null;

  const expected = sign(sessionId);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actual, expectedBuf)) return null;

  return sessionId;
}
