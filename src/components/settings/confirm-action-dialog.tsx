"use client"

import { useId, useState, type ReactNode } from "react"
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
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

/** Shared "are you sure?" step for the users screen's two plain confirm-then-call
 * high-risk actions (deactivate, revoke sessions) — identity.resetUserPassword needs its
 * own dialog because it also collects a new password (see reset-password-dialog.tsx). */
interface ConfirmActionDialogProps<T> {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<ActionResult<T>>
  onSuccess: (data: T) => void
}

export function ConfirmActionDialog<T>({
  open,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onConfirm,
  onSuccess,
}: ConfirmActionDialogProps<T>) {
  const router = useRouter()
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Clear any error from a previous attempt so reopening this dialog (for the same
      // or a different target) starts clean, without needing an effect to sync it.
      setError(null)
      setSubmitting(false)
    }
    onOpenChange(next)
  }

  async function handleConfirm() {
    setError(null)
    setSubmitting(true)
    const result = await onConfirm()
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(result.error.message)
      return
    }

    setError(null)
    onSuccess(result.data)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert" id={errorId}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
