"use client"

// Odoo-style "pick a related record" combobox — the most important primitive in this
// library. Composes @base-ui/react/combobox (which already implements full ARIA
// combobox semantics: role, aria-expanded, aria-activedescendant, aria-controls, and
// arrow-key/Enter/Escape keyboard handling) rather than hand-rolling one, per the
// project constraint to prefer an existing primitive over adding a dependency.
//
// Data-fetching seam: this component never imports `callAction` or a domain action.
// Screens supply `loadOptions` (typeahead search), and optionally `onQuickCreate`
// ("Create") and `renderCreateForm` ("Create and Edit", rendered in a dialog owned by
// this component so the parent form is never navigated away from or unmounted).
import { useEffect, useRef, useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronsUpDown, Plus, SquarePen, X } from "lucide-react"

import {
  buildRelationItems,
  deriveRelationStatusMessage,
  type RelationComboboxItem,
  type RelationOption,
} from "@/components/data/relation-typeahead-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ActionResult } from "@/platform/errors"

export type { RelationOption }

export interface RelationTypeaheadProps {
  id: string
  value: RelationOption | null
  onChange: (option: RelationOption | null) => void
  /** Called on open and on each (debounced) keystroke. Empty string means "show defaults". */
  loadOptions: (query: string) => Promise<ActionResult<{ options: RelationOption[] }>>
  /** "Create" — makes the record inline with just its name and selects it. Omit to hide the row. */
  onQuickCreate?: (name: string) => Promise<ActionResult<RelationOption>>
  /**
   * "Create and Edit" — renders the fuller create form for the related record inside a
   * dialog owned by this component, so the field being filled in never loses its
   * in-progress form. Omit to hide the row.
   */
  renderCreateForm?: (props: {
    initialName: string
    onCreated: (option: RelationOption) => void
    onCancel: () => void
  }) => React.ReactNode
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Singular noun used in row copy, e.g. "position" -> `Create "X" as a new position`. */
  entityLabel?: string
  emptyLabel?: string
  createAndEditTitle?: string
  "aria-describedby"?: string
  "aria-invalid"?: true
  className?: string
}

function isItemEqualToValue(a: RelationComboboxItem, b: RelationComboboxItem): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "option" && b.kind === "option") return a.option.id === b.option.id
  if (a.kind !== "option" && b.kind !== "option") return a.query === b.query
  return false
}

function itemToStringLabel(item: RelationComboboxItem): string {
  return item.kind === "option" ? item.option.label : item.query
}

const itemClassName =
  "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-heading"

export function RelationTypeahead({
  id,
  value,
  onChange,
  loadOptions,
  onQuickCreate,
  renderCreateForm,
  placeholder = "Search…",
  disabled,
  required,
  entityLabel,
  emptyLabel,
  createAndEditTitle,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
}: RelationTypeaheadProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value?.label ?? "")
  const [options, setOptions] = useState<RelationOption[]>([])
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle")
  const [searchError, setSearchError] = useState<string | null>(null)

  const [quickCreating, setQuickCreating] = useState<string | null>(null)
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null)

  const [createAndEditOpen, setCreateAndEditOpen] = useState(false)
  const [createAndEditQuery, setCreateAndEditQuery] = useState("")

  const [liveMessage, setLiveMessage] = useState("")

  const inputRef = useRef<HTMLInputElement | null>(null)
  // Restoring focus to the combobox input after the "Create and Edit" dialog closes
  // needs to read `inputRef.current`, which the callbacks handed to `renderCreateForm`
  // (an eagerly-invoked render prop) must not do directly — refs may only be read in
  // an effect or a DOM event handler, never from a closure constructed while
  // rendering. Bumping this counter (a plain setState call, not a ref read) routes the
  // actual focus() through this effect instead. The delay gives the dialog's own
  // closing transition and focus trap time to release first — an immediate
  // requestAnimationFrame call loses that race and gets pulled back inside.
  const [focusRequestId, setFocusRequestId] = useState(0)
  useEffect(() => {
    if (focusRequestId === 0) return
    const timeout = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(timeout)
  }, [focusRequestId])

  const loadOptionsRef = useRef(loadOptions)
  useEffect(() => {
    loadOptionsRef.current = loadOptions
  }, [loadOptions])
  const requestIdRef = useRef(0)

  // Re-syncing the displayed text from the controlled `value` happens in
  // `handleOpenChange` below (an event handler, not an effect) so it can tell "closed
  // because the user picked something" (already handled by `handleValueChange`) apart
  // from "closed by Escape/outside click while abandoning an edit" (query must revert
  // to the current selection's label) without racing the value-change React hasn't
  // re-rendered with yet.
  function handleOpenChange(nextOpen: boolean, eventDetails: { reason: string }) {
    setOpen(nextOpen)
    if (nextOpen) {
      // Typing is itself what opens the popup for the very first keystroke from a
      // closed field — `onInputValueChange` already applies that keystroke to
      // `query`, so resetting it here too would race it and swallow the character.
      // Only seed the field with the current selection's label when the popup opens
      // some other way (click, trigger button, focus) with nothing typed yet.
      if (eventDetails.reason !== "input-change") {
        setQuery(value?.label ?? "")
      }
      return
    }
    if (eventDetails.reason !== "item-press") {
      setQuery(value?.label ?? "")
    }
  }

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    const delayMs = query.trim() === "" ? 0 : 200
    const timeout = setTimeout(() => {
      void (async () => {
        setSearchStatus("loading")
        const result = await loadOptionsRef.current(query)
        if (requestIdRef.current !== requestId) return
        if (!result.ok) {
          setSearchStatus("error")
          setSearchError(result.error.message)
          setOptions([])
          return
        }
        setSearchStatus("idle")
        setSearchError(null)
        setOptions(result.data.options)
      })()
    }, delayMs)
    return () => clearTimeout(timeout)
  }, [open, query])

  const items = buildRelationItems(options, query, {
    quickCreate: Boolean(onQuickCreate),
    createAndEdit: Boolean(renderCreateForm),
  })

  const statusMessage = deriveRelationStatusMessage({
    status: searchStatus,
    query,
    resultCount: options.length,
    errorMessage: searchError,
  })

  const selectedItem: RelationComboboxItem | null = value ? { kind: "option", option: value } : null

  async function handleQuickCreate(name: string) {
    if (!onQuickCreate) return
    setQuickCreating(name)
    setQuickCreateError(null)
    const result = await onQuickCreate(name)
    setQuickCreating(null)

    if (!result.ok) {
      setQuickCreateError(result.error.message)
      setOpen(true)
      return
    }

    onChange(result.data)
    setQuery(result.data.label)
    setLiveMessage(`Created "${result.data.label}" and selected it.`)
  }

  function handleValueChange(next: RelationComboboxItem | null) {
    if (!next) {
      onChange(null)
      setQuery("")
      return
    }
    if (next.kind === "option") {
      onChange(next.option)
      setQuery(next.option.label)
      return
    }
    if (next.kind === "create") {
      void handleQuickCreate(next.query)
      return
    }
    setCreateAndEditQuery(next.query)
    setCreateAndEditOpen(true)
  }

  return (
    <div className={className}>
      <Combobox.Root
        items={items}
        filter={null}
        value={selectedItem}
        onValueChange={handleValueChange}
        inputValue={query}
        onInputValueChange={setQuery}
        open={open}
        onOpenChange={handleOpenChange}
        itemToStringLabel={itemToStringLabel}
        isItemEqualToValue={isItemEqualToValue}
        disabled={disabled}
        required={required}
      >
        <Combobox.InputGroup className="relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-card pr-1 shadow-xs transition-colors outline-none focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
          <Combobox.Input
            id={id}
            ref={inputRef}
            placeholder={placeholder}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            className="h-full w-full min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2.5 py-1 text-base text-heading outline-none placeholder:text-body-subtle disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          />
          <div className="flex shrink-0 items-center gap-0.5">
            {value && !required && (
              <Combobox.Clear
                aria-label="Clear selection"
                className="flex size-6 items-center justify-center rounded text-body-subtle hover:bg-muted hover:text-heading"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Combobox.Clear>
            )}
            <Combobox.Trigger
              aria-label="Show options"
              className="flex size-6 items-center justify-center rounded text-body-subtle hover:bg-muted hover:text-heading disabled:pointer-events-none disabled:opacity-50"
            >
              <ChevronsUpDown className="size-3.5" aria-hidden="true" />
            </Combobox.Trigger>
          </div>
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
            <Combobox.Popup className="w-(--anchor-width) max-h-(--available-height) origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              {(quickCreating || quickCreateError) && (
                <div
                  className={cn(
                    "px-2 py-1.5 text-xs",
                    quickCreateError ? "text-fg-danger" : "text-body-subtle",
                  )}
                >
                  {quickCreating ? `Creating "${quickCreating}"…` : quickCreateError}
                </div>
              )}
              <Combobox.Status className="px-2 py-1.5 text-xs text-body-subtle empty:hidden">
                {statusMessage}
              </Combobox.Status>
              <Combobox.Empty className="px-2 py-6 text-center text-sm text-body-subtle">
                {emptyLabel ?? "No matches."}
              </Combobox.Empty>
              <Combobox.List>
                {(item: RelationComboboxItem) => {
                  if (item.kind === "option") {
                    return (
                      <Combobox.Item key={item.option.id} value={item} className={itemClassName}>
                        <Combobox.ItemIndicator className="col-start-1">
                          <Check className="size-4" aria-hidden="true" />
                        </Combobox.ItemIndicator>
                        <div className="col-start-2 flex flex-col">
                          <span>{item.option.label}</span>
                          {item.option.description && (
                            <span className="text-xs text-body-subtle">{item.option.description}</span>
                          )}
                        </div>
                      </Combobox.Item>
                    )
                  }
                  if (item.kind === "create") {
                    return (
                      <Combobox.Item key={`create:${item.query}`} value={item} className={itemClassName}>
                        <Plus className="col-start-1 size-4 text-brand-strong" aria-hidden="true" />
                        <span className="col-start-2">
                          Create &ldquo;{item.query}&rdquo;
                          {entityLabel ? ` as a new ${entityLabel}` : ""}
                        </span>
                      </Combobox.Item>
                    )
                  }
                  return (
                    <Combobox.Item key={`create-and-edit:${item.query}`} value={item} className={itemClassName}>
                      <SquarePen className="col-start-1 size-4 text-brand-strong" aria-hidden="true" />
                      <span className="col-start-2">Create and edit…</span>
                    </Combobox.Item>
                  )
                }}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {/* Always-mounted live region: announces inline creation regardless of the
          popup's own mount lifecycle (Combobox.Status only speaks to what's visible
          while open). */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {renderCreateForm && (
        <Dialog open={createAndEditOpen} onOpenChange={setCreateAndEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createAndEditTitle ?? `Create ${entityLabel ?? "record"}`}</DialogTitle>
              <DialogDescription>
                Fill this in and save — you&rsquo;ll be returned to your form with it selected.
              </DialogDescription>
            </DialogHeader>
            {renderCreateForm({
              initialName: createAndEditQuery,
              onCreated: created => {
                setCreateAndEditOpen(false)
                onChange(created)
                setQuery(created.label)
                setLiveMessage(`Created "${created.label}" and selected it.`)
                setFocusRequestId(id => id + 1)
              },
              onCancel: () => {
                setCreateAndEditOpen(false)
                setFocusRequestId(id => id + 1)
              },
            })}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
