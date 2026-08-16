// Pure, framework-free helpers for RelationTypeahead (relation-typeahead.tsx) — kept
// separate so the "should we offer Create / Create and Edit" decision and the status
// line shown to screen readers are unit-testable without a DOM, mirroring the
// settings-state.ts / users-state.ts split used elsewhere in this codebase.

export interface RelationOption {
  id: string
  label: string
  /** Optional secondary line shown under the label, e.g. a department's code. */
  description?: string
}

export type RelationComboboxItem =
  | { kind: "option"; option: RelationOption }
  | { kind: "create"; query: string }
  | { kind: "create-and-edit"; query: string }

export interface RelationItemCapabilities {
  /** Whether the "Create" quick-create row can be offered. */
  quickCreate: boolean
  /** Whether the "Create and Edit" row can be offered. */
  createAndEdit: boolean
}

/**
 * Builds the rows the popup renders: the loaded options, followed by up to two
 * synthetic "Create ..." rows (Odoo-style) when the typed query doesn't already
 * exactly match an existing option's label. Matching is case-insensitive and
 * trims whitespace so "Finance" and "finance " don't both offer to create a
 * duplicate department.
 */
export function buildRelationItems(
  options: RelationOption[],
  query: string,
  capabilities: RelationItemCapabilities,
): RelationComboboxItem[] {
  const items: RelationComboboxItem[] = options.map(option => ({ kind: "option", option }))

  const trimmed = query.trim()
  if (trimmed === "") {
    return items
  }

  const normalized = trimmed.toLocaleLowerCase()
  const exactMatch = options.some(option => option.label.trim().toLocaleLowerCase() === normalized)
  if (exactMatch) {
    return items
  }

  if (capabilities.quickCreate) {
    items.push({ kind: "create", query: trimmed })
  }
  if (capabilities.createAndEdit) {
    items.push({ kind: "create-and-edit", query: trimmed })
  }
  return items
}

export function isRelationOptionItem(
  item: RelationComboboxItem,
): item is Extract<RelationComboboxItem, { kind: "option" }> {
  return item.kind === "option"
}

/**
 * Case-insensitive substring filter for screens whose backing action returns the
 * whole reference list rather than accepting a server-side search term (e.g.
 * `org.listDepartments`/`listPositions`/`listLocations` — 04-organization-employees.md).
 * Screens wrap this in an async `loadOptions` that re-fetches the list on each call so
 * results stay fresh, then filter client-side with this. Empty query returns every
 * option unfiltered ("show defaults").
 */
export function filterRelationOptions(options: RelationOption[], query: string): RelationOption[] {
  const trimmed = query.trim().toLocaleLowerCase()
  if (trimmed === "") return options
  return options.filter(option => option.label.toLocaleLowerCase().includes(trimmed))
}

export type RelationSearchStatus = "idle" | "loading" | "error"

export interface RelationSearchStatusInput {
  status: RelationSearchStatus
  query: string
  resultCount: number
  errorMessage?: string | null
}

/**
 * Text for the popup's live-region status line (`Combobox.Status`). `null` means
 * render nothing — there's nothing useful to announce yet (empty query, idle).
 */
export function deriveRelationStatusMessage({
  status,
  query,
  resultCount,
  errorMessage,
}: RelationSearchStatusInput): string | null {
  if (status === "loading") {
    return "Searching…"
  }
  if (status === "error") {
    return errorMessage ?? "Couldn't load results. Try again."
  }
  const trimmed = query.trim()
  if (trimmed === "") {
    return null
  }
  if (resultCount === 0) {
    return `No matches for "${trimmed}".`
  }
  return `${resultCount} ${resultCount === 1 ? "result" : "results"}.`
}
