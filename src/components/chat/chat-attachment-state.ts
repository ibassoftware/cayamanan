// Pure helpers for the composer's file-attach affordance (chat-attachment-control.tsx) —
// kept framework/DOM-free so the validation and text-building rules are unit-testable
// without mounting anything, same pattern as src/lib/chat/panel-width.ts.
//
// The design this backs (03-missy-foundation.md's PII boundary, replayed for attachments
// in src/modules/ai/schema.ts's header comment): a CSV's rows must never reach the model.
// The file is staged server-side by `ai.createAttachment` and referred to by id; nothing
// here ever holds, logs or transmits the file's actual content beyond the one upload call.

export const ALLOWED_ATTACHMENT_EXTENSIONS = [".csv", ".tsv", ".txt"] as const

/**
 * Convenience only — the real boundary is `ai.createAttachment`'s server-side validation
 * (src/modules/ai/service/attachments.ts), which enforces `MAX_ATTACHMENT_BASE64_LENGTH`
 * (derived from `MAX_CSV_INPUT_LENGTH`, src/modules/employee/service/csv.ts) and a real
 * UTF-8/CSV parse. This client-side check exists only to reject the obviously-wrong case
 * before a round trip, never as the actual limit — that constant lives in a server-only
 * module (it pulls in `pg` via src/platform/db) and must not be imported into this bundle.
 */
export const MAX_CLIENT_ATTACHMENT_BYTES = 2_000_000

export function hasAllowedAttachmentExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export type AttachmentPickResult = { ok: true } | { ok: false; message: string }

export function validateAttachmentPick(file: { name: string; size: number }): AttachmentPickResult {
  if (!hasAllowedAttachmentExtension(file.name)) {
    return { ok: false, message: "Only .csv, .tsv or .txt files can be attached." }
  }
  if (file.size === 0) {
    return { ok: false, message: "This file is empty." }
  }
  if (file.size > MAX_CLIENT_ATTACHMENT_BYTES) {
    return { ok: false, message: "This file is too large to attach." }
  }
  return { ok: true }
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export function formatAttachmentRowCount(rowCount: number): string {
  return rowCount === 1 ? "1 row" : `${rowCount.toLocaleString()} rows`
}

/** `FileReader#readAsDataURL` yields `data:<mime>;base64,<payload>` — this is the one
 * place that ever touches that string, and only to isolate the payload; never logged. */
export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",")
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1)
}

export interface MissyAttachmentRef {
  id: string
  filename: string
  rowCount: number
}

/**
 * The only place an attached file's existence reaches Missy at all. Per-message
 * `metadata` (how screenContext reaches the server, chat-provider.tsx's `sendMessage`)
 * is never forwarded into the model's own context — src/app/api/chat/route.ts only ever
 * reads it server-side, to scope which tools are offered, never as conversation content.
 * So the reference has to live in the message *text* itself: filename, row count and id,
 * never file content, appended after whatever the user typed.
 */
export function buildMessageText(text: string, attachment?: MissyAttachmentRef | null): string {
  if (!attachment) return text
  const reference = `[Attached file: ${attachment.filename} — ${formatAttachmentRowCount(attachment.rowCount)} — attachment id ${attachment.id}]`
  return text ? `${text}\n\n${reference}` : reference
}

export type AttachmentSlot =
  | { status: "idle" }
  | { status: "uploading"; filename: string }
  | { status: "ready"; id: string; filename: string; byteSize: number; rowCount: number }
  | { status: "error"; message: string }
