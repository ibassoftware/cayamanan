"use client"

// Add/edit dialog form for one Background-tab prior-employment row.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { requiredString } from "@/components/data/form/form-state"
import type { EmployeeWorkHistoryEntry } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateEmployer = requiredString("Employer is required.")

export interface WorkHistoryFormProps {
  employeeId: string
  workHistory: EmployeeWorkHistoryEntry | null
  onSaved: (workHistory: EmployeeWorkHistoryEntry) => void
  onCancel: () => void
}

export function WorkHistoryForm({ employeeId, workHistory, onSaved, onCancel }: WorkHistoryFormProps) {
  const router = useRouter()
  const [employer, setEmployer] = useState(workHistory?.employer ?? "")
  const [position, setPosition] = useState(workHistory?.position ?? "")
  const [startDate, setStartDate] = useState(workHistory?.startDate ?? "")
  const [endDate, setEndDate] = useState(workHistory?.endDate ?? "")
  const [reasonForLeaving, setReasonForLeaving] = useState(workHistory?.reasonForLeaving ?? "")
  const [employerError, setEmployerError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const employerId = useId()
  const positionId = useId()
  const startDateId = useId()
  const endDateId = useId()
  const reasonId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const employerResult = validateEmployer(employer)
    setEmployerError(employerResult.ok ? null : employerResult.message)
    if (!employerResult.ok) return

    setSubmitting(true)
    // `employee.addWorkHistory`'s optional fields are plain `.optional()` (blank ->
    // omit the key); `employee.updateWorkHistory`'s are `.nullable().optional()` (blank
    // -> clear the field) — see employee-form.tsx's identical create/update split.
    const blank = workHistory ? null : undefined
    const networkPayload = {
      employeeId,
      employer: employerResult.value,
      position: position.trim() || blank,
      startDate: startDate || blank,
      endDate: endDate || blank,
      reasonForLeaving: reasonForLeaving.trim() || blank,
    }
    const result = workHistory
      ? await callAction<{ id: string }>("employee.updateWorkHistory", { ...networkPayload, id: workHistory.id })
      : await callAction<{ id: string }>("employee.addWorkHistory", networkPayload)
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
      id: workHistory?.id ?? result.data.id,
      employer: employerResult.value,
      position: position.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      reasonForLeaving: reasonForLeaving.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormField id={employerId} label="Employer" required error={employerError}>
        {controlProps => <Input {...controlProps} value={employer} onChange={e => setEmployer(e.target.value)} autoFocus />}
      </FormField>
      <FormField id={positionId} label="Position">
        {controlProps => <Input {...controlProps} value={position} onChange={e => setPosition(e.target.value)} />}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={startDateId} label="Start date">
          {controlProps => <Input {...controlProps} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}
        </FormField>
        <FormField id={endDateId} label="End date" hint="Leave blank if ongoing">
          {controlProps => <Input {...controlProps} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />}
        </FormField>
      </div>

      <FormField id={reasonId} label="Reason for leaving">
        {controlProps => <Input {...controlProps} value={reasonForLeaving} onChange={e => setReasonForLeaving(e.target.value)} />}
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
