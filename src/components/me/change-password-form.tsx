"use client"

import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

interface ChangeOwnPasswordOutput {
  ok: true
}

export function ChangePasswordForm() {
  const router = useRouter()
  const currentFieldId = useId()
  const nextFieldId = useId()
  const confirmFieldId = useId()
  const errorId = useId()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.")
      return
    }

    setSubmitting(true)
    const result = await callAction<ChangeOwnPasswordOutput>("identity.changeOwnPassword", {
      currentPassword,
      newPassword,
    })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      // Note: identity.changeOwnPassword also returns UNAUTHORIZED for "current
      // password is incorrect" — a domain error, not a session problem — which is
      // exactly what shows up here.
      setError(result.error.message)
      return
    }

    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setSuccess(true)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive" role="alert" id={errorId}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert role="status" aria-live="polite">
          <AlertDescription>Your password has been changed.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={currentFieldId} className="text-sm font-medium text-heading">
          Current password
        </label>
        <Input
          id={currentFieldId}
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nextFieldId} className="text-sm font-medium text-heading">
          New password
        </label>
        <Input
          id={nextFieldId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <p className="text-sm text-body-subtle">At least 8 characters.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={confirmFieldId} className="text-sm font-medium text-heading">
          Confirm new password
        </label>
        <Input
          id={confirmFieldId}
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <Button type="submit" disabled={submitting} className="mt-2 self-start">
        {submitting ? "Saving…" : "Change password"}
      </Button>
    </form>
  )
}
