"use client"

// Employment tab — hire date and current department/position/location assignment. Real
// employment/compensation records (pay rate, employment type, separation) land in
// slice 05; this tab intentionally only covers what `employees` already stores today.
import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { displayOrDash, formatHumanDate } from "@/components/employee/employee-format"
import { EmploymentForm } from "@/components/employee/employment-form"
import type { EmployeeDetail } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-body-subtle">{label}</span>
      <span className="text-sm text-heading">{displayOrDash(value)}</span>
    </div>
  )
}

export interface EmploymentTabProps {
  employee: EmployeeDetail
  onChange: (patch: Partial<EmployeeDetail>) => void
}

export function EmploymentTab({ employee, onChange }: EmploymentTabProps) {
  const [editing, setEditing] = useState(false)
  const [departmentName, setDepartmentName] = useState<string | null>(null)
  const [positionTitle, setPositionTitle] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (employee.departmentId) {
        const result = await callAction<{ departments: { id: string; name: string }[] }>("org.listDepartments")
        if (!cancelled && result.ok) setDepartmentName(result.data.departments.find(d => d.id === employee.departmentId)?.name ?? null)
      } else if (!cancelled) {
        setDepartmentName(null)
      }
      if (employee.positionId) {
        const result = await callAction<{ positions: { id: string; title: string }[] }>("org.listPositions")
        if (!cancelled && result.ok) setPositionTitle(result.data.positions.find(p => p.id === employee.positionId)?.title ?? null)
      } else if (!cancelled) {
        setPositionTitle(null)
      }
      if (employee.locationId) {
        const result = await callAction<{ locations: { id: string; name: string }[] }>("org.listLocations")
        if (!cancelled && result.ok) setLocationName(result.data.locations.find(l => l.id === employee.locationId)?.name ?? null)
      } else if (!cancelled) {
        setLocationName(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [employee.departmentId, employee.positionId, employee.locationId])

  if (editing) {
    return (
      <EmploymentForm
        employee={employee}
        onSaved={(patch, resolved) => {
          setEditing(false)
          if (resolved.department) setDepartmentName(resolved.department.label)
          if (resolved.department === null) setDepartmentName(null)
          if (resolved.position) setPositionTitle(resolved.position.label)
          if (resolved.position === null) setPositionTitle(null)
          if (resolved.location) setLocationName(resolved.location.label)
          if (resolved.location === null) setLocationName(null)
          onChange(patch)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employment</CardTitle>
        <CardDescription>Hire date and current assignment.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Hire date" value={formatHumanDate(employee.hireDate)} />
        <Field label="Department" value={departmentName} />
        <Field label="Position" value={positionTitle} />
        <Field label="Location" value={locationName} />
      </CardContent>
    </Card>
  )
}
