"use client"

// High-risk, ADMIN-only action (`employee.linkUserAccount` — CLAUDE.md's high-risk
// list / 04-organization-employees.md). Mirrors reset-password-dialog.tsx's convention
// for a risk:'high' action that also needs one more input (here: the user's email)
// before it can be confirmed — the risk copy plus the explicit submit button both live
// in the same dialog, rather than a two-step "collect input, then confirm" flow.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

export interface LinkUserAccountDialogProps {
  open: boolean
  employeeId: string
  employeeName: string
  onOpenChange: (open: boolean) => void
  onLinked: (userId: string) => void
}

export function LinkUserAccountDialog({ open, employeeId, employeeName, onOpenChange, onLinked }: LinkUserAccountDialogProps) {
  const router = useRouter()
  const emailFieldId = useId()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEmail("")
      setError(null)
      setSubmitting(false)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await callAction<{ employeeId: string; userId: string }>("employee.linkUserAccount", {
      employeeId,
      userEmail: email.trim(),
    })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(result.error.message)
      return
    }

    onLinked(result.data.userId)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link user account</DialogTitle>
          <DialogDescription>
            This grants that user account self-service access to{" "}
            <strong className="font-medium text-heading">{employeeName}</strong>&rsquo;s own data going forward.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={emailFieldId} className="text-sm font-medium text-heading">
              User email
            </label>
            <Input
              id={emailFieldId}
              type="email"
              autoComplete="off"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || email.trim() === ""}>
              {submitting ? "Linking…" : "Link account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
