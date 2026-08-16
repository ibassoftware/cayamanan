// Pure, framework-free nav model for the app shell sidebar — kept separate from the
// rendering component (app-sidebar.tsx) so the role-gating logic (acceptance criterion 1:
// "an Employee must see only /app/me/* entries in the nav") is unit-testable without a DOM.
// This is a usability affordance only; the action layer (src/platform/actions.ts) is the
// real authorization boundary, so hiding an item here never substitutes for a server check.
import type { Role } from "@/platform/actions"

export interface NavItem {
  label: string
  href: string
  icon: "home" | "users" | "wallet" | "settings" | "shield" | "building"
  roles: readonly Role[]
  /**
   * Sub-menu entries (04-organization-employees.md / product owner requirement:
   * "Employees, Positions, Departments — each one should have menus and sub menus").
   * The parent's own `href` stays a real, navigable destination (usually the list
   * screen) — children are additional shortcuts rendered underneath it, not a
   * replacement for the parent link.
   */
  children?: readonly NavItem[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Home", href: "/app", icon: "home", roles: ["ADMIN", "HR_PAYROLL"] },
  {
    label: "Employees",
    href: "/app/employees",
    icon: "users",
    roles: ["ADMIN", "HR_PAYROLL"],
    children: [
      { label: "All employees", href: "/app/employees", icon: "users", roles: ["ADMIN", "HR_PAYROLL"] },
      { label: "Add employee", href: "/app/employees/new", icon: "users", roles: ["ADMIN", "HR_PAYROLL"] },
    ],
  },
  {
    label: "Organization",
    href: "/app/org/departments",
    icon: "building",
    roles: ["ADMIN", "HR_PAYROLL"],
    children: [
      { label: "Departments", href: "/app/org/departments", icon: "building", roles: ["ADMIN", "HR_PAYROLL"] },
      { label: "Positions", href: "/app/org/positions", icon: "building", roles: ["ADMIN", "HR_PAYROLL"] },
      { label: "Locations", href: "/app/org/locations", icon: "building", roles: ["ADMIN", "HR_PAYROLL"] },
      { label: "Cost centers", href: "/app/org/cost-centers", icon: "building", roles: ["ADMIN", "HR_PAYROLL"] },
    ],
  },
  { label: "Payroll", href: "/app/payroll", icon: "wallet", roles: ["ADMIN", "HR_PAYROLL"] },
  { label: "Users", href: "/app/settings/users", icon: "settings", roles: ["ADMIN"] },
  { label: "System settings", href: "/app/settings/system", icon: "settings", roles: ["ADMIN"] },
  {
    label: "My profile",
    href: "/app/me/profile",
    icon: "shield",
    roles: ["ADMIN", "HR_PAYROLL", "EMPLOYEE"],
  },
  {
    label: "My security",
    href: "/app/me/security",
    icon: "shield",
    roles: ["ADMIN", "HR_PAYROLL", "EMPLOYEE"],
  },
] as const

function filterForRoles(items: readonly NavItem[], roles: readonly Role[]): NavItem[] {
  return items
    .filter(item => item.roles.some(role => roles.includes(role)))
    .map(item => (item.children ? { ...item, children: filterForRoles(item.children, roles) } : item))
}

export function getVisibleNavItems(roles: readonly Role[]): NavItem[] {
  return filterForRoles(NAV_ITEMS, roles)
}
