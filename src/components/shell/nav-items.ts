// Pure, framework-free nav model for the app shell sidebar — kept separate from the
// rendering component (app-sidebar.tsx) so the role-gating logic (acceptance criterion 1:
// "an Employee must see only /app/me/* entries in the nav") is unit-testable without a DOM.
// This is a usability affordance only; the action layer (src/platform/actions.ts) is the
// real authorization boundary, so hiding an item here never substitutes for a server check.
import type { Role } from "@/platform/actions"

export interface NavItem {
  label: string
  href: string
  icon: "home" | "users" | "wallet" | "settings" | "shield"
  roles: readonly Role[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Home", href: "/app", icon: "home", roles: ["ADMIN", "HR_PAYROLL"] },
  { label: "Employees", href: "/app/employees", icon: "users", roles: ["ADMIN", "HR_PAYROLL"] },
  { label: "Payroll", href: "/app/payroll", icon: "wallet", roles: ["ADMIN", "HR_PAYROLL"] },
  { label: "Users", href: "/app/settings/users", icon: "settings", roles: ["ADMIN"] },
  { label: "System settings", href: "/app/settings/system", icon: "settings", roles: ["ADMIN"] },
  {
    label: "My security",
    href: "/app/me/security",
    icon: "shield",
    roles: ["ADMIN", "HR_PAYROLL", "EMPLOYEE"],
  },
] as const

export function getVisibleNavItems(roles: readonly Role[]): NavItem[] {
  return NAV_ITEMS.filter(item => item.roles.some(role => roles.includes(role)))
}
