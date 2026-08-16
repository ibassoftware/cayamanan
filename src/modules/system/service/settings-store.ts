// Shared write path for `system_settings` — the effective-dated close-old-row/insert-new-row
// mechanism used by both `system.updateSetting` (arbitrary admin-entered settings) and
// `system.setOpenAiKey` (the encrypted OpenAI key). Extracted so this concurrency-race
// handling can't drift between the two call sites; see `writeSettingRow`'s own comment.
import { and, eq, isNull } from 'drizzle-orm';

import type { ActionCtx } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { systemSettings } from '@/platform/schema/settings';
import { OPENAI_KEY_SETTING_KEY } from './openai-key-setting';

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

export type SystemSettingRow = typeof systemSettings.$inferSelect;

/**
 * Keys that must only ever be written through their own dedicated action, never the
 * generic `system.updateSetting` — currently just the encrypted OpenAI key, whose value
 * shape (`{ ciphertext, last4 }`) only `system.setOpenAiKey` is trusted to produce.
 * `system.updateSetting` rejects writes to these keys, and `system.getSettings` hides
 * them from the generic settings list so the admin UI never renders raw ciphertext next
 * to ordinary config or offers a generic "Edit" path that could overwrite it with an
 * arbitrary (unencrypted) shape.
 */
export const RESERVED_SETTING_KEYS: ReadonlySet<string> = new Set([OPENAI_KEY_SETTING_KEY]);

/**
 * Closes the currently-open row for `key` (if any) and inserts a new open-ended row,
 * inside the caller's already-tenant-scoped transaction (`ctx.db`). Returns the created
 * row and the previous one (or `null` if this is the first write for `key`) so the
 * caller can build its own `ctx.audit()` entry — this function never audits itself,
 * since what belongs in `before`/`after` differs per caller (system.updateSetting audits
 * the raw value; system.setOpenAiKey audits only the masked `last4`).
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
export async function writeSettingRow(
  ctx: ActionCtx,
  key: string,
  value: unknown,
  effectiveFrom?: string,
): Promise<{ created: SystemSettingRow; previous: SystemSettingRow | null }> {
  const resolvedEffectiveFrom = effectiveFrom ?? ctx.now.toISOString().slice(0, 10);

  const [current] = await ctx.db
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.tenantId, ctx.tenantId),
        eq(systemSettings.companyId, ctx.companyId),
        eq(systemSettings.key, key),
        isNull(systemSettings.effectiveTo),
      ),
    );

  if (current) {
    await ctx.db
      .update(systemSettings)
      .set({ effectiveTo: resolvedEffectiveFrom, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(systemSettings.id, current.id));
  }

  let created: SystemSettingRow;
  try {
    [created] = await ctx.db
      .insert(systemSettings)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        key,
        value,
        effectiveFrom: resolvedEffectiveFrom,
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

  return { created, previous: current ?? null };
}
