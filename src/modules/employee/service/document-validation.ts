// Shared upload-time validation for employee_documents (201-file task packet §2). Every
// rule here runs on the *decoded bytes*, never on anything the client merely asserts —
// see `sniffMimeType` below for why the declared MIME type/file extension is never
// trusted on its own.
import { createHash } from 'node:crypto';

import { ActionError } from '@/platform/errors';

/** 5 MB, enforced on the decoded content, before the row is ever inserted. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/**
 * The same cap expressed as an encoded-string length, so the action's zod schema can
 * reject an oversized upload *before* anything decodes it.
 *
 * Checking only `MAX_DOCUMENT_BYTES` on the decoded buffer is too late to be a real limit:
 * by then the whole base64 payload has been read into memory and expanded into a second
 * Buffer roughly ¾ its size. A client posting a 500 MB string would cost ~875 MB of heap
 * before the size rule ever ran. Next's App Router route handlers impose no body limit of
 * their own, so this schema bound is the only thing standing between an authenticated
 * caller and memory exhaustion.
 *
 * Base64 is 4 output chars per 3 input bytes; the slack covers padding and any line breaks
 * a client's encoder inserts.
 */
export const MAX_DOCUMENT_BASE64_LENGTH = Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

/**
 * `employee_documents.document_type` — set only when `kind === 'GENERAL'` (see the CHECK
 * constraint in schema.ts). Plain text union, not a DB enum, matching `kind`/`status`
 * elsewhere in this domain.
 */
export const DOCUMENT_TYPES = [
  'CONTRACT',
  'RESUME',
  'GOVERNMENT_ID',
  'MEDICAL',
  'CERTIFICATE',
  'CLEARANCE',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const EXTENSION_MIME_MAP: Record<string, AllowedDocumentMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Identifies the file type from its magic bytes — the only thing this module trusts.
 * Never inspects the filename/extension or any client-declared content type: those are
 * exactly what a malicious upload gets to choose, so they prove nothing about what the
 * bytes actually are (an HTML file renamed `.png`, a `.png`-named text file, etc.).
 *
 * SVG is deliberately not, and must never be, recognized here: it is XML that can embed
 * `<script>`, so accepting it would hand this endpoint a stored-XSS vector the moment
 * anything ever renders a document inline. Do not "helpfully" add an SVG branch below —
 * if SVG support is ever genuinely needed, it requires a sanitizer and a product
 * decision, not a one-line addition to this allowlist.
 */
function sniffMimeType(bytes: Buffer): AllowedDocumentMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= PNG_MAGIC.length && PNG_MAGIC.every((byte, index) => bytes[index] === byte)) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

/**
 * What the filename's own extension *claims* the type is — used only as the second half
 * of the "declared type must agree with sniffed type" check below, never as a substitute
 * for sniffing. Returns null for no/unrecognized extension (including `.svg`, `.html`,
 * `.txt`, or no extension at all), which the caller below treats as a mismatch, not as
 * "no opinion" — an upload has to name itself correctly as one of the four allowed types.
 */
function declaredMimeTypeFromFilename(filename: string): AllowedDocumentMimeType | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  if (!match) return null;
  return EXTENSION_MIME_MAP[match[1].toLowerCase()] ?? null;
}

const MAX_FILENAME_LENGTH = 180;

/**
 * `filename` is a display label only — it must never be interpreted as, or concatenated
 * into, a filesystem path (the document's real storage location is a `bytea` column, not
 * a path at all). Strips path separators and control characters, then caps length.
 */
export function sanitizeFilename(rawFilename: string): string {
  const stripped = rawFilename
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  const truncated = stripped.slice(0, MAX_FILENAME_LENGTH);
  return truncated.length > 0 ? truncated : 'document';
}

export interface ValidatedDocumentUpload {
  content: Buffer;
  mimeType: AllowedDocumentMimeType;
  byteSize: number;
  checksum: string;
  filename: string;
}

/**
 * Full upload-time validation pipeline: decode, size cap, magic-byte sniff, declared-vs-
 * sniffed agreement, and the PHOTO-must-be-an-image rule. Throws `ActionError` (never a
 * bare `Error`) on any violation, with a message safe to show and safe to log — never
 * echoes file content or any sensitive value back in the message.
 */
export function validateDocumentUpload(input: {
  kind: 'PHOTO' | 'REQUIREMENT' | 'GENERAL';
  filename: string;
  contentBase64: string;
}): ValidatedDocumentUpload {
  const content = Buffer.from(input.contentBase64, 'base64');

  if (content.length === 0) {
    throw new ActionError('VALIDATION_ERROR', 'File is empty.', { field: 'contentBase64' });
  }
  if (content.length > MAX_DOCUMENT_BYTES) {
    throw new ActionError('VALIDATION_ERROR', 'File exceeds the 5 MB size limit.', { field: 'contentBase64' });
  }

  const sniffed = sniffMimeType(content);
  if (!sniffed) {
    throw new ActionError(
      'VALIDATION_ERROR',
      'File type is not supported. Allowed types: JPEG, PNG, WEBP, PDF.',
      { field: 'contentBase64' },
    );
  }

  const declared = declaredMimeTypeFromFilename(input.filename);
  if (declared !== sniffed) {
    throw new ActionError(
      'VALIDATION_ERROR',
      'The file’s contents do not match its filename extension.',
      { field: 'filename' },
    );
  }

  if (input.kind === 'PHOTO' && sniffed === 'application/pdf') {
    throw new ActionError('VALIDATION_ERROR', 'A photo must be an image file, not a PDF.', { field: 'contentBase64' });
  }

  return {
    content,
    mimeType: sniffed,
    byteSize: content.length,
    checksum: createHash('sha256').update(content).digest('hex'),
    filename: sanitizeFilename(input.filename),
  };
}
