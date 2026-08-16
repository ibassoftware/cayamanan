"use client"

// Personal tab — Identity, Contact and Addresses, grouped into their own cards (task
// packet: "grouped by Purpose, 2-3 columns per group"). Read view + an edit toggle to
// `PersonalInfoForm`, matching the read/edit-toggle convention every other tab here uses.
import { useState } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatAddressLines, isSameAsPresentAddress } from "@/components/employee/employee-address-state"
import { formatHumanDate, displayOrDash } from "@/components/employee/employee-format"
import { PersonalInfoForm } from "@/components/employee/personal-info-form"
import type { EmployeeDetail } from "@/components/employee/employee-state"

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-body-subtle">{label}</span>
      <span className="text-sm text-heading">{displayOrDash(value)}</span>
    </div>
  )
}

export interface PersonalTabProps {
  employee: EmployeeDetail
  onChange: (patch: Partial<EmployeeDetail>) => void
}

export function PersonalTab({ employee, onChange }: PersonalTabProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <PersonalInfoForm
        employee={employee}
        onSaved={patch => {
          setEditing(false)
          onChange(patch)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const presentLines = formatAddressLines(employee.address)
  const permanentLines = formatAddressLines(employee.permanentAddress)
  const sameAsPresent = isSameAsPresentAddress(employee.permanentAddress)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Name, birth details and other statutory-form identity fields.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name" value={employee.firstName} />
          <Field label="Middle name" value={employee.middleName} />
          <Field label="Last name" value={employee.lastName} />
          <Field label="Suffix" value={employee.suffix} />
          <Field label="Birth date" value={formatHumanDate(employee.birthDate)} />
          <Field label="Birth place" value={employee.birthPlace} />
          <Field label="Sex" value={employee.sex} />
          <Field label="Civil status" value={employee.civilStatus} />
          <Field label="Nationality" value={employee.nationality} />
          <Field label="Religion" value={employee.religion} />
          <Field label="Blood type" value={employee.bloodType} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Mobile" value={employee.mobile} />
          <Field label="Personal email" value={employee.emailPersonal} />
          <Field label="Work email" value={employee.emailWork} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-body-subtle">Present address</span>
            {presentLines.length > 0 ? (
              presentLines.map((line, index) => (
                <span key={index} className="text-sm text-heading">
                  {line}
                </span>
              ))
            ) : (
              <span className="text-sm text-body-subtle">—</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-body-subtle">Permanent address</span>
            {sameAsPresent ? (
              <span className="text-sm text-body-subtle">Same as present address</span>
            ) : permanentLines.length > 0 ? (
              permanentLines.map((line, index) => (
                <span key={index} className="text-sm text-heading">
                  {line}
                </span>
              ))
            ) : (
              <span className="text-sm text-body-subtle">—</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
