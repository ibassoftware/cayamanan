"use client"

// Labelled field wrapper every create/edit form uses instead of hand-rolling the
// label/control/error markup (see setting-form.tsx for the pattern this generalises).
// Wires the control's `id`, `aria-invalid`, and `aria-describedby` together so
// validation errors are associated for assistive tech, and marks required fields with
// both a glyph and screen-reader text — never colour alone.
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface FormFieldControlProps {
  id: string
  "aria-invalid": true | undefined
  "aria-describedby": string | undefined
}

export interface FormFieldProps {
  id: string
  label: string
  required?: boolean
  /** Validation error, if any. Takes priority over `hint` for the describedby text. */
  error?: string | null
  hint?: string
  className?: string
  children: (controlProps: FormFieldControlProps) => ReactNode
}

export function FormField({ id, label, required, error, hint, className, children }: FormFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-heading">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-fg-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={errorId} className="text-sm text-fg-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-body-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
