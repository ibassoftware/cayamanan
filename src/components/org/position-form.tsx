"use client"

// Bare create/edit form for a position/job title — reused both by the Positions screen
// and as the RelationTypeahead "Create and Edit" quick-create form on the Employee form
// (the product owner's specific example: "positions - if the position is not available,
// a quick option to Create or Create and Edit like in odoo").
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
import { deriveCodeFromName, type Position } from "@/components/org/org-state"

const validateRequired = requiredString("This field is required.")

export interface PositionFormProps {
  mode: "create" | "edit"
  position?: Position | null
  initialName?: string
  onSaved: (position: Position) => void
  onCancel: () => void
  useDialogFooter?: boolean
}

export function PositionForm({ mode, position, initialName, onSaved, onCancel, useDialogFooter = true }: PositionFormProps) {
  const router = useRouter()
  const titleFieldId = useId()
  const codeFieldId = useId()

  const [title, setTitle] = useState(position?.title ?? initialName ?? "")
  const [code, setCode] = useState(position?.code ?? deriveCodeFromName(initialName ?? ""))
  const [codeTouched, setCodeTouched] = useState(mode === "edit")
  const [titleError, setTitleError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleTitleChange(next: string) {
    setTitle(next)
    if (mode === "create" && !codeTouched) {
      setCode(deriveCodeFromName(next))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const titleResult = validateRequired(title)
    const codeResult = validateRequired(code)
    setTitleError(titleResult.ok ? null : titleResult.message)
    setCodeError(codeResult.ok ? null : codeResult.message)
    if (!titleResult.ok || !codeResult.ok) return

    setSubmitting(true)
    const result =
      mode === "create"
        ? await callAction<Position>("org.createPosition", { code: codeResult.value, title: titleResult.value })
        : await callAction<Position>("org.updatePosition", {
            id: position!.id,
            code: codeResult.value,
            title: titleResult.value,
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

      <FormField id={titleFieldId} label="Title" required error={titleError}>
        {controlProps => (
          <Input {...controlProps} value={title} onChange={e => handleTitleChange(e.target.value)} autoFocus />
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

      {useDialogFooter ? <DialogFooter>{footer}</DialogFooter> : footer}
    </form>
  )
}
