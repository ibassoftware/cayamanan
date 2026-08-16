"use client"

// The composer's file-attach affordance. Picking a file uploads it immediately to
// `ai.createAttachment`, which stages it server-side and hands back only a
// filename/size/row-count triple (src/modules/ai/schema.ts's header comment explains why
// the model never sees the rows). Nothing in this component ever logs the file's content
// or the intermediate data URL — both are read once, converted, and discarded.
import { PaperclipIcon, XIcon } from "lucide-react"
import { useCallback, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { callAction } from "@/lib/actions-client"
import {
  formatAttachmentRowCount,
  formatAttachmentSize,
  stripDataUrlPrefix,
  validateAttachmentPick,
  type AttachmentSlot,
} from "@/components/chat/chat-attachment-state"

interface CreateAttachmentResult {
  id: string
  filename: string
  byteSize: number
  rowCount: number
}

export interface ChatAttachmentControlProps {
  slot: AttachmentSlot
  onSlotChange: (slot: AttachmentSlot) => void
  disabled?: boolean
}

export function ChatAttachmentControl({ slot, onSlotChange, disabled }: ChatAttachmentControlProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) return

      // Convenience only — see chat-attachment-state.ts's own comment. The server
      // (ai.createAttachment) re-validates everything and is the actual boundary.
      const validation = validateAttachmentPick(file)
      if (!validation.ok) {
        onSlotChange({ status: "error", message: validation.message })
        return
      }

      onSlotChange({ status: "uploading", filename: file.name })

      const reader = new FileReader()
      reader.onerror = () => {
        onSlotChange({ status: "error", message: "Could not read this file. Please try again." })
      }
      reader.onload = () => {
        void (async () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : ""
          // Isolated to the base64 payload immediately — never held onto or logged as a
          // data URL beyond this one local variable.
          const contentBase64 = stripDataUrlPrefix(dataUrl)
          const result = await callAction<CreateAttachmentResult>("ai.createAttachment", {
            filename: file.name,
            contentBase64,
          })
          if (!result.ok) {
            onSlotChange({ status: "error", message: result.error.message })
            return
          }
          onSlotChange({
            status: "ready",
            id: result.data.id,
            filename: result.data.filename,
            byteSize: result.data.byteSize,
            rowCount: result.data.rowCount,
          })
        })()
      }
      reader.readAsDataURL(file)
    },
    [onSlotChange],
  )

  const openFileDialog = useCallback(() => inputRef.current?.click(), [])

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="hidden"
        aria-label="Attach a CSV file"
        onChange={(event) => {
          handleFiles(event.currentTarget.files)
          // Allows re-selecting the same file after it was removed.
          event.currentTarget.value = ""
        }}
      />

      {slot.status === "idle" && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Attach a file"
          disabled={disabled}
          onClick={openFileDialog}
          className="self-start"
        >
          <PaperclipIcon className="size-4" aria-hidden="true" />
        </Button>
      )}

      {slot.status === "uploading" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-body-subtle text-xs">
          <Spinner className="size-3" />
          <span className="min-w-0 truncate">Attaching {slot.filename}…</span>
        </div>
      )}

      {slot.status === "ready" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs">
          <span className="min-w-0 truncate font-medium text-heading">{slot.filename}</span>
          <span className="shrink-0 text-body-subtle">
            {formatAttachmentSize(slot.byteSize)} · {formatAttachmentRowCount(slot.rowCount)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove attachment"
            className="ml-auto size-5 shrink-0"
            onClick={() => onSlotChange({ status: "idle" })}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      )}

      {slot.status === "error" && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--tc-border-danger-subtle)] bg-danger-soft px-2 py-1 text-fg-danger text-xs">
          <span className="min-w-0 truncate">{slot.message}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            className="ml-auto size-5 shrink-0"
            onClick={() => onSlotChange({ status: "idle" })}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
