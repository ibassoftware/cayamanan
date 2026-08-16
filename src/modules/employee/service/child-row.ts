// Shared "identify this 201-file child row by its own id, then verify it actually
// belongs to the already-resolved employee" check — reused by every
// employee.update*/employee.remove* action on employee_education/employee_work_history/
// employee_training/employee_contacts. None of these child tables has a human-facing
// natural key (unlike `employees.employeeNo` — see employee-selector.ts), so there is no
// id-or-key selector here, only a bare row id; what this module adds over a plain
// `db.select().where(eq(id, rowId))` is the ownership check every caller would otherwise
// have to remember to repeat: a row id from another employee (even within the same
// tenant+company) must be rejected, never silently operated on. `NOT_FOUND` (not
// `FORBIDDEN`) mirrors resolveByIdOrKey's "wrong scope reads as not found" convention —
// this is a data-scoping check, not a permission check.
import { and, eq } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

import { ActionError } from '@/platform/errors';
import type { ScopedDb } from '@/platform/db';

export interface ChildRowConfig {
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  employeeIdColumn: AnyPgColumn;
  tenantIdColumn: AnyPgColumn;
  companyIdColumn: AnyPgColumn;
  /** Capitalized singular noun used in the not-found message, e.g. "Education record". */
  entityLabel: string;
}

/**
 * Resolves `rowId` to a tenant+company-scoped row and verifies `row.employeeId` matches
 * `employeeId` (the caller's already-resolved employee — see `resolveEmployee`).
 * `NOT_FOUND` for both "no such row" and "row belongs to a different employee": a caller
 * must never learn from the error alone that a row id exists under someone else's record.
 */
export async function resolveChildRow<Row extends { id: string; employeeId: string }>(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  config: ChildRowConfig,
  rowId: string,
  employeeId: string,
): Promise<Row> {
  const rows = await tenantDb
    .select()
    .from(config.table)
    .where(
      and(eq(config.idColumn, rowId), eq(config.tenantIdColumn, tenantId), eq(config.companyIdColumn, companyId)),
    );

  const row = rows[0] as Row | undefined;
  if (!row || row.employeeId !== employeeId) {
    throw new ActionError('NOT_FOUND', `${config.entityLabel} not found for this employee.`);
  }
  return row;
}
