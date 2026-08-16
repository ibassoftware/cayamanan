"use client"

// Generic list/table shell every model screen (Departments, Positions, Locations,
// Cost Centers, Employees, ...) configures rather than reimplementing. Visual
// language matches the hand-rolled tables in system-settings-screen.tsx and
// users-screen.tsx exactly (same wrapper/thead/row classes) — this just factors that
// markup out from behind column config, sorting, paging, search, filter slots, row
// actions, and the four required states (loading / empty / error / no-permission).
//
// Data-fetching seam: this component never imports `callAction` or any domain action.
// Screens own fetching and hand in a `ListScreenState<T>` (see list-state.ts) plus
// controlled search/sort/pagination callbacks; whether those are served client-side
// or round-trip to the server is entirely the screen's decision.
import type { ReactNode } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { nextSortState } from "@/components/data/list-state"
import type { ListScreenState, SortState } from "@/components/data/list-state"
import { EmptyPanel, ErrorPanel, LoadingPanel, NoPermissionPanel } from "@/components/data/state-panels"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  align?: "left" | "right"
  headerClassName?: string
  cellClassName?: string
}

export interface DataTableSearch {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  "aria-label"?: string
}

export interface DataTableSort {
  value: SortState | null
  onChange: (next: SortState | null) => void
}

export interface DataTablePagination {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
}

export interface DataTableEmptyState {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export interface DataTableProps<T> {
  /** The label announced to assistive tech for this table, e.g. "Employees". */
  "aria-label": string
  state: ListScreenState<T>
  columns: DataTableColumn<T>[]
  getRowId: (row: T) => string
  onRetry?: () => void
  errorTitle?: string
  noPermission?: { title?: string; description: string }
  emptyState: DataTableEmptyState
  search?: DataTableSearch
  sort?: DataTableSort
  /** Extra filter controls (selects, date pickers, ...) rendered next to search. */
  filters?: ReactNode
  pagination?: DataTablePagination
  rowActions?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  /** Primary action rendered top-right of the toolbar, e.g. a "Create" button. */
  toolbarEnd?: ReactNode
  className?: string
}

function nextSortIcon(sort: DataTableSort | undefined, columnId: string) {
  if (!sort?.value || sort.value.columnId !== columnId) return ChevronsUpDown
  return sort.value.direction === "asc" ? ChevronUp : ChevronDown
}

function ariaSortFor(sort: DataTableSort | undefined, columnId: string): "ascending" | "descending" | "none" {
  if (!sort?.value || sort.value.columnId !== columnId) return "none"
  return sort.value.direction === "asc" ? "ascending" : "descending"
}

export function DataTable<T>({
  "aria-label": ariaLabel,
  state,
  columns,
  getRowId,
  onRetry,
  errorTitle = "Couldn’t load this list",
  noPermission,
  emptyState,
  search,
  sort,
  filters,
  pagination,
  rowActions,
  onRowClick,
  toolbarEnd,
  className,
}: DataTableProps<T>) {
  const showToolbar = Boolean(search || filters || toolbarEnd)

  return (
    // `min-w-0` is required here and on the scroll wrapper below: without it, a flex
    // item defaults to a minimum width equal to its content's intrinsic width, so a
    // wide table would push this column wider than the viewport instead of the
    // wrapper's own `overflow-x-auto` containing the overflow internally.
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {search && (
              <div className="relative w-64 max-w-full">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-body-subtle"
                  aria-hidden="true"
                />
                <Input
                  value={search.value}
                  onChange={e => search.onChange(e.target.value)}
                  placeholder={search.placeholder ?? "Search…"}
                  aria-label={search["aria-label"] ?? "Search"}
                  className="pl-8"
                />
              </div>
            )}
            {filters}
          </div>
          {toolbarEnd}
        </div>
      )}

      {state.status === "loading" && <LoadingPanel label={`Loading ${ariaLabel.toLowerCase()}…`} />}

      {state.status === "no-permission" && (
        <NoPermissionPanel description={noPermission?.description ?? "You don’t have access to this list."} title={noPermission?.title} />
      )}

      {state.status === "error" && <ErrorPanel title={errorTitle} message={state.message} onRetry={onRetry} />}

      {state.status === "ready" && state.items.length === 0 && search && search.value.trim() !== "" && (
        <EmptyPanel
          icon={Search}
          title="No results"
          description={`Nothing matches "${search.value.trim()}". Try a different search.`}
          action={{ label: "Clear search", onClick: () => search.onChange("") }}
        />
      )}

      {state.status === "ready" && state.items.length === 0 && (!search || search.value.trim() === "") && (
        <EmptyPanel icon={emptyState.icon} title={emptyState.title} description={emptyState.description} action={emptyState.action} />
      )}

      {state.status === "ready" && state.items.length > 0 && (
        <div className="min-w-0 overflow-x-auto rounded-lg ring-1 ring-foreground/10 contain-layout">
          <table className="w-full border-collapse text-sm" aria-label={ariaLabel}>
            <thead>
              <tr className="border-border border-b bg-muted text-left">
                {columns.map(column => {
                  const Icon = nextSortIcon(sort, column.id)
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={column.sortable ? ariaSortFor(sort, column.id) : undefined}
                      className={cn(
                        "px-4 py-2 font-medium text-heading",
                        column.align === "right" && "text-right",
                        column.headerClassName,
                      )}
                    >
                      {column.sortable && sort ? (
                        <button
                          type="button"
                          onClick={() => sort.onChange(nextSortState(sort.value, column.id))}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm font-medium text-heading hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            column.align === "right" && "flex-row-reverse",
                          )}
                        >
                          {column.header}
                          <Icon className="size-3.5 text-body-subtle" aria-hidden="true" />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  )
                })}
                {rowActions && (
                  <th scope="col" className="px-4 py-2 text-right font-medium text-heading">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {state.items.map(row => {
                const rowId = getRowId(row)
                return (
                  <tr
                    key={rowId}
                    className={cn(
                      "border-border border-b last:border-b-0",
                      onRowClick && "cursor-pointer hover:bg-muted/50",
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map(column => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-4 py-2 text-body-subtle",
                          column.align === "right" && "text-right",
                          column.cellClassName,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {state.status === "ready" && state.items.length > 0 && pagination && (
        <DataTablePager {...pagination} />
      )}
    </div>
  )
}

function DataTablePager({ page, pageSize, totalItems, onPageChange }: DataTablePagination) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-body-subtle">
      <span>
        {totalItems === 0 ? "0 results" : `${start}–${end} of ${totalItems}`}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
