"use client"

// The ONE row/list component shared by every repeating 201-file collection — education,
// work history, training, contacts and onboarding requirements — instead of five
// near-identical Card+row implementations (task packet's quality bar). Purely
// presentational: the owning tab supplies already-formatted row content and owns the
// actual `callAction` calls; this component only renders the card, the empty state, and
// the add/edit/remove affordances.
import type { ComponentType, ReactNode } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export interface ChildRecordListItem {
  id: string
  primary: ReactNode
  secondary?: ReactNode
  meta?: ReactNode
  badge?: ReactNode
  /** Full-width block rendered below the row (e.g. the Onboarding tab's attachment list) — unlike `meta`, not wrapped in an inline `<span>`, so it may contain its own interactive elements. */
  footer?: ReactNode
}

export interface ChildRecordListProps {
  title: string
  description?: string
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
  items: ChildRecordListItem[]
  addLabel: string
  onAdd: () => void
  onEdit: (id: string) => void
  onRemove: (id: string) => void
  emptyTitle: string
  emptyDescription: string
  disabled?: boolean
}

export function ChildRecordList({
  title,
  description,
  icon: Icon,
  items,
  addLabel,
  onAdd,
  onEdit,
  onRemove,
  emptyTitle,
  emptyDescription,
  disabled,
}: ChildRecordListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <Button variant="outline" size="sm" onClick={onAdd} disabled={disabled}>
            <Plus aria-hidden="true" />
            {addLabel}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-control px-4 py-6">
            {Icon && <Icon className="size-5 text-body-subtle" aria-hidden="true" />}
            <p className="text-sm font-medium text-heading">{emptyTitle}</p>
            <p className="text-sm text-body-subtle">{emptyDescription}</p>
            <Button variant="outline" size="sm" onClick={onAdd} disabled={disabled}>
              <Plus aria-hidden="true" />
              {addLabel}
            </Button>
          </div>
        ) : (
          // Rows share ONE border around the whole collection (hairline dividers between
          // them via `divide-y`) rather than each row being its own bordered/padded card —
          // that's what turned a two-line entry into ~90px of mostly background colour
          // (task packet). Row controls stay in the DOM at rest (never `opacity-0`/hover-only,
          // which would make them unreachable by keyboard and invisible on touch) but read as
          // quiet — ghost buttons with muted icon color — until hovered or focused.
          <ul className="divide-y divide-border">
            {items.map(item => (
              <li key={item.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-heading">{item.primary}</span>
                      {item.badge}
                    </div>
                    {item.secondary && <span className="text-xs text-body-subtle">{item.secondary}</span>}
                    {item.meta && <span className="text-xs text-body-subtle">{item.meta}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-body-subtle hover:text-heading focus-visible:text-heading"
                      onClick={() => onEdit(item.id)}
                      aria-label={`Edit ${typeof item.primary === "string" ? item.primary : "record"}`}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-body-subtle hover:text-fg-danger focus-visible:text-fg-danger"
                      onClick={() => onRemove(item.id)}
                      aria-label={`Remove ${typeof item.primary === "string" ? item.primary : "record"}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                {item.footer}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
