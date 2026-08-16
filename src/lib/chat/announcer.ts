// Pure decision logic for the chat panel's single polite screen-reader announcement per
// turn. Streaming text re-renders on every token; wiring `aria-live="polite"` straight to
// that would spam assistive tech. Instead we announce once per state transition: entering
// "thinking", entering "responding", and the final reply text when a turn completes —
// never on every delta. Kept framework-free so it's unit-testable without a DOM.
import type { ChatStatus } from "ai"

const MAX_ANNOUNCEMENT_LENGTH = 600

interface TextBearingMessage {
  role: string
  parts: Array<{ type: string; text?: string }>
}

/** Concatenates every text part of a message — used to read out the finished reply. */
export function extractMessageText(message: TextBearingMessage | undefined): string {
  if (!message) return ""
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
}

export function truncateForAnnouncement(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_ANNOUNCEMENT_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_ANNOUNCEMENT_LENGTH)}… (see chat panel for the full reply)`
}

/**
 * Returns the next polite announcement (or `null` for "say nothing new") given the
 * previous and current chat status and the latest assistant text. Called once per
 * status transition, not once per render — the caller is responsible for only invoking
 * this when `status` actually changes.
 */
export function deriveAnnouncement(
  previousStatus: ChatStatus | null,
  status: ChatStatus,
  latestAssistantText: string,
): string | null {
  if (previousStatus === status) return null

  if (status === "submitted") return "Missy is thinking…"
  if (status === "streaming") return "Missy is responding…"
  if (status === "ready" && (previousStatus === "submitted" || previousStatus === "streaming")) {
    return latestAssistantText.trim().length > 0
      ? `Missy replied: ${truncateForAnnouncement(latestAssistantText)}`
      : "Missy finished responding."
  }
  if (status === "error") return "Missy could not complete that request."

  return null
}
