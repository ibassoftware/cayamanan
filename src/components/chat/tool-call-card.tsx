"use client"

// Renders one tool invocation from the message stream. Every registered action id
// (`ui.navigate`, `identity.me`, ...) reaches the model through Mastra/OpenAI's function
// name constraints, which strip the dot — confirmed live against `/api/chat`: the message
// part's own `type` is `"tool-ui_navigate"`, not `"tool-ui.navigate"` (and never
// `"dynamic-tool"` either). `normalizeToolName` undoes that so comparisons against real
// registry ids (e.g. the ui.navigate side effect below) actually match, and so the header
// shows the familiar dotted id. This is the single place that turns the bridge's
// `{status: 'ok'|'confirmation_required'|'error'}` contract into UI, so a failed tool call
// always renders a readable card (03-missy-foundation.md criterion 6), never silence.
import { AlertTriangleIcon, LockIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { getToolName } from "ai"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { ConfirmationCard } from "@/components/chat/confirmation-card"
import { normalizeToolName, parseToolResult, toApprovalInput } from "@/lib/chat/tool-result"

const overlineClass = "block font-medium text-body-subtle text-xs uppercase tracking-[0.1em]"

export function ToolCallCard({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const router = useRouter()
  const toolName = normalizeToolName(getToolName(part))
  const toolResult = part.state === "output-available" ? parseToolResult(part.output) : null

  // ui.navigate's own action only validates + echoes the path back
  // (src/modules/ui/actions/navigate.ts) — the chat panel is what actually changes the
  // route once the result comes back "ok" (criterion 2).
  useEffect(() => {
    if (toolName !== "ui.navigate" || toolResult?.status !== "ok") return
    const data = toolResult.data as { path?: unknown }
    if (typeof data.path === "string") {
      router.push(data.path)
    }
  }, [toolName, toolResult, router])

  const headerProps =
    part.type === "dynamic-tool"
      ? ({ type: "dynamic-tool" as const, state: part.state, toolName })
      : ({ type: part.type, state: part.state })

  return (
    <Tool defaultOpen>
      <ToolHeader {...headerProps} title={toolName} />
      <ToolContent>
        <ToolInput input={part.input} />

        {part.state === "output-error" && (
          <div className="space-y-2">
            <span className={overlineClass}>Error</span>
            <Alert variant="destructive" role="alert">
              <AlertTriangleIcon className="size-4" aria-hidden="true" />
              <AlertDescription>{part.errorText}</AlertDescription>
            </Alert>
          </div>
        )}

        {part.state === "output-available" && toolResult?.status === "ok" && (
          <ToolOutput output={toolResult.data} errorText={undefined} />
        )}

        {part.state === "output-available" && toolResult?.status === "error" && (
          <div className="space-y-2">
            <span className={overlineClass}>{toolResult.code === "FORBIDDEN" ? "Not permitted" : "Error"}</span>
            <Alert variant="destructive" role="alert">
              {toolResult.code === "FORBIDDEN" ? (
                <LockIcon className="size-4" aria-hidden="true" />
              ) : (
                <AlertTriangleIcon className="size-4" aria-hidden="true" />
              )}
              <AlertDescription>{toolResult.message}</AlertDescription>
            </Alert>
          </div>
        )}

        {part.state === "output-available" && toolResult?.status === "confirmation_required" && (
          <ConfirmationCard
            confirmationId={toolResult.confirmationId}
            token={toolResult.token}
            title={toolResult.title}
            preview={toolResult.preview}
            input={toApprovalInput(part.input)}
            expiresAt={toolResult.expiresAt}
          />
        )}

        {part.state === "output-available" && !toolResult && (
          <Alert variant="destructive" role="alert">
            <AlertTriangleIcon className="size-4" aria-hidden="true" />
            <AlertDescription>Missy received an unexpected response for this action.</AlertDescription>
          </Alert>
        )}
      </ToolContent>
    </Tool>
  )
}
