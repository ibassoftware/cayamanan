"use client"

import { useCallback, useEffect, useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import {
  deriveOpenAiKeyCardState,
  validateOpenAiApiKey,
  type OpenAiKeyStatus,
} from "@/components/settings/openai-key-state"
import type { ActionResult } from "@/platform/errors"

const SOURCE_LABEL: Record<OpenAiKeyStatus["source"], string> = {
  settings: "Set here",
  env: "Environment variable",
  none: "Not configured",
}

/**
 * Write-only by design: this card never renders the stored key, only whether one is
 * configured, its last 4 characters, and where it came from (system.getOpenAiKeyStatus
 * never returns secret material). Setting a new key goes through system.setOpenAiKey —
 * high-risk and audited, but deliberately not one of Missy's tools (see that action's
 * own header comment).
 */
export function OpenAiKeyCard() {
  const [result, setResult] = useState<ActionResult<OpenAiKeyStatus> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchStatus = useCallback(async () => {
    const response = await callAction<OpenAiKeyStatus>("system.getOpenAiKeyStatus")
    setResult(response)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const response = await callAction<OpenAiKeyStatus>("system.getOpenAiKeyStatus")
      if (!cancelled) setResult(response)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const state = deriveOpenAiKeyCardState(result)

  // Only ADMIN can reach system.getOpenAiKeyStatus/setOpenAiKey at all — a FORBIDDEN
  // means this admin-only card simply doesn't render for the current viewer, same as the
  // rest of this screen already does for a non-admin.
  if (state.status === "no-permission") {
    return null
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="mb-1">
          <KeyRound className="size-5 text-body-subtle" aria-hidden="true" />
        </div>
        <CardTitle>OpenAI API key</CardTitle>
        <CardDescription>
          Used by Missy. The key itself is never displayed once set — only whether one is
          configured and its last 4 characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.status === "loading" && (
          <div className="flex items-center gap-3 text-body-subtle">
            <Spinner />
            <span>Loading…</span>
          </div>
        )}

        {state.status === "error" && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {state.status === "ready" && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              {state.keyStatus.configured ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )}
              {state.keyStatus.last4 && (
                <code className="text-body-subtle [font-variant-numeric:tabular-nums]">
                  •••• {state.keyStatus.last4}
                </code>
              )}
              <span className="text-body-subtle">{SOURCE_LABEL[state.keyStatus.source]}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              {state.keyStatus.configured ? "Update key" : "Set key"}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set OpenAI API key</DialogTitle>
            <DialogDescription>
              Stored encrypted. This change is audited and takes effect on the next chat
              request — it never displays again once saved.
            </DialogDescription>
          </DialogHeader>
          <OpenAiKeyForm
            onCancel={() => setDialogOpen(false)}
            onSaved={() => {
              setDialogOpen(false)
              fetchStatus()
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}

interface SetOpenAiKeyOutput {
  configured: true
  last4: string
}

function OpenAiKeyForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const router = useRouter()
  const keyFieldId = useId()
  const keyErrorId = useId()

  const [apiKey, setApiKey] = useState("")
  const [keyError, setKeyError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const keyResult = validateOpenAiApiKey(apiKey)
    setKeyError(keyResult.ok ? null : keyResult.message)
    if (!keyResult.ok) return

    setSubmitting(true)
    const result = await callAction<SetOpenAiKeyOutput>("system.setOpenAiKey", { apiKey: keyResult.value })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setSubmitError(result.error.message)
      return
    }

    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={keyFieldId} className="text-sm font-medium text-heading">
          API key
        </label>
        <Input
          id={keyFieldId}
          type="password"
          autoComplete="off"
          autoFocus
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-..."
          aria-invalid={keyError ? true : undefined}
          aria-describedby={keyError ? keyErrorId : undefined}
        />
        {keyError && (
          <p id={keyErrorId} className="text-sm text-fg-danger">
            {keyError}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
