// Effective-dated configuration resolution — §4.7. Distinct from payroll snapshotting
// (see 99-payroll-domain-notes.md); this helper is for `*_versions`-style tables where
// resolution is always "the row effective at date X", never "the latest row".
export interface EffectiveDatedRow {
  effectiveFrom: string | Date;
  effectiveTo: string | Date | null;
}

/**
 * Picks the row where `effectiveFrom <= date` and (`effectiveTo` is null or
 * `date < effectiveTo`). Assumes at most one such row exists per natural key (enforced at
 * the DB layer — see the exclusion-constraint pattern below); if the caller passes rows
 * for multiple natural keys, filter first.
 */
export function resolveAt<T extends EffectiveDatedRow>(rows: readonly T[], date: Date): T | undefined {
  return rows.find((row) => {
    const from = new Date(row.effectiveFrom);
    const to = row.effectiveTo === null ? null : new Date(row.effectiveTo);
    return from <= date && (to === null || date < to);
  });
}

/**
 * Overlap-prevention pattern for later slices' `*_versions` tables (contracts,
 * allowances, statutory tables, deduction schedule, pay components, holidays). Slice 01
 * does not need this for `system_settings` (single writer, closed transactionally by the
 * action handler), so it is documented here rather than built as a generator.
 *
 * Requires the `btree_gist` extension for the equality operator class on the non-range
 * natural-key column:
 *
 *   CREATE EXTENSION IF NOT EXISTS btree_gist;
 *
 *   ALTER TABLE foo_versions ADD CONSTRAINT foo_versions_no_overlap
 *     EXCLUDE USING gist (
 *       natural_key_column WITH =,
 *       daterange(effective_from, effective_to, '[)') WITH &&
 *     );
 *
 * `daterange(..., '[)')` makes `effective_from` inclusive and `effective_to` exclusive,
 * matching `resolveAt` above. A null `effective_to` is treated by `daterange` as
 * unbounded (open-ended), which is what "currently open" version rows want.
 */
