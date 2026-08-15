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
import { RoleCheckboxGroup } from "@/components/settings/role-checkbox-group"
import { validateRoleSelection, type UserSummary } from "@/components/settings/users-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { Role } from "@/platform/actions"

interface SetUserRolesOutput {
  id: string
  roles: Role[]
}

interface EditRolesDialogProps {
  user: UserSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: (userId: string, roles: Role[]) => void
}

export function EditRolesDialog({ user, onOpenChange, onSaved }: EditRolesDialogProps) {
  return (
    <Dialog open={user !== null} onOpenChange={open => !open && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit roles</DialogTitle>
          <DialogDescription>
            {user && (
              <>
                Change what <strong className="font-medium text-heading">{user.name}</strong> can do. This
                replaces their current role set.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Keyed by user id so switching targets mounts a fresh form with that
            user's current roles, rather than reusing state across targets. */}
        {user && (
          <EditRolesForm
            key={user.id}
            user={user}
            onCancel={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditRolesForm({
  user,
  onCancel,
  onSaved,
}: {
  user: UserSummary
  onCancel: () => void
  onSaved: (userId: string, roles: Role[]) => void
}) {
  const router = useRouter()
  const errorId = useId()
  const [roles, setRoles] = useState<Role[]>(user.roles)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const rolesResult = validateRoleSelection(roles)
    if (!rolesResult.ok) {
      setError(rolesResult.message)
      return
    }

    setSubmitting(true)
    const result = await callAction<SetUserRolesOutput>("identity.setUserRoles", {
      userId: user.id,
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

    onSaved(result.data.id, result.data.roles)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive" role="alert" id={errorId}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <RoleCheckboxGroup legend="Roles" selected={roles} onChange={setRoles} errorId={error ? errorId : undefined} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save roles"}
        </Button>
      </DialogFooter>
    </form>
  )
}
