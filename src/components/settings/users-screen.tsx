"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, KeyRound, Lock, MoreHorizontal, ShieldOff, Users2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import { deriveUsersScreenState, formatLastLogin, type UserSummary } from "@/components/settings/users-state"
import { CreateUserDialog } from "@/components/settings/create-user-dialog"
import { EditRolesDialog } from "@/components/settings/edit-roles-dialog"
import { ResetPasswordDialog } from "@/components/settings/reset-password-dialog"
import { ConfirmActionDialog } from "@/components/settings/confirm-action-dialog"
import type { ActionResult } from "@/platform/errors"
import type { Role } from "@/platform/actions"

interface ListUsersOutput {
  users: UserSummary[]
}

type DialogState =
  | { mode: "create" }
  | { mode: "editRoles"; user: UserSummary }
  | { mode: "resetPassword"; user: UserSummary }
  | { mode: "deactivate"; user: UserSummary }
  | { mode: "revokeSessions"; user: UserSummary }
  | null

interface UsersScreenProps {
  currentUserId: string
}

export function UsersScreen({ currentUserId }: UsersScreenProps) {
  const router = useRouter()
  const [result, setResult] = useState<ActionResult<ListUsersOutput> | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)

  const fetchUsers = useCallback(async () => {
    const response = await callAction<ListUsersOutput>("identity.listUsers")
    if (isSessionExpired(response)) {
      router.push(SESSION_EXPIRED_LOGIN_PATH)
      return
    }
    setResult(response)
  }, [router])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const response = await callAction<ListUsersOutput>("identity.listUsers")
      if (cancelled) return
      if (isSessionExpired(response)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setResult(response)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fetch; `fetchUsers` (used by the "Try again" retry button) intentionally duplicates this rather than being called here, matching system-settings-screen.tsx's convention for the same lint rule (react-hooks/set-state-in-effect flags calling a setState-carrying useCallback from an effect).
  }, [])

  const state = deriveUsersScreenState(result)

  function upsertUser(user: UserSummary) {
    setResult(current =>
      current && current.ok
        ? {
            ok: true,
            data: {
              users: [...current.data.users.filter(u => u.id !== user.id), user].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
            },
          }
        : current,
    )
  }

  function patchUser(userId: string, patch: Partial<UserSummary>) {
    setResult(current =>
      current && current.ok
        ? {
            ok: true,
            data: {
              users: current.data.users.map(u => (u.id === userId ? { ...u, ...patch } : u)),
            },
          }
        : current,
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Users</h1>
        {state.status === "ready" && (
          <Button onClick={() => setDialogState({ mode: "create" })}>Create user</Button>
        )}
      </div>

      {state.status === "loading" && (
        <Card className="max-w-3xl">
          <CardContent className="flex items-center gap-3 py-2 text-body-subtle">
            <Spinner />
            <span>Loading users…</span>
          </CardContent>
        </Card>
      )}

      {state.status === "no-permission" && (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <Lock className="size-5 text-body-subtle" aria-hidden="true" />
            </div>
            <CardTitle>You don&rsquo;t have permission to view this</CardTitle>
            <CardDescription>User management is restricted to Admins.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {state.status === "error" && (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <AlertTriangle className="size-5 text-fg-danger" aria-hidden="true" />
            </div>
            <CardTitle>Couldn&rsquo;t load users</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => fetchUsers()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {state.status === "ready" && state.users.length === 0 && (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <Users2 className="size-5 text-body-subtle" aria-hidden="true" />
            </div>
            <CardTitle>No users yet</CardTitle>
            <CardDescription>Create the first user account for this company.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setDialogState({ mode: "create" })}>Create user</Button>
          </CardContent>
        </Card>
      )}

      {state.status === "ready" && state.users.length > 0 && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border border-b bg-muted text-left">
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Email
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Roles
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Last login
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-heading">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.users.map(user => (
                <tr key={user.id} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium text-heading">{user.name}</td>
                  <td className="px-4 py-2 text-body-subtle">{user.email}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map(role => (
                        <Badge key={role} variant="brand">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={user.status === "ACTIVE" ? "success" : "secondary"}>{user.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-body-subtle">{formatLastLogin(user.lastLoginAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="outline" size="icon-sm">
                            <MoreHorizontal aria-hidden="true" />
                            <span className="sr-only">Actions for {user.name}</span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDialogState({ mode: "editRoles", user })}>
                          Edit roles
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDialogState({ mode: "resetPassword", user })}>
                          <KeyRound aria-hidden="true" />
                          Reset password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDialogState({ mode: "revokeSessions", user })}>
                          <ShieldOff aria-hidden="true" />
                          Revoke sessions
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={user.id === currentUserId || user.status !== "ACTIVE"}
                          onClick={() => setDialogState({ mode: "deactivate", user })}
                        >
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserDialog
        open={dialogState?.mode === "create"}
        onOpenChange={open => !open && setDialogState(null)}
        onCreated={user => {
          upsertUser(user)
          setDialogState(null)
        }}
      />

      <EditRolesDialog
        user={dialogState?.mode === "editRoles" ? dialogState.user : null}
        onOpenChange={open => !open && setDialogState(null)}
        onSaved={(userId, roles: Role[]) => {
          patchUser(userId, { roles })
          setDialogState(null)
        }}
      />

      <ResetPasswordDialog
        user={dialogState?.mode === "resetPassword" ? dialogState.user : null}
        onOpenChange={open => !open && setDialogState(null)}
        onReset={userId => {
          patchUser(userId, { mustChangePassword: true })
          setDialogState(null)
        }}
      />

      <ConfirmActionDialog
        open={dialogState?.mode === "deactivate"}
        title="Deactivate user"
        description={
          dialogState?.mode === "deactivate" ? (
            <>
              <strong className="font-medium text-heading">{dialogState.user.name}</strong> will no longer be
              able to sign in, and their current session will stop working immediately.
            </>
          ) : null
        }
        confirmLabel="Deactivate"
        onOpenChange={open => !open && setDialogState(null)}
        onConfirm={() =>
          callAction<{ id: string; status: string }>("identity.deactivateUser", {
            userId: dialogState?.mode === "deactivate" ? dialogState.user.id : "",
          })
        }
        onSuccess={data => {
          patchUser(data.id, { status: data.status })
          setDialogState(null)
        }}
      />

      <ConfirmActionDialog
        open={dialogState?.mode === "revokeSessions"}
        title="Revoke sessions"
        description={
          dialogState?.mode === "revokeSessions" ? (
            <>
              <strong className="font-medium text-heading">{dialogState.user.name}</strong> will be signed out
              of every active session. Their account stays active.
            </>
          ) : null
        }
        confirmLabel="Revoke sessions"
        onOpenChange={open => !open && setDialogState(null)}
        onConfirm={() =>
          callAction<{ id: string }>("identity.revokeSessions", {
            userId: dialogState?.mode === "revokeSessions" ? dialogState.user.id : "",
          })
        }
        onSuccess={() => setDialogState(null)}
      />
    </div>
  )
}
