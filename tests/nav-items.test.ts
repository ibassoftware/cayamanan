import { describe, expect, it } from 'vitest';

import { getVisibleNavItems } from '@/components/shell/nav-items';

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
      expect(employees?.children?.map(c => c.href)).toEqual(['/app/employees', '/app/employees/new']);
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

  it('shows every role the self-service profile entry', () => {
    for (const roles of [['ADMIN'], ['HR_PAYROLL'], ['EMPLOYEE']] as const) {
      expect(getVisibleNavItems(roles).some(item => item.href === '/app/me/profile')).toBe(true);
    }
  });
});
