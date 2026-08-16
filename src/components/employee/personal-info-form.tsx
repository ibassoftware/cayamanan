"use client"

// Edit form for the Personal tab — identity, contact and present/permanent addresses.
// Calls `employee.update` (the same action `EmployeeForm`'s edit mode used before the
// 201-file rebuild split it by tab). Employee no. and hire date/assignment/status live
// on other tabs now, not here.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { FormFooter } from "@/components/data/form/form-footer"
import { FormSection } from "@/components/data/form/form-section"
import { isDirty, requiredString } from "@/components/data/form/form-state"
import { AddressFields } from "@/components/employee/address-fields"
import {
  isSameAsPresentAddress,
  parseAddress,
  resolvePermanentAddressPayload,
  serializeAddress,
  type EmployeeAddress,
} from "@/components/employee/employee-address-state"
import type { EmployeeDetail } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateRequired = requiredString("This field is required.")

type FormValues = {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthDate: string
  birthPlace: string
  sex: string
  civilStatus: string
  nationality: string
  religion: string
  bloodType: string
  emailPersonal: string
  emailWork: string
  mobile: string
}

function valuesFromEmployee(employee: EmployeeDetail): FormValues {
  return {
    firstName: employee.firstName,
    middleName: employee.middleName ?? "",
    lastName: employee.lastName,
    suffix: employee.suffix ?? "",
    birthDate: employee.birthDate ?? "",
    birthPlace: employee.birthPlace ?? "",
    sex: employee.sex ?? "",
    civilStatus: employee.civilStatus ?? "",
    nationality: employee.nationality ?? "",
    religion: employee.religion ?? "",
    bloodType: employee.bloodType ?? "",
    emailPersonal: employee.emailPersonal ?? "",
    emailWork: employee.emailWork ?? "",
    mobile: employee.mobile ?? "",
  }
}

export interface PersonalInfoFormProps {
  employee: EmployeeDetail
  onSaved: (patch: Partial<EmployeeDetail>) => void
  onCancel: () => void
}

export function PersonalInfoForm({ employee, onSaved, onCancel }: PersonalInfoFormProps) {
  const router = useRouter()
  const initialValues = valuesFromEmployee(employee)
  const [values, setValues] = useState<FormValues>(initialValues)
  const [present, setPresent] = useState<EmployeeAddress>(parseAddress(employee.address))
  const [permanent, setPermanent] = useState<EmployeeAddress>(parseAddress(employee.permanentAddress))
  const [sameAsPresent, setSameAsPresent] = useState(isSameAsPresentAddress(employee.permanentAddress))

  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ids = {
    firstName: useId(),
    middleName: useId(),
    lastName: useId(),
    suffix: useId(),
    birthDate: useId(),
    birthPlace: useId(),
    sex: useId(),
    civilStatus: useId(),
    nationality: useId(),
    religion: useId(),
    bloodType: useId(),
    emailPersonal: useId(),
    emailWork: useId(),
    mobile: useId(),
    sameAsPresent: useId(),
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const firstNameResult = validateRequired(values.firstName)
    const lastNameResult = validateRequired(values.lastName)
    const nextErrors: Partial<Record<keyof FormValues, string>> = {}
    if (!firstNameResult.ok) nextErrors.firstName = firstNameResult.message
    if (!lastNameResult.ok) nextErrors.lastName = lastNameResult.message
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const addressPayload = serializeAddress(present)
    const permanentAddressPayload = resolvePermanentAddressPayload(sameAsPresent, permanent)
    const result = await callAction<{ id: string }>("employee.update", {
      employeeId: employee.id,
      firstName: values.firstName.trim(),
      middleName: values.middleName.trim() || null,
      lastName: values.lastName.trim(),
      suffix: values.suffix.trim() || null,
      birthDate: values.birthDate || null,
      birthPlace: values.birthPlace.trim() || null,
      sex: values.sex.trim() || null,
      civilStatus: values.civilStatus.trim() || null,
      nationality: values.nationality.trim() || null,
      religion: values.religion.trim() || null,
      bloodType: values.bloodType.trim() || null,
      emailPersonal: values.emailPersonal.trim() || null,
      emailWork: values.emailWork.trim() || null,
      mobile: values.mobile.trim() || null,
      address: addressPayload,
      permanentAddress: permanentAddressPayload,
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

    onSaved({
      firstName: values.firstName.trim(),
      middleName: values.middleName.trim() || null,
      lastName: values.lastName.trim(),
      suffix: values.suffix.trim() || null,
      birthDate: values.birthDate || null,
      birthPlace: values.birthPlace.trim() || null,
      sex: values.sex.trim() || null,
      civilStatus: values.civilStatus.trim() || null,
      nationality: values.nationality.trim() || null,
      religion: values.religion.trim() || null,
      bloodType: values.bloodType.trim() || null,
      emailPersonal: values.emailPersonal.trim() || null,
      emailWork: values.emailWork.trim() || null,
      mobile: values.mobile.trim() || null,
      address: addressPayload,
      permanentAddress: permanentAddressPayload,
    })
  }

  const dirty =
    isDirty(initialValues, values) ||
    sameAsPresent !== isSameAsPresentAddress(employee.permanentAddress) ||
    JSON.stringify(present) !== JSON.stringify(parseAddress(employee.address)) ||
    (!sameAsPresent && JSON.stringify(permanent) !== JSON.stringify(parseAddress(employee.permanentAddress)))

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={ids.firstName} label="First name" required error={errors.firstName}>
            {controlProps => <Input {...controlProps} value={values.firstName} onChange={e => set("firstName", e.target.value)} autoFocus />}
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
            {controlProps => <Input {...controlProps} type="date" value={values.birthDate} onChange={e => set("birthDate", e.target.value)} />}
          </FormField>
          <FormField id={ids.birthPlace} label="Birth place">
            {controlProps => <Input {...controlProps} value={values.birthPlace} onChange={e => set("birthPlace", e.target.value)} />}
          </FormField>
          <FormField id={ids.sex} label="Sex">
            {controlProps => <Input {...controlProps} value={values.sex} onChange={e => set("sex", e.target.value)} />}
          </FormField>
          <FormField id={ids.civilStatus} label="Civil status">
            {controlProps => <Input {...controlProps} value={values.civilStatus} onChange={e => set("civilStatus", e.target.value)} />}
          </FormField>
          <FormField id={ids.nationality} label="Nationality">
            {controlProps => <Input {...controlProps} value={values.nationality} onChange={e => set("nationality", e.target.value)} />}
          </FormField>
          <FormField id={ids.religion} label="Religion">
            {controlProps => <Input {...controlProps} value={values.religion} onChange={e => set("religion", e.target.value)} />}
          </FormField>
          <FormField id={ids.bloodType} label="Blood type" hint="e.g. O+">
            {controlProps => <Input {...controlProps} value={values.bloodType} onChange={e => set("bloodType", e.target.value)} />}
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={ids.mobile} label="Mobile">
            {controlProps => <Input {...controlProps} value={values.mobile} onChange={e => set("mobile", e.target.value)} />}
          </FormField>
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
        </div>
      </FormSection>

      <FormSection title="Present address">
        <AddressFields value={present} onChange={setPresent} idPrefix="present" />
      </FormSection>

      <FormSection title="Permanent address" description="Only recorded when it differs from the present address.">
        <label htmlFor={ids.sameAsPresent} className="flex items-center gap-2 text-sm text-body">
          <input
            id={ids.sameAsPresent}
            type="checkbox"
            className="size-4 rounded border-border-control accent-[var(--tc-brand-strong)]"
            checked={sameAsPresent}
            onChange={e => setSameAsPresent(e.target.checked)}
          />
          Same as present address
        </label>
        {!sameAsPresent && <AddressFields value={permanent} onChange={setPermanent} idPrefix="permanent" />}
      </FormSection>

      <FormFooter onCancel={onCancel} submitting={submitting} isDirty={dirty} saveLabel="Save" />
    </form>
  )
}
