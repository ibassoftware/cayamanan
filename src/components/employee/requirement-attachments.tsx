"use client"

// Attachments block for one Onboarding-tab checklist row (task packet §2) — rendered as
// the row's footer in ChildRecordList. Lists already-uploaded REQUIREMENT documents
// (filename, size, download link, remove) and an "Attach file" control accepting
// JPEG/PNG/WEBP/PDF (unlike the photo control, PDFs are allowed here).
import { useId, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Download, Paperclip, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ATTACHMENT_ACCEPT_ATTR,
  ATTACHMENT_ACCEPT_EXTENSIONS,
  attachmentsForRequirement,
  checkClientUpload,
  documentDownloadUrl,
  formatByteSize,
  stripBase64Prefix,
} from "@/components/employee/document-state"
import type { EmployeeDocument } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

export interface RequirementAttachmentsProps {
  employeeId: string
  requirementId: string
  documents: EmployeeDocument[]
  onChange: (documents: EmployeeDocument[]) => void
}

export function RequirementAttachments({ employeeId, requirementId, documents, onChange }: RequirementAttachmentsProps) {
  const router = useRouter()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const attachments = attachmentsForRequirement(documents, requirementId)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return

    const check = checkClientUpload(file, ATTACHMENT_ACCEPT_EXTENSIONS)
    if (!check.ok) {
      setError(check.message ?? "That file can't be used.")
      return
    }

    setError(null)
    setUploading(true)

    const contentBase64 = await new Promise<string | null>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(stripBase64Prefix(typeof reader.result === "string" ? reader.result : ""))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })

    if (contentBase64 === null) {
      setUploading(false)
      setError("Couldn't read that file. Try again.")
      return
    }

    const uploaded = await callAction<{ id: string; filename: string; mimeType: string; byteSize: number }>(
      "employee.uploadDocument",
      { employeeId, kind: "REQUIREMENT", requirementId, filename: file.name, contentBase64 },
    )
    setUploading(false)

    if (!uploaded.ok) {
      if (isSessionExpired(uploaded)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(uploaded.error.message)
      return
    }

    onChange([
      ...documents,
      {
        id: uploaded.data.id,
        kind: "REQUIREMENT",
        requirementId,
        filename: uploaded.data.filename,
        mimeType: uploaded.data.mimeType,
        byteSize: uploaded.data.byteSize,
        createdAt: new Date().toISOString(),
      },
    ])
  }

  async function handleRemove(documentId: string) {
    setError(null)
    setRemovingId(documentId)
    const removed = await callAction<{ id: string }>("employee.removeDocument", { employeeId, documentId })
    setRemovingId(null)
    if (!removed.ok) {
      if (isSessionExpired(removed)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(removed.error.message)
      return
    }
    onChange(documents.filter(doc => doc.id !== documentId))
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-control pt-2">
      {attachments.length === 0 ? (
        <p className="text-xs text-body-subtle">No attachments yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {attachments.map(doc => (
            <li key={doc.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-heading" title={doc.filename}>
                {doc.filename}
              </span>
              <span className="shrink-0 text-body-subtle">{formatByteSize(doc.byteSize)}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <a
                  href={documentDownloadUrl(doc.id)}
                  aria-label={`Download ${doc.filename}`}
                  title="Download"
                  className="flex size-6 items-center justify-center rounded-md text-body-subtle hover:bg-muted hover:text-heading"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(doc.id)}
                  disabled={removingId === doc.id}
                  aria-label={`Remove ${doc.filename}`}
                  title="Remove"
                  className="flex size-6 items-center justify-center rounded-md text-fg-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Paperclip aria-hidden="true" />
          {uploading ? "Attaching…" : "Attach file"}
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ATTACHMENT_ACCEPT_ATTR}
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Attach file"
          disabled={uploading}
        />
      </div>

      {error && <p className="text-xs text-fg-danger">{error}</p>}
    </div>
  )
}
