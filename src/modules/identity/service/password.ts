// Password hashing (argon2, per docs/plan/00-overview.md §6 "Auth" decision) and the
// no-user-enumeration timing defense: verifying against a real hash and verifying
// against a dummy hash must cost the same, so a caller cannot distinguish "no such
// email" from "wrong password" by response time.
import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed/foreign hash string throws rather than returning false — treat it the
    // same as "password did not match" (never surface the parse error to the caller).
    return false;
  }
}

// Computed once (memoized) and reused for every login attempt against an email that
// doesn't resolve to a user, so that path costs the same as verifying a real hash
// instead of returning near-instantly. The literal value is arbitrary and never
// compared against anything real.
let dummyHashPromise: Promise<string> | undefined;

export function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('cayamanan-timing-safety-dummy-password');
  }
  return dummyHashPromise;
}
