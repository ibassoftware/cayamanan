"use client"

// Background tab — education, work history and training, each its own `ChildRecordList`
// section sharing the same row component, sorted most-recent-first.
import { useState } from "react"
import { Briefcase, GraduationCap, Sparkles } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/data/confirm-dialog"
import { ChildRecordList, type ChildRecordListItem } from "@/components/employee/child-record-list"
import { EducationForm } from "@/components/employee/education-form"
import { WorkHistoryForm } from "@/components/employee/work-history-form"
import { TrainingForm } from "@/components/employee/training-form"
import { educationLevelLabel, sortByDateRangeRecency, sortEducationByRecency } from "@/components/employee/employee-background-state"
import { dropPlaceholderLine, formatDateRange, formatHours, formatYearRange } from "@/components/employee/employee-format"
import type {
  EmployeeDetail,
  EmployeeEducation,
  EmployeeTrainingEntry,
  EmployeeWorkHistoryEntry,
} from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"

type DialogState =
  | { collection: "education"; mode: "create" }
  | { collection: "education"; mode: "edit"; item: EmployeeEducation }
  | { collection: "workHistory"; mode: "create" }
  | { collection: "workHistory"; mode: "edit"; item: EmployeeWorkHistoryEntry }
  | { collection: "training"; mode: "create" }
  | { collection: "training"; mode: "edit"; item: EmployeeTrainingEntry }
  | null

type RemoveTarget = { collection: "education" | "workHistory" | "training"; id: string; label: string } | null

const REMOVE_ACTION: Record<"education" | "workHistory" | "training", string> = {
  education: "employee.removeEducation",
  workHistory: "employee.removeWorkHistory",
  training: "employee.removeTraining",
}

export interface BackgroundTabProps {
  employee: EmployeeDetail
  onChange: (patch: Partial<EmployeeDetail>) => void
}

export function BackgroundTab({ employee, onChange }: BackgroundTabProps) {
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget>(null)

  const education = sortEducationByRecency(employee.education)
  const workHistory = sortByDateRangeRecency(employee.workHistory)
  const training = sortByDateRangeRecency(employee.training)

  const educationItems: ChildRecordListItem[] = education.map(row => ({
    id: row.id,
    primary: row.school,
    secondary: dropPlaceholderLine([educationLevelLabel(row.level), row.degree, row.fieldOfStudy].filter(Boolean).join(" · ")),
    meta: dropPlaceholderLine([formatYearRange(row.startYear, row.endYear), row.honors].filter(Boolean).join(" · ")),
  }))

  const workHistoryItems: ChildRecordListItem[] = workHistory.map(row => ({
    id: row.id,
    primary: row.employer,
    secondary: dropPlaceholderLine(row.position),
    meta: dropPlaceholderLine([formatDateRange(row.startDate, row.endDate), row.reasonForLeaving].filter(Boolean).join(" · ")),
  }))

  const trainingItems: ChildRecordListItem[] = training.map(row => ({
    id: row.id,
    primary: row.title,
    secondary: dropPlaceholderLine(row.provider),
    meta: dropPlaceholderLine(
      [formatDateRange(row.startDate, row.endDate), row.hours ? formatHours(row.hours) : null, row.certificateNo]
        .filter(Boolean)
        .join(" · "),
    ),
  }))

  return (
    <div className="flex flex-col gap-4">
      <ChildRecordList
        title="Education"
        icon={GraduationCap}
        items={educationItems}
        addLabel="Add education"
        onAdd={() => setDialogState({ collection: "education", mode: "create" })}
        onEdit={id => {
          const item = education.find(row => row.id === id)
          if (item) setDialogState({ collection: "education", mode: "edit", item })
        }}
        onRemove={id => {
          const item = education.find(row => row.id === id)
          if (item) setRemoveTarget({ collection: "education", id, label: item.school })
        }}
        emptyTitle="No education records yet"
        emptyDescription="Add schooling history for this employee's 201 file."
      />

      <ChildRecordList
        title="Work history"
        icon={Briefcase}
        items={workHistoryItems}
        addLabel="Add work history"
        onAdd={() => setDialogState({ collection: "workHistory", mode: "create" })}
        onEdit={id => {
          const item = workHistory.find(row => row.id === id)
          if (item) setDialogState({ collection: "workHistory", mode: "edit", item })
        }}
        onRemove={id => {
          const item = workHistory.find(row => row.id === id)
          if (item) setRemoveTarget({ collection: "workHistory", id, label: item.employer })
        }}
        emptyTitle="No prior employment on file"
        emptyDescription="Add this employee's previous employers."
      />

      <ChildRecordList
        title="Training"
        icon={Sparkles}
        items={trainingItems}
        addLabel="Add training"
        onAdd={() => setDialogState({ collection: "training", mode: "create" })}
        onEdit={id => {
          const item = training.find(row => row.id === id)
          if (item) setDialogState({ collection: "training", mode: "edit", item })
        }}
        onRemove={id => {
          const item = training.find(row => row.id === id)
          if (item) setRemoveTarget({ collection: "training", id, label: item.title })
        }}
        emptyTitle="No training records yet"
        emptyDescription="Add seminars/trainings this employee has completed."
      />

      <Dialog open={dialogState !== null} onOpenChange={open => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === "edit" ? "Edit" : "Add"}{" "}
              {dialogState?.collection === "education" ? "education record" : dialogState?.collection === "workHistory" ? "work history record" : "training record"}
            </DialogTitle>
            <DialogDescription>Part of this employee&rsquo;s 201-file background.</DialogDescription>
          </DialogHeader>
          {dialogState?.collection === "education" && (
            <EducationForm
              employeeId={employee.id}
              education={dialogState.mode === "edit" ? dialogState.item : null}
              onSaved={row => {
                setDialogState(null)
                const exists = employee.education.some(e => e.id === row.id)
                onChange({ education: exists ? employee.education.map(e => (e.id === row.id ? row : e)) : [...employee.education, row] })
              }}
              onCancel={() => setDialogState(null)}
            />
          )}
          {dialogState?.collection === "workHistory" && (
            <WorkHistoryForm
              employeeId={employee.id}
              workHistory={dialogState.mode === "edit" ? dialogState.item : null}
              onSaved={row => {
                setDialogState(null)
                const exists = employee.workHistory.some(w => w.id === row.id)
                onChange({
                  workHistory: exists ? employee.workHistory.map(w => (w.id === row.id ? row : w)) : [...employee.workHistory, row],
                })
              }}
              onCancel={() => setDialogState(null)}
            />
          )}
          {dialogState?.collection === "training" && (
            <TrainingForm
              employeeId={employee.id}
              training={dialogState.mode === "edit" ? dialogState.item : null}
              onSaved={row => {
                setDialogState(null)
                const exists = employee.training.some(t => t.id === row.id)
                onChange({ training: exists ? employee.training.map(t => (t.id === row.id ? row : t)) : [...employee.training, row] })
              }}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove this record?"
        description={
          <>
            This permanently deletes <strong className="font-medium text-heading">{removeTarget?.label}</strong> from this
            employee&rsquo;s 201 file.
          </>
        }
        confirmLabel="Remove"
        onOpenChange={open => !open && setRemoveTarget(null)}
        onConfirm={() =>
          callAction<{ id: string }>(REMOVE_ACTION[removeTarget!.collection], { employeeId: employee.id, id: removeTarget!.id })
        }
        onSuccess={() => {
          const target = removeTarget!
          setRemoveTarget(null)
          if (target.collection === "education") onChange({ education: employee.education.filter(e => e.id !== target.id) })
          if (target.collection === "workHistory") onChange({ workHistory: employee.workHistory.filter(w => w.id !== target.id) })
          if (target.collection === "training") onChange({ training: employee.training.filter(t => t.id !== target.id) })
        }}
      />
    </div>
  )
}
