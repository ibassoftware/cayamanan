"use client"

// Employee-photo control for the 201-file header band (task packet §1). Renders the
// uploaded PHOTO document from GET /api/files/[id], falling back to initials — including
// when the image never loads at all, e.g. under that route's `Content-Disposition:
// attachment` header (see api/files/[documentId]/route.ts; base-ui's Avatar shows
// AvatarFallback automatically whenever AvatarImage fails to load, so no extra state is
// needed here to detect that). Lets ADMIN/HR_PAYROLL add, replace or remove the photo.
//
// `employee.uploadDocument` is `risk: 'high'` but `toolExposed: false` (never a Missy
// tool — see that action's own comment): this direct form submit through callAction is
// the only path that ever calls it, so there is no separate confirmation step to wire up.
import { useId, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Camera, Trash2 } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  PHOTO_ACCEPT_ATTR,
  PHOTO_ACCEPT_EXTENSIONS,
  checkClientUpload,
  documentDownloadUrl,
  selectPhotoDocument,
  stripBase64Prefix,
} from "@/components/employee/document-state"
import type { EmployeeDocument } from "@/components/employee/employee-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"

export interface EmployeePhotoProps {
  employeeId: string
  documents: EmployeeDocument[]
  initials: string
  onChange: (documents: EmployeeDocument[]) => void
}

export function EmployeePhoto({ employeeId, documents, initials, onChange }: EmployeePhotoProps) {
  const router = useRouter()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const photo = selectPhotoDocument(documents)

  function readAsBase64(file: File): Promise<string | null> {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(stripBase64Prefix(typeof reader.result === "string" ? reader.result : ""))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return

    const check = checkClientUpload(file, PHOTO_ACCEPT_EXTENSIONS)
    if (!check.ok) {
      setError(check.message ?? "That file can't be used.")
      return
    }

    setError(null)
    setBusy(true)

    // Replacing an existing photo: the server allows at most one PHOTO document per
    // employee (a unique constraint), so the old one is removed first.
    let remaining = documents
    if (photo) {
      const removed = await callAction<{ id: string }>("employee.removeDocument", {
        employeeId,
        documentId: photo.id,
      })
      if (!removed.ok) {
        setBusy(false)
        if (isSessionExpired(removed)) {
          router.push(SESSION_EXPIRED_LOGIN_PATH)
          return
        }
        setError(removed.error.message)
        return
      }
      remaining = documents.filter(doc => doc.id !== photo.id)
      onChange(remaining)
    }

    const contentBase64 = await readAsBase64(file)
    if (contentBase64 === null) {
      setBusy(false)
      setError("Couldn't read that file. Try again.")
      return
    }

    const uploaded = await callAction<{ id: string; filename: string; mimeType: string; byteSize: number }>(
      "employee.uploadDocument",
      { employeeId, kind: "PHOTO", filename: file.name, contentBase64 },
    )
    setBusy(false)

    if (!uploaded.ok) {
      if (isSessionExpired(uploaded)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(uploaded.error.message)
      return
    }

    onChange([
      ...remaining,
      {
        id: uploaded.data.id,
        kind: "PHOTO",
        requirementId: null,
        filename: uploaded.data.filename,
        mimeType: uploaded.data.mimeType,
        byteSize: uploaded.data.byteSize,
        createdAt: new Date().toISOString(),
      },
    ])
  }

  async function handleRemove() {
    if (!photo) return
    setError(null)
    setBusy(true)
    const removed = await callAction<{ id: string }>("employee.removeDocument", { employeeId, documentId: photo.id })
    setBusy(false)
    if (!removed.ok) {
      if (isSessionExpired(removed)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(removed.error.message)
      return
    }
    onChange(documents.filter(doc => doc.id !== photo.id))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative w-fit">
        <Avatar className="size-14" aria-hidden="true">
          {photo && <AvatarImage src={documentDownloadUrl(photo.id)} alt="" />}
          <AvatarFallback className="text-base font-medium text-heading">{initials}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={photo ? "Change photo" : "Add photo"}
          title={photo ? "Change photo" : "Add photo"}
          className="absolute -right-1 -bottom-1 z-10 flex size-6 items-center justify-center rounded-full border border-border-control bg-card text-body-subtle shadow-xs hover:bg-accent hover:text-heading disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Camera className="size-3.5" aria-hidden="true" />
        </button>
        {photo && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            aria-label="Remove photo"
            title="Remove photo"
            className="absolute -top-1 -right-1 z-10 flex size-6 items-center justify-center rounded-full border border-border-control bg-card text-fg-danger shadow-xs hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={PHOTO_ACCEPT_ATTR}
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Upload photo"
          disabled={busy}
        />
      </div>
      {busy && <p className="text-xs text-body-subtle">Uploading…</p>}
      {error && <p className="max-w-48 text-xs text-fg-danger">{error}</p>}
    </div>
  )
}
