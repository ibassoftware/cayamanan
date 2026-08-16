"use client"

// Add/edit dialog form for one Background-tab training/seminar row.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { requiredString } from "@/components/data/form/form-state"
import type { EmployeeTrainingEntry } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateTitle = requiredString("Title is required.")
// Mirrors add-training.ts's `hoursSchema` exactly — a decimal string, never parsed
// to a JS number (CLAUDE.md: never parseFloat a `pg` numeric).
const HOURS_PATTERN = /^\d{1,6}(\.\d{1,2})?$/

export interface TrainingFormProps {
  employeeId: string
  training: EmployeeTrainingEntry | null
  onSaved: (training: EmployeeTrainingEntry) => void
  onCancel: () => void
}

export function TrainingForm({ employeeId, training, onSaved, onCancel }: TrainingFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(training?.title ?? "")
  const [provider, setProvider] = useState(training?.provider ?? "")
  const [startDate, setStartDate] = useState(training?.startDate ?? "")
  const [endDate, setEndDate] = useState(training?.endDate ?? "")
  const [hours, setHours] = useState(training?.hours ?? "")
  const [certificateNo, setCertificateNo] = useState(training?.certificateNo ?? "")
  const [titleError, setTitleError] = useState<string | null>(null)
  const [hoursError, setHoursError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const titleId = useId()
  const providerId = useId()
  const startDateId = useId()
  const endDateId = useId()
  const hoursId = useId()
  const certificateId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const titleResult = validateTitle(title)
    setTitleError(titleResult.ok ? null : titleResult.message)
    const trimmedHours = hours.trim()
    const hoursValid = trimmedHours === "" || HOURS_PATTERN.test(trimmedHours)
    setHoursError(hoursValid ? null : "Hours must be a plain decimal number with up to 2 decimal places.")
    if (!titleResult.ok || !hoursValid) return

    setSubmitting(true)
    // `employee.addTraining`'s optional fields are plain `.optional()` (blank -> omit
    // the key); `employee.updateTraining`'s are `.nullable().optional()` (blank ->
    // clear the field) — see employee-form.tsx's identical create/update split.
    const blank = training ? null : undefined
    const networkPayload = {
      employeeId,
      title: titleResult.value,
      provider: provider.trim() || blank,
      startDate: startDate || blank,
      endDate: endDate || blank,
      hours: trimmedHours || blank,
      certificateNo: certificateNo.trim() || blank,
    }
    const result = training
      ? await callAction<{ id: string }>("employee.updateTraining", { ...networkPayload, id: training.id })
      : await callAction<{ id: string }>("employee.addTraining", networkPayload)
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
      id: training?.id ?? result.data.id,
      title: titleResult.value,
      provider: provider.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      hours: trimmedHours || null,
      certificateNo: certificateNo.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormField id={titleId} label="Title" required error={titleError}>
        {controlProps => <Input {...controlProps} value={title} onChange={e => setTitle(e.target.value)} autoFocus />}
      </FormField>
      <FormField id={providerId} label="Provider">
        {controlProps => <Input {...controlProps} value={provider} onChange={e => setProvider(e.target.value)} />}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={startDateId} label="Start date">
          {controlProps => <Input {...controlProps} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}
        </FormField>
        <FormField id={endDateId} label="End date">
          {controlProps => <Input {...controlProps} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />}
        </FormField>
        <FormField id={hoursId} label="Hours" hint='e.g. "7.5"' error={hoursError}>
          {controlProps => <Input {...controlProps} inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} />}
        </FormField>
        <FormField id={certificateId} label="Certificate no.">
          {controlProps => <Input {...controlProps} value={certificateNo} onChange={e => setCertificateNo(e.target.value)} />}
        </FormField>
      </div>

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
