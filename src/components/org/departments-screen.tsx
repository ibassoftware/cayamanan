"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, MoreHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { DataTable, type DataTableColumn } from "@/components/data/data-table"
import {
  deriveListScreenState,
  filterBySearch,
  sortRows,
  type ListScreenState,
  type SortState,
} from "@/components/data/list-state"
import { DepartmentForm } from "@/components/org/department-form"
import type { Department } from "@/components/org/org-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

type DialogState = { mode: "create" } | { mode: "edit"; department: Department } | null

export function DepartmentsScreen() {
  const router = useRouter()
  const switchId = useId()
  const [result, setResult] = useState<ActionResult<{ departments: Department[] }> | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)

  const load = useCallback(
    async (nextIncludeInactive: boolean) => {
      const response = await callAction<{ departments: Department[] }>("org.listDepartments", {
        includeInactive: nextIncludeInactive,
      })
      if (isSessionExpired(response)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setResult(response)
    },
    [router],
  )

  useEffect(() => {
    // A fresh inline fetch (not calling the `load` callback above directly) —
    // matches users-screen.tsx's convention for the `set-state-in-effect` lint rule.
    let cancelled = false
    ;(async () => {
      const response = await callAction<{ departments: Department[] }>("org.listDepartments", { includeInactive })
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
  }, [includeInactive, router])

  const state = deriveListScreenState(result ? (result.ok ? { ok: true, data: result.data.departments } : result) : null)

  const tableState: ListScreenState<Department> =
    state.status === "ready"
      ? {
          status: "ready",
          items: sortRows(filterBySearch(state.items, search, d => `${d.name} ${d.code}`), sort, (row, columnId) =>
            columnId === "isActive" ? Number(row.isActive) : (row[columnId as keyof Department] as string | number),
          ),
        }
      : state

  function upsert(department: Department) {
    setResult(current =>
      current && current.ok
        ? { ok: true, data: { departments: [...current.data.departments.filter(d => d.id !== department.id), department] } }
        : current,
    )
    setDialogState(null)
  }

  const departmentList = state.status === "ready" ? state.items : []
  const parentOf = (id: string | null) => (id ? departmentList.find(d => d.id === id) ?? null : null)

  const columns: DataTableColumn<Department>[] = [
    { id: "name", header: "Name", sortable: true, cell: d => <span className="font-medium text-heading">{d.name}</span> },
    { id: "code", header: "Code", sortable: true, cell: d => d.code },
    {
      id: "parent",
      header: "Parent",
      cell: d => parentOf(d.parentId)?.name ?? <span className="text-body-subtle">—</span>,
    },
    {
      id: "isActive",
      header: "Status",
      cell: d => <Badge variant={d.isActive ? "success" : "secondary"}>{d.isActive ? "Active" : "Archived"}</Badge>,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Departments</h1>
        <Button onClick={() => setDialogState({ mode: "create" })}>Create department</Button>
      </div>

      <DataTable
        aria-label="Departments"
        state={tableState}
        columns={columns}
        getRowId={d => d.id}
        onRetry={() => load(includeInactive)}
        errorTitle="Couldn’t load departments"
        noPermission={{ description: "Department management is restricted to Admins and HR/Payroll." }}
        emptyState={{
          icon: Building2,
          title: "No departments yet",
          description: "Create your first department to start assigning employees to it.",
          action: { label: "Create department", onClick: () => setDialogState({ mode: "create" }) },
        }}
        search={{ value: search, onChange: setSearch, placeholder: "Search departments…", "aria-label": "Search departments" }}
        sort={{ value: sort, onChange: setSort }}
        filters={
          <label htmlFor={switchId} className="flex items-center gap-2 text-sm text-body-subtle">
            <Switch id={switchId} checked={includeInactive} onCheckedChange={setIncludeInactive} size="sm" />
            Show archived
          </label>
        }
        rowActions={department => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontal aria-hidden="true" />
                  <span className="sr-only">Actions for {department.name}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialogState({ mode: "edit", department })}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant={department.isActive ? "destructive" : undefined}
                onClick={async () => {
                  const response = department.isActive
                    ? await callAction<{ id: string; isActive: boolean }>("org.archiveDepartment", { id: department.id })
                    : await callAction<Department>("org.updateDepartment", { id: department.id, isActive: true })
                  if (response.ok) load(includeInactive)
                }}
              >
                {department.isActive ? "Archive" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit department" : "Create department"}</DialogTitle>
            <DialogDescription>Departments organize employees and can be nested under one another.</DialogDescription>
          </DialogHeader>
          {dialogState && (
            <DepartmentForm
              mode={dialogState.mode}
              department={dialogState.mode === "edit" ? dialogState.department : null}
              initialParent={
                dialogState.mode === "edit" && dialogState.department.parentId
                  ? (() => {
                      const p = parentOf(dialogState.department.parentId)
                      return p ? { id: p.id, label: p.name, description: p.code } : null
                    })()
                  : null
              }
              onSaved={upsert}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
