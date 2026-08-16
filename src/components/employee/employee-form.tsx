"use client"

// Shared create/edit form for an employee's master-identity profile
// (04-organization-employees.md). Bare form (no page/Dialog chrome of its own) so
// `/app/employees/new` renders it directly on a full page and the Profile tab of
// `/app/employees/[id]` renders the same component in place for editing — one
// implementation, not a second form system.
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

const validateRequired = requiredString("This field is required.")

type FormValues = {
  employeeNo: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthDate: string
  sex: string
  civilStatus: string
  emailPersonal: string
  emailWork: string
  mobile: string
  hireDate: string
}

function valuesFromEmployee(employee?: EmployeeDetail | null): FormValues {
  return {
    employeeNo: employee?.employeeNo ?? "",
    firstName: employee?.firstName ?? "",
    middleName: employee?.middleName ?? "",
    lastName: employee?.lastName ?? "",
    suffix: employee?.suffix ?? "",
    birthDate: employee?.birthDate ?? "",
    sex: employee?.sex ?? "",
    civilStatus: employee?.civilStatus ?? "",
    emailPersonal: employee?.emailPersonal ?? "",
    emailWork: employee?.emailWork ?? "",
    mobile: employee?.mobile ?? "",
    hireDate: employee?.hireDate ?? "",
  }
}

export interface EmployeeFormProps {
  mode: "create" | "edit"
  employee?: EmployeeDetail | null
  onSaved: (result: { id: string; employeeNo: string }) => void
  onCancel: () => void
}

export function EmployeeForm({ mode, employee, onSaved, onCancel }: EmployeeFormProps) {
  const router = useRouter()
  const initialValues = valuesFromEmployee(employee)
  const [values, setValues] = useState<FormValues>(initialValues)
  const [department, setDepartment] = useState<RelationOption | null>(null)
  const [position, setPosition] = useState<RelationOption | null>(null)
  const [location, setLocation] = useState<RelationOption | null>(null)

  // Resolve the current department/position/location's display label once for edit
  // mode — `employee.get`/`getSelf` only return ids (see schema.ts's comment on why
  // these are plain ids, not a join), so the label comes from a one-time reference-list
  // fetch here rather than the RelationTypeahead's own (query-driven) fetches.
  useEffect(() => {
    if (!employee) return
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
  }, [employee?.id])

  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ids = {
    employeeNo: useId(),
    firstName: useId(),
    middleName: useId(),
    lastName: useId(),
    suffix: useId(),
    birthDate: useId(),
    sex: useId(),
    civilStatus: useId(),
    emailPersonal: useId(),
    emailWork: useId(),
    mobile: useId(),
    hireDate: useId(),
    department: useId(),
    position: useId(),
    location: useId(),
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const firstNameResult = validateRequired(values.firstName)
    const lastNameResult = validateRequired(values.lastName)
    const employeeNoResult = validateRequired(values.employeeNo)
    const hireDateResult = validateRequired(values.hireDate)
    const nextErrors: Partial<Record<keyof FormValues, string>> = {}
    if (!firstNameResult.ok) nextErrors.firstName = firstNameResult.message
    if (!lastNameResult.ok) nextErrors.lastName = lastNameResult.message
    if (!employeeNoResult.ok) nextErrors.employeeNo = employeeNoResult.message
    if (!hireDateResult.ok) nextErrors.hireDate = hireDateResult.message
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)

    // `employee.create`'s optional fields are plain `.optional()` (no `.nullable()`) —
    // blank means "omit the key"; `employee.update`'s are `.nullable().optional()` —
    // blank means "clear the field", so it needs the explicit `null` instead.
    const result =
      mode === "create"
        ? await callAction<{ id: string; employeeNo: string }>("employee.create", {
            employeeNo: values.employeeNo.trim(),
            firstName: values.firstName.trim(),
            middleName: values.middleName.trim() || undefined,
            lastName: values.lastName.trim(),
            suffix: values.suffix.trim() || undefined,
            birthDate: values.birthDate || undefined,
            sex: values.sex.trim() || undefined,
            civilStatus: values.civilStatus.trim() || undefined,
            emailPersonal: values.emailPersonal.trim() || undefined,
            emailWork: values.emailWork.trim() || undefined,
            mobile: values.mobile.trim() || undefined,
            hireDate: values.hireDate,
            departmentId: department?.id ?? undefined,
            positionId: position?.id ?? undefined,
            locationId: location?.id ?? undefined,
          })
        : await callAction<{ id: string }>("employee.update", {
            employeeId: employee!.id,
            firstName: values.firstName.trim(),
            middleName: values.middleName.trim() || null,
            lastName: values.lastName.trim(),
            suffix: values.suffix.trim() || null,
            birthDate: values.birthDate || null,
            sex: values.sex.trim() || null,
            civilStatus: values.civilStatus.trim() || null,
            emailPersonal: values.emailPersonal.trim() || null,
            emailWork: values.emailWork.trim() || null,
            mobile: values.mobile.trim() || null,
            hireDate: values.hireDate,
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
      if (result.error.field && result.error.field in values) {
        setErrors(current => ({ ...current, [result.error.field as keyof FormValues]: result.error.message }))
      } else {
        setSubmitError(result.error.message)
      }
      return
    }

    onSaved({ id: result.data.id, employeeNo: values.employeeNo.trim() })
  }

  const dirty = isDirty(initialValues, values)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Identity" description="Employee number is permanent once created.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={ids.employeeNo} label="Employee no." required error={errors.employeeNo}>
            {controlProps => (
              <Input
                {...controlProps}
                value={values.employeeNo}
                onChange={e => set("employeeNo", e.target.value)}
                disabled={mode === "edit"}
                autoFocus={mode === "create"}
              />
            )}
          </FormField>
          <FormField id={ids.hireDate} label="Hire date" required error={errors.hireDate}>
            {controlProps => (
              <Input {...controlProps} type="date" value={values.hireDate} onChange={e => set("hireDate", e.target.value)} />
            )}
          </FormField>
          <FormField id={ids.firstName} label="First name" required error={errors.firstName}>
            {controlProps => <Input {...controlProps} value={values.firstName} onChange={e => set("firstName", e.target.value)} />}
          </FormField>
          <FormField id={ids.middleName} label="Middle name">
            {controlProps => <Input {...controlProps} value={values.middleName} onChange={e => set("middleName", e.target.value)} />}
          </FormField>
          <FormField id={ids.lastName} label="Last name" required error={errors.lastName}>
            {controlProps => <Input {...controlProps} value={values.lastName} onChange={e => set("lastName", e.target.value)} />}
          </FormField>
          <FormField id={ids.suffix} label="Suffix" hint="e.g. Jr., III">
            {controlProps => <Input {...controlProps} value={values.suffix} onChange={e => set("suffix", e.target.value)} />}
          </FormField>
          <FormField id={ids.birthDate} label="Birth date">
            {controlProps => (
              <Input {...controlProps} type="date" value={values.birthDate} onChange={e => set("birthDate", e.target.value)} />
            )}
          </FormField>
          <FormField id={ids.sex} label="Sex">
            {controlProps => <Input {...controlProps} value={values.sex} onChange={e => set("sex", e.target.value)} />}
          </FormField>
          <FormField id={ids.civilStatus} label="Civil status">
            {controlProps => (
              <Input {...controlProps} value={values.civilStatus} onChange={e => set("civilStatus", e.target.value)} />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={ids.emailPersonal} label="Personal email">
            {controlProps => (
              <Input {...controlProps} type="email" value={values.emailPersonal} onChange={e => set("emailPersonal", e.target.value)} />
            )}
          </FormField>
          <FormField id={ids.emailWork} label="Work email">
            {controlProps => (
              <Input {...controlProps} type="email" value={values.emailWork} onChange={e => set("emailWork", e.target.value)} />
            )}
          </FormField>
          <FormField id={ids.mobile} label="Mobile">
            {controlProps => <Input {...controlProps} value={values.mobile} onChange={e => set("mobile", e.target.value)} />}
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Assignment" description="Optional — pick an existing one, or create it inline.">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id={ids.department} label="Department">
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
          <FormField id={ids.position} label="Position">
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
          <FormField id={ids.location} label="Location">
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

      <FormFooter onCancel={onCancel} submitting={submitting} isDirty={dirty} saveLabel={mode === "create" ? "Create employee" : "Save"} />
    </form>
  )
}
