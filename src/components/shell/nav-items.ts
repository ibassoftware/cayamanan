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
  /**
   * Held back from the first public build. The scope was cut after Employees and
   * Contracts, so anything downstream of that is hidden rather than deleted — the routes
   * and plans still exist, they are just not part of what ships first.
   *
   * Hiding is not a security boundary; it only keeps the shipped surface honest. Where a
   * route still exists behind a hidden entry, guard the page itself with
   * `assertRouteReleased` so a guessed URL does not land on half-built work.
   */
  unreleased?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Home", href: "/app", icon: "home", roles: ["ADMIN", "HR_PAYROLL"] },
  {
    label: "Employees",
    href: "/app/employees",
    icon: "users",
    roles: ["ADMIN", "HR_PAYROLL"],
    // "Add employee" is deliberately not here: the employee list screen already carries an
    // "Add employee" button, and a nav entry for a create form is a menu item for something
    // you do *from* a list, not a place you go. `/app/employees/new` still exists and stays
    // in Missy's screen catalogue — this only removes the duplicate sidebar link.
    children: [
      { label: "All employees", href: "/app/employees", icon: "users", roles: ["ADMIN", "HR_PAYROLL"] },
      { label: "Import employees", href: "/app/employees/import", icon: "users", roles: ["ADMIN", "HR_PAYROLL"] },
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
  // Slices 08–14. There is no /app/payroll route at all yet, so this entry was a 404.
  { label: "Payroll", href: "/app/payroll", icon: "wallet", roles: ["ADMIN", "HR_PAYROLL"], unreleased: true },
  { label: "Users", href: "/app/settings/users", icon: "settings", roles: ["ADMIN"] },
  { label: "System settings", href: "/app/settings/system", icon: "settings", roles: ["ADMIN"] },
  // Employee self-service is slice 11. The first build is the HR-facing 201 file, so the
  // read-only own-record view is held back; "My security" stays, because any live account
  // needs to be able to change its own password.
  {
    label: "My profile",
    href: "/app/me/profile",
    icon: "shield",
    roles: ["ADMIN", "HR_PAYROLL", "EMPLOYEE"],
    unreleased: true,
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
    .filter(item => !item.unreleased && item.roles.some(role => roles.includes(role)))
    .map(item => (item.children ? { ...item, children: filterForRoles(item.children, roles) } : item))
}

export function getVisibleNavItems(roles: readonly Role[]): NavItem[] {
  return filterForRoles(NAV_ITEMS, roles)
}

/** Every href held back from the first public build, parents and children alike. */
export function unreleasedHrefs(items: readonly NavItem[] = NAV_ITEMS): string[] {
  return items.flatMap(item => [
    ...(item.unreleased ? [item.href] : []),
    ...unreleasedHrefs(item.children ?? []),
  ])
}

/**
 * True when a route is part of the shipped surface. Pages behind a hidden nav entry call
 * this and `notFound()` — the sidebar only stops people finding the link, not typing it.
 */
export function isRouteReleased(pathname: string): boolean {
  return !unreleasedHrefs().some(href => pathname === href || pathname.startsWith(`${href}/`))
}
