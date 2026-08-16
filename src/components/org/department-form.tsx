"use client"

// Bare create/edit form for a department — no Dialog markup of its own, so it can be
// reused both as the Departments screen's create/edit dialog body and as the
// RelationTypeahead "Create and Edit" quick-create form on the Employee form (Odoo-style
// quick-create — 04-organization-employees.md / product owner requirement). Mirrors
// setting-form.tsx's "bare form, caller supplies Dialog+DialogFooter or its own footer"
// convention.
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { FormFooter } from "@/components/data/form/form-footer"
import { RelationTypeahead, type RelationOption } from "@/components/data/relation-typeahead"
import { requiredString } from "@/components/data/form/form-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import { deriveCodeFromName, type Department } from "@/components/org/org-state"
import { loadDepartmentOptions } from "@/components/org/relation-options"

const validateRequired = requiredString("This field is required.")

export interface DepartmentFormProps {
  mode: "create" | "edit"
  department?: Department | null
  /** The current parent's display option, resolved by the caller (which already holds
   * the full department list) — avoids this form re-fetching just to find one label. */
  initialParent?: RelationOption | null
  initialName?: string
  onSaved: (department: Department) => void
  onCancel: () => void
  /** When true, renders its own DialogFooter (default). Set false for embedding elsewhere. */
  useDialogFooter?: boolean
}

export function DepartmentForm({
  mode,
  department,
  initialParent,
  initialName,
  onSaved,
  onCancel,
  useDialogFooter = true,
}: DepartmentFormProps) {
  const router = useRouter()
  const nameFieldId = useId()
  const codeFieldId = useId()
  const parentFieldId = useId()

  const [name, setName] = useState(department?.name ?? initialName ?? "")
  const [code, setCode] = useState(department?.code ?? deriveCodeFromName(initialName ?? ""))
  const [codeTouched, setCodeTouched] = useState(mode === "edit")
  const [parent, setParent] = useState<RelationOption | null>(initialParent ?? null)
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
        ? await callAction<Department>("org.createDepartment", {
            code: codeResult.value,
            name: nameResult.value,
            parentId: parent?.id ?? null,
          })
        : await callAction<Department>("org.updateDepartment", {
            id: department!.id,
            code: codeResult.value,
            name: nameResult.value,
            parentId: parent?.id ?? null,
          })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      if (result.error.field === "code") setCodeError(result.error.message)
      else if (result.error.field === "parentId") setSubmitError(result.error.message)
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

      <FormField id={parentFieldId} label="Parent department" hint="Optional — leave empty for a top-level department.">
        {controlProps => (
          <RelationTypeahead
            {...controlProps}
            value={parent}
            onChange={setParent}
            loadOptions={q => loadDepartmentOptions(q, { excludeId: department?.id })}
            placeholder="Search departments…"
            entityLabel="department"
          />
        )}
      </FormField>

      {useDialogFooter ? <DialogFooter>{footer}</DialogFooter> : footer}
    </form>
  )
}
