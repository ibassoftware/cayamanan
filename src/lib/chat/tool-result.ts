// Client-safe mirror of `toolResultSchema` in src/mastra/tools/action-tool-bridge.ts —
// deliberately duplicated rather than imported, since that module pulls in server-only
// dependencies (`@mastra/core/tools`, `@/platform/db` via the confirmations/tool-invocation
// services) that must never reach the browser bundle. Keep this in lockstep with that
// file's `toolResultSchema` — it is the source of truth for the contract.
import { z } from "zod"

export const chatToolResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), data: z.unknown() }),
  z.object({
    status: z.literal("confirmation_required"),
    confirmationId: z.string(),
    token: z.string(),
    actionId: z.string(),
    title: z.string(),
    preview: z.unknown(),
    expiresAt: z.string(),
  }),
  z.object({ status: z.literal("error"), code: z.string(), message: z.string() }),
])

export type ChatToolResult = z.infer<typeof chatToolResultSchema>

/** Returns `null` for anything that doesn't match the bridge's contract, rather than throwing —
 * a malformed/unexpected tool output should render as a generic failure card, never crash the panel. */
export function parseToolResult(output: unknown): ChatToolResult | null {
  const parsed = chatToolResultSchema.safeParse(output)
  return parsed.success ? parsed.data : null
}

/**
 * The model-facing tool name is not the registry action id verbatim — OpenAI's function
 * name constraints reach it through Mastra, so `ui.navigate` (the actual registry id, used
 * everywhere else — action routes, tests, audit rows) arrives in the message stream as
 * `ui_navigate` (confirmed against the live `/api/chat` stream: `"type":"tool-ui_navigate"`,
 * never `"tool-ui.navigate"`). Every registered action id in this codebase is
 * `<module>.<method>` with a camelCase method and no other underscores, so undoing exactly
 * the first underscore recovers the real id unambiguously.
 */
export function normalizeToolName(toolName: string): string {
  return toolName.replace("_", ".")
}

/**
 * The tool call's actual arguments (`ToolUIPart.input`), coerced to the plain record
 * shape `ai.approveAction` expects — never `preview`. `preview` is a display artifact:
 * `confirmationPreview()` may redact or reshape it, so it will not, in general, hash-match
 * what the server actually proposed (see src/modules/ai/service/confirmations.ts). Falls
 * back to `{}` for a non-object input, which is not expected in practice (tool arguments
 * are always an object) but keeps this total rather than throwing.
 */
export function toApprovalInput(toolCallInput: unknown): Record<string, unknown> {
  return toolCallInput && typeof toolCallInput === "object" && !Array.isArray(toolCallInput)
    ? (toolCallInput as Record<string, unknown>)
    : {}
}
