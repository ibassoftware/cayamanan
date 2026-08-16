/**
 * Pure decision logic for which pose Missy strikes, derived from the stream the chat panel
 * already receives. Framework-free so it is unit-testable without a DOM — the same shape as
 * `announcer.ts`, and for the same reason.
 *
 * Presentation only. Every input here is something that has *already* streamed back from a
 * completed round-trip; nothing about the pose grants, gates or predicts a capability.
 * `executeAction`'s role check remains the only boundary.
 */
import type { ChatStatus } from "ai"

import { isInternalToolPart } from "@/lib/chat/internal-tools"
import { classifyActionIntent } from "@/lib/chat/tool-label"
import { normalizeToolName, parseToolResult } from "@/lib/chat/tool-result"

export type MissyState =
  | "idle"
  | "thinking"
  | "reading"
  | "working"
  | "awaiting-approval"
  | "concerned"
  | "celebrating"

/** The subset of a `ToolUIPart` / `DynamicToolUIPart` this module needs. */
interface ToolBearingPart {
  type: string
  state?: string
  output?: unknown
  toolName?: string
}

interface AssistantMessageLike {
  role: string
  parts: ToolBearingPart[]
}

/** `"tool-ui_navigate"` → `"ui.navigate"`; dynamic parts carry the name in a field instead. */
function actionIdOf(part: ToolBearingPart): string {
  if (part.type === "dynamic-tool") return normalizeToolName(part.toolName ?? "")
  return normalizeToolName(part.type.slice("tool-".length))
}

function isToolPart(part: ToolBearingPart): boolean {
  return (part.type.startsWith("tool-") || part.type === "dynamic-tool") && !isInternalToolPart(part)
}

/** A tool call the model has issued but which has not come back yet. */
function isInFlight(part: ToolBearingPart): boolean {
  return part.state !== "output-available" && part.state !== "output-error"
}

/**
 * The pose for the current turn.
 *
 * Precedence is deliberate: a pending approval is the one thing the user must act on, so it
 * outranks everything and survives the turn ending. A failure outranks progress. Only then
 * does the in-flight work decide the pose.
 *
 * `celebrating` is never returned here — it belongs to the transition into `ready`, which
 * needs a clock. `useMissyState` layers it (and the decay of a settled `concerned`) on top.
 */
export function deriveMissyState(
  status: ChatStatus,
  lastMessage: AssistantMessageLike | undefined,
): MissyState {
  const toolParts = lastMessage?.role === "assistant" ? lastMessage.parts.filter(isToolPart) : []

  const results = toolParts.map((part) =>
    part.state === "output-available" ? parseToolResult(part.output) : null,
  )

  if (results.some((result) => result?.status === "confirmation_required")) return "awaiting-approval"

  if (status === "error") return "concerned"
  if (toolParts.some((part) => part.state === "output-error")) return "concerned"
  if (results.some((result) => result?.status === "error")) return "concerned"

  if (status === "submitted" || status === "streaming") {
    // The most recent outstanding call — with several in a turn, she should be acting out
    // whatever she is doing *now*, not the first thing she started.
    const running = [...toolParts].reverse().find(isInFlight)
    if (!running) return "thinking"
    return classifyActionIntent(actionIdOf(running)) === "read" ? "reading" : "working"
  }

  return "idle"
}
