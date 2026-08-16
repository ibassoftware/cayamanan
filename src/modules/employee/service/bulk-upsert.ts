// Shared planning + apply logic behind `employee.importCommit` (CSV) and
// `employee.bulkUpsert` (Missy's structured, conversational path). Both resolve to
// exactly the same semantics — `employeeNo` decides CREATE vs UPDATE, a duplicate
// `employeeNo` within the same batch is rejected, and every row is validated against the
// real `employee.create`/`employee.update` zod schemas rather than a restated copy of
// their field rules — so this is one function each, reused by both actions, not two
// near-identical implementations.
//
// `planUpserts` never writes anything: it only reads (to resolve CREATE vs UPDATE) and
// validates. Both `employee.importPreview` (a pure dry run) and the write path of
// `employee.importCommit`/`employee.bulkUpsert` call it first — the write path only
// proceeds to `applyPlannedUpserts` once every row comes back with no errors, which is
// what makes "all-or-nothing" hold: nothing has been written yet at the point a bad row
// would otherwise be discovered, so there is no partial write to unwind.
import { and, eq, inArray } from 'drizzle-orm';

import type { ActionCtx } from '@/platform/actions';
import type { ScopedDb } from '@/platform/db';
import { employees } from '../schema';
import { createEmployeeAction } from '../actions/create-employee';
import { updateEmployeeAction } from '../actions/update-employee';

export interface UpsertCandidate {
  /** 1-based, human-facing position for error messages — the CSV file's actual row
   * number (header counts as row 1) for the import path, or the array position for
   * `employee.bulkUpsert`. */
  rowNumber: number;
  /** Raw field values for this row/item. `null`/`undefined` both mean "not supplied"
   * (never "clear this field") and are stripped before validation. */
  values: Record<string, unknown>;
}

export interface PlannedUpsertRow {
  rowNumber: number;
  employeeNo: string | null;
  operation: 'CREATE' | 'UPDATE' | 'ERROR';
  values: Record<string, unknown>;
  errors: string[];
  /** The already-zod-parsed input ready for `createEmployeeAction.handler`/
   * `updateEmployeeAction.handler` — populated only when `operation !== 'ERROR'`.
   * Internal to this module's own actions; never part of an action's `output`. */
  parsedInput?: unknown;
}

function issueMessages(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
}

function stripNullish(values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Validates every candidate against the real `employee.create`/`employee.update` zod
 * schemas and decides CREATE vs UPDATE by checking `employeeNo` against what already
 * exists in this tenant+company. Read-only — safe to call from a dry-run preview action
 * as well as the first half of a committing one.
 */
export async function planUpserts(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  candidates: UpsertCandidate[],
): Promise<PlannedUpsertRow[]> {
  const rows: PlannedUpsertRow[] = candidates.map((candidate) => {
    const values = stripNullish(candidate.values);
    const employeeNoValue = values.employeeNo;
    const employeeNo = typeof employeeNoValue === 'string' && employeeNoValue.length > 0 ? employeeNoValue : null;
    return { rowNumber: candidate.rowNumber, employeeNo, operation: 'ERROR', values, errors: [] };
  });

  // Duplicate-within-batch check: the *later* row of a repeated employeeNo is the one
  // that errors, matching what a person would expect scanning their own file top to
  // bottom for "which one is the mistake".
  const seenEmployeeNos = new Set<string>();
  const employeeNosToLookUp: string[] = [];
  for (const row of rows) {
    if (!row.employeeNo) {
      row.errors.push('employeeNo is required.');
      continue;
    }
    if (seenEmployeeNos.has(row.employeeNo)) {
      row.errors.push(`Duplicate employeeNo "${row.employeeNo}" already appears earlier in this batch.`);
      continue;
    }
    seenEmployeeNos.add(row.employeeNo);
    employeeNosToLookUp.push(row.employeeNo);
  }

  const existingIdByEmployeeNo = new Map<string, string>();
  if (employeeNosToLookUp.length > 0) {
    const existingRows = await tenantDb
      .select({ id: employees.id, employeeNo: employees.employeeNo })
      .from(employees)
      .where(
        and(
          eq(employees.tenantId, tenantId),
          eq(employees.companyId, companyId),
          inArray(employees.employeeNo, employeeNosToLookUp),
        ),
      );
    for (const existing of existingRows) {
      existingIdByEmployeeNo.set(existing.employeeNo, existing.id);
    }
  }

  for (const row of rows) {
    if (row.errors.length > 0 || !row.employeeNo) continue;

    const isUpdate = existingIdByEmployeeNo.has(row.employeeNo);
    const schema = isUpdate ? updateEmployeeAction.input : createEmployeeAction.input;
    const parsed = schema.safeParse(row.values);
    if (!parsed.success) {
      row.errors.push(...issueMessages(parsed.error.issues));
      continue;
    }
    row.operation = isUpdate ? 'UPDATE' : 'CREATE';
    row.parsedInput = parsed.data;
  }

  // A row with any error is reported as ERROR regardless of what CREATE/UPDATE guess
  // preceded it — ERROR is its own category, not a qualifier on the other two.
  for (const row of rows) {
    if (row.errors.length > 0) row.operation = 'ERROR';
  }

  return rows;
}

export interface AppliedUpsertResult {
  created: number;
  updated: number;
  employeeNumbers: string[];
}

/**
 * Executes every already-`planUpserts`-validated row by calling the exact same
 * `employee.create`/`employee.update` handlers a single-row call would use — never a
 * duplicated insert/update implementation. The caller must have already rejected the
 * whole batch if any row's `operation` came back `'ERROR'`; this throws instead of
 * silently skipping one, since reaching here with an unresolved row means the caller
 * skipped that check.
 */
export async function applyPlannedUpserts(ctx: ActionCtx, rows: PlannedUpsertRow[]): Promise<AppliedUpsertResult> {
  let created = 0;
  let updated = 0;
  const employeeNumbers: string[] = [];

  for (const row of rows) {
    if (row.operation === 'CREATE') {
      await createEmployeeAction.handler(row.parsedInput as Parameters<typeof createEmployeeAction.handler>[0], ctx);
      created += 1;
    } else if (row.operation === 'UPDATE') {
      await updateEmployeeAction.handler(row.parsedInput as Parameters<typeof updateEmployeeAction.handler>[0], ctx);
      updated += 1;
    } else {
      throw new Error(
        `applyPlannedUpserts received an unresolved row (rowNumber ${row.rowNumber}) — the caller must reject the whole batch before applying.`,
      );
    }
    if (row.employeeNo) employeeNumbers.push(row.employeeNo);
  }

  return { created, updated, employeeNumbers };
}
