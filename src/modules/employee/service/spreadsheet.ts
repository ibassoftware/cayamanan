// xlsx support for employee.importPreview/employee.importCommit, alongside csv.ts's
// hand-written CSV/TSV parser. Unlike CSV, a spreadsheet format is not something worth
// hand-rolling a binary reader for — `read-excel-file` (already a dependency, unused
// until now) is the one piece of I/O this module doesn't own itself. Everything else
// (normalizing a sheet's raw cells into the same `CsvTable` shape `parseCsv` produces,
// deciding which sheet to use) is pure and fully owned here, same discipline as csv.ts.
//
// Split deliberately into an I/O half (`parseXlsxWorkbook`, calls into `read-excel-file`)
// and a pure half (`normalizeSheetRows`, exported so it can be unit-tested directly with
// hand-built rows — including a `Date` cell and a ragged row — without needing a real
// .xlsx buffer for every case).
import readXlsxFile, { type Row, type Sheet } from 'read-excel-file/node';

import { err, type AppError } from '@/platform/errors';
import type { CsvTable } from './csv';
import { checkZipExpansion } from './zip-expansion';

// 5 MB, the same cap `employee/service/document-validation.ts`'s `MAX_DOCUMENT_BYTES`
// uses for an uploaded file — a spreadsheet of a few thousand employee rows fits
// comfortably inside it, and it bounds how much a single request can force this module to
// hold in memory (the whole buffer, plus `read-excel-file`'s own in-memory unzip/XML
// parse of it) before any row-count cap even gets a chance to apply.
export const MAX_XLSX_BYTES = 5 * 1024 * 1024;

// Same encoded-string-cap pattern as `MAX_DOCUMENT_BASE64_LENGTH`
// (employee/service/document-validation.ts) / `MAX_ATTACHMENT_BASE64_LENGTH`
// (ai/service/attachments.ts): checking `MAX_XLSX_BYTES` only after base64-decoding is
// too late to be a real limit, since the whole encoded payload would already have been
// read into memory and expanded into a second buffer. This bounds the *encoded* string
// length a zod schema can reject at the request boundary, before any decoding happens.
export const MAX_XLSX_BASE64_LENGTH = Math.ceil(MAX_XLSX_BYTES / 3) * 4 + 1024;

export interface XlsxWorkbookSheet {
  name: string;
  table: CsvTable;
}

export type XlsxWorkbookResult = { ok: true; data: { sheets: XlsxWorkbookSheet[] } } | { ok: false; error: AppError };

export type XlsxSheetResult = { ok: true; data: CsvTable } | { ok: false; error: AppError };

/**
 * One raw cell as `read-excel-file` returns it: `string | number | boolean | Date | null`.
 * Coerced to a string exactly as typed — a numeric cell becomes its decimal text, a
 * boolean becomes "true"/"false", and a `Date` cell (a genuine Excel date, as opposed to a
 * human-typed date *string* like "15/07/2025") becomes its `YYYY-MM-DD` calendar date.
 * Nothing here re-interprets or "fixes" a value: a malformed date typed as plain text
 * arrives, and leaves, exactly as typed, so `isoDate()` downstream rejects it exactly the
 * way it would reject the same text out of a CSV.
 */
function cellToString(value: Row[number]): string {
  if (value === null) return '';
  if (value instanceof Date) {
    // `read-excel-file` resolves an Excel date-typed cell to a UTC `Date` (the library's
    // own documented behavior — the serial date has no timezone of its own), so reading
    // the UTC calendar fields back out is the exact inverse, not a repair of anything.
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value);
}

/**
 * Normalizes one sheet's raw rows (as `read-excel-file` returns them) into the same
 * `{header, rows}` shape `parseCsv` produces. Pure — no I/O, never throws — so it can be
 * exercised directly with hand-built rows, the same testing discipline `csv.ts`'s
 * `tokenize` gets.
 *
 * A row shorter than the header is padded with empty cells rather than rejected: unlike a
 * genuinely ragged CSV line (which `parseCsv` does reject), a spreadsheet's own sparse row
 * encoding routinely omits trailing empty cells entirely — that is a storage artifact of
 * the format, not a sign the row is malformed. A row *longer* than the header has no such
 * innocent explanation and is reported as an error instead, the same "row N has M
 * column(s); expected the header's count" shape `parseCsv` already uses.
 */
export function normalizeSheetRows(data: Row[]): CsvTable | { error: string } {
  if (data.length === 0) return { header: [], rows: [] };

  const [rawHeader, ...rawRows] = data;
  const header = rawHeader.map(cellToString);
  const columnCount = header.length;

  const rows: string[][] = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const raw = rawRows[i];
    if (raw.length > columnCount) {
      return { error: `Row ${i + 2} has ${raw.length} column(s); expected ${columnCount} to match the header.` };
    }
    const row = raw.map(cellToString);
    while (row.length < columnCount) row.push('');
    rows.push(row);
  }

  return { header, rows };
}

function isNormalizedTable(value: CsvTable | { error: string }): value is CsvTable {
  return 'header' in value;
}

/**
 * Reads every sheet in an .xlsx workbook and normalizes each one. The default export of
 * `read-excel-file/node` returns `[{ sheet, data }]` — an array covering *every* sheet —
 * when called with no sheet name, never a bare array of rows for "the" sheet; a workbook
 * with multiple tabs needs one chosen from this list (see `pickXlsxSheet`), not assumed to
 * be the first.
 */
export async function parseXlsxWorkbook(buffer: Buffer): Promise<XlsxWorkbookResult> {
  if (buffer.length === 0) {
    return { ok: false, error: err('VALIDATION_ERROR', 'The file is empty.') };
  }
  if (buffer.length > MAX_XLSX_BYTES) {
    return {
      ok: false,
      error: err('VALIDATION_ERROR', `File is too large (max ${(MAX_XLSX_BYTES / (1024 * 1024)).toFixed(0)} MB).`),
    };
  }

  // Before `readXlsxFile` unzips anything. `MAX_XLSX_BYTES` only bounds the *compressed*
  // upload, and the row cap downstream cannot help because it runs after every row has
  // already been materialised in memory — so a small, highly compressible workbook was
  // able to expand without limit inside the shared process.
  const expansion = checkZipExpansion(buffer);
  if (!expansion.ok) {
    return { ok: false, error: err('VALIDATION_ERROR', expansion.reason) };
  }

  let workbook: Sheet[];
  try {
    workbook = await readXlsxFile(buffer);
  } catch {
    return { ok: false, error: err('VALIDATION_ERROR', 'The file is not a valid .xlsx workbook.') };
  }

  if (workbook.length === 0) {
    return { ok: false, error: err('VALIDATION_ERROR', 'This workbook has no sheets.') };
  }

  const sheets: XlsxWorkbookSheet[] = [];
  for (const { sheet, data } of workbook) {
    const normalized = normalizeSheetRows(data);
    if (!isNormalizedTable(normalized)) {
      return { ok: false, error: err('VALIDATION_ERROR', `Sheet "${sheet}": ${normalized.error}`) };
    }
    sheets.push({ name: sheet, table: normalized });
  }

  return { ok: true, data: { sheets } };
}

/**
 * Selects one already-parsed sheet by name (defaulting to the first sheet in the
 * workbook when none is given) and requires it to have at least a header row. Pure — the
 * I/O already happened in `parseXlsxWorkbook`.
 */
export function pickXlsxSheet(sheets: XlsxWorkbookSheet[], sheetName?: string): XlsxSheetResult {
  const chosen = sheetName ? sheets.find((sheet) => sheet.name === sheetName) : sheets[0];
  if (!chosen) {
    return {
      ok: false,
      error: err('VALIDATION_ERROR', `Sheet "${sheetName}" was not found in this workbook.`, { field: 'sheet' }),
    };
  }
  if (chosen.table.header.length === 0) {
    return { ok: false, error: err('VALIDATION_ERROR', `Sheet "${chosen.name}" is empty.`) };
  }
  return { ok: true, data: chosen.table };
}
