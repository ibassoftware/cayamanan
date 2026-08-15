// Pure, framework-free helpers for the system settings screen: deriving which of the
// required states (loading / no-permission / error / ready-including-empty) to render,
// and validating the key/value the admin types before it ever reaches the action layer.
// Kept separate from the React component so this logic is unit-testable without a DOM.
import type { ActionResult } from "@/platform/errors"

export interface SystemSetting {
  key: string
  value: unknown
  effectiveFrom: string
}

export type SettingsScreenState =
  | { status: "loading" }
  | { status: "no-permission" }
  | { status: "error"; message: string }
  | { status: "ready"; settings: SystemSetting[] }

/**
 * `result === null` means "fetch in flight or not yet started" — the loading state.
 * A `FORBIDDEN` action error maps to the no-permission state; every other error code
 * maps to the generic error state. Server-side authorization is the source of truth;
 * this is a convenience mapping, not an enforcement point.
 */
export function deriveSettingsScreenState(
  result: ActionResult<{ settings: SystemSetting[] }> | null,
): SettingsScreenState {
  if (result === null) {
    return { status: "loading" }
  }
  if (!result.ok) {
    if (result.error.code === "FORBIDDEN") {
      return { status: "no-permission" }
    }
    return { status: "error", message: result.error.message }
  }
  return { status: "ready", settings: result.data.settings }
}

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]*$/

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

export function validateSettingKey(raw: string): FieldResult<string> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: "Enter a key." }
  }
  if (!KEY_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message: "Use letters, numbers, dots, and underscores only, starting with a letter.",
    }
  }
  return { ok: true, value: trimmed }
}

export function parseSettingValueInput(raw: string): FieldResult<unknown> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: "Enter a value." }
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    return {
      ok: false,
      message: 'Value must be valid JSON, e.g. "HALF_UP", 42, true, or {"mode":"HALF_UP"}.',
    }
  }
}

/** Renders a stored `jsonb` value back into the textarea/preview text. */
export function formatSettingValue(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value, null, 2)
}
