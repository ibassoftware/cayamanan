"use client"

// One address sub-form, reused for both present and permanent address in
// `PersonalInfoForm` — a PH 201-file always shows the same six fields for either.
import { useId } from "react"

import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import type { EmployeeAddress } from "@/components/employee/employee-address-state"

export interface AddressFieldsProps {
  value: EmployeeAddress
  onChange: (next: EmployeeAddress) => void
  disabled?: boolean
  idPrefix: string
}

export function AddressFields({ value, onChange, disabled, idPrefix }: AddressFieldsProps) {
  const uid = useId()
  const prefix = `${idPrefix}-${uid}`

  function set<K extends keyof EmployeeAddress>(key: K, next: EmployeeAddress[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${prefix}-line1`} label="Address line 1" className="sm:col-span-2">
        {controlProps => (
          <Input
            {...controlProps}
            value={value.line1}
            onChange={e => set("line1", e.target.value)}
            disabled={disabled}
            placeholder="House/unit no., street"
          />
        )}
      </FormField>
      <FormField id={`${prefix}-line2`} label="Address line 2" className="sm:col-span-2">
        {controlProps => (
          <Input
            {...controlProps}
            value={value.line2}
            onChange={e => set("line2", e.target.value)}
            disabled={disabled}
            placeholder="Barangay, subdivision"
          />
        )}
      </FormField>
      <FormField id={`${prefix}-city`} label="City / Municipality">
        {controlProps => <Input {...controlProps} value={value.city} onChange={e => set("city", e.target.value)} disabled={disabled} />}
      </FormField>
      <FormField id={`${prefix}-province`} label="Province">
        {controlProps => (
          <Input {...controlProps} value={value.province} onChange={e => set("province", e.target.value)} disabled={disabled} />
        )}
      </FormField>
      <FormField id={`${prefix}-postalCode`} label="Postal code">
        {controlProps => (
          <Input {...controlProps} value={value.postalCode} onChange={e => set("postalCode", e.target.value)} disabled={disabled} />
        )}
      </FormField>
      <FormField id={`${prefix}-country`} label="Country">
        {controlProps => (
          <Input {...controlProps} value={value.country} onChange={e => set("country", e.target.value)} disabled={disabled} />
        )}
      </FormField>
    </div>
  )
}
