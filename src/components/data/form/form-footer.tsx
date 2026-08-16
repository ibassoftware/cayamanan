"use client"

// Consistent save/cancel footer for every create/edit form. Not tied to Dialog
// markup — screens using a full-page form (e.g. `/app/employees/new`) render this
// directly; screens using a dialog form (matching setting-form.tsx) wrap it in
// `DialogFooter` themselves. When the form is dirty, Cancel asks for confirmation
// before discarding instead of silently dropping the user's edits.
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface FormFooterProps {
  onCancel: () => void
  saveLabel?: string
  cancelLabel?: string
  submitting?: boolean
  /** When provided, Cancel confirms before discarding if `true`. */
  isDirty?: boolean
  saveDisabled?: boolean
  className?: string
}

export function FormFooter({
  onCancel,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  submitting = false,
  isDirty,
  saveDisabled,
  className,
}: FormFooterProps) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)

  function handleCancelClick() {
    if (isDirty) {
      setConfirmDiscardOpen(true)
      return
    }
    onCancel()
  }

  return (
    <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}>
      <Button type="button" variant="outline" onClick={handleCancelClick} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={submitting || saveDisabled}>
        {submitting ? "Saving…" : saveLabel}
      </Button>

      <Dialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>You have unsaved changes. Leaving now will discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmDiscardOpen(false)
                onCancel()
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
