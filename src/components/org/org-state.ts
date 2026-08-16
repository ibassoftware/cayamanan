// Pure, framework-free helpers shared by the four org reference-data screens
// (Departments, Positions, Locations, Cost Centers — 04-organization-employees.md).
// Mirrors the settings-state.ts / users-state.ts split: state-machine and small pure
// transforms live here, away from React, so they're unit-testable without a DOM.
import type { RelationOption } from "@/components/data/relation-typeahead-state"

export interface Department {
  id: string
  code: string
  name: string
  parentId: string | null
  depth: number
  isActive: boolean
}

export interface Position {
  id: string
  code: string
  title: string
  isActive: boolean
}

export interface Location {
  id: string
  code: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
}

export interface CostCenter {
  id: string
  code: string
  name: string
  isActive: boolean
}

/**
 * Derives a short, unique-ish code from a freely-typed name for the RelationTypeahead
 * "Create" quick-create row (Odoo-style single-click create) — `org.create*` actions
 * all require a non-empty `code` the popup never asks for. Uppercases, strips anything
 * that isn't a letter/digit into a single underscore, and trims to a sane length.
 * Collisions are possible (two different names can derive the same code) — that's
 * surfaced as the normal duplicate-code VALIDATION_ERROR, and the "Create and Edit" row
 * (which shows the full form, including an editable code field) is the escape hatch.
 */
export function deriveCodeFromName(name: string): string {
  const cleaned = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned.slice(0, 24) || "NEW"
}

export function departmentToOption(department: Department): RelationOption {
  return { id: department.id, label: department.name, description: department.code }
}

export function positionToOption(position: Position): RelationOption {
  return { id: position.id, label: position.title, description: position.code }
}

export function locationToOption(location: Location): RelationOption {
  return { id: location.id, label: location.name, description: location.code }
}
