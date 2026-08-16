"use client"

// The confirmation card (03-missy-foundation.md criterion 4/5): shows the `preview` a
// high-risk tool call proposed, Approve/Cancel, and an expired-token state. Cancel is
// purely local — there is no "cancel" action on the server, so clicking it changes
// nothing there, only this card's own display.
//
// `preview` is a *display artifact only* — `confirmationPreview()` on the server may
// redact or reshape it (src/modules/ai/service/confirmations.ts), so it will not, in
// general, equal what was actually hashed and proposed. Approve must resubmit `input`
// (the tool call's actual arguments, i.e. `ToolUIPart.input` — what the model composed,
// already sitting on the message the caller has), never `preview`: `ai.approveAction`
// (src/modules/ai/actions/approve-action.ts) rejects anything whose hash doesn't match
// what was originally proposed, and the original hash was always taken over the real
// input, not its redacted preview. Resubmitting `preview` would make every action whose
// preview actually redacts something (salary, bank details, ...) permanently unapprovable.
import { AlertTriangleIcon, CheckCircle2Icon, ClockIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { callAction } from "@/lib/actions-client"
import { formatCountdown, isConfirmationExpired, secondsUntilExpiry } from "@/lib/chat/confirmation"
import { CodeBlock } from "@/components/ai-elements/code-block"
import { MissyAvatar } from "@/components/missy/missy-avatar"

export interface ConfirmationCardProps {
  confirmationId: string
  token: string
  title: string
  /** Redacted, human-readable — rendered for the user, never resubmitted. */
  preview: unknown
  /** The tool call's actual arguments — what gets resubmitted on Approve. */
  input: Record<string, unknown>
  expiresAt: string
}

type LocalState =
  | { kind: "pending" }
  | { kind: "approving" }
  | { kind: "approved"; result: unknown }
  | { kind: "cancelled" }
  | { kind: "failed"; message: string }

const overlineClass = "block font-medium text-body-subtle text-xs uppercase tracking-[0.1em]"

export function ConfirmationCard({ confirmationId, token, title, preview, input, expiresAt }: ConfirmationCardProps) {
  const [state, setState] = useState<LocalState>({ kind: "pending" })
  const [now, setNow] = useState(() => Date.now())

  // Live countdown so "expired" is visible before the user even clicks Approve —
  // the server's own expiry check (CONFLICT) remains the actual authority.
  useEffect(() => {
    if (state.kind !== "pending" && state.kind !== "failed") return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [state.kind])

  const expired = isConfirmationExpired(expiresAt, now)

  async function handleApprove() {
    setState({ kind: "approving" })
    const result = await callAction<{ actionId: string; result: unknown }>("ai.approveAction", {
      confirmationId,
      token,
      // The tool call's actual arguments — never `preview` (see the header comment).
      input,
    })
    if (!result.ok) {
      // Legible, not silent — a consumed or expired token surfaces the server's own
      // message here rather than pretending the click worked (criterion 5).
      setState({ kind: "failed", message: result.error.message })
      return
    }
    setState({ kind: "approved", result: result.data.result })
  }

  function handleCancel() {
    setState({ kind: "cancelled" })
  }

  return (
    <div
      className="not-prose mb-4 w-full space-y-3 overflow-hidden rounded-lg border border-[var(--tc-border-warning-subtle)] bg-card p-4 shadow-xs"
      role="group"
      aria-label={`Confirmation required: ${title}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* She is holding this out to you: the raised brow is the character half of the
              "Missy proposes, you decide" boundary the confirmation flow enforces for real. */}
          <MissyAvatar className="size-6 shrink-0" state="awaiting-approval" />
          <p className="min-w-0 font-medium text-heading text-sm">{title}</p>
        </div>
        {state.kind === "pending" && (
          <Badge variant={expired ? "destructive" : "warning"} className="gap-1.5 rounded-full">
            <ClockIcon className="size-3" aria-hidden="true" />
            {expired ? "Expired" : `Expires in ${formatCountdown(secondsUntilExpiry(expiresAt, now))}`}
          </Badge>
        )}
        {state.kind === "approved" && (
          <Badge variant="success" className="gap-1.5 rounded-full">
            <CheckCircle2Icon className="size-3" aria-hidden="true" />
            Approved
          </Badge>
        )}
      </div>

      <div className="space-y-2 overflow-hidden">
        <span className={overlineClass}>Values</span>
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <CodeBlock code={JSON.stringify(preview, null, 2)} language="json" />
        </div>
      </div>

      {state.kind === "cancelled" && (
        <Alert>
          <AlertDescription>Cancelled — no changes were made.</AlertDescription>
        </Alert>
      )}

      {state.kind === "approved" && (
        <Alert>
          <AlertDescription>This was applied.</AlertDescription>
        </Alert>
      )}

      {state.kind === "failed" && (
        <Alert variant="destructive" role="alert">
          <AlertTriangleIcon className="size-4" aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {(state.kind === "pending" || state.kind === "approving" || state.kind === "failed") && (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={state.kind === "approving"}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApprove}
            disabled={state.kind === "approving" || expired}
          >
            {state.kind === "approving" ? "Applying…" : "Approve"}
          </Button>
        </div>
      )}
    </div>
  )
}
