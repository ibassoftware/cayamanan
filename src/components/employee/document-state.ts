// Pure helpers for the employee 201-file's document store (photo + onboarding-requirement
// attachments) — task packet "wire the new document store into the employee 201-file UI".
// Deliberately framework-free, like employee-format.ts / employee-requirements-state.ts.
//
// Client-side checks here are convenience only, never the real boundary: the server
// re-validates the decoded bytes' magic numbers (service/document-validation.ts) and is
// what actually decides whether an upload is accepted. Do not "optimise away" the server
// check because this file's guard looks redundant — a client can always lie about a
// file's name/size/mime type.

/**
 * Mirrors service/document-validation.ts's `MAX_DOCUMENT_BYTES` (5 MB). Duplicated, not
 * imported: that module runs `node:crypto` at module scope and must never ship in the
 * browser bundle. If the server cap ever changes, update both places.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const PHOTO_ACCEPT_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const
export const ATTACHMENT_ACCEPT_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"] as const

export const PHOTO_ACCEPT_ATTR = PHOTO_ACCEPT_EXTENSIONS.map(ext => `.${ext}`).join(",")
export const ATTACHMENT_ACCEPT_ATTR = ATTACHMENT_ACCEPT_EXTENSIONS.map(ext => `.${ext}`).join(",")

function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return match ? match[1].toLowerCase() : null
}

export interface ClientUploadCheck {
  ok: boolean
  message?: string
}

/**
 * Guards a file picker's selection before it is ever read into memory: rejects an
 * oversized file (naming the 5 MB limit, so the user isn't left waiting on a round trip
 * for a 40 MB file the server would reject anyway) or a disallowed extension (naming the
 * accepted types). Never a substitute for the server's magic-byte sniff.
 */
export function checkClientUpload(file: { name: string; size: number }, allowedExtensions: readonly string[]): ClientUploadCheck {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "That file is too large — the maximum is 5 MB." }
  }
  const extension = extensionOf(file.name)
  if (!extension || !allowedExtensions.includes(extension)) {
    return {
      ok: false,
      message: `Unsupported file type. Accepted types: ${allowedExtensions.map(ext => ext.toUpperCase()).join(", ")}.`,
    }
  }
  return { ok: true }
}

/**
 * Strips the `data:<mime>;base64,` prefix that `FileReader.readAsDataURL` adds, leaving
 * the bare base64 payload `employee.uploadDocument`'s `contentBase64` expects.
 */
export function stripBase64Prefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",")
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1)
}

/** Human-readable byte size ("482 B" / "14 KB" / "2.1 MB") — never a raw byte count in the UI. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The one PHOTO document, if any — `employee.uploadDocument`'s unique constraint
 * (`employee_documents_one_photo_per_employee_uidx`) guarantees there's never more than one.
 */
export function selectPhotoDocument<T extends { kind: string }>(documents: T[]): T | null {
  return documents.find(doc => doc.kind === "PHOTO") ?? null
}

/** Attachments linked to one onboarding requirement, oldest (upload order) first. */
export function attachmentsForRequirement<T extends { kind: string; requirementId: string | null; createdAt: string }>(
  documents: T[],
  requirementId: string,
): T[] {
  return documents
    .filter(doc => doc.kind === "REQUIREMENT" && doc.requirementId === requirementId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** The one binary-serving route (`GET /api/files/[documentId]`) — never any other URL shape. */
export function documentDownloadUrl(documentId: string): string {
  return `/api/files/${documentId}`
}
