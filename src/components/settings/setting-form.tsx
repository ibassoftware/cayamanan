"use client"

import { useId, useState, type FormEvent } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { callAction } from "@/lib/actions-client"
import {
  formatSettingValue,
  parseSettingValueInput,
  validateSettingKey,
  type SystemSetting,
} from "@/components/settings/settings-state"

interface UpdateSettingOutput {
  key: string
  value: unknown
  effectiveFrom: string
}

interface SettingFormProps {
  /** `null` = creating a new setting (key is editable); otherwise editing this one. */
  editingSetting: SystemSetting | null
  onSaved: (setting: SystemSetting) => void
  onCancel: () => void
}

export function SettingForm({ editingSetting, onSaved, onCancel }: SettingFormProps) {
  const keyFieldId = useId()
  const keyErrorId = useId()
  const valueFieldId = useId()
  const valueErrorId = useId()

  const [keyInput, setKeyInput] = useState(editingSetting?.key ?? "")
  const [valueInput, setValueInput] = useState(
    editingSetting ? formatSettingValue(editingSetting.value) : "",
  )
  const [keyError, setKeyError] = useState<string | null>(null)
  const [valueError, setValueError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const keyResult = editingSetting
      ? { ok: true as const, value: editingSetting.key }
      : validateSettingKey(keyInput)
    const valueResult = parseSettingValueInput(valueInput)

    setKeyError(keyResult.ok ? null : keyResult.message)
    setValueError(valueResult.ok ? null : valueResult.message)
    if (!keyResult.ok || !valueResult.ok) {
      return
    }

    setSubmitting(true)
    const result = await callAction<UpdateSettingOutput>("system.updateSetting", {
      key: keyResult.value,
      value: valueResult.value,
    })
    setSubmitting(false)

    if (!result.ok) {
      setSubmitError(result.error.message)
      return
    }

    onSaved(result.data)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={keyFieldId} className="text-sm font-medium text-heading">
          Key
        </label>
        {editingSetting ? (
          <Input id={keyFieldId} value={editingSetting.key} disabled />
        ) : (
          <Input
            id={keyFieldId}
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="payroll.roundingPolicy"
            aria-invalid={keyError ? true : undefined}
            aria-describedby={keyError ? keyErrorId : undefined}
            autoFocus
          />
        )}
        {keyError && (
          <p id={keyErrorId} className="text-sm text-fg-danger">
            {keyError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={valueFieldId} className="text-sm font-medium text-heading">
          Value (JSON)
        </label>
        <Textarea
          id={valueFieldId}
          value={valueInput}
          onChange={e => setValueInput(e.target.value)}
          placeholder='"HALF_UP" or 42 or {"mode":"HALF_UP"}'
          aria-invalid={valueError ? true : undefined}
          aria-describedby={valueError ? valueErrorId : undefined}
          autoFocus={Boolean(editingSetting)}
        />
        {valueError ? (
          <p id={valueErrorId} className="text-sm text-fg-danger">
            {valueError}
          </p>
        ) : (
          <p className="text-sm text-body-subtle">
            Enter a JSON value: a quoted string, a number, true/false, or an object.
          </p>
        )}
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
