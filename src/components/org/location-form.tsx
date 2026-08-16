"use client"

// Bare create/edit form for a work location — reused both by the Locations screen and
// as the RelationTypeahead "Create and Edit" quick-create form on the Employee form.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { FormFooter } from "@/components/data/form/form-footer"
import { requiredString } from "@/components/data/form/form-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import { deriveCodeFromName, type Location } from "@/components/org/org-state"

const validateRequired = requiredString("This field is required.")

export interface LocationFormProps {
  mode: "create" | "edit"
  location?: Location | null
  initialName?: string
  onSaved: (location: Location) => void
  onCancel: () => void
  useDialogFooter?: boolean
}

export function LocationForm({ mode, location, initialName, onSaved, onCancel, useDialogFooter = true }: LocationFormProps) {
  const router = useRouter()
  const nameFieldId = useId()
  const codeFieldId = useId()
  const addressFieldId = useId()
  const timezoneFieldId = useId()

  const [name, setName] = useState(location?.name ?? initialName ?? "")
  const [code, setCode] = useState(location?.code ?? deriveCodeFromName(initialName ?? ""))
  const [codeTouched, setCodeTouched] = useState(mode === "edit")
  const [address, setAddress] = useState(location?.address ?? "")
  const [timezone, setTimezone] = useState(location?.timezone ?? "Asia/Manila")
  const [nameError, setNameError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleNameChange(next: string) {
    setName(next)
    if (mode === "create" && !codeTouched) {
      setCode(deriveCodeFromName(next))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const nameResult = validateRequired(name)
    const codeResult = validateRequired(code)
    setNameError(nameResult.ok ? null : nameResult.message)
    setCodeError(codeResult.ok ? null : codeResult.message)
    if (!nameResult.ok || !codeResult.ok) return

    setSubmitting(true)
    const result =
      mode === "create"
        ? await callAction<Location>("org.createLocation", {
            code: codeResult.value,
            name: nameResult.value,
            address: address.trim() || undefined,
            timezone: timezone.trim() || undefined,
          })
        : await callAction<Location>("org.updateLocation", {
            id: location!.id,
            code: codeResult.value,
            name: nameResult.value,
            address: address.trim() || null,
            timezone: timezone.trim() || undefined,
          })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      if (result.error.field === "code") setCodeError(result.error.message)
      else setSubmitError(result.error.message)
      return
    }

    onSaved(result.data)
  }

  const footer = (
    <FormFooter onCancel={onCancel} submitting={submitting} saveLabel={mode === "create" ? "Create" : "Save"} />
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormField id={nameFieldId} label="Name" required error={nameError}>
        {controlProps => (
          <Input {...controlProps} value={name} onChange={e => handleNameChange(e.target.value)} autoFocus />
        )}
      </FormField>

      <FormField id={codeFieldId} label="Code" required error={codeError} hint="Unique within your company.">
        {controlProps => (
          <Input
            {...controlProps}
            value={code}
            onChange={e => {
              setCodeTouched(true)
              setCode(e.target.value)
            }}
          />
        )}
      </FormField>

      <FormField id={addressFieldId} label="Address" hint="Optional.">
        {controlProps => <Input {...controlProps} value={address} onChange={e => setAddress(e.target.value)} />}
      </FormField>

      <FormField id={timezoneFieldId} label="Timezone">
        {controlProps => <Input {...controlProps} value={timezone} onChange={e => setTimezone(e.target.value)} />}
      </FormField>

      {useDialogFooter ? <DialogFooter>{footer}</DialogFooter> : footer}
    </form>
  )
}
