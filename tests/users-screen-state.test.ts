import { describe, expect, it } from 'vitest';

import {
  deriveUsersScreenState,
  formatLastLogin,
  validateEmail,
  validateName,
  validatePassword,
  validateRoleSelection,
} from '@/components/settings/users-state';

// Pure UI-logic tests for the admin user management screen
// (src/app/app/(app)/settings/users), mirroring settings-screen-state.test.ts's split for
// the system settings screen. No DOM/component rendering here.
describe('deriveUsersScreenState', () => {
  it('is loading while no result has arrived yet', () => {
    expect(deriveUsersScreenState(null)).toEqual({ status: 'loading' });
  });

  it('maps a FORBIDDEN action error to the no-permission state', () => {
    const state = deriveUsersScreenState({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
    });
    expect(state).toEqual({ status: 'no-permission' });
  });

  it('maps any other action error to the generic error state, preserving the message', () => {
    const state = deriveUsersScreenState({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(state).toEqual({ status: 'error', message: 'Something went wrong. Please try again.' });
  });

  it('is ready with an empty list when there are no users', () => {
    expect(deriveUsersScreenState({ ok: true, data: { users: [] } })).toEqual({ status: 'ready', users: [] });
  });

  it('is ready with the returned users otherwise', () => {
    const users = [
      {
        id: 'u1',
        email: 'a@example.com',
        name: 'Ada',
        status: 'ACTIVE',
        mustChangePassword: false,
        lastLoginAt: null,
        roles: ['ADMIN' as const],
      },
    ];
    expect(deriveUsersScreenState({ ok: true, data: { users } })).toEqual({ status: 'ready', users });
  });
});

describe('validateRoleSelection', () => {
  it('rejects an empty selection', () => {
    expect(validateRoleSelection([])).toEqual({ ok: false, message: 'Select at least one role.' });
  });

  it('accepts one or more roles', () => {
    expect(validateRoleSelection(['ADMIN'])).toEqual({ ok: true, value: ['ADMIN'] });
  });
});

describe('validatePassword', () => {
  it('rejects a password under 8 characters', () => {
    expect(validatePassword('short')).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters.',
    });
  });

  it('accepts an 8+ character password', () => {
    expect(validatePassword('longenough')).toEqual({ ok: true, value: 'longenough' });
  });
});

describe('validateName', () => {
  it('rejects an empty/whitespace-only name', () => {
    expect(validateName('   ')).toEqual({ ok: false, message: 'Enter a name.' });
  });

  it('trims and accepts a real name', () => {
    expect(validateName('  Ada Lovelace  ')).toEqual({ ok: true, value: 'Ada Lovelace' });
  });
});

describe('validateEmail', () => {
  it('rejects a malformed email', () => {
    expect(validateEmail('not-an-email').ok).toBe(false);
  });

  it('accepts a well-formed email', () => {
    expect(validateEmail('person@example.com')).toEqual({ ok: true, value: 'person@example.com' });
  });
});

describe('formatLastLogin', () => {
  it('renders "Never" for a null last login', () => {
    expect(formatLastLogin(null)).toBe('Never');
  });

  it('renders a locale date string for a real timestamp', () => {
    expect(formatLastLogin('2026-08-15T12:00:00.000Z')).not.toBe('Never');
  });
});
