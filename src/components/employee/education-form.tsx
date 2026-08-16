"use client"

// Add/edit dialog form for one Background-tab education row.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/data/form/form-field"
import { requiredString } from "@/components/data/form/form-state"
import { EDUCATION_LEVELS, educationLevelLabel, type EducationLevel } from "@/components/employee/employee-background-state"
import type { EmployeeEducation } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateSchool = requiredString("School is required.")

function parseYear(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const year = Number(trimmed)
  return Number.isInteger(year) ? year : null
}

export interface EducationFormProps {
  employeeId: string
  education: EmployeeEducation | null
  onSaved: (education: EmployeeEducation) => void
  onCancel: () => void
}

export function EducationForm({ employeeId, education, onSaved, onCancel }: EducationFormProps) {
  const router = useRouter()
  const [level, setLevel] = useState<EducationLevel>((education?.level as EducationLevel) ?? "COLLEGE")
  const [school, setSchool] = useState(education?.school ?? "")
  const [degree, setDegree] = useState(education?.degree ?? "")
  const [fieldOfStudy, setFieldOfStudy] = useState(education?.fieldOfStudy ?? "")
  const [startYear, setStartYear] = useState(education?.startYear ? String(education.startYear) : "")
  const [endYear, setEndYear] = useState(education?.endYear ? String(education.endYear) : "")
  const [honors, setHonors] = useState(education?.honors ?? "")
  const [schoolError, setSchoolError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const levelId = useId()
  const schoolId = useId()
  const degreeId = useId()
  const fieldOfStudyId = useId()
  const startYearId = useId()
  const endYearId = useId()
  const honorsId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const schoolResult = validateSchool(school)
    setSchoolError(schoolResult.ok ? null : schoolResult.message)
    if (!schoolResult.ok) return

    setSubmitting(true)
    // `employee.addEducation`'s optional fields are plain `.optional()` (blank -> omit
    // the key); `employee.updateEducation`'s are `.nullable().optional()` (blank ->
    // clear the field) — see employee-form.tsx's identical create/update split.
    const blank = education ? null : undefined
    const networkPayload = {
      employeeId,
      level,
      school: schoolResult.value,
      degree: degree.trim() || blank,
      fieldOfStudy: fieldOfStudy.trim() || blank,
      startYear: parseYear(startYear) ?? blank,
      endYear: parseYear(endYear) ?? blank,
      honors: honors.trim() || blank,
    }
    const result = education
      ? await callAction<{ id: string }>("employee.updateEducation", { ...networkPayload, id: education.id })
      : await callAction<{ id: string }>("employee.addEducation", networkPayload)
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
      id: education?.id ?? result.data.id,
      level,
      school: schoolResult.value,
      degree: degree.trim() || null,
      fieldOfStudy: fieldOfStudy.trim() || null,
      startYear: parseYear(startYear),
      endYear: parseYear(endYear),
      honors: honors.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormField id={levelId} label="Level" required>
        {controlProps => (
          <Select value={level} onValueChange={value => value && setLevel(value as EducationLevel)}>
            <SelectTrigger id={controlProps.id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDUCATION_LEVELS.map(l => (
                <SelectItem key={l} value={l}>
                  {educationLevelLabel(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField id={schoolId} label="School" required error={schoolError}>
        {controlProps => <Input {...controlProps} value={school} onChange={e => setSchool(e.target.value)} autoFocus />}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={degreeId} label="Degree" hint='e.g. "BS Accountancy"'>
          {controlProps => <Input {...controlProps} value={degree} onChange={e => setDegree(e.target.value)} />}
        </FormField>
        <FormField id={fieldOfStudyId} label="Field of study">
          {controlProps => <Input {...controlProps} value={fieldOfStudy} onChange={e => setFieldOfStudy(e.target.value)} />}
        </FormField>
        <FormField id={startYearId} label="Start year">
          {controlProps => (
            <Input {...controlProps} inputMode="numeric" value={startYear} onChange={e => setStartYear(e.target.value)} />
          )}
        </FormField>
        <FormField id={endYearId} label="End year" hint="Leave blank if ongoing">
          {controlProps => <Input {...controlProps} inputMode="numeric" value={endYear} onChange={e => setEndYear(e.target.value)} />}
        </FormField>
      </div>

      <FormField id={honorsId} label="Honors" hint='e.g. "Cum Laude"'>
        {controlProps => <Input {...controlProps} value={honors} onChange={e => setHonors(e.target.value)} />}
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
