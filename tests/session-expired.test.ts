import { describe, expect, it } from 'vitest';

import { isSessionExpired } from '@/lib/session-expired';

// Pure UI-logic test for the "session-expired interception" state
// (docs/plan/02-identity-auth.md UI screens table, "Global" row). The important case
// this guards against: identity.changeOwnPassword also returns UNAUTHORIZED for a wrong
// *current* password (a domain error, not a session problem) — the two must not be
// confused, or a mistyped current password would incorrectly bounce someone to /login.
describe('isSessionExpired', () => {
  it('is true for the generic "no session" message every action shares', () => {
    const result = {
      ok: false as const,
      error: { code: 'UNAUTHORIZED' as const, message: 'Authentication is required to perform this action.' },
    };
    expect(isSessionExpired(result)).toBe(true);
  });

  it('is false for identity.changeOwnPassword\'s "current password is incorrect", despite the same code', () => {
    const result = {
      ok: false as const,
      error: { code: 'UNAUTHORIZED' as const, message: 'Current password is incorrect.' },
    };
    expect(isSessionExpired(result)).toBe(false);
  });

  it('is false for identity.login\'s lockout/invalid-credentials messages', () => {
    expect(
      isSessionExpired({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Incorrect email or password.' },
      }),
    ).toBe(false);
    expect(
      isSessionExpired({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Too many failed attempts. Please try again later.' },
      }),
    ).toBe(false);
  });

  it('is false for any other error code', () => {
    expect(isSessionExpired({ ok: false, error: { code: 'FORBIDDEN', message: 'nope' } })).toBe(false);
  });

  it('is false for a successful result', () => {
    expect(isSessionExpired({ ok: true, data: {} })).toBe(false);
  });
});
