// Header-name -> employee-field mapping shared by employee.importPreview/
// employee.importCommit (CSV columns). Matching is case-insensitive and ignores spaces
// and underscores, so "Employee No", "employee_no" and "employeeNo" are all the same
// column — comparing the normalized header cell against the normalized field name itself
// needs no per-field alias table to get there.
//
// Deliberately scoped to the flat, human-typeable identity fields employee.create/
// employee.update accept: `address`/`permanentAddress` (jsonb) and `departmentId`/
// `positionId`/`locationId` (UUID references) are excluded on purpose — a spreadsheet
// cell has no good way to hold nested JSON, and nobody hand-transcribes another table's
// UUID. Those three continue to go through employee.create/employee.update/employee.list
// as before; this is a deliberate scope decision, not an oversight.
import { err, type AppError } from '@/platform/errors';

export const IMPORT_FIELDS = [
  'employeeNo',
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'birthDate',
  'sex',
  'civilStatus',
  'emailPersonal',
  'emailWork',
  'mobile',
  'hireDate',
  'photoUrl',
  'birthPlace',
  'nationality',
  'religion',
  'bloodType',
  // Device-facing operational id (platform/fields.ts's `biometricId()`), already accepted
  // by employee.create/employee.update — this was the one gap between what the two
  // single-row actions take and what a bulk import file could carry. Optional, unique per
  // company when set (DB partial index), so a colliding value across two rows is refused
  // at write time, not here.
  'biometricId',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

const IMPORT_FIELD_SET = new Set<string>(IMPORT_FIELDS);

/** Type guard against the real field list — the one place a candidate field name (from
 * the model, or from a client-confirmed mapping) is checked against what actually exists.
 * Never widen this by trusting a caller's own claim that a string is a valid field. */
export function isImportField(value: string): value is ImportField {
  return IMPORT_FIELD_SET.has(value);
}

// `employeeNo` is the natural key that decides CREATE vs UPDATE (see
// service/bulk-upsert.ts) — every row needs it, so its column is required at the header
// level. Every other field is validated per-row by the real create/update zod schemas
// (a CREATE row missing firstName/lastName/hireDate fails there, not here).
const REQUIRED_COLUMNS: readonly ImportField[] = ['employeeNo'];

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '');
}

const FIELD_BY_NORMALIZED_NAME = new Map<string, ImportField>(IMPORT_FIELDS.map((field) => [normalize(field), field]));

export interface ColumnMapping {
  /** `fieldByIndex[i]` is the employee field header column `i` maps to, or `null` when the
   * column matched no known field. */
  fieldByIndex: (ImportField | null)[];
  /** Header cells that matched no known field — reported to the caller as warnings, never
   * silently dropped. */
  unknownColumns: string[];
  /** Required fields with no matching column anywhere in the header. */
  missingRequiredColumns: ImportField[];
  /** A field matched by more than one header column — ambiguous, always rejected rather
   * than silently letting one column win over the other. */
  duplicateFieldColumns: { field: ImportField; columns: string[] }[];
}

/**
 * Shared by `mapColumns` (deterministic header-name matching) and
 * `resolveConfirmedMapping` (a client-confirmed mapping, e.g. from
 * `employee.suggestColumnMapping`) — both end up with one `ImportField | null` per header
 * column, and both need the same "every required field present, no field claimed twice"
 * checks applied to it. One implementation, not two copies that could drift.
 */
function checkRequiredAndDuplicates(
  fieldByIndex: (ImportField | null)[],
  header: string[],
): Pick<ColumnMapping, 'missingRequiredColumns' | 'duplicateFieldColumns'> {
  const columnsByField = new Map<ImportField, string[]>();
  fieldByIndex.forEach((field, index) => {
    if (field === null) return;
    const existing = columnsByField.get(field) ?? [];
    existing.push(header[index]);
    columnsByField.set(field, existing);
  });

  const missingRequiredColumns = REQUIRED_COLUMNS.filter((field) => !columnsByField.has(field));
  const duplicateFieldColumns = Array.from(columnsByField.entries())
    .filter(([, columns]) => columns.length > 1)
    .map(([field, columns]) => ({ field, columns }));

  return { missingRequiredColumns, duplicateFieldColumns };
}

export function mapColumns(header: string[]): ColumnMapping {
  const fieldByIndex: (ImportField | null)[] = [];
  const unknownColumns: string[] = [];

  for (const rawName of header) {
    const field = FIELD_BY_NORMALIZED_NAME.get(normalize(rawName)) ?? null;
    fieldByIndex.push(field);
    if (field === null) unknownColumns.push(rawName);
  }

  return { fieldByIndex, unknownColumns, ...checkRequiredAndDuplicates(fieldByIndex, header) };
}

export interface ConfirmedMappingEntry {
  column: string;
  field: string | null;
}

export type ConfirmedMappingResult =
  | { ok: true; data: { fieldByIndex: (ImportField | null)[] } }
  | { ok: false; error: AppError };

/**
 * Turns a client-confirmed mapping (employee.importPreview/importCommit's `mapping`
 * input) back into the same `fieldByIndex` shape `mapColumns` produces — re-validated
 * from scratch against the freshly re-parsed `header`, never assumed to still be valid.
 * A stale mapping replayed against a different file, or a `field` string that isn't one
 * of `IMPORT_FIELDS` (however plausible-looking — the client is never trusted to have
 * sent a real one), is rejected outright rather than silently coerced or dropped: unlike
 * `employee.suggestColumnMapping`'s merely-advisory output, this function feeds directly
 * into a write path, so a mismatch here is surfaced as an error the caller must fix, not
 * quietly patched over.
 */
export function resolveConfirmedMapping(header: string[], mapping: ConfirmedMappingEntry[]): ConfirmedMappingResult {
  if (mapping.length !== header.length) {
    return {
      ok: false,
      error: err(
        'VALIDATION_ERROR',
        `The column mapping has ${mapping.length} column(s); the file's header has ${header.length}.`,
      ),
    };
  }

  const fieldByIndex: (ImportField | null)[] = [];
  for (let i = 0; i < header.length; i += 1) {
    const entry = mapping[i];
    if (entry.column !== header[i]) {
      return {
        ok: false,
        error: err(
          'VALIDATION_ERROR',
          'The column mapping does not match this file’s header — re-map and try again.',
          { field: 'mapping' },
        ),
      };
    }
    if (entry.field === null) {
      fieldByIndex.push(null);
      continue;
    }
    if (!isImportField(entry.field)) {
      return {
        ok: false,
        error: err('VALIDATION_ERROR', `"${entry.field}" is not a recognized employee field.`, { field: 'mapping' }),
      };
    }
    fieldByIndex.push(entry.field);
  }

  const { missingRequiredColumns, duplicateFieldColumns } = checkRequiredAndDuplicates(fieldByIndex, header);
  if (missingRequiredColumns.length > 0) {
    return {
      ok: false,
      error: err('VALIDATION_ERROR', `Missing required column(s): ${missingRequiredColumns.join(', ')}.`),
    };
  }
  if (duplicateFieldColumns.length > 0) {
    return {
      ok: false,
      error: err(
        'VALIDATION_ERROR',
        `Ambiguous mapping — more than one column maps to the same field: ${duplicateFieldColumns
          .map((d) => `${d.field} ("${d.columns.join('", "')}")`)
          .join('; ')}.`,
      ),
    };
  }

  return { ok: true, data: { fieldByIndex } };
}

/**
 * Maps one CSV data row (already checked to have `header.length` cells — see
 * `parseCsv`) to a raw `{ field: value }` record. An empty cell is omitted entirely
 * (never sent as `""`): on an UPDATE row that means "leave this field unchanged", the
 * same convention `employee.update`'s own optional fields already use for "not supplied".
 * There is deliberately no way to blank out a field via this CSV path in this slice —
 * clearing a value stays a job for `employee.update` itself.
 */
export function mapRow(fieldByIndex: (ImportField | null)[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < row.length; i += 1) {
    const field = fieldByIndex[i];
    if (field === null) continue;
    const value = row[i];
    if (value === '') continue;
    record[field] = value;
  }
  return record;
}
