"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Landmark, MoreHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
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
import { CostCenterForm } from "@/components/org/cost-center-form"
import type { CostCenter } from "@/components/org/org-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

type DialogState = { mode: "create" } | { mode: "edit"; costCenter: CostCenter } | null

export function CostCentersScreen() {
  const router = useRouter()
  const switchId = useId()
  const [result, setResult] = useState<ActionResult<{ costCenters: CostCenter[] }> | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)

  const load = useCallback(
    async (nextIncludeInactive: boolean) => {
      const response = await callAction<{ costCenters: CostCenter[] }>("org.listCostCenters", {
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
      const response = await callAction<{ costCenters: CostCenter[] }>("org.listCostCenters", { includeInactive })
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

  const state = deriveListScreenState(result ? (result.ok ? { ok: true, data: result.data.costCenters } : result) : null)

  const tableState: ListScreenState<CostCenter> =
    state.status === "ready"
      ? {
          status: "ready",
          items: sortRows(filterBySearch(state.items, search, c => `${c.name} ${c.code}`), sort, (row, columnId) =>
            columnId === "isActive" ? Number(row.isActive) : (row[columnId as keyof CostCenter] as string | number),
          ),
        }
      : state

  function upsert(costCenter: CostCenter) {
    setResult(current =>
      current && current.ok
        ? { ok: true, data: { costCenters: [...current.data.costCenters.filter(c => c.id !== costCenter.id), costCenter] } }
        : current,
    )
    setDialogState(null)
  }

  const columns: DataTableColumn<CostCenter>[] = [
    { id: "name", header: "Name", sortable: true, cell: c => <span className="font-medium text-heading">{c.name}</span> },
    { id: "code", header: "Code", sortable: true, cell: c => c.code },
    {
      id: "isActive",
      header: "Status",
      cell: c => <Badge variant={c.isActive ? "success" : "secondary"}>{c.isActive ? "Active" : "Archived"}</Badge>,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Cost centers</h1>
        <Button onClick={() => setDialogState({ mode: "create" })}>Create cost center</Button>
      </div>

      <DataTable
        aria-label="Cost centers"
        state={tableState}
        columns={columns}
        getRowId={c => c.id}
        onRetry={() => load(includeInactive)}
        errorTitle="Couldn’t load cost centers"
        noPermission={{ description: "Cost center management is restricted to Admins and HR/Payroll." }}
        emptyState={{
          icon: Landmark,
          title: "No cost centers yet",
          description: "Create your first cost center — used later by payroll reporting.",
          action: { label: "Create cost center", onClick: () => setDialogState({ mode: "create" }) },
        }}
        search={{ value: search, onChange: setSearch, placeholder: "Search cost centers…", "aria-label": "Search cost centers" }}
        sort={{ value: sort, onChange: setSort }}
        filters={
          <label htmlFor={switchId} className="flex items-center gap-2 text-sm text-body-subtle">
            <Switch id={switchId} checked={includeInactive} onCheckedChange={setIncludeInactive} size="sm" />
            Show archived
          </label>
        }
        rowActions={costCenter => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontal aria-hidden="true" />
                  <span className="sr-only">Actions for {costCenter.name}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialogState({ mode: "edit", costCenter })}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant={costCenter.isActive ? "destructive" : undefined}
                onClick={async () => {
                  const response = costCenter.isActive
                    ? await callAction<{ id: string; isActive: boolean }>("org.archiveCostCenter", { id: costCenter.id })
                    : await callAction<CostCenter>("org.updateCostCenter", { id: costCenter.id, isActive: true })
                  if (response.ok) load(includeInactive)
                }}
              >
                {costCenter.isActive ? "Archive" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit cost center" : "Create cost center"}</DialogTitle>
            <DialogDescription>Cost centers are used by payroll reporting.</DialogDescription>
          </DialogHeader>
          {dialogState && (
            <CostCenterForm
              mode={dialogState.mode}
              costCenter={dialogState.mode === "edit" ? dialogState.costCenter : null}
              onSaved={upsert}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
