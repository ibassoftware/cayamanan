"use client"

// Family tab — emergency contacts, dependents and beneficiaries, grouped by kind (task
// packet: "contacts grouped by kind"). Three `ChildRecordList` sections sharing one
// `ContactForm` dialog, rather than three near-identical CRUD implementations.
import { useState } from "react"
import { HeartHandshake, ShieldAlert, Users } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChildRecordList, type ChildRecordListItem } from "@/components/employee/child-record-list"
import { ConfirmDialog } from "@/components/data/confirm-dialog"
import { ContactForm } from "@/components/employee/contact-form"
import { contactKindLabel, groupContactsByKind, type ContactKind } from "@/components/employee/employee-contacts-state"
import { formatHumanDate } from "@/components/employee/employee-format"
import type { EmployeeContact, EmployeeDetail } from "@/components/employee/employee-state"
import { Badge } from "@/components/ui/badge"
import { callAction } from "@/lib/actions-client"

type DialogState = { mode: "create"; kind: ContactKind } | { mode: "edit"; contact: EmployeeContact } | null

const SECTIONS: { kind: ContactKind; title: string; description: string; icon: typeof ShieldAlert; emptyDescription: string }[] = [
  {
    kind: "EMERGENCY",
    title: "Emergency contacts",
    description: "Who to reach in an emergency.",
    icon: ShieldAlert,
    emptyDescription: "Add at least one emergency contact.",
  },
  {
    kind: "DEPENDENT",
    title: "Dependents",
    description: "Children/dependents for BIR dependent-exemption purposes.",
    icon: Users,
    emptyDescription: "No dependents on file yet.",
  },
  {
    kind: "BENEFICIARY",
    title: "Beneficiaries",
    description: "Statutory/insurance beneficiaries.",
    icon: HeartHandshake,
    emptyDescription: "No beneficiaries on file yet.",
  },
]

export interface FamilyTabProps {
  employee: EmployeeDetail
  onChange: (patch: Partial<EmployeeDetail>) => void
}

export function FamilyTab({ employee, onChange }: FamilyTabProps) {
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [removeTarget, setRemoveTarget] = useState<EmployeeContact | null>(null)

  const groups = groupContactsByKind(employee.contacts)

  function toRow(contact: EmployeeContact): ChildRecordListItem {
    const metaParts = [contact.relationship, contact.mobile, contact.email].filter(Boolean)
    return {
      id: contact.id,
      primary: contact.name,
      badge: contact.isPrimary ? <Badge variant="brand">Primary</Badge> : undefined,
      secondary: metaParts.length > 0 ? metaParts.join(" · ") : undefined,
      meta: contact.birthDate ? `Born ${formatHumanDate(contact.birthDate)}` : undefined,
    }
  }

  function handleSaved(contact: EmployeeContact) {
    setDialogState(null)
    const exists = employee.contacts.some(c => c.id === contact.id)
    onChange({
      contacts: exists ? employee.contacts.map(c => (c.id === contact.id ? contact : c)) : [...employee.contacts, contact],
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map(section => (
        <ChildRecordList
          key={section.kind}
          title={section.title}
          description={section.description}
          icon={section.icon}
          items={groups[section.kind].map(toRow)}
          addLabel={`Add ${contactKindLabel(section.kind).toLowerCase()}`}
          onAdd={() => setDialogState({ mode: "create", kind: section.kind })}
          onEdit={id => {
            const contact = groups[section.kind].find(c => c.id === id)
            if (contact) setDialogState({ mode: "edit", contact })
          }}
          onRemove={id => {
            const contact = groups[section.kind].find(c => c.id === id)
            if (contact) setRemoveTarget(contact)
          }}
          emptyTitle={`No ${section.title.toLowerCase()} yet`}
          emptyDescription={section.emptyDescription}
        />
      ))}

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>Emergency contacts, dependents and beneficiaries are all recorded here.</DialogDescription>
          </DialogHeader>
          {dialogState && (
            <ContactForm
              employeeId={employee.id}
              contact={dialogState.mode === "edit" ? dialogState.contact : null}
              defaultKind={dialogState.mode === "create" ? dialogState.kind : "EMERGENCY"}
              onSaved={handleSaved}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove this contact?"
        description={
          <>
            This permanently deletes <strong className="font-medium text-heading">{removeTarget?.name}</strong> from the
            employee&rsquo;s 201 file.
          </>
        }
        confirmLabel="Remove"
        onOpenChange={open => !open && setRemoveTarget(null)}
        onConfirm={() => callAction<{ id: string }>("employee.removeContact", { employeeId: employee.id, id: removeTarget!.id })}
        onSuccess={() => {
          const removedId = removeTarget!.id
          setRemoveTarget(null)
          onChange({ contacts: employee.contacts.filter(c => c.id !== removedId) })
        }}
      />
    </div>
  )
}
