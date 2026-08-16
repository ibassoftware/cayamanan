"use client"

// Shared "are you sure?" dialog for high-risk actions (salary, bank details,
// termination, permissions, payroll approve/finalize/reopen/adjust, ...) — the same
// pattern already proven on the users screen
// (src/components/settings/confirm-action-dialog.tsx), generalised here so every
// model screen reuses one implementation instead of copy-pasting it. Domain-agnostic:
// screens supply the confirm callback (typically a `callAction(...)` call) and what
// to do with the result.
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

export interface ConfirmDialogProps<T> {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  /** @default "destructive" — most confirm-dialog uses are for high-risk actions. */
  confirmVariant?: "destructive" | "default"
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<ActionResult<T>>
  onSuccess: (data: T) => void
}

export function ConfirmDialog<T>({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = "destructive",
  onOpenChange,
  onConfirm,
  onSuccess,
}: ConfirmDialogProps<T>) {
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
          <Button type="button" variant={confirmVariant} onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
