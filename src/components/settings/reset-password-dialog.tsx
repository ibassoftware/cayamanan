"use client"

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
import { validatePassword, type UserSummary } from "@/components/settings/users-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

interface ResetUserPasswordOutput {
  id: string
}

interface ResetPasswordDialogProps {
  user: UserSummary | null
  onOpenChange: (open: boolean) => void
  onReset: (userId: string) => void
}

/** High-risk (audited): sets a user's password directly and forces them to change it,
 * revoking their existing sessions in the same transaction (identity.resetUserPassword). */
export function ResetPasswordDialog({ user, onOpenChange, onReset }: ResetPasswordDialogProps) {
  return (
    <Dialog open={user !== null} onOpenChange={open => !open && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {user && (
              <>
                Sets a new password for <strong className="font-medium text-heading">{user.name}</strong> and
                signs them out everywhere. They&rsquo;ll be required to change it on next login.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Keyed by user id so switching targets mounts a fresh, empty form. */}
        {user && <ResetPasswordForm key={user.id} user={user} onCancel={() => onOpenChange(false)} onReset={onReset} />}
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordForm({
  user,
  onCancel,
  onReset,
}: {
  user: UserSummary
  onCancel: () => void
  onReset: (userId: string) => void
}) {
  const router = useRouter()
  const passwordFieldId = useId()
  const errorId = useId()
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const passwordResult = validatePassword(newPassword)
    if (!passwordResult.ok) {
      setError(passwordResult.message)
      return
    }

    setSubmitting(true)
    const result = await callAction<ResetUserPasswordOutput>("identity.resetUserPassword", {
      userId: user.id,
      newPassword: passwordResult.value,
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

    onReset(result.data.id)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive" role="alert" id={errorId}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordFieldId} className="text-sm font-medium text-heading">
          New password
        </label>
        <Input
          id={passwordFieldId}
          type="password"
          autoComplete="new-password"
          autoFocus
          minLength={8}
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <p className="text-sm text-body-subtle">At least 8 characters.</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={submitting}>
          {submitting ? "Resetting…" : "Reset password"}
        </Button>
      </DialogFooter>
    </form>
  )
}
