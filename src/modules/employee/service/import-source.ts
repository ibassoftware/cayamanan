// Resolves employee.importPreview/employee.importCommit's `source` (raw CSV/TSV text or
// an uploaded .xlsx) into the same `{header, rows}` shape, then applies the
// client-confirmed `mapping` against a *freshly re-parsed* header to produce upsert
// candidates — shared by both actions so "how a file source becomes candidate rows"
// exists in exactly one place, not two copies that could quietly diverge.
//
// Deliberately does not know about the third source kind, `{ kind: 'attachment' }`: that
// one resolves through `ai.getAttachment` (a different module's action), and this is
// `src/modules/employee/service/**` — 00-overview.md §4.1 lets a module import another
// module's `service/` exports, but never in a cycle, and `ai/service/attachments.ts`
// already imports `parseCsv` from *this* module. A module importing back from `ai/`
// here would be exactly that cycle. Each action's own handler (which — like
// `ai.approveAction` — is already allowed to cross that boundary through the shared
// action *registry*, a runtime dispatch rather than a static import) resolves an
// attachment id to text via a nested `executeAction('ai.getAttachment', ...)` first, then
// hands this module a plain `{ kind: 'csv' }` source — see import-preview.ts/
// import-commit.ts.
//
// Pure result-returning otherwise, like `csv.ts`/`spreadsheet.ts`/`import-columns.ts` —
// never throws, never assembles an `ActionError` itself.
import { z } from 'zod';

import type { AppError } from '@/platform/errors';
import { err } from '@/platform/errors';
import { MAX_CSV_INPUT_LENGTH, parseCsv } from './csv';
import { MAX_XLSX_BASE64_LENGTH, parseXlsxWorkbook, pickXlsxSheet } from './spreadsheet';
import { resolveConfirmedMapping, mapRow, type ConfirmedMappingEntry } from './import-columns';
import type { UpsertCandidate } from './bulk-upsert';

// Shared by employee.importPreview and employee.importCommit — a preview must never let
// through more rows than a commit ever could, and both run the identical per-row
// validation query load in `planUpserts`.
export const MAX_IMPORT_ROWS = 1000;

const mappingEntrySchema = z
  .object({
    column: z.string().min(1).max(300),
    field: z.string().min(1).max(100).nullable(),
  })
  .strict();

// The wire-level input contract for `employee.importPreview`/`employee.importCommit`:
// every source kind a client may submit, including `attachment` — resolved to text by
// the action handler (see this file's header comment) before this module ever sees it.
export const importFileSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('csv'), csv: z.string().min(1).max(MAX_CSV_INPUT_LENGTH) }).strict(),
  z
    .object({
      kind: z.literal('xlsx'),
      contentBase64: z.string().min(1).max(MAX_XLSX_BASE64_LENGTH),
      sheet: z.string().min(1).max(200).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('attachment'), attachmentId: z.string().uuid() }).strict(),
]);

export type ImportFileSource = z.infer<typeof importFileSourceSchema>;

/** What `prepareImportRows` below actually accepts — the two source kinds it can resolve
 * on its own, once an action handler has already turned any `attachment` source into a
 * plain `csv` one. */
export type ResolvedImportSource = Extract<ImportFileSource, { kind: 'csv' } | { kind: 'xlsx' }>;

export const importMappingSchema = z.array(mappingEntrySchema).min(1).max(200);
export type ImportMapping = ConfirmedMappingEntry[];

export type PrepareImportRowsResult =
  | { ok: true; data: { header: string[]; candidates: UpsertCandidate[] } }
  | { ok: false; error: AppError };

type TableResult = { ok: true; data: { header: string[]; rows: string[][] } } | { ok: false; error: AppError };

async function resolveTable(source: ResolvedImportSource): Promise<TableResult> {
  if (source.kind === 'csv') {
    return parseCsv(source.csv);
  }
  const workbook = await parseXlsxWorkbook(Buffer.from(source.contentBase64, 'base64'));
  if (!workbook.ok) return workbook;
  return pickXlsxSheet(workbook.data.sheets, source.sheet);
}

/**
 * Full resolution pipeline: parse `source` from scratch, cap the row count, then
 * re-validate `mapping` against the header that was *actually just parsed* (never assumed
 * to match a mapping confirmed against an earlier preview) — see
 * `resolveConfirmedMapping`'s own header comment for why a stale or invented mapping is
 * rejected outright rather than coerced.
 */
export async function prepareImportRows(
  source: ResolvedImportSource,
  mapping: ConfirmedMappingEntry[],
): Promise<PrepareImportRowsResult> {
  const parsed = await resolveTable(source);
  if (!parsed.ok) return parsed;

  const { header, rows } = parsed.data;
  if (rows.length === 0) {
    return { ok: false, error: err('VALIDATION_ERROR', 'The file has no data rows.') };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: err('VALIDATION_ERROR', `This file has ${rows.length} data rows; the maximum is ${MAX_IMPORT_ROWS}.`),
    };
  }

  const resolvedMapping = resolveConfirmedMapping(header, mapping);
  if (!resolvedMapping.ok) return resolvedMapping;

  const candidates: UpsertCandidate[] = rows.map((row, index) => ({
    rowNumber: index + 2,
    values: mapRow(resolvedMapping.data.fieldByIndex, row),
  }));

  return { ok: true, data: { header, candidates } };
}
