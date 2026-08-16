"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Users2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, type DataTableColumn } from "@/components/data/data-table"
import { deriveListScreenState, type ListScreenState } from "@/components/data/list-state"
import { formatEmployeeName, statusBadgeVariant, statusLabel, type EmployeeSummary } from "@/components/employee/employee-state"
import type { Department, Position } from "@/components/org/org-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

const PAGE_SIZE = 25
const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "SEPARATED"] as const

export function EmployeesScreen() {
  const router = useRouter()
  const [result, setResult] = useState<ActionResult<{ employees: EmployeeSummary[]; total: number }> | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>("")
  const [departmentId, setDepartmentId] = useState<string>("")
  const [page, setPage] = useState(1)

  const load = useCallback(
    async (params: { search: string; status: string; departmentId: string; page: number }) => {
      const response = await callAction<{ employees: EmployeeSummary[]; total: number }>("employee.list", {
        search: params.search.trim() || undefined,
        status: params.status || undefined,
        departmentId: params.departmentId || undefined,
        limit: PAGE_SIZE,
        offset: (params.page - 1) * PAGE_SIZE,
      })
      if (isSessionExpired(response)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setResult(response)
    },
    [router],
  )

  // Reference-data lookups for rendering department/position names in the table —
  // employee.list only ever returns ids (see actions/list-employees.ts). Loaded once;
  // these lists are small, tenant-scoped reference data, not paged.
  useEffect(() => {
    void (async () => {
      const [deptResult, posResult] = await Promise.all([
        callAction<{ departments: Department[] }>("org.listDepartments"),
        callAction<{ positions: Position[] }>("org.listPositions"),
      ])
      if (deptResult.ok) setDepartments(deptResult.data.departments)
      if (posResult.ok) setPositions(posResult.data.positions)
    })()
  }, [])

  // Debounce search keystrokes only; status/department/page changes below refetch
  // immediately. `searchMounted` skips the debounce on first render so mount doesn't
  // fire two overlapping fetches.
  const searchMounted = useRef(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true
      return
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setPage(1)
      load({ search, status, departmentId, page: 1 })
    }, 250)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the search keystroke is debounced; status/department/page below refetch synchronously
  }, [search])

  useEffect(() => {
    // A fresh inline fetch (not calling the `load` callback above directly) —
    // matches users-screen.tsx's convention for the `set-state-in-effect` lint rule.
    let cancelled = false
    ;(async () => {
      const response = await callAction<{ employees: EmployeeSummary[]; total: number }>("employee.list", {
        search: search.trim() || undefined,
        status: status || undefined,
        departmentId: departmentId || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + status/department/page-driven refetch; search has its own debounced effect above, `router`/`load` are stable
  }, [status, departmentId, page])

  const state = deriveListScreenState(result ? (result.ok ? { ok: true, data: result.data.employees } : result) : null)
  const total = result?.ok ? result.data.total : 0

  const departmentName = (id: string | null) => (id ? departments.find(d => d.id === id)?.name ?? null : null)
  const positionTitle = (id: string | null) => (id ? positions.find(p => p.id === id)?.title ?? null : null)

  const tableState: ListScreenState<EmployeeSummary> = state

  const columns: DataTableColumn<EmployeeSummary>[] = [
    { id: "employeeNo", header: "Employee No.", cell: e => e.employeeNo },
    { id: "name", header: "Name", cell: e => <span className="font-medium text-heading">{formatEmployeeName(e)}</span> },
    { id: "department", header: "Department", cell: e => departmentName(e.departmentId) ?? <span className="text-body-subtle">—</span> },
    { id: "position", header: "Position", cell: e => positionTitle(e.positionId) ?? <span className="text-body-subtle">—</span> },
    { id: "status", header: "Status", cell: e => <Badge variant={statusBadgeVariant(e.status)}>{statusLabel(e.status)}</Badge> },
    { id: "hireDate", header: "Hire date", cell: e => e.hireDate },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Employees</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/app/employees/import" />}>
            Import
          </Button>
          <Button nativeButton={false} render={<Link href="/app/employees/new" />}>
            Add employee
          </Button>
        </div>
      </div>

      <DataTable
        aria-label="Employees"
        state={tableState}
        columns={columns}
        getRowId={e => e.id}
        onRowClick={e => router.push(`/app/employees/${e.id}`)}
        onRetry={() => load({ search, status, departmentId, page })}
        errorTitle="Couldn’t load employees"
        noPermission={{ description: "Employee records are restricted to Admins and HR/Payroll." }}
        emptyState={{
          icon: Users2,
          title: "No employees yet",
          description: "Add your first employee to get started.",
          action: { label: "Add employee", onClick: () => router.push("/app/employees/new") },
        }}
        search={{ value: search, onChange: setSearch, placeholder: "Search by name or employee number…", "aria-label": "Search employees" }}
        filters={
          <>
            <Select value={status || "ALL"} onValueChange={v => setStatus(!v || v === "ALL" ? "" : v)}>
              <SelectTrigger aria-label="Filter by status" className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={departmentId || "ALL"} onValueChange={v => setDepartmentId(!v || v === "ALL" ? "" : v)}>
              <SelectTrigger aria-label="Filter by department" className="w-48">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All departments</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        pagination={{ page, pageSize: PAGE_SIZE, totalItems: total, onPageChange: setPage }}
      />
    </div>
  )
}
