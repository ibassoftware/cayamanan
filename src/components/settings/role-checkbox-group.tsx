"use client"

import { useId } from "react"

import type { Role } from "@/platform/actions"

const ALL_ROLES: readonly Role[] = ["ADMIN", "HR_PAYROLL", "EMPLOYEE"]

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  HR_PAYROLL: "HR / Payroll",
  EMPLOYEE: "Employee",
}

interface RoleCheckboxGroupProps {
  legend: string
  selected: Role[]
  onChange: (roles: Role[]) => void
  errorId?: string
}

/** Shared by create-user and edit-roles dialogs — both need the same fixed three-role
 * multi-select (a user "may hold HR + Employee", docs/plan/02-identity-auth.md). */
export function RoleCheckboxGroup({ legend, selected, onChange, errorId }: RoleCheckboxGroupProps) {
  const groupId = useId()

  function toggle(role: Role, checked: boolean) {
    if (checked) {
      onChange(Array.from(new Set([...selected, role])))
    } else {
      onChange(selected.filter(r => r !== role))
    }
  }

  return (
    <fieldset aria-describedby={errorId} className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-heading">{legend}</legend>
      <div id={groupId} className="flex flex-col gap-2">
        {ALL_ROLES.map(role => {
          const inputId = `${groupId}-${role}`
          return (
            <label key={role} htmlFor={inputId} className="flex items-center gap-2 text-sm text-body">
              <input
                id={inputId}
                type="checkbox"
                className="size-4 rounded border-border-control accent-[var(--tc-brand-strong)]"
                checked={selected.includes(role)}
                onChange={e => toggle(role, e.target.checked)}
              />
              {ROLE_LABELS[role]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
