// A reusable **framework primitive** for "identify this record by its stable, human
// natural key instead of a raw UUID" — the fix for the reported Missy bug, where a
// transcribed UUID (a transposed hex pair) reliably resolves to nothing rather than
// something wrong (ids are random, so a corrupted one realistically matches no row) —
// making retyping-a-UUID a pure usability failure, and one every id-taking action shares.
// Slice 05+ models (employment contracts, attendance records, leave requests, payroll
// runs, payslips, statutory tables, ...) that have a genuine human-facing natural key
// should wire up through here — table, natural-key column, entity label, roughly one
// line of configuration — not hand-roll the branching per action. See
// `src/modules/org/actions/update-position.ts` (`code` is also a mutable field there)
// and `src/modules/org/actions/archive-position.ts` (pure selector) plus
// `src/modules/employee/service/employee-selector.ts` (a shared config reused by five
// actions on the same table) for reference call sites.
//
// ---------------------------------------------------------------------------------
// What a natural key must guarantee before you reach for this helper
// ---------------------------------------------------------------------------------
//   1. Unique per tenant+company — ideally a real DB unique index (`keyIsUnique: true`).
//      If it is only a convention (`keyIsUnique: false`), `resolveByIdOrKey` still
//      resolves by it, but always fails loudly (`INTERNAL`) on more than one match
//      rather than trusting the flag or silently taking a row via an unordered
//      `LIMIT 1` — the same trap this codebase already had to fix once for
//      `system_settings`. `keyIsUnique` is documentation for the next reader, not a
//      correctness switch — the multiple-match check below runs unconditionally.
//   2. Stable across ordinary edits — it should not silently change out from under a
//      reference held elsewhere. If the same field is *also* something this action
//      writes a new value to (e.g. `org.updatePosition`'s `code`), set
//      `keyIsAlsoMutableField: true` — see that flag's doc comment for why.
//   3. Actually human-typable: short, meant to be said or typed by a person (a code, an
//      employee/document/payslip number). A record with no such thing — an internal
//      join row, a system-generated artifact nobody addresses by name — should keep
//      taking a bare id. Do not invent a fake natural key just to use this helper.
// ---------------------------------------------------------------------------------
import { z } from 'zod';
import { and, eq, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

import { ActionError } from './errors';
import type { ScopedDb } from './db';

export interface NaturalKeySelectorConfig {
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  keyColumn: AnyPgColumn;
  tenantIdColumn: AnyPgColumn;
  companyIdColumn: AnyPgColumn;
  /**
   * JSON field name the selector uses for the id, e.g. `"id"` (org reference data, which
   * addresses "this record") or `"employeeId"` (employee.* actions, which address a
   * referenced record). Whatever it's called, the underlying column is always the
   * table's real primary key.
   */
  idField: string;
  /** JSON field name the selector uses for the natural key, e.g. `"code"`, `"employeeNo"`. */
  keyField: string;
  /** Capitalized singular noun used in every message, e.g. `"Position"`, `"Employee"`. */
  entityLabel: string;
  /** See the module header comment's guarantee (1). Documentation, not a safety net. */
  keyIsUnique: boolean;
  /**
   * Set when the natural-key column is *also* a field this same action can write a new
   * value to (only `org.update*` today). In that shape, the id — when supplied — stays
   * authoritative for finding the row, exactly as before this helper existed, and the
   * key is not cross-checked as an independent selector: doing so would reject a
   * legitimate rename, since the new value the caller is renaming *to* won't resolve to
   * anything yet. Leave this `false` (the default, and the right choice for every
   * action that only reads the key, i.e. almost everything) to get full "both supplied
   * must resolve to the same row, or reject" reconciliation.
   */
  keyIsAlsoMutableField?: boolean;
}

/** Spread into a `z.object({...})` shape alongside an action's other fields, e.g.
 * `z.object({ ...idOrKeyShape('id', 'code'), title: z.string().optional() })`. */
export function idOrKeyShape<TIdField extends string, TKeyField extends string>(
  idField: TIdField,
  keyField: TKeyField,
): Record<TIdField, z.ZodOptional<z.ZodString>> & Record<TKeyField, z.ZodOptional<z.ZodString>> {
  return {
    [idField]: z.string().uuid().optional(),
    [keyField]: z.string().min(1).optional(),
  } as Record<TIdField, z.ZodOptional<z.ZodString>> & Record<TKeyField, z.ZodOptional<z.ZodString>>;
}

/**
 * Chain onto `.strict().superRefine(requireIdOrKey(idField, keyField))` — fails with a
 * field-level VALIDATION_ERROR unless at least one of `idField`/`keyField` is supplied.
 * Neither is defaulted and neither is silently preferred over the other at the schema
 * level; reconciling both-supplied is `resolveByIdOrKey`'s job, at request time, once
 * both values are known.
 */
export function requireIdOrKey(idField: string, keyField: string) {
  return (data: Record<string, unknown>, ctx: z.RefinementCtx): void => {
    if (data[idField] === undefined && data[keyField] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provide either ${idField} or ${keyField} to identify the record.`,
        path: [idField],
      });
    }
  };
}

async function lookupRows<Row>(
  db: ScopedDb,
  config: NaturalKeySelectorConfig,
  matchCondition: SQL,
  tenantId: string,
  companyId: string,
): Promise<Row[]> {
  const rows = await db
    .select()
    .from(config.table)
    .where(and(matchCondition, eq(config.tenantIdColumn, tenantId), eq(config.companyIdColumn, companyId)));
  return rows as unknown as Row[];
}

/**
 * Resolves `{ [idField]?, [keyField]? }` (at least one always present by the time this
 * runs — see `requireIdOrKey`) to a single tenant+company-scoped row. Both may be
 * supplied: unless `keyIsAlsoMutableField`, they must resolve to the *same* row, or the
 * request is rejected — never a silent preference between two disagreeing selectors.
 * `NOT_FOUND` always names which selector missed when it can (never leaks whether an
 * unmatched id exists in a different tenant/company — the tenant+company predicate above
 * already guarantees that).
 */
export async function resolveByIdOrKey<Row extends { id: string }>(
  db: ScopedDb,
  tenantId: string,
  companyId: string,
  config: NaturalKeySelectorConfig,
  selector: Record<string, unknown>,
): Promise<Row> {
  const id = selector[config.idField] as string | undefined;
  const keyValue = selector[config.keyField] as string | undefined;

  const byId = id !== undefined ? await lookupRows<Row>(db, config, eq(config.idColumn, id), tenantId, companyId) : [];
  const byKey =
    keyValue !== undefined ? await lookupRows<Row>(db, config, eq(config.keyColumn, keyValue), tenantId, companyId) : [];

  // Defense in depth regardless of `keyIsUnique`: never silently take the first of
  // several matches (the `.limit(1)`-without-`ORDER BY` trap this codebase has already
  // had to fix once for system_settings).
  if (byId.length > 1) {
    throw new ActionError('INTERNAL', `Multiple ${config.entityLabel} records matched the same ${config.idField}.`);
  }
  if (byKey.length > 1) {
    throw new ActionError(
      'INTERNAL',
      `Multiple ${config.entityLabel} records matched the same ${config.keyField} — refusing to guess which one.`,
    );
  }

  const idRow = byId[0];
  const keyRow = byKey[0];

  if (id !== undefined && keyValue !== undefined && !config.keyIsAlsoMutableField) {
    if (!keyRow) {
      throw new ActionError('NOT_FOUND', `${config.entityLabel} not found for ${config.keyField} "${keyValue}".`);
    }
    if (!idRow) {
      throw new ActionError('NOT_FOUND', `${config.entityLabel} not found.`);
    }
    if (idRow.id !== keyRow.id) {
      throw new ActionError(
        'VALIDATION_ERROR',
        `${config.idField} and ${config.keyField} refer to different ${config.entityLabel.toLowerCase()} records.`,
        { field: config.keyField },
      );
    }
    return idRow;
  }

  // Either only one selector was supplied, or `keyIsAlsoMutableField` makes the id
  // authoritative whenever it's present (see that field's doc comment above).
  const existing = id !== undefined ? idRow : keyRow;
  if (!existing) {
    throw new ActionError(
      'NOT_FOUND',
      id !== undefined
        ? `${config.entityLabel} not found.`
        : `${config.entityLabel} not found for ${config.keyField} "${keyValue}".`,
    );
  }
  return existing;
}
