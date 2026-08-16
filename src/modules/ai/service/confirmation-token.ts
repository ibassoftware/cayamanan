// Signed, single-use confirmation tokens — the high-risk action confirmation flow
// (03-missy-foundation.md). Deliberately mirrors the session cookie's signed-opaque-id
// pattern (src/modules/identity/service/cookie.ts): the token carries only the
// `ai_confirmations` row id, HMAC-signed so it can't be forged or have its id swapped
// without the server secret. Binding to a *specific input* is a separate check
// (`inputHash`, verified against the caller-resubmitted input at approval time — see
// approveConfirmation in confirmations.ts), not encoded in the token itself.
import { createHmac, timingSafeEqual } from 'node:crypto';

const SEPARATOR = ':';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing required environment variable: SESSION_SECRET');
  }
  return secret;
}

function sign(confirmationId: string): string {
  // Domain-separated from the session cookie's HMAC (src/modules/identity/service/cookie.ts)
  // even though both currently read the same SESSION_SECRET, so a token from one scheme
  // can never be replayed as valid input to the other.
  return createHmac('sha256', requireSecret()).update(`missy-confirmation:${confirmationId}`).digest('base64url');
}

export function signConfirmationToken(confirmationId: string): string {
  return `${confirmationId}${SEPARATOR}${sign(confirmationId)}`;
}

/**
 * Verifies the token's HMAC signature and returns the confirmation id it was issued for,
 * or `null` if the token is missing, malformed, or its signature doesn't match. Constant-
 * time comparison, same as the session cookie's verifySessionCookie.
 */
export function verifyConfirmationToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const separatorIndex = token.lastIndexOf(SEPARATOR);
  if (separatorIndex <= 0) return null;

  const confirmationId = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!UUID_RE.test(confirmationId)) return null;

  const expected = sign(confirmationId);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actual, expectedBuf)) return null;

  return confirmationId;
}
