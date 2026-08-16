// A hand-written RFC 4180 (+ tab-separated paste-from-Excel) parser for
// employee.importPreview/employee.importCommit. Deliberately not a dependency: no
// spreadsheet/CSV library is in the tree today, and the obvious npm candidates have a
// poor supply-chain story for a product handling payroll-adjacent PII (name, birth date,
// personal email, mobile) in bulk. This is a small, fully-owned, fully-tested state
// machine instead — see tests/employee-csv-parser.test.ts for the awkward cases it has
// to get right (this is the piece of the import feature most likely to silently corrupt
// someone's data if it's wrong).
//
// Pure and side-effect free: no I/O, never throws. Malformed input is reported as a
// typed `AppError` (the same shape every action boundary already uses), so a caller can
// surface it exactly like any other validation failure.
import { err, type AppError } from '@/platform/errors';

export interface CsvTable {
  header: string[];
  rows: string[][];
}

export type CsvParseResult = { ok: true; data: CsvTable } | { ok: false; error: AppError };

const BOM = '\uFEFF';

// ~2MB of text. Generous for a few thousand employee rows of short text fields, small
// enough that a caller never has to stream it. The row-count cap (employee.importPreview/
// employee.importCommit, 1000 rows) is the more meaningful limit in practice; this is a
// backstop against a client sending something absurd before we even start parsing it.
export const MAX_CSV_INPUT_LENGTH = 2_000_000;

/**
 * Looks at the header line only — quotes are vanishingly rare in a header row, and this
 * only has to choose between two delimiters, not parse the row. Tab wins when it is
 * strictly more frequent than comma: a paste out of Excel is tab-separated and its header
 * will typically contain zero commas; a real .csv export's header will typically contain
 * zero tabs. A tie (including a single-column file with neither) defaults to comma, by
 * far the more common format.
 */
function sniffDelimiter(firstLine: string): ',' | '\t' {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

/**
 * Splits `text` into records of raw string cells, honouring RFC 4180 quoting: a quoted
 * field may contain the delimiter, an embedded CRLF/LF, or an escaped `""` for a literal
 * quote character. CR, LF and CRLF are all accepted as a record terminator outside of
 * quotes. A line with literally no content and no delimiter — the common case being one
 * or more trailing blank lines at end of file — is not emitted as a record at all, rather
 * than being reported as a ragged one-column row against the header.
 *
 * Never throws; an unterminated quoted field (the one input shape this grammar cannot
 * represent as a record) is reported back via `unterminated` for the caller to turn into
 * a validation error.
 */
function tokenize(text: string, delimiter: string): { records: string[][]; unterminated: boolean } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  // True once the current (still-open) record has seen any real content — a delimiter,
  // a quote, or a plain character. Distinguishes a genuinely empty line (nothing at all
  // before the line terminator) from a line that is empty *because* every cell on it was
  // deliberately blank (e.g. ",,").
  let hasContent = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      hasContent = true;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      record.push(field);
      field = '';
      hasContent = true;
      i += 1;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      if (hasContent || field.length > 0) {
        record.push(field);
        records.push(record);
      }
      field = '';
      record = [];
      hasContent = false;
      i += 1;
      continue;
    }

    field += c;
    hasContent = true;
    i += 1;
  }

  // The final record, if the text doesn't end on a line terminator.
  if (hasContent || field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return { records, unterminated: inQuotes };
}

/**
 * Parses `input` into a header row and data rows. Every data row is checked against the
 * header's column count — a mismatch is reported with the offending row's 1-based
 * position counting the header itself as row 1 (so "row 2" is always the first data row,
 * matching what a person sees scrolling their own file/spreadsheet).
 */
export function parseCsv(input: string): CsvParseResult {
  if (input.length > MAX_CSV_INPUT_LENGTH) {
    return {
      ok: false,
      error: err('VALIDATION_ERROR', `File is too large (max ${MAX_CSV_INPUT_LENGTH.toLocaleString()} characters).`),
    };
  }

  const withoutBom = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  if (withoutBom.trim().length === 0) {
    return { ok: false, error: err('VALIDATION_ERROR', 'The file is empty.') };
  }

  const firstLineEnd = withoutBom.search(/\r\n|\r|\n/);
  const firstLine = firstLineEnd === -1 ? withoutBom : withoutBom.slice(0, firstLineEnd);
  const delimiter = sniffDelimiter(firstLine);

  const { records, unterminated } = tokenize(withoutBom, delimiter);
  if (unterminated) {
    return { ok: false, error: err('VALIDATION_ERROR', 'Malformed CSV: a quoted field is never closed.') };
  }
  if (records.length === 0) {
    return { ok: false, error: err('VALIDATION_ERROR', 'The file is empty.') };
  }

  const [header, ...rows] = records;
  const columnCount = header.length;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].length !== columnCount) {
      return {
        ok: false,
        error: err(
          'VALIDATION_ERROR',
          `Row ${i + 2} has ${rows[i].length} column(s); expected ${columnCount} to match the header.`,
        ),
      };
    }
  }

  return { ok: true, data: { header, rows } };
}
