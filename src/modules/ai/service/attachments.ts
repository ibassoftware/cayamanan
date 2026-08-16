// Validation, staging and resolution for a file attached in the Missy composer
// (schema.ts's `chat_attachments` header comment explains the "why": the deterministic
// CSV parser stays authoritative, the model only ever sees a filename/size/row count).
//
// A module may import another module's `service/` public exports (00-overview.md §4.1);
// `parseCsv`/`MAX_CSV_INPUT_LENGTH` below is exactly that — read-only, no schema import.
import { eq, lt } from 'drizzle-orm';

import { MAX_CSV_INPUT_LENGTH, parseCsv } from '@/modules/employee/service/csv';
import { ActionError } from '@/platform/errors';
import type { ScopedDb } from '@/platform/db';
import { chatAttachments } from '../schema';

const MAX_FILENAME_LENGTH = 180;

// No magic-byte sniffing exists for plain text the way it does for images/PDF
// (employee/service/document-validation.ts) — a CSV/TSV/TXT file has no reliable magic
// bytes at all. The extension is therefore the *only* signal, and `mimeType` is always
// derived from it here, never accepted as a client-declared field (the input schema in
// actions/create-attachment.ts has no such field at all).
const ALLOWED_EXTENSION_MIME_TYPES: Record<string, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
};

function mimeTypeFromExtension(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  if (!match) return null;
  return ALLOWED_EXTENSION_MIME_TYPES[match[1].toLowerCase()] ?? null;
}

/**
 * `filename` is a display label only — never interpreted as, or concatenated into, a
 * filesystem path. Strips path separators and control characters, then caps length. Same
 * shape as employee/service/document-validation.ts's `sanitizeFilename`, reimplemented
 * locally rather than imported: it's a few lines of generic string hygiene, not a shared
 * concept the two modules should be coupled through.
 */
function sanitizeFilename(rawFilename: string): string {
  const stripped = rawFilename
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  const truncated = stripped.slice(0, MAX_FILENAME_LENGTH);
  return truncated.length > 0 ? truncated : 'attachment';
}

export interface ValidatedAttachmentUpload {
  filename: string;
  mimeType: string;
  content: string;
  byteSize: number;
  /** From the real parser (`parseCsv`), never invented — the number Missy is told. */
  rowCount: number;
}

/**
 * Full upload-time validation pipeline for a chat attachment: extension allowlist, UTF-8
 * decode, and a real CSV parse (which is also where the definitive length cap and the
 * reported `rowCount` come from). Throws `ActionError` on any violation, with a message
 * safe to show and safe to log — never echoes file content back in the message.
 */
export function validateAttachmentUpload(input: { filename: string; contentBase64: string }): ValidatedAttachmentUpload {
  const mimeType = mimeTypeFromExtension(input.filename);
  if (!mimeType) {
    throw new ActionError('VALIDATION_ERROR', 'Only .csv, .tsv or .txt files are supported.', { field: 'filename' });
  }

  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (bytes.length === 0) {
    throw new ActionError('VALIDATION_ERROR', 'File is empty.', { field: 'contentBase64' });
  }

  let content: string;
  try {
    // `fatal: true` is the load-bearing part: `Buffer#toString('utf-8')` silently
    // replaces an invalid byte sequence with U+FFFD instead of failing, which would let
    // an arbitrary binary file through as mojibake text. `TextDecoder` is the one
    // decoder in the platform that actually rejects it.
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ActionError('VALIDATION_ERROR', 'File is not valid UTF-8 text.', { field: 'contentBase64' });
  }

  // The same deterministic parser employee.importPreview/importCommit use — never a
  // second, subtly different implementation here. It enforces MAX_CSV_INPUT_LENGTH
  // itself (on the decoded text's character count, the definitive cap — see
  // MAX_ATTACHMENT_BASE64_LENGTH below for the pre-decode backstop) and is also where
  // `rowCount` comes from, so the number Missy is ever told matches what the real
  // importer would see for this exact file.
  const parsed = parseCsv(content);
  if (!parsed.ok) {
    throw new ActionError(parsed.error.code, parsed.error.message, { field: 'contentBase64' });
  }

  return {
    filename: sanitizeFilename(input.filename),
    mimeType,
    content,
    byteSize: bytes.length,
    rowCount: parsed.data.rows.length,
  };
}

/**
 * The same encoded-string-cap pattern as `MAX_DOCUMENT_BASE64_LENGTH`
 * (employee/service/document-validation.ts): checking `MAX_CSV_INPUT_LENGTH` only after
 * decoding is too late to be a real limit — the whole base64 payload would already have
 * been read into memory and expanded into a second buffer first. `MAX_CSV_INPUT_LENGTH`
 * itself bounds the decoded *text's character count*, not bytes, but treating it as a
 * byte bound here is a fine backstop: it only has to reject an absurdly oversized upload
 * before any decoding happens at all. The definitive, encoding-exact check is `parseCsv`'s
 * own length check on the decoded string above.
 */
export const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_CSV_INPUT_LENGTH / 3) * 4 + 1024;

/**
 * Deletes every expired row visible in the caller's current tenant/company transaction —
 * RLS on `chat_attachments` (drizzle migration) already confines `db` to that scope, same
 * as every other query in this module. There is no scheduler/cron in this app, so this is
 * called opportunistically from `ai.createAttachment`'s handler only: an expired row is
 * reaped the next time someone in the same tenant/company stages a new attachment, never
 * on a timer.
 */
export async function deleteExpiredAttachments(scopedDb: ScopedDb, now: Date): Promise<void> {
  await scopedDb.delete(chatAttachments).where(lt(chatAttachments.expiresAt, now));
}

export interface AttachmentContent {
  id: string;
  filename: string;
  mimeType: string;
  content: string;
}

/**
 * Resolves one attachment's text content for another module to consume — this is what
 * the employee import actions call to turn an attachment id back into CSV text, entirely
 * through the deterministic parser, never through the model. Scoped to the caller's own
 * tenant/company via `ctx.db`'s RLS transaction context (the same transaction-scoped
 * handle an action's own `ctx.db` already is) *and* to the caller's own `userId`, checked
 * explicitly here since RLS only knows about tenant_id/company_id, not row ownership.
 *
 * Returns `null` — never a distinct "forbidden" signal — for all of: the id doesn't
 * exist, it belongs to another tenant/company (RLS hides it), it belongs to another user,
 * and it has expired. Collapsing these avoids turning attachment ids into an enumeration
 * oracle, the same reasoning as `resolveDocumentForDownload`
 * (employee/service/resolve-document-for-download.ts).
 */
export async function getAttachmentContent(
  ctx: { db: ScopedDb; userId: string },
  attachmentId: string,
): Promise<AttachmentContent | null> {
  const [row] = await ctx.db.select().from(chatAttachments).where(eq(chatAttachments.id, attachmentId)).limit(1);
  if (!row) return null;
  if (row.userId !== ctx.userId) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return { id: row.id, filename: row.filename, mimeType: row.mimeType, content: row.content };
}
