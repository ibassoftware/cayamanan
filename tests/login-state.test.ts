import { describe, expect, it } from 'vitest';

import { resolveLoginRedirect } from '@/app/login/login-state';

// Pure UI-logic test for the login screen's post-login redirect (docs/plan/02-identity-auth.md
// acceptance criterion 1: each of the three seeded roles lands on a role-appropriate home;
// an Employee's only nav entries are under /app/me/*). No DOM/component rendering here.
describe('resolveLoginRedirect', () => {
  it('sends a must-change-password login to the security screen regardless of role', () => {
    expect(resolveLoginRedirect({ roles: ['ADMIN'] }, true)).toBe('/app/me/security');
    expect(resolveLoginRedirect({ roles: ['EMPLOYEE'] }, true)).toBe('/app/me/security');
  });

  it('sends an Admin to the module home', () => {
    expect(resolveLoginRedirect({ roles: ['ADMIN'] }, false)).toBe('/app');
  });

  it('sends HR/Payroll to the module home', () => {
    expect(resolveLoginRedirect({ roles: ['HR_PAYROLL'] }, false)).toBe('/app');
  });

  it('sends a plain Employee to their security screen, not the module home', () => {
    expect(resolveLoginRedirect({ roles: ['EMPLOYEE'] }, false)).toBe('/app/me/security');
  });

  it('treats a user holding both HR/Payroll and Employee as HR/Payroll', () => {
    expect(resolveLoginRedirect({ roles: ['HR_PAYROLL', 'EMPLOYEE'] }, false)).toBe('/app');
  });
});
