"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Lock, Pencil } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingPanel } from "@/components/data/state-panels"
import { EmployeeForm } from "@/components/employee/employee-form"
import { GovernmentIdsForm } from "@/components/employee/government-ids-form"
import { ContactsList } from "@/components/employee/contacts-list"
import { LinkUserAccountDialog } from "@/components/employee/link-user-account-dialog"
import {
  formatEmployeeName,
  statusBadgeVariant,
  statusLabel,
  type EmployeeDetail,
} from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

export interface EmployeeDetailScreenProps {
  employeeId: string
  canLinkAccount: boolean
}

export function EmployeeDetailScreen({ employeeId, canLinkAccount }: EmployeeDetailScreenProps) {
  const router = useRouter()
  const [result, setResult] = useState<ActionResult<EmployeeDetail> | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingGovIds, setEditingGovIds] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  const load = useCallback(async () => {
    const response = await callAction<EmployeeDetail>("employee.get", { employeeId })
    if (isSessionExpired(response)) {
      router.push(SESSION_EXPIRED_LOGIN_PATH)
      return
    }
    setResult(response)
  }, [employeeId, router])

  useEffect(() => {
    // A fresh inline fetch (not calling the `load` callback above directly) —
    // matches users-screen.tsx's convention for the `set-state-in-effect` lint rule.
    let cancelled = false
    ;(async () => {
      const response = await callAction<EmployeeDetail>("employee.get", { employeeId })
      if (cancelled) return
      if (isSessionExpired(response)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setResult(response)
    })()
    return () => {
      cancelled = true
    }
  }, [employeeId, router])

  if (result === null) {
    return <LoadingPanel label="Loading employee…" />
  }

  if (!result.ok) {
    if (result.error.code === "FORBIDDEN") {
      return (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <Lock className="size-5 text-body-subtle" aria-hidden="true" />
            </div>
            <CardTitle>You don&rsquo;t have permission to view this</CardTitle>
            <CardDescription>Employee records are restricted to Admins and HR/Payroll.</CardDescription>
          </CardHeader>
        </Card>
      )
    }
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <div className="mb-1">
            <AlertTriangle className="size-5 text-fg-danger" aria-hidden="true" />
          </div>
          <CardTitle>Couldn&rsquo;t load this employee</CardTitle>
          <CardDescription>{result.error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  const employee = result.data

  async function handleStatusChange(nextStatus: string | null) {
    if (!nextStatus || nextStatus === employee.status) return
    setStatusSubmitting(true)
    const response = await callAction<{ id: string; status: string }>("employee.setStatus", {
      employeeId: employee.id,
      status: nextStatus,
    })
    setStatusSubmitting(false)
    if (!response.ok) {
      if (isSessionExpired(response)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      return
    }
    setResult({ ok: true, data: { ...employee, status: response.data.status } })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="tc-app-title">{formatEmployeeName(employee)}</h1>
          <p className="text-sm text-body-subtle">{employee.employeeNo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {employee.status === "SEPARATED" ? (
            <Badge variant={statusBadgeVariant(employee.status)}>{statusLabel(employee.status)}</Badge>
          ) : (
            <Select value={employee.status} onValueChange={handleStatusChange} disabled={statusSubmitting}>
              <SelectTrigger aria-label="Employee status" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ON_LEAVE">On leave</SelectItem>
              </SelectContent>
            </Select>
          )}
          {canLinkAccount && (
            <Button variant="outline" onClick={() => setLinkDialogOpen(true)}>
              Link user account
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="government-ids">Government IDs</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          {editingProfile ? (
            <EmployeeForm
              mode="edit"
              employee={employee}
              onSaved={() => {
                setEditingProfile(false)
                load()
              }}
              onCancel={() => setEditingProfile(false)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Identity, contact and employment details.</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <ProfileField label="Hire date" value={employee.hireDate} />
                <ProfileField label="Birth date" value={employee.birthDate} />
                <ProfileField label="Sex" value={employee.sex} />
                <ProfileField label="Civil status" value={employee.civilStatus} />
                <ProfileField label="Personal email" value={employee.emailPersonal} />
                <ProfileField label="Work email" value={employee.emailWork} />
                <ProfileField label="Mobile" value={employee.mobile} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="government-ids">
          {editingGovIds ? (
            <GovernmentIdsForm
              employeeId={employee.id}
              governmentIds={employee.governmentIds}
              onSaved={governmentIds => {
                setEditingGovIds(false)
                setResult({ ok: true, data: { ...employee, governmentIds } })
              }}
              onCancel={() => setEditingGovIds(false)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Government IDs</CardTitle>
                <CardDescription>SSS, PhilHealth, Pag-IBIG and TIN numbers.</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => setEditingGovIds(true)}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <ProfileField label="SSS no." value={employee.governmentIds?.sssNo ?? null} />
                <ProfileField label="PhilHealth no." value={employee.governmentIds?.philhealthNo ?? null} />
                <ProfileField label="Pag-IBIG no." value={employee.governmentIds?.pagibigNo ?? null} />
                <ProfileField label="TIN" value={employee.governmentIds?.tin ?? null} />
                <ProfileField label="HDMF MID" value={employee.governmentIds?.hdmfMid ?? null} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsList contacts={employee.contacts} />
        </TabsContent>
      </Tabs>

      <LinkUserAccountDialog
        open={linkDialogOpen}
        employeeId={employee.id}
        employeeName={formatEmployeeName(employee)}
        onOpenChange={setLinkDialogOpen}
        onLinked={() => setLinkDialogOpen(false)}
      />
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-body-subtle">{label}</span>
      <span className="text-sm text-heading">{value || <span className="text-body-subtle">—</span>}</span>
    </div>
  )
}
