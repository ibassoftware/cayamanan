// `RelationTypeahead.loadOptions`/`onQuickCreate` implementations for the three org
// reference lists an Employee is assigned to (Department/Position/Location —
// 04-organization-employees.md). None of `org.listDepartments`/`listPositions`/
// `listLocations` accept a server-side search term, so `loadOptions` re-fetches the
// whole (small, reference-data-sized) list on every call and filters client-side with
// `filterRelationOptions` — screens own fetching, per relation-typeahead.tsx's contract.
import { callAction } from "@/lib/actions-client"
import { filterRelationOptions, type RelationOption } from "@/components/data/relation-typeahead-state"
import type { ActionResult } from "@/platform/errors"
import {
  deriveCodeFromName,
  departmentToOption,
  locationToOption,
  positionToOption,
  type Department,
  type Location,
  type Position,
} from "@/components/org/org-state"

function toOptionsResult(options: RelationOption[]): ActionResult<{ options: RelationOption[] }> {
  return { ok: true, data: { options } }
}

/** `excludeId` keeps a department out of its own "parent" typeahead while editing it. */
export function loadDepartmentOptions(query: string, options?: { excludeId?: string }): Promise<ActionResult<{ options: RelationOption[] }>> {
  return callAction<{ departments: Department[] }>("org.listDepartments").then(result => {
    if (!result.ok) return result
    const rows = options?.excludeId ? result.data.departments.filter(d => d.id !== options.excludeId) : result.data.departments
    return toOptionsResult(filterRelationOptions(rows.map(departmentToOption), query))
  })
}

export function loadPositionOptions(query: string): Promise<ActionResult<{ options: RelationOption[] }>> {
  return callAction<{ positions: Position[] }>("org.listPositions").then(result => {
    if (!result.ok) return result
    return toOptionsResult(filterRelationOptions(result.data.positions.map(positionToOption), query))
  })
}

export function loadLocationOptions(query: string): Promise<ActionResult<{ options: RelationOption[] }>> {
  return callAction<{ locations: Location[] }>("org.listLocations").then(result => {
    if (!result.ok) return result
    return toOptionsResult(filterRelationOptions(result.data.locations.map(locationToOption), query))
  })
}

export async function quickCreateDepartment(name: string): Promise<ActionResult<RelationOption>> {
  const result = await callAction<Department>("org.createDepartment", { code: deriveCodeFromName(name), name })
  if (!result.ok) return result
  return { ok: true, data: departmentToOption(result.data) }
}

export async function quickCreatePosition(name: string): Promise<ActionResult<RelationOption>> {
  const result = await callAction<Position>("org.createPosition", { code: deriveCodeFromName(name), title: name })
  if (!result.ok) return result
  return { ok: true, data: positionToOption(result.data) }
}

export async function quickCreateLocation(name: string): Promise<ActionResult<RelationOption>> {
  const result = await callAction<Location>("org.createLocation", { code: deriveCodeFromName(name), name })
  if (!result.ok) return result
  return { ok: true, data: locationToOption(result.data) }
}
