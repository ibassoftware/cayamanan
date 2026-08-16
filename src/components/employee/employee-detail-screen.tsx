"use client"

// The Philippine "201 file" — full employee detail screen (ADMIN/HR_PAYROLL). Header/
// summary band + six purpose-grouped tabs: Personal, Employment, Government, Family,
// Background, Onboarding. Each tab manages its own read/edit toggle and (for repeating
// collections) add/edit/remove dialogs; this screen only owns the single `employee.get`
// fetch, the four required loading/empty/error/no-permission states, and merging each
// tab's successful mutation back into local state (no full refetch needed — every tab
// hands back exactly the fields it changed).
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Lock, Pencil } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingPanel } from "@/components/data/state-panels"
import { BackgroundTab } from "@/components/employee/background-tab"
import { EmployeePhoto } from "@/components/employee/employee-photo"
import { EmploymentTab } from "@/components/employee/employment-tab"
import { FamilyTab } from "@/components/employee/family-tab"
import { GovernmentIdsForm } from "@/components/employee/government-ids-form"
import { LinkUserAccountDialog } from "@/components/employee/link-user-account-dialog"
import { OnboardingTab } from "@/components/employee/onboarding-tab"
import { PersonalTab } from "@/components/employee/personal-tab"
import {
  employeeInitials,
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
  const [editingGovIds, setEditingGovIds] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [departmentName, setDepartmentName] = useState<string | null>(null)
  const [positionTitle, setPositionTitle] = useState<string | null>(null)

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

  // Header band's department/position labels — `employee.get` only returns ids (see
  // schema.ts's comment on why these are plain ids, not a join). Re-resolved whenever
  // the assignment changes (e.g. after the Employment tab's own edit).
  const departmentId = result?.ok ? result.data.departmentId : null
  const positionId = result?.ok ? result.data.positionId : null
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (departmentId) {
        const response = await callAction<{ departments: { id: string; name: string }[] }>("org.listDepartments")
        if (!cancelled && response.ok) setDepartmentName(response.data.departments.find(d => d.id === departmentId)?.name ?? null)
      } else if (!cancelled) {
        setDepartmentName(null)
      }
      if (positionId) {
        const response = await callAction<{ positions: { id: string; title: string }[] }>("org.listPositions")
        if (!cancelled && response.ok) setPositionTitle(response.data.positions.find(p => p.id === positionId)?.title ?? null)
      } else if (!cancelled) {
        setPositionTitle(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [departmentId, positionId])

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

  /** Merges a tab's successful mutation straight into local state — every tab hands
   * back exactly the fields it changed, so no refetch (and no lost tab selection). */
  function patchEmployee(patch: Partial<EmployeeDetail>) {
    setResult({ ok: true, data: { ...employee, ...patch } })
  }

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
    patchEmployee({ status: response.data.status })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <EmployeePhoto
              employeeId={employee.id}
              documents={employee.documents}
              initials={employeeInitials(employee)}
              onChange={documents => patchEmployee({ documents })}
            />
            <div className="flex flex-col gap-0.5">
              <h1 className="tc-app-title">{formatEmployeeName(employee)}</h1>
              <p className="text-sm text-body-subtle">{employee.employeeNo}</p>
              <p className="text-sm text-body-subtle">
                {[departmentName, positionTitle].filter(Boolean).join(" · ") || "No department/position assigned yet"}
              </p>
            </div>
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
        </CardContent>
      </Card>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="government">Government</TabsTrigger>
          <TabsTrigger value="family">Family</TabsTrigger>
          <TabsTrigger value="background">Background</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <PersonalTab employee={employee} onChange={patchEmployee} />
        </TabsContent>

        <TabsContent value="employment">
          <EmploymentTab employee={employee} onChange={patchEmployee} />
        </TabsContent>

        <TabsContent value="government">
          {editingGovIds ? (
            <GovernmentIdsForm
              employeeId={employee.id}
              governmentIds={employee.governmentIds}
              onSaved={governmentIds => {
                setEditingGovIds(false)
                patchEmployee({ governmentIds })
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
              <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <GovernmentIdField label="SSS no." value={employee.governmentIds?.sssNo ?? null} />
                <GovernmentIdField label="PhilHealth no." value={employee.governmentIds?.philhealthNo ?? null} />
                <GovernmentIdField label="Pag-IBIG no." value={employee.governmentIds?.pagibigNo ?? null} />
                <GovernmentIdField label="TIN" value={employee.governmentIds?.tin ?? null} />
                <GovernmentIdField label="HDMF MID" value={employee.governmentIds?.hdmfMid ?? null} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="family">
          <FamilyTab employee={employee} onChange={patchEmployee} />
        </TabsContent>

        <TabsContent value="background">
          <BackgroundTab employee={employee} onChange={patchEmployee} />
        </TabsContent>

        <TabsContent value="onboarding">
          <OnboardingTab employee={employee} onChange={patchEmployee} />
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

function GovernmentIdField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-body-subtle">{label}</span>
      <span className="text-sm text-heading">{value || <span className="text-body-subtle">—</span>}</span>
    </div>
  )
}
