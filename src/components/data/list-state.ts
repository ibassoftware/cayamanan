// Pure, framework-free helpers shared by every list/table screen (Departments,
// Positions, Locations, Cost Centers, Employees, ...). Mirrors the split already
// established by src/components/settings/settings-state.ts and users-state.ts: the
// state-machine and small pure transforms live here, away from React, so they're
// unit-testable without a DOM and reusable across every DataTable consumer.
import type { ActionResult } from "@/platform/errors"

export type ListScreenState<T> =
  | { status: "loading" }
  | { status: "no-permission" }
  | { status: "error"; message: string }
  | { status: "ready"; items: T[] }

/**
 * `result === null` means "fetch in flight or not yet started". A `FORBIDDEN` action
 * error maps to the no-permission state; every other error code maps to the generic
 * error state. Server-side authorization is the source of truth; this is a
 * convenience mapping, not an enforcement point.
 *
 * Screens whose action returns a named property (e.g. `{ employees: [...] }`) map
 * the `ActionResult` to an array before calling this, the same way
 * `deriveSettingsScreenState`/`deriveUsersScreenState` unwrap `{ settings }`/`{ users }`.
 */
export function deriveListScreenState<T>(result: ActionResult<T[]> | null): ListScreenState<T> {
  if (result === null) {
    return { status: "loading" }
  }
  if (!result.ok) {
    if (result.error.code === "FORBIDDEN") {
      return { status: "no-permission" }
    }
    return { status: "error", message: result.error.message }
  }
  return { status: "ready", items: result.data }
}

export type SortDirection = "asc" | "desc"

export interface SortState {
  columnId: string
  direction: SortDirection
}

/** Click cycle for a sortable column header: unsorted -> asc -> desc -> unsorted. */
export function nextSortState(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: "asc" }
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" }
  }
  return null
}

/**
 * Client-side sort for screens that don't page/sort server-side (small reference
 * lists like Departments/Positions/Locations). `getValue` reads whatever field
 * `sort.columnId` refers to; `null`/`undefined` values sort to the start.
 */
export function sortRows<T>(
  rows: T[],
  sort: SortState | null,
  getValue: (row: T, columnId: string) => string | number | null | undefined,
): T[] {
  if (!sort) return rows
  const sorted = [...rows].sort((a, b) => {
    const av = getValue(a, sort.columnId)
    const bv = getValue(b, sort.columnId)
    if (av == null && bv == null) return 0
    if (av == null) return -1
    if (bv == null) return 1
    if (typeof av === "number" && typeof bv === "number") return av - bv
    return String(av).localeCompare(String(bv))
  })
  return sort.direction === "desc" ? sorted.reverse() : sorted
}

/** Case-insensitive substring search for client-side-filtered lists. */
export function filterBySearch<T>(rows: T[], query: string, getSearchText: (row: T) => string): T[] {
  const trimmed = query.trim().toLocaleLowerCase()
  if (trimmed === "") return rows
  return rows.filter(row => getSearchText(row).toLocaleLowerCase().includes(trimmed))
}

export interface PageResult<T> {
  pageRows: T[]
  page: number
  totalPages: number
}

/** Clamps `page` into range and slices `rows` for client-side pagination. */
export function paginateRows<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const start = (clampedPage - 1) * pageSize
  return { pageRows: rows.slice(start, start + pageSize), page: clampedPage, totalPages }
}
