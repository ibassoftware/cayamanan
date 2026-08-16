"use client"

// Onboarding tab — the onboarding requirements checklist, sorted so outstanding
// (PENDING) items surface first.
import { useState } from "react"
import { ClipboardCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/data/confirm-dialog"
import { ChildRecordList, type ChildRecordListItem } from "@/components/employee/child-record-list"
import { RequirementAttachments } from "@/components/employee/requirement-attachments"
import { RequirementForm } from "@/components/employee/requirement-form"
import {
  requirementStatusBadgeVariant,
  requirementStatusLabel,
  sortRequirementsByStatus,
} from "@/components/employee/employee-requirements-state"
import { dropPlaceholderLine, formatHumanDate } from "@/components/employee/employee-format"
import type { EmployeeDetail, EmployeeRequirement } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"

type DialogState = { mode: "create" } | { mode: "edit"; requirement: EmployeeRequirement } | null

export interface OnboardingTabProps {
  employee: EmployeeDetail
  onChange: (patch: Partial<EmployeeDetail>) => void
}

export function OnboardingTab({ employee, onChange }: OnboardingTabProps) {
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [removeTarget, setRemoveTarget] = useState<EmployeeRequirement | null>(null)

  const requirements = sortRequirementsByStatus(employee.requirements)

  const items: ChildRecordListItem[] = requirements.map(row => ({
    id: row.id,
    primary: row.requirement,
    badge: <Badge variant={requirementStatusBadgeVariant(row.status)}>{requirementStatusLabel(row.status)}</Badge>,
    secondary: row.submittedOn ? `Submitted ${formatHumanDate(row.submittedOn)}` : undefined,
    meta: dropPlaceholderLine(row.notes),
    footer: (
      <RequirementAttachments
        employeeId={employee.id}
        requirementId={row.id}
        documents={employee.documents}
        onChange={documents => onChange({ documents })}
      />
    ),
  }))

  function handleSaved(requirement: EmployeeRequirement) {
    setDialogState(null)
    const exists = employee.requirements.some(r => r.id === requirement.id || r.requirement === requirement.requirement)
    onChange({
      requirements: exists
        ? employee.requirements.map(r => (r.id === requirement.id || r.requirement === requirement.requirement ? requirement : r))
        : [...employee.requirements, requirement],
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ChildRecordList
        title="Onboarding checklist"
        description="Statutory forms and clearances required before/during onboarding."
        icon={ClipboardCheck}
        items={items}
        addLabel="Add requirement"
        onAdd={() => setDialogState({ mode: "create" })}
        onEdit={id => {
          const requirement = requirements.find(r => r.id === id)
          if (requirement) setDialogState({ mode: "edit", requirement })
        }}
        onRemove={id => {
          const requirement = requirements.find(r => r.id === id)
          if (requirement) setRemoveTarget(requirement)
        }}
        emptyTitle="No onboarding requirements yet"
        emptyDescription="Add checklist items like NBI clearance or SSS E-1 form."
      />

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit requirement" : "Add requirement"}</DialogTitle>
            <DialogDescription>Track this checklist item&rsquo;s submission status.</DialogDescription>
          </DialogHeader>
          {dialogState && (
            <RequirementForm
              employeeId={employee.id}
              requirement={dialogState.mode === "edit" ? dialogState.requirement : null}
              onSaved={handleSaved}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove this requirement?"
        description={
          <>
            This permanently deletes{" "}
            <strong className="font-medium text-heading">{removeTarget?.requirement}</strong> from the onboarding checklist.
          </>
        }
        confirmLabel="Remove"
        onOpenChange={open => !open && setRemoveTarget(null)}
        onConfirm={() =>
          callAction<{ id: string }>("employee.removeRequirement", {
            employeeId: employee.id,
            requirement: removeTarget!.requirement,
          })
        }
        onSuccess={() => {
          const removedId = removeTarget!.id
          setRemoveTarget(null)
          onChange({ requirements: employee.requirements.filter(r => r.id !== removedId) })
        }}
      />
    </div>
  )
}
