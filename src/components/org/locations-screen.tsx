"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { MapPin, MoreHorizontal } from "lucide-react"

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
import { LocationForm } from "@/components/org/location-form"
import type { Location } from "@/components/org/org-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

type DialogState = { mode: "create" } | { mode: "edit"; location: Location } | null

export function LocationsScreen() {
  const router = useRouter()
  const switchId = useId()
  const [result, setResult] = useState<ActionResult<{ locations: Location[] }> | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)

  const load = useCallback(
    async (nextIncludeInactive: boolean) => {
      const response = await callAction<{ locations: Location[] }>("org.listLocations", {
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
      const response = await callAction<{ locations: Location[] }>("org.listLocations", { includeInactive })
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

  const state = deriveListScreenState(result ? (result.ok ? { ok: true, data: result.data.locations } : result) : null)

  const tableState: ListScreenState<Location> =
    state.status === "ready"
      ? {
          status: "ready",
          items: sortRows(filterBySearch(state.items, search, l => `${l.name} ${l.code}`), sort, (row, columnId) =>
            columnId === "isActive" ? Number(row.isActive) : (row[columnId as keyof Location] as string | number),
          ),
        }
      : state

  function upsert(location: Location) {
    setResult(current =>
      current && current.ok
        ? { ok: true, data: { locations: [...current.data.locations.filter(l => l.id !== location.id), location] } }
        : current,
    )
    setDialogState(null)
  }

  const columns: DataTableColumn<Location>[] = [
    { id: "name", header: "Name", sortable: true, cell: l => <span className="font-medium text-heading">{l.name}</span> },
    { id: "code", header: "Code", sortable: true, cell: l => l.code },
    { id: "timezone", header: "Timezone", cell: l => l.timezone },
    {
      id: "isActive",
      header: "Status",
      cell: l => <Badge variant={l.isActive ? "success" : "secondary"}>{l.isActive ? "Active" : "Archived"}</Badge>,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Locations</h1>
        <Button onClick={() => setDialogState({ mode: "create" })}>Create location</Button>
      </div>

      <DataTable
        aria-label="Locations"
        state={tableState}
        columns={columns}
        getRowId={l => l.id}
        onRetry={() => load(includeInactive)}
        errorTitle="Couldn’t load locations"
        noPermission={{ description: "Location management is restricted to Admins and HR/Payroll." }}
        emptyState={{
          icon: MapPin,
          title: "No locations yet",
          description: "Create your first work location to start assigning employees to it.",
          action: { label: "Create location", onClick: () => setDialogState({ mode: "create" }) },
        }}
        search={{ value: search, onChange: setSearch, placeholder: "Search locations…", "aria-label": "Search locations" }}
        sort={{ value: sort, onChange: setSort }}
        filters={
          <label htmlFor={switchId} className="flex items-center gap-2 text-sm text-body-subtle">
            <Switch id={switchId} checked={includeInactive} onCheckedChange={setIncludeInactive} size="sm" />
            Show archived
          </label>
        }
        rowActions={location => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontal aria-hidden="true" />
                  <span className="sr-only">Actions for {location.name}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialogState({ mode: "edit", location })}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant={location.isActive ? "destructive" : undefined}
                onClick={async () => {
                  const response = location.isActive
                    ? await callAction<{ id: string; isActive: boolean }>("org.archiveLocation", { id: location.id })
                    : await callAction<Location>("org.updateLocation", { id: location.id, isActive: true })
                  if (response.ok) load(includeInactive)
                }}
              >
                {location.isActive ? "Archive" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit location" : "Create location"}</DialogTitle>
            <DialogDescription>Work locations employees can be assigned to.</DialogDescription>
          </DialogHeader>
          {dialogState && (
            <LocationForm
              mode={dialogState.mode}
              location={dialogState.mode === "edit" ? dialogState.location : null}
              onSaved={upsert}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
