import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { isoDate } from '@/platform/fields';
import { redact } from '@/platform/redact';
import { systemSettings } from '@/platform/schema/settings';

// Postgres unique-violation code, and the partial index (see
// drizzle/0002_system_settings_open_row_unique.sql) that turns a concurrent
// read-then-close-then-insert race into this specific, identifiable error rather than a
// silently-corrupt second open row.
const UNIQUE_VIOLATION = '23505';
const OPEN_ROW_CONSTRAINT = 'system_settings_open_row_uidx';

function isOpenRowConflict(error: unknown): boolean {
  // drizzle-orm wraps the raw `pg` DatabaseError in a DrizzleQueryError, preserving the
  // original as `.cause` — check both shapes so this survives either one.
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === UNIQUE_VIOLATION &&
      (candidate as { constraint?: unknown }).constraint === OPEN_ROW_CONSTRAINT,
  );
}

const inputSchema = z.object({
  key: z.string().min(1).describe("Setting's unique key name."),
  value: z.unknown().describe('New value for this setting (any JSON).'),
  // Defaults to "today" (server time) if omitted — never client-trusted for anything
  // beyond a plain effective date.
  effectiveFrom: isoDate().describe('Date the new value takes effect; defaults to today.').optional(),
});

const outputSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  effectiveFrom: z.string(),
});

/**
 * Closes the currently-open row for this key (sets `effectiveTo`) and inserts a new
 * open-ended row, inside one transaction. High-risk: audited with before/after.
 *
 * Concurrency: two concurrent calls for the same key can both read the same "current"
 * row before either commits (a read-then-close-then-insert race). We rely on the
 * `system_settings_open_row_uidx` partial unique index — not an additional
 * `SELECT ... FOR UPDATE` — to make the loser's INSERT fail: whichever transaction
 * commits second gets a unique-violation, its whole transaction (including its UPDATE
 * of the row it thought was "current") rolls back, so no bad state is ever persisted.
 * A `SELECT ... FOR UPDATE` on the row read here would not actually close this race
 * (each update inserts a *new* row rather than mutating one in place — locking the row
 * being read doesn't stop a second transaction from building its own conflicting new
 * row once that lock is released post-commit), so it would add real complexity
 * (session/advisory locking) without removing the need for the index anyway. We only
 * translate the specific unique-violation into a clean `CONFLICT` for the caller
 * instead of a generic 500.
 */
export const updateSettingAction = defineAction({
  id: 'system.updateSetting',
  title: 'Update system setting',
  input: inputSchema,
  output: outputSchema,
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  // Slice 03: the vehicle for the confirmation flow ("change the system setting X to Y")
  // — high-risk and tool-exposed, so the bridge routes every call through a confirmation
  // card rather than executing directly. `value` is arbitrary jsonb; `redact()` strips
  // any key/token that looks sensitive rather than trusting the caller's key name.
  toolExposed: true,
  toolDescription: 'Propose a change to a system setting (admin only) — requires user confirmation before it applies.',
  confirmationPreview(input) {
    return { key: input.key, value: redact(input.value), effectiveFrom: input.effectiveFrom ?? null };
  },
  async handler(input, ctx) {
    const effectiveFrom = input.effectiveFrom ?? ctx.now.toISOString().slice(0, 10);

    const [current] = await ctx.db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.tenantId, ctx.tenantId),
          eq(systemSettings.companyId, ctx.companyId),
          eq(systemSettings.key, input.key),
          isNull(systemSettings.effectiveTo),
        ),
      );

    if (current) {
      await ctx.db
        .update(systemSettings)
        .set({ effectiveTo: effectiveFrom, updatedAt: ctx.now, updatedBy: ctx.userId })
        .where(eq(systemSettings.id, current.id));
    }

    let created: typeof systemSettings.$inferSelect;
    try {
      [created] = await ctx.db
        .insert(systemSettings)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          key: input.key,
          value: input.value,
          effectiveFrom,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();
    } catch (error) {
      if (isOpenRowConflict(error)) {
        throw new ActionError(
          'CONFLICT',
          'This setting was updated by another request at the same time. Please retry.',
        );
      }
      throw error;
    }

    ctx.audit({
      entityType: 'system_settings',
      entityId: created.id,
      before: current ? { key: current.key, value: current.value } : null,
      after: { key: created.key, value: created.value },
    });

    return { key: created.key, value: created.value, effectiveFrom: created.effectiveFrom };
  },
});
