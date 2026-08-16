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
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { getToolName } from "ai"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { ConfirmationCard } from "@/components/chat/confirmation-card"
import { humanizeToolName } from "@/lib/chat/tool-label"
import { normalizeToolName, parseToolResult, toApprovalInput } from "@/lib/chat/tool-result"

const overlineClass = "block font-medium text-body-subtle text-xs uppercase tracking-[0.1em]"

export function ToolCallCard({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const router = useRouter()
  const [userToggled, setUserToggled] = useState<boolean | null>(null)
  const toolName = normalizeToolName(getToolName(part))
  const toolResult = part.state === "output-available" ? parseToolResult(part.output) : null

  // ui.navigate's own action only validates + echoes the path back
  // (src/modules/ui/actions/navigate.ts) — the chat panel is what actually changes the
  // route once the result comes back "ok" (criterion 2).
  //
  // Guarded by tool call id so it pushes exactly once, ever. `parseToolResult` builds a
  // fresh object on every render (src/lib/chat/tool-result.ts), so `toolResult` never
  // compares equal and this effect re-ran on *every* re-render of an already-completed
  // navigate card — re-pushing its path and dragging the user back whenever they clicked
  // somewhere else while that card was still in the transcript.
  //
  // `ui.openRecord` rides the same path: it used to echo `{entityType, entityId}` back with
  // no client handler at all, so it always reported success while the screen never changed.
  // It now returns a resolved `path` too, and both tools share this one mechanism.
  const navigatedForRef = useRef<string | null>(null)
  const destinationPath =
    (toolName === "ui.navigate" || toolName === "ui.openRecord") && toolResult?.status === "ok"
      ? ((toolResult.data as { path?: unknown }).path as string | undefined)
      : undefined

  useEffect(() => {
    if (typeof destinationPath !== "string") return
    if (navigatedForRef.current === part.toolCallId) return
    navigatedForRef.current = part.toolCallId
    router.push(destinationPath)
  }, [destinationPath, router, part.toolCallId])

  const headerProps =
    part.type === "dynamic-tool"
      ? ({ type: "dynamic-tool" as const, state: part.state, toolName })
      : ({ type: part.type, state: part.state })

  // Routine successes collapse: Missy already narrates what she did in prose, so the raw
  // parameters and result are detail-on-demand rather than the default view. Anything the
  // user must act on or know about stays open — a confirmation card holds the Approve
  // button, and a permission/error card is the only signal that something did not happen.
  // A navigation is the exception among routine successes: the destination is the whole
  // point, and it is one line. Showing it means the user has something to click when the
  // page they were sent to is not the one they wanted, or when they want to get back to it
  // later in the conversation.
  const needsAttention =
    part.state === "output-error" ||
    typeof destinationPath === "string" ||
    (part.state === "output-available" &&
      (!toolResult || toolResult.status === "error" || toolResult.status === "confirmation_required"))

  // Controlled, not `defaultOpen`: `needsAttention` is false while the call streams and
  // only becomes true once an error/confirmation result arrives, i.e. after mount — and
  // changing an uncontrolled Collapsible's default state after initialization is a Base UI
  // warning. `null` means "not touched", so the card follows needsAttention until the user
  // expresses a preference, and respects it afterwards.
  const open = userToggled ?? needsAttention

  return (
    <Tool open={open} onOpenChange={setUserToggled}>
      <ToolHeader {...headerProps} title={humanizeToolName(toolName)} />
      <ToolContent>
        {/* A navigation card shows its destination and nothing else. `{entityType,
            entityId}` is entirely redundant once the path is resolved, and dumping that
            JSON at an HR user — which is what this card did, doubly so once navigation
            cards started opening by default — is developer output in a screen built for
            payroll staff. */}
        {typeof destinationPath === "string" ? null : part.input === undefined ? (
          <div className="space-y-2">
            <span className={overlineClass}>Input</span>
            <p className="text-body-subtle text-sm" aria-live="polite">
              Preparing…
            </p>
          </div>
        ) : (
          <ToolInput input={part.input} />
        )}

        {part.state === "output-error" && (
          <div className="space-y-2">
            <span className={overlineClass}>Error</span>
            <Alert variant="destructive" role="alert">
              <AlertTriangleIcon className="size-4" aria-hidden="true" />
              <AlertDescription>{part.errorText}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* A resolved destination renders as the link itself rather than as the raw
            `{entityType, entityId, path}` JSON — that object is developer output, and the
            only part of it an HR user can act on is the path. */}
        {typeof destinationPath === "string" ? (
          <div className="space-y-2">
            <span className={overlineClass}>Opened</span>
            <Link
              href={destinationPath}
              className="inline-block break-all font-medium text-brand-strong text-sm underline underline-offset-2 hover:no-underline"
            >
              {destinationPath}
            </Link>
          </div>
        ) : (
          part.state === "output-available" &&
          toolResult?.status === "ok" && <ToolOutput output={toolResult.data} errorText={undefined} />
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
