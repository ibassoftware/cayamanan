"use client"

// Bare create/edit form for a cost center (slice 14 reporting needs these later — no
// employee relation field references it, so unlike Department/Position/Location this
// form is never mounted inside a RelationTypeahead "Create and Edit").
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
import { deriveCodeFromName, type CostCenter } from "@/components/org/org-state"

const validateRequired = requiredString("This field is required.")

export interface CostCenterFormProps {
  mode: "create" | "edit"
  costCenter?: CostCenter | null
  onSaved: (costCenter: CostCenter) => void
  onCancel: () => void
}

export function CostCenterForm({ mode, costCenter, onSaved, onCancel }: CostCenterFormProps) {
  const router = useRouter()
  const nameFieldId = useId()
  const codeFieldId = useId()

  const [name, setName] = useState(costCenter?.name ?? "")
  const [code, setCode] = useState(costCenter?.code ?? "")
  const [codeTouched, setCodeTouched] = useState(mode === "edit")
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
        ? await callAction<CostCenter>("org.createCostCenter", { code: codeResult.value, name: nameResult.value })
        : await callAction<CostCenter>("org.updateCostCenter", {
            id: costCenter!.id,
            code: codeResult.value,
            name: nameResult.value,
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

      <DialogFooter>
        <FormFooter onCancel={onCancel} submitting={submitting} saveLabel={mode === "create" ? "Create" : "Save"} />
      </DialogFooter>
    </form>
  )
}
