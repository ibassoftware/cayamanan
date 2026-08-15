// Pure, framework-free helpers for the login screen — kept separate from the rendering
// component so the role-based redirect (acceptance criterion 1: each of the three seeded
// roles lands on a role-appropriate home) is unit-testable without a DOM.
import type { Role } from "@/platform/actions"

export interface LoginResultUser {
  roles: Role[]
}

/**
 * Where to send someone right after a successful login. A first-login (or
 * admin-reset) password change always wins — the plan's "must-change-password
 * redirect" state — regardless of role. Otherwise Admins and HR/Payroll land on the
 * module home; an Employee has nothing there (their only nav entries are under
 * /app/me/*), so they go straight to the one screen they do have.
 */
export function resolveLoginRedirect(user: LoginResultUser, mustChangePassword: boolean): string {
  if (mustChangePassword) return "/app/me/security"
  if (user.roles.includes("ADMIN") || user.roles.includes("HR_PAYROLL")) return "/app"
  return "/app/me/security"
}
