"use client"

import { useId, useState, type FormEvent } from "react"

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
import { RoleCheckboxGroup } from "@/components/settings/role-checkbox-group"
import { validateEmail, validateName, validatePassword, validateRoleSelection } from "@/components/settings/users-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { Role } from "@/platform/actions"
import type { UserSummary } from "@/components/settings/users-state"
import { useRouter } from "next/navigation"

interface CreateUserOutput {
  id: string
  email: string
  name: string
  roles: Role[]
}

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (user: UserSummary) => void
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: CreateUserDialogProps) {
  const router = useRouter()
  const emailFieldId = useId()
  const nameFieldId = useId()
  const passwordFieldId = useId()
  const errorId = useId()

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [initialPassword, setInitialPassword] = useState("")
  const [roles, setRoles] = useState<Role[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setEmail("")
    setName("")
    setInitialPassword("")
    setRoles([])
    setError(null)
    setSubmitting(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const emailResult = validateEmail(email)
    const nameResult = validateName(name)
    const passwordResult = validatePassword(initialPassword)
    const rolesResult = validateRoleSelection(roles)
    const firstInvalid = [emailResult, nameResult, passwordResult, rolesResult].find(r => !r.ok)
    if (firstInvalid && !firstInvalid.ok) {
      setError(firstInvalid.message)
      return
    }
    if (!emailResult.ok || !nameResult.ok || !passwordResult.ok || !rolesResult.ok) return

    setSubmitting(true)
    const result = await callAction<CreateUserOutput>("identity.createUser", {
      email: emailResult.value,
      name: nameResult.value,
      initialPassword: passwordResult.value,
      roles: rolesResult.value,
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

    onCreated({
      id: result.data.id,
      email: result.data.email,
      name: result.data.name,
      status: "ACTIVE",
      mustChangePassword: true,
      lastLoginAt: null,
      roles: result.data.roles,
    })
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They&rsquo;ll be required to change this password on first login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <Alert variant="destructive" role="alert" id={errorId}>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameFieldId} className="text-sm font-medium text-heading">
              Name
            </label>
            <Input
              id={nameFieldId}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={emailFieldId} className="text-sm font-medium text-heading">
              Email
            </label>
            <Input
              id={emailFieldId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={passwordFieldId} className="text-sm font-medium text-heading">
              Initial password
            </label>
            <Input
              id={passwordFieldId}
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={initialPassword}
              onChange={e => setInitialPassword(e.target.value)}
              aria-describedby={error ? errorId : undefined}
            />
            <p className="text-sm text-body-subtle">At least 8 characters.</p>
          </div>

          <RoleCheckboxGroup legend="Roles" selected={roles} onChange={setRoles} errorId={error ? errorId : undefined} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
