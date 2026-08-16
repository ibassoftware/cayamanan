import { describe, expect, it } from 'vitest';

import { getVisibleNavItems, isRouteReleased } from '@/components/shell/nav-items';

// Pure UI-logic test for the sidebar's role-based filtering (docs/plan/02-identity-auth.md
// acceptance criterion 1: "Employee sees only /app/me/* entries in the nav"). This is a
// usability affordance, not the authorization boundary — src/platform/actions.ts is.
describe('getVisibleNavItems', () => {
  it('shows an Employee only /app/me/* entries', () => {
    const items = getVisibleNavItems(['EMPLOYEE']);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.href.startsWith('/app/me/'))).toBe(true);
  });

  it('shows Admin the Users management entry that HR/Payroll does not get', () => {
    const adminItems = getVisibleNavItems(['ADMIN']);
    const hrItems = getVisibleNavItems(['HR_PAYROLL']);
    expect(adminItems.some((item) => item.href === '/app/settings/users')).toBe(true);
    expect(hrItems.some((item) => item.href === '/app/settings/users')).toBe(false);
  });

  it('shows both Admin and HR/Payroll the module home', () => {
    expect(getVisibleNavItems(['ADMIN']).some((item) => item.href === '/app')).toBe(true);
    expect(getVisibleNavItems(['HR_PAYROLL']).some((item) => item.href === '/app')).toBe(true);
  });

  it('shows every role the security entry', () => {
    for (const roles of [['ADMIN'], ['HR_PAYROLL'], ['EMPLOYEE']] as const) {
      expect(getVisibleNavItems(roles).some((item) => item.href === '/app/me/security')).toBe(true);
    }
  });

  it('shows nothing for an empty role list', () => {
    expect(getVisibleNavItems([])).toEqual([]);
  });

  it('gives Admin/HR the Employees and Organization groups with their sub-menus, but not an Employee', () => {
    for (const roles of [['ADMIN'], ['HR_PAYROLL']] as const) {
      const items = getVisibleNavItems(roles);
      const employees = items.find(item => item.href === '/app/employees');
      const organization = items.find(item => item.href === '/app/org/departments');
      // No '/app/employees/new': creating an employee is an action taken from the list
      // screen's own button, not a destination that earns a sidebar entry. The route still
      // exists and Missy can still navigate to it.
      expect(employees?.children?.map(c => c.href)).toEqual([
        '/app/employees',
        '/app/employees/import',
      ]);
      expect(organization?.children?.map(c => c.href)).toEqual([
        '/app/org/departments',
        '/app/org/positions',
        '/app/org/locations',
        '/app/org/cost-centers',
      ]);
    }

    const employeeItems = getVisibleNavItems(['EMPLOYEE']);
    expect(employeeItems.some(item => item.href === '/app/employees')).toBe(false);
    expect(employeeItems.some(item => item.href === '/app/org/departments')).toBe(false);
  });

  // The first public build was cut after Employees and Contracts. Payroll (slices 08–14)
  // and employee self-service (slice 11) are hidden rather than deleted, so these assert
  // the hold-back is actually in effect — and `isRouteReleased` backs it at the route, since
  // a hidden link is not a closed door.
  describe('first public build hold-back', () => {
    it('hides Payroll and the self-service profile from every role', () => {
      for (const roles of [['ADMIN'], ['HR_PAYROLL'], ['EMPLOYEE']] as const) {
        const hrefs = getVisibleNavItems(roles).map(item => item.href);
        expect(hrefs).not.toContain('/app/payroll');
        expect(hrefs).not.toContain('/app/me/profile');
      }
    });

    it('still shows the shipped surface', () => {
      const hrefs = getVisibleNavItems(['ADMIN']).map(item => item.href);
      expect(hrefs).toEqual(
        expect.arrayContaining([
          '/app',
          '/app/employees',
          '/app/org/departments',
          '/app/settings/users',
          '/app/settings/system',
          '/app/me/security',
        ]),
      );
    });

    it('reports held-back routes, including nested paths, as unreleased', () => {
      expect(isRouteReleased('/app/payroll')).toBe(false);
      expect(isRouteReleased('/app/me/profile')).toBe(false);
      expect(isRouteReleased('/app/payroll/runs/123')).toBe(false);
      expect(isRouteReleased('/app/employees')).toBe(true);
      expect(isRouteReleased('/app/me/security')).toBe(true);
    });

    // `/app/me/profile-something` is a different route that merely shares a prefix.
    it('does not treat a sibling route as held back by prefix alone', () => {
      expect(isRouteReleased('/app/me/profile-export')).toBe(true);
    });
  });
});
