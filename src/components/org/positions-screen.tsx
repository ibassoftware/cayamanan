"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Briefcase, MoreHorizontal } from "lucide-react"

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
import { PositionForm } from "@/components/org/position-form"
import type { Position } from "@/components/org/org-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

type DialogState = { mode: "create" } | { mode: "edit"; position: Position } | null

export function PositionsScreen() {
  const router = useRouter()
  const switchId = useId()
  const [result, setResult] = useState<ActionResult<{ positions: Position[] }> | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)

  const load = useCallback(
    async (nextIncludeInactive: boolean) => {
      const response = await callAction<{ positions: Position[] }>("org.listPositions", {
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
      const response = await callAction<{ positions: Position[] }>("org.listPositions", { includeInactive })
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

  const state = deriveListScreenState(result ? (result.ok ? { ok: true, data: result.data.positions } : result) : null)

  const tableState: ListScreenState<Position> =
    state.status === "ready"
      ? {
          status: "ready",
          items: sortRows(filterBySearch(state.items, search, p => `${p.title} ${p.code}`), sort, (row, columnId) =>
            columnId === "isActive" ? Number(row.isActive) : (row[columnId as keyof Position] as string | number),
          ),
        }
      : state

  function upsert(position: Position) {
    setResult(current =>
      current && current.ok
        ? { ok: true, data: { positions: [...current.data.positions.filter(p => p.id !== position.id), position] } }
        : current,
    )
    setDialogState(null)
  }

  const columns: DataTableColumn<Position>[] = [
    { id: "title", header: "Title", sortable: true, cell: p => <span className="font-medium text-heading">{p.title}</span> },
    { id: "code", header: "Code", sortable: true, cell: p => p.code },
    {
      id: "isActive",
      header: "Status",
      cell: p => <Badge variant={p.isActive ? "success" : "secondary"}>{p.isActive ? "Active" : "Archived"}</Badge>,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Positions</h1>
        <Button onClick={() => setDialogState({ mode: "create" })}>Create position</Button>
      </div>

      <DataTable
        aria-label="Positions"
        state={tableState}
        columns={columns}
        getRowId={p => p.id}
        onRetry={() => load(includeInactive)}
        errorTitle="Couldn’t load positions"
        noPermission={{ description: "Position management is restricted to Admins and HR/Payroll." }}
        emptyState={{
          icon: Briefcase,
          title: "No positions yet",
          description: "Create your first job position/title to start assigning employees to it.",
          action: { label: "Create position", onClick: () => setDialogState({ mode: "create" }) },
        }}
        search={{ value: search, onChange: setSearch, placeholder: "Search positions…", "aria-label": "Search positions" }}
        sort={{ value: sort, onChange: setSort }}
        filters={
          <label htmlFor={switchId} className="flex items-center gap-2 text-sm text-body-subtle">
            <Switch id={switchId} checked={includeInactive} onCheckedChange={setIncludeInactive} size="sm" />
            Show archived
          </label>
        }
        rowActions={position => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontal aria-hidden="true" />
                  <span className="sr-only">Actions for {position.title}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialogState({ mode: "edit", position })}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant={position.isActive ? "destructive" : undefined}
                onClick={async () => {
                  const response = position.isActive
                    ? await callAction<{ id: string; isActive: boolean }>("org.archivePosition", { id: position.id })
                    : await callAction<Position>("org.updatePosition", { id: position.id, isActive: true })
                  if (response.ok) load(includeInactive)
                }}
              >
                {position.isActive ? "Archive" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit position" : "Create position"}</DialogTitle>
            <DialogDescription>Job positions/titles employees can be assigned to.</DialogDescription>
          </DialogHeader>
          {dialogState && (
            <PositionForm
              mode={dialogState.mode}
              position={dialogState.mode === "edit" ? dialogState.position : null}
              onSaved={upsert}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
