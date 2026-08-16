// Pure, framework-free helpers for the OpenAI key card — kept separate from the React
// component so validation is unit-testable without a DOM (mirrors settings-state.ts).
import type { ActionResult } from "@/platform/errors"

export interface OpenAiKeyStatus {
  configured: boolean
  last4: string | null
  source: "settings" | "env" | "none"
}

export type OpenAiKeyCardState =
  | { status: "loading" }
  | { status: "no-permission" }
  | { status: "error"; message: string }
  | { status: "ready"; keyStatus: OpenAiKeyStatus }

export function deriveOpenAiKeyCardState(
  result: ActionResult<OpenAiKeyStatus> | null,
): OpenAiKeyCardState {
  if (result === null) {
    return { status: "loading" }
  }
  if (!result.ok) {
    if (result.error.code === "FORBIDDEN") {
      return { status: "no-permission" }
    }
    return { status: "error", message: result.error.message }
  }
  return { status: "ready", keyStatus: result.data }
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

// Mirrors system.setOpenAiKey's own `z.string().min(20, ...)` — a client-side echo so the
// form can show the same message before a round trip, not a substitute for the
// server-side check.
const MIN_KEY_LENGTH = 20

export function validateOpenAiApiKey(raw: string): FieldResult<string> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: "Enter an API key." }
  }
  if (trimmed.length < MIN_KEY_LENGTH) {
    return { ok: false, message: "That does not look like a valid OpenAI API key." }
  }
  return { ok: true, value: trimmed }
}
