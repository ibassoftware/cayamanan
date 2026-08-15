// One-way hashing for values that must never be stored/logged in the clear but are only
// ever compared for equality (email/IP in login_attempts and sessions) — sha256 is
// sufficient here (unlike password_hash, which must resist offline brute force and uses
// argon2 in password.ts); these are rate-limiting/audit keys, not secrets an attacker
// gains anything from reversing beyond what they already supplied.
import { createHash } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
