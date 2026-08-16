"use client"

// Add/edit dialog form for one Family-tab row (emergency contact, beneficiary or
// dependent — the three `employee_contacts.kind` values share one table and one form,
// per schema.ts's comment on why DEPENDENT reuses this table rather than a fourth one).
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/data/form/form-field"
import { requiredString } from "@/components/data/form/form-state"
import { CONTACT_KINDS, contactKindLabel, type ContactKind } from "@/components/employee/employee-contacts-state"
import type { EmployeeContact } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

const validateName = requiredString("Name is required.")

export interface ContactFormProps {
  employeeId: string
  contact: EmployeeContact | null
  defaultKind: ContactKind
  onSaved: (contact: EmployeeContact) => void
  onCancel: () => void
}

export function ContactForm({ employeeId, contact, defaultKind, onSaved, onCancel }: ContactFormProps) {
  const router = useRouter()
  const [kind, setKind] = useState<ContactKind>((contact?.kind as ContactKind) ?? defaultKind)
  const [name, setName] = useState(contact?.name ?? "")
  const [relationship, setRelationship] = useState(contact?.relationship ?? "")
  const [mobile, setMobile] = useState(contact?.mobile ?? "")
  const [email, setEmail] = useState(contact?.email ?? "")
  const [address, setAddress] = useState(contact?.address ?? "")
  const [birthDate, setBirthDate] = useState(contact?.birthDate ?? "")
  const [isPrimary, setIsPrimary] = useState(contact?.isPrimary ?? false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const kindId = useId()
  const nameId = useId()
  const relationshipId = useId()
  const mobileId = useId()
  const emailId = useId()
  const addressId = useId()
  const birthDateId = useId()
  const primaryId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const nameResult = validateName(name)
    setNameError(nameResult.ok ? null : nameResult.message)
    if (!nameResult.ok) return

    setSubmitting(true)
    // `employee.addContact`'s optional fields are plain `.optional()` (blank -> omit the
    // key, i.e. `undefined`); `employee.updateContact`'s are `.nullable().optional()`
    // (blank -> clear the field, i.e. explicit `null`) — see employee-form.tsx's
    // identical create/update split.
    const blank = contact ? null : undefined
    const networkPayload = {
      employeeId,
      kind,
      name: nameResult.value,
      relationship: relationship.trim() || blank,
      mobile: mobile.trim() || blank,
      email: email.trim() || blank,
      address: address.trim() || blank,
      birthDate: birthDate || blank,
      isPrimary,
    }
    const result = contact
      ? await callAction<{ id: string }>("employee.updateContact", { ...networkPayload, id: contact.id })
      : await callAction<{ id: string }>("employee.addContact", networkPayload)
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
      id: contact?.id ?? result.data.id,
      kind,
      name: nameResult.value,
      relationship: relationship.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      birthDate: birthDate || null,
      isPrimary,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {submitError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FormField id={kindId} label="Kind" required>
        {controlProps => (
          <Select value={kind} onValueChange={value => value && setKind(value as ContactKind)}>
            <SelectTrigger id={controlProps.id} aria-invalid={controlProps["aria-invalid"]} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_KINDS.map(k => (
                <SelectItem key={k} value={k}>
                  {contactKindLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField id={nameId} label="Full name" required error={nameError}>
        {controlProps => <Input {...controlProps} value={name} onChange={e => setName(e.target.value)} autoFocus />}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={relationshipId} label="Relationship" hint='e.g. "Spouse", "Child"'>
          {controlProps => <Input {...controlProps} value={relationship} onChange={e => setRelationship(e.target.value)} />}
        </FormField>
        <FormField id={birthDateId} label="Birth date">
          {controlProps => <Input {...controlProps} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />}
        </FormField>
        <FormField id={mobileId} label="Mobile">
          {controlProps => <Input {...controlProps} value={mobile} onChange={e => setMobile(e.target.value)} />}
        </FormField>
        <FormField id={emailId} label="Email">
          {controlProps => <Input {...controlProps} type="email" value={email} onChange={e => setEmail(e.target.value)} />}
        </FormField>
      </div>

      <FormField id={addressId} label="Address">
        {controlProps => <Input {...controlProps} value={address} onChange={e => setAddress(e.target.value)} />}
      </FormField>

      <label htmlFor={primaryId} className="flex items-center gap-2 text-sm text-body">
        <input
          id={primaryId}
          type="checkbox"
          className="size-4 rounded border-border-control accent-[var(--tc-brand-strong)]"
          checked={isPrimary}
          onChange={e => setIsPrimary(e.target.checked)}
        />
        Primary contact for this kind
      </label>

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
