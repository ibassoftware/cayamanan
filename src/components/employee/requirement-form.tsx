"use client"

// Add/edit dialog form for one Onboarding-tab checklist requirement. Both create and
// edit call `employee.setRequirement` — it upserts by (employeeId, requirement), the
// checklist item's own natural key (see set-requirement.ts) — so the requirement name
// is only editable when creating; changing it afterward would target a different row,
// not rename this one.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/data/form/form-field"
import { requiredString } from "@/components/data/form/form-state"
import { REQUIREMENT_STATUSES, requirementStatusLabel, type RequirementStatus } from "@/components/employee/employee-requirements-state"
import type { EmployeeRequirement } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateRequirement = requiredString("Requirement name is required.")

export interface RequirementFormProps {
  employeeId: string
  requirement: EmployeeRequirement | null
  onSaved: (requirement: EmployeeRequirement) => void
  onCancel: () => void
}

export function RequirementForm({ employeeId, requirement, onSaved, onCancel }: RequirementFormProps) {
  const router = useRouter()
  const [name, setName] = useState(requirement?.requirement ?? "")
  const [status, setStatus] = useState<RequirementStatus>((requirement?.status as RequirementStatus) ?? "PENDING")
  const [submittedOn, setSubmittedOn] = useState(requirement?.submittedOn ?? "")
  const [notes, setNotes] = useState(requirement?.notes ?? "")
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nameId = useId()
  const statusId = useId()
  const submittedOnId = useId()
  const notesId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const nameResult = validateRequirement(name)
    setNameError(nameResult.ok ? null : nameResult.message)
    if (!nameResult.ok) return

    setSubmitting(true)
    const result = await callAction<{ id: string; requirement: string; status: string }>("employee.setRequirement", {
      employeeId,
      requirement: nameResult.value,
      status,
      submittedOn: submittedOn || null,
      notes: notes.trim() || null,
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

    onSaved({
      id: result.data.id,
      requirement: result.data.requirement,
      status: result.data.status,
      submittedOn: submittedOn || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormField id={nameId} label="Requirement" required error={nameError} hint={requirement ? "Requirement name can't be changed once created." : undefined}>
        {controlProps => (
          <Input
            {...controlProps}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={Boolean(requirement)}
            autoFocus={!requirement}
            placeholder='e.g. "NBI Clearance"'
          />
        )}
      </FormField>

      <FormField id={statusId} label="Status" required>
        {controlProps => (
          <Select value={status} onValueChange={value => value && setStatus(value as RequirementStatus)}>
            <SelectTrigger id={controlProps.id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REQUIREMENT_STATUSES.map(s => (
                <SelectItem key={s} value={s}>
                  {requirementStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField id={submittedOnId} label="Submitted on">
        {controlProps => <Input {...controlProps} type="date" value={submittedOn} onChange={e => setSubmittedOn(e.target.value)} />}
      </FormField>

      <FormField id={notesId} label="Notes">
        {controlProps => <Textarea {...controlProps} value={notes} onChange={e => setNotes(e.target.value)} />}
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
