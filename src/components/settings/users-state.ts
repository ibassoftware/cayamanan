// Pure, framework-free helpers for the admin user management screen
// (src/app/app/(app)/settings/users) — kept separate from the rendering components so the
// state-machine and small validators are unit-testable without a DOM, mirroring
// src/components/settings/settings-state.ts's split for the system settings screen.
import type { ActionResult } from "@/platform/errors"
import type { Role } from "@/platform/actions"

export interface UserSummary {
  id: string
  email: string
  name: string
  status: string
  mustChangePassword: boolean
  lastLoginAt: string | null
  roles: Role[]
}

export type UsersScreenState =
  | { status: "loading" }
  | { status: "no-permission" }
  | { status: "error"; message: string }
  | { status: "ready"; users: UserSummary[] }

/**
 * `result === null` means "fetch in flight or not yet started". A `FORBIDDEN` action
 * error maps to the no-permission state; every other error code maps to the generic
 * error state. Server-side authorization is the source of truth; this is a convenience
 * mapping, not an enforcement point.
 */
export function deriveUsersScreenState(
  result: ActionResult<{ users: UserSummary[] }> | null,
): UsersScreenState {
  if (result === null) {
    return { status: "loading" }
  }
  if (!result.ok) {
    if (result.error.code === "FORBIDDEN") {
      return { status: "no-permission" }
    }
    return { status: "error", message: result.error.message }
  }
  return { status: "ready", users: result.data.users }
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

export function validateRoleSelection(roles: Role[]): FieldResult<Role[]> {
  if (roles.length === 0) {
    return { ok: false, message: "Select at least one role." }
  }
  return { ok: true, value: roles }
}

export function validatePassword(raw: string): FieldResult<string> {
  if (raw.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." }
  }
  return { ok: true, value: raw }
}

export function validateName(raw: string): FieldResult<string> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: "Enter a name." }
  }
  return { ok: true, value: trimmed }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(raw: string): FieldResult<string> {
  const trimmed = raw.trim()
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, message: "Enter a valid email address." }
  }
  return { ok: true, value: trimmed }
}

export function formatLastLogin(lastLoginAt: string | null): string {
  if (!lastLoginAt) return "Never"
  return new Date(lastLoginAt).toLocaleString()
}
