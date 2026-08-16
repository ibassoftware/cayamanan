"use client"

// Read-only self-service view (`employee.getSelf` — 04-organization-employees.md, "read-only
// in MVP"). Deliberately has no Edit affordance anywhere on this screen, unlike
// `/app/employees/[id]` (admin/HR) — self-service profile editing is out of this slice's
// scope, not an oversight.
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingPanel } from "@/components/data/state-panels"
import { ContactsList } from "@/components/employee/contacts-list"
import { formatEmployeeName, statusBadgeVariant, statusLabel, type EmployeeDetail } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-body-subtle">{label}</span>
      <span className="text-sm text-heading">{value || <span className="text-body-subtle">—</span>}</span>
    </div>
  )
}

export function ProfileScreen() {
  const router = useRouter()
  const [result, setResult] = useState<ActionResult<EmployeeDetail> | null>(null)

  const load = useCallback(async () => {
    const response = await callAction<EmployeeDetail>("employee.getSelf")
    if (isSessionExpired(response)) {
      router.push(SESSION_EXPIRED_LOGIN_PATH)
      return
    }
    setResult(response)
  }, [router])

  useEffect(() => {
    // A fresh inline fetch (not calling the `load` callback above directly) —
    // matches users-screen.tsx's convention for the `set-state-in-effect` lint rule.
    let cancelled = false
    ;(async () => {
      const response = await callAction<EmployeeDetail>("employee.getSelf")
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
  }, [router])

  if (result === null) {
    return <LoadingPanel label="Loading your profile…" />
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
          <CardTitle>Couldn&rsquo;t load your profile</CardTitle>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="tc-app-title">{formatEmployeeName(employee)}</h1>
          <p className="text-sm text-body-subtle">{employee.employeeNo}</p>
        </div>
        <Badge variant={statusBadgeVariant(employee.status)}>{statusLabel(employee.status)}</Badge>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="government-ids">Government IDs</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Identity, contact and employment details.</CardDescription>
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
        </TabsContent>

        <TabsContent value="government-ids">
          <Card>
            <CardHeader>
              <CardTitle>Government IDs</CardTitle>
              <CardDescription>SSS, PhilHealth, Pag-IBIG and TIN numbers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <ProfileField label="SSS no." value={employee.governmentIds?.sssNo ?? null} />
              <ProfileField label="PhilHealth no." value={employee.governmentIds?.philhealthNo ?? null} />
              <ProfileField label="Pag-IBIG no." value={employee.governmentIds?.pagibigNo ?? null} />
              <ProfileField label="TIN" value={employee.governmentIds?.tin ?? null} />
              <ProfileField label="HDMF MID" value={employee.governmentIds?.hdmfMid ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsList contacts={employee.contacts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
