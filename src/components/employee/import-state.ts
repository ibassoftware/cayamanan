// Pure UI-logic for the CSV employee import screen (task packet: "extract the pure bits
// — file-size check, template CSV generation, summary/labels, disabled-state logic —
// into src/components/employee/import-state.ts"). No DOM, no fetch: everything here is
// deterministic string/number/array manipulation, unit-tested in
// tests/employee-import-state.test.ts.
//
// `IMPORT_TEMPLATE_COLUMNS` and `MAX_CSV_CHARS` mirror
// src/modules/employee/service/import-columns.ts's `IMPORT_FIELDS` and
// src/modules/employee/service/csv.ts's `MAX_CSV_INPUT_LENGTH` respectively. Duplicated
// rather than imported — frontend components never import from src/modules/** (see
// employee-state.ts's EmployeeSummary, duplicated from the action's own output shape) —
// so the drift-guard test imports the real backend constant to assert the two stay equal.
import { EMPTY_VALUE } from "@/components/employee/employee-format"

export const IMPORT_TEMPLATE_COLUMNS = [
  "employeeNo",
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "birthDate",
  "sex",
  "civilStatus",
  "emailPersonal",
  "emailWork",
  "mobile",
  "hireDate",
  "photoUrl",
  "birthPlace",
  "nationality",
  "religion",
  "bloodType",
  "biometricId",
] as const

export type ImportField = (typeof IMPORT_TEMPLATE_COLUMNS)[number]

const IMPORT_FIELD_SET = new Set<string>(IMPORT_TEMPLATE_COLUMNS)

/** Type guard against the mirrored field list — the mapping step's field `<Select>`
 * hands back a plain string, and this is the one place that gets cast back to
 * `ImportField`. Never trust a value's shape without this. */
export function isImportTemplateField(value: string): value is ImportField {
  return IMPORT_FIELD_SET.has(value)
}

// Mirrors service/import-columns.ts's own `REQUIRED_COLUMNS` — `employeeNo` is the
// natural key deciding CREATE vs UPDATE, so it is the one field the mapping step itself
// blocks progress on. Every other field is validated per-row server-side.
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ["employeeNo"]

// Same cap as employee.importPreview/employee.importCommit's shared MAX_CSV_INPUT_LENGTH.
export const MAX_CSV_CHARS = 2_000_000

// Mirrors service/spreadsheet.ts's MAX_XLSX_BYTES — the same 5 MB cap guards an .xlsx
// upload client-side before it is ever read into memory, same discipline as
// `checkCsvSize` for CSV/TSV.
export const MAX_XLSX_BYTES = 5 * 1024 * 1024

export type FileSizeCheck = { ok: true } | { ok: false; message: string }

/**
 * Guards a file/paste's size before it is ever read into memory or sent to the server.
 * `unit` lets the message describe what was actually measured — a `File`'s `.size` is
 * bytes (checked before `FileReader` even runs), a pasted string's `.length` is
 * characters (the same unit the server itself caps).
 */
export function checkCsvSize(length: number, unit: "bytes" | "characters" = "characters"): FileSizeCheck {
  if (length <= MAX_CSV_CHARS) return { ok: true }
  return {
    ok: false,
    message: `That's ${length.toLocaleString()} ${unit} — the maximum is ${MAX_CSV_CHARS.toLocaleString()}. Split the file into smaller batches and import them separately.`,
  }
}

/**
 * Guards an .xlsx upload's byte size before it is ever read client-side (sheet-name
 * discovery, base64 encoding) — same "guard before any work happens" discipline as
 * `checkCsvSize`, against the same cap the server itself enforces.
 */
export function checkXlsxSize(bytes: number): FileSizeCheck {
  if (bytes <= MAX_XLSX_BYTES) return { ok: true }
  const maxMb = (MAX_XLSX_BYTES / (1024 * 1024)).toFixed(0)
  const gotMb = (bytes / (1024 * 1024)).toFixed(1)
  return {
    ok: false,
    message: `That's ${gotMb} MB — the maximum is ${maxMb} MB. Split the file into smaller batches and import them separately.`,
  }
}

/** The downloadable template's contents — recognized headers only, in a stable order. */
export function buildTemplateCsv(): string {
  return `${IMPORT_TEMPLATE_COLUMNS.join(",")}\r\n`
}

export type ImportOperation = "CREATE" | "UPDATE" | "ERROR"

export function operationLabel(operation: ImportOperation): string {
  if (operation === "CREATE") return "Created"
  if (operation === "UPDATE") return "Updated"
  return "Error"
}

export function operationBadgeVariant(operation: ImportOperation): "success" | "brand" | "destructive" {
  if (operation === "CREATE") return "success"
  if (operation === "UPDATE") return "brand"
  return "destructive"
}

export interface ImportSummary {
  toCreate: number
  toUpdate: number
  withErrors: number
}

/** Top-of-preview summary line, e.g. "3 to create · 2 to update · 1 with errors". */
export function summaryText(summary: ImportSummary): string {
  const errorWord = summary.withErrors === 1 ? "error" : "errors"
  return `${summary.toCreate} to create · ${summary.toUpdate} to update · ${summary.withErrors} with ${errorWord}`
}

/**
 * The commit button's disabled state: no preview yet, any row still failing validation,
 * a commit already in flight, or nothing to actually do — all block the button. Matches
 * the task packet's "all-or-nothing" rule: a single bad row blocks the whole import.
 */
export function canCommitImport(summary: ImportSummary | null, committing: boolean): boolean {
  if (!summary) return false
  if (committing) return false
  if (summary.withErrors > 0) return false
  return summary.toCreate + summary.toUpdate > 0
}

/** Renders a preview row's raw CSV cell value for the table — never a literal
 * `null`/`undefined`/empty string, always the shared placeholder dash. */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_VALUE
  const text = String(value).trim()
  return text.length > 0 ? text : EMPTY_VALUE
}

/**
 * The set of value columns actually present across a preview's rows, in
 * `IMPORT_TEMPLATE_COLUMNS`'s canonical order (so the table reads left-to-right the same
 * way the template does), with any unexpected leftover key appended defensively at the
 * end rather than silently dropped.
 */
export function collectValueColumns(rows: { values: Record<string, unknown> }[]): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()

  for (const field of IMPORT_TEMPLATE_COLUMNS) {
    if (rows.some((row) => field in row.values)) {
      ordered.push(field)
      seen.add(field)
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row.values)) {
      if (!seen.has(key)) {
        seen.add(key)
        ordered.push(key)
      }
    }
  }

  return ordered
}

/** "employeeNo" -> "Employee no", "emailPersonal" -> "Email personal" — a generic
 * camelCase humanizer rather than a per-field label table (there is nothing field-specific
 * to say here). */
export function columnLabel(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// ---------------------------------------------------------------------------------------
// Wizard steps
// ---------------------------------------------------------------------------------------

export type WizardStepId = "file" | "sheet" | "mapping" | "preview"

/**
 * The steps the wizard actually shows, in order — the "sheet" step only exists for an
 * .xlsx workbook with more than one sheet (a single-sheet workbook, or any CSV/TSV
 * source, has nothing to pick and skips straight to mapping).
 */
export function wizardSteps(hasMultipleSheets: boolean): WizardStepId[] {
  return hasMultipleSheets ? ["file", "sheet", "mapping", "preview"] : ["file", "mapping", "preview"]
}

export function wizardStepLabel(step: WizardStepId): string {
  if (step === "file") return "Choose file"
  if (step === "sheet") return "Pick sheet"
  if (step === "mapping") return "Map columns"
  return "Preview & confirm"
}

// ---------------------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------------------

function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, "")
}

// Mirrors service/import-columns.ts's `FIELD_BY_NORMALIZED_NAME` — case-insensitive,
// space/underscore-insensitive header matching. Duplicated rather than imported for the
// same reason `IMPORT_TEMPLATE_COLUMNS` itself is (see this file's header comment); the
// drift-guard test already asserts the two field lists stay equal, and this matcher has
// no state of its own beyond that list.
const FIELD_BY_NORMALIZED_NAME = new Map<string, ImportField>(
  IMPORT_TEMPLATE_COLUMNS.map((field) => [normalizeHeaderName(field), field]),
)

export interface MappingRow {
  column: string
  /** The employee field this column currently maps to, or `null` when unmapped. */
  field: ImportField | null
  /** Only ever set from `employee.suggestColumnMapping`'s own output — `null` for a
   * column mapped by the local deterministic pass or by hand, since neither of those is
   * a "confidence" the mapping step has any business grading. */
  confidence: "high" | "low" | null
}

/**
 * The mapping step's starting point, before "Match with AI" is ever clicked: an exact,
 * case/space/underscore-insensitive header-name match against `IMPORT_TEMPLATE_COLUMNS`,
 * first-match-wins on a collision (mirrors `service/import-columns.ts`'s own
 * deterministic pass) — never authoritative, since `employee.importPreview`/
 * `importCommit` re-validate the confirmed mapping against the file's real header from
 * scratch regardless of what this guessed.
 */
export function initialMappingFromHeader(header: string[]): MappingRow[] {
  const usedFields = new Set<ImportField>()
  return header.map((column) => {
    const field = FIELD_BY_NORMALIZED_NAME.get(normalizeHeaderName(column)) ?? null
    if (field === null || usedFields.has(field)) {
      return { column, field: null, confidence: null }
    }
    usedFields.add(field)
    return { column, field, confidence: null }
  })
}

export interface SuggestedMapping {
  column: string
  field: ImportField | null
  confidence: "high" | "low"
}

/**
 * Merges `employee.suggestColumnMapping`'s response into the mapping table — "fills
 * gaps" only: a column the user (or the local deterministic pass) has already mapped is
 * left exactly as-is, never clobbered by a model guess. A suggestion whose field is
 * already claimed by another row (however that row got mapped) is dropped rather than
 * creating a duplicate-field mapping the server would just reject anyway.
 */
export function applyAiSuggestions(current: MappingRow[], suggestions: SuggestedMapping[]): MappingRow[] {
  const usedFields = new Set<ImportField>()
  for (const row of current) {
    if (row.field !== null) usedFields.add(row.field)
  }

  return current.map((row, index) => {
    if (row.field !== null) return row
    const suggestion = suggestions[index]
    if (!suggestion || suggestion.field === null || usedFields.has(suggestion.field)) return row
    usedFields.add(suggestion.field)
    return { ...row, field: suggestion.field, confidence: suggestion.confidence }
  })
}

/** Required fields (`employeeNo`) with no column mapped to them yet — blocks leaving the
 * mapping step with a clear, field-named message rather than a generic "fix errors". */
export function missingRequiredFields(mapping: MappingRow[]): ImportField[] {
  const mappedFields = new Set(mapping.map((row) => row.field).filter((field): field is ImportField => field !== null))
  return REQUIRED_IMPORT_FIELDS.filter((field) => !mappedFields.has(field))
}

/** Fields claimed by more than one column — always ambiguous, same rule
 * `resolveConfirmedMapping` enforces server-side, surfaced here before the round trip. */
export function duplicateMappedFields(mapping: MappingRow[]): ImportField[] {
  const counts = new Map<ImportField, number>()
  for (const row of mapping) {
    if (row.field === null) continue
    counts.set(row.field, (counts.get(row.field) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([field]) => field)
}

/** The mapping step's "Continue" gate: every required field mapped, no field claimed
 * twice. */
export function canProceedFromMapping(mapping: MappingRow[]): boolean {
  return missingRequiredFields(mapping).length === 0 && duplicateMappedFields(mapping).length === 0
}

// ---------------------------------------------------------------------------------------
// File parsing helpers (header/sample-row discovery only — never the authoritative
// parse, which stays server-side in employee.importPreview/employee.importCommit)
// ---------------------------------------------------------------------------------------

/** Same comma-vs-tab sniffing rule as service/csv.ts's `sniffDelimiter`: tab wins only
 * when strictly more frequent than comma in the header line. */
function sniffCsvDelimiter(headerLine: string): "," | "\t" {
  const commas = (headerLine.match(/,/g) ?? []).length
  const tabs = (headerLine.match(/\t/g) ?? []).length
  return tabs > commas ? "\t" : ","
}

/**
 * A quote-aware split of a single CSV/TSV line — handles a quoted field containing the
 * delimiter and an escaped `""`, but (unlike service/csv.ts's `tokenize`) not a quoted
 * field spanning multiple lines: fine for a header row (quotes there are vanishingly
 * rare, per csv.ts's own comment) and for the handful of sample rows shown/sent for
 * mapping, since neither is the authoritative parse.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i += 1
          continue
        }
        inQuotes = false
        continue
      }
      field += c
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === delimiter) {
      cells.push(field)
      field = ""
      continue
    }
    field += c
  }
  cells.push(field)
  return cells
}

/**
 * Pulls a header row and up to `maxSampleRows` data rows out of raw CSV/TSV text, for the
 * mapping step's display and for `employee.suggestColumnMapping`'s input — never used to
 * build the rows actually submitted to `employee.importPreview`/`employee.importCommit`,
 * which re-parse the same text server-side with `service/csv.ts`'s full RFC 4180 grammar.
 */
export function parseCsvPreview(text: string, maxSampleRows = 3): { header: string[]; sampleRows: string[][] } {
  const withoutBom = text.startsWith("﻿") ? text.slice(1) : text
  const lines = withoutBom.split(/\r\n|\r|\n/).filter((line) => line.length > 0)
  if (lines.length === 0) return { header: [], sampleRows: [] }

  const delimiter = sniffCsvDelimiter(lines[0])
  const header = splitCsvLine(lines[0], delimiter)
  const sampleRows = lines.slice(1, 1 + maxSampleRows).map((line) => splitCsvLine(line, delimiter))
  return { header, sampleRows }
}

/**
 * One `read-excel-file` cell, stringified exactly like service/spreadsheet.ts's own
 * `cellToString` — a genuine Excel date-typed cell becomes its UTC `YYYY-MM-DD` calendar
 * date, everything else its plain string form. Duplicated for the same reason the rest
 * of this file's constants are: components never import `src/modules/**`.
 */
export function formatSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) {
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  return String(value)
}

/** Pads or truncates one already-stringified spreadsheet row to the header's column
 * count, purely for display alignment in the mapping/preview steps — never a
 * ragged-row rejection (that stays server-side, in `normalizeSheetRows`). */
export function normalizeSpreadsheetRow(row: string[], columnCount: number): string[] {
  const copy = row.slice(0, columnCount)
  while (copy.length < columnCount) copy.push("")
  return copy
}
