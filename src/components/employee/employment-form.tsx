"use client"

// Edit form for the Employment tab — hire date and department/position/location
// assignment. Status transitions stay in the header band's own Select (employee.setStatus
// is a dedicated action — see employee-detail-screen.tsx), not folded in here. Real
// employment/compensation records land in slice 05; this only edits what
// `employees.{hire_date,department_id,position_id,location_id}` already store today.
import { useEffect, useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { FormFooter } from "@/components/data/form/form-footer"
import { FormSection } from "@/components/data/form/form-section"
import { isDirty, requiredString } from "@/components/data/form/form-state"
import { RelationTypeahead, type RelationOption } from "@/components/data/relation-typeahead"
import { DepartmentForm } from "@/components/org/department-form"
import { PositionForm } from "@/components/org/position-form"
import { LocationForm } from "@/components/org/location-form"
import {
  loadDepartmentOptions,
  loadLocationOptions,
  loadPositionOptions,
  quickCreateDepartment,
  quickCreateLocation,
  quickCreatePosition,
} from "@/components/org/relation-options"
import { departmentToOption, locationToOption, positionToOption } from "@/components/org/org-state"
import type { EmployeeDetail } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateRequired = requiredString("Hire date is required.")

export interface EmploymentFormProps {
  employee: EmployeeDetail
  onSaved: (patch: Partial<EmployeeDetail>, options: { department: RelationOption | null; position: RelationOption | null; location: RelationOption | null }) => void
  onCancel: () => void
}

export function EmploymentForm({ employee, onSaved, onCancel }: EmploymentFormProps) {
  const router = useRouter()
  const [hireDate, setHireDate] = useState(employee.hireDate)
  const [department, setDepartment] = useState<RelationOption | null>(null)
  const [position, setPosition] = useState<RelationOption | null>(null)
  const [location, setLocation] = useState<RelationOption | null>(null)
  const [hireDateError, setHireDateError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const hireDateId = useId()
  const departmentId = useId()
  const positionId = useId()
  const locationId = useId()

  // Resolve current assignment labels once — `employee.get` only returns ids (see
  // schema.ts's comment on why these are plain ids, not a join).
  useEffect(() => {
    void (async () => {
      if (employee.departmentId) {
        const result = await callAction<{ departments: { id: string; code: string; name: string }[] }>("org.listDepartments")
        const match = result.ok ? result.data.departments.find(d => d.id === employee.departmentId) : undefined
        if (match) setDepartment({ id: match.id, label: match.name, description: match.code })
      }
      if (employee.positionId) {
        const result = await callAction<{ positions: { id: string; code: string; title: string }[] }>("org.listPositions")
        const match = result.ok ? result.data.positions.find(p => p.id === employee.positionId) : undefined
        if (match) setPosition({ id: match.id, label: match.title, description: match.code })
      }
      if (employee.locationId) {
        const result = await callAction<{ locations: { id: string; code: string; name: string }[] }>("org.listLocations")
        const match = result.ok ? result.data.locations.find(l => l.id === employee.locationId) : undefined
        if (match) setLocation({ id: match.id, label: match.name, description: match.code })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve once for the employee this form was mounted with
  }, [employee.id])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const hireDateResult = validateRequired(hireDate)
    setHireDateError(hireDateResult.ok ? null : hireDateResult.message)
    if (!hireDateResult.ok) return

    setSubmitting(true)
    const result = await callAction<{ id: string }>("employee.update", {
      employeeId: employee.id,
      hireDate,
      departmentId: department?.id ?? null,
      positionId: position?.id ?? null,
      locationId: location?.id ?? null,
    })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setSubmitError(result.error.message)
      return
    }

    onSaved(
      { hireDate, departmentId: department?.id ?? null, positionId: position?.id ?? null, locationId: location?.id ?? null },
      { department, position, location },
    )
  }

  const dirty = isDirty(
    { hireDate: employee.hireDate, departmentId: employee.departmentId ?? "", positionId: employee.positionId ?? "", locationId: employee.locationId ?? "" },
    { hireDate, departmentId: department?.id ?? "", positionId: position?.id ?? "", locationId: location?.id ?? "" },
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Employment" description="Hire date and current assignment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={hireDateId} label="Hire date" required error={hireDateError ?? undefined}>
            {controlProps => <Input {...controlProps} type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} autoFocus />}
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Assignment" description="Optional — pick an existing one, or create it inline.">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id={departmentId} label="Department">
            {controlProps => (
              <RelationTypeahead
                {...controlProps}
                value={department}
                onChange={setDepartment}
                loadOptions={loadDepartmentOptions}
                onQuickCreate={quickCreateDepartment}
                renderCreateForm={({ initialName, onCreated, onCancel: onCancelCreate }) => (
                  <DepartmentForm
                    mode="create"
                    initialName={initialName}
                    onSaved={created => onCreated(departmentToOption(created))}
                    onCancel={onCancelCreate}
                  />
                )}
                placeholder="Search departments…"
                entityLabel="department"
                createAndEditTitle="Create department"
              />
            )}
          </FormField>
          <FormField id={positionId} label="Position">
            {controlProps => (
              <RelationTypeahead
                {...controlProps}
                value={position}
                onChange={setPosition}
                loadOptions={loadPositionOptions}
                onQuickCreate={quickCreatePosition}
                renderCreateForm={({ initialName, onCreated, onCancel: onCancelCreate }) => (
                  <PositionForm
                    mode="create"
                    initialName={initialName}
                    onSaved={created => onCreated(positionToOption(created))}
                    onCancel={onCancelCreate}
                  />
                )}
                placeholder="Search positions…"
                entityLabel="position"
                createAndEditTitle="Create position"
              />
            )}
          </FormField>
          <FormField id={locationId} label="Location">
            {controlProps => (
              <RelationTypeahead
                {...controlProps}
                value={location}
                onChange={setLocation}
                loadOptions={loadLocationOptions}
                onQuickCreate={quickCreateLocation}
                renderCreateForm={({ initialName, onCreated, onCancel: onCancelCreate }) => (
                  <LocationForm
                    mode="create"
                    initialName={initialName}
                    onSaved={created => onCreated(locationToOption(created))}
                    onCancel={onCancelCreate}
                  />
                )}
                placeholder="Search locations…"
                entityLabel="location"
                createAndEditTitle="Create location"
              />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormFooter onCancel={onCancel} submitting={submitting} isDirty={dirty} saveLabel="Save" />
    </form>
  )
}
