import { and, eq, isNull } from 'drizzle-orm';
import { z, ZodObject, type ZodTypeAny } from 'zod';

import { defineAction, executeAction, getAction, type VerifiedSession } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { aiConfirmations } from '../schema';
import { verifyConfirmationToken } from '../service/confirmation-token';
import { hashInput } from '../service/input-hash';

/**
 * OpenAI's structured tool-calling makes every property "required" and represents
 * optionality as nullable, so a model's tool-call input for an optional field always
 * arrives as an explicit `null` rather than an omitted key. Mastra's own tool-invocation
 * pipeline (src/mastra/tools/action-tool-bridge.ts) coerces that away before
 * `proposeAction` ever validates the input, but this handler re-validates the
 * client-resubmitted `input` against the same target action schema through a different
 * route (a nested `executeAction()`, never through Mastra) — so without this, every
 * optional field on every tool-exposed high-risk action would hit the identical trap as
 * slices 05-14 add more of them (salary, bank details, payroll finalize, ...).
 *
 * Deliberately schema-aware, not a blanket strip: a top-level key is dropped only when
 * its own field schema rejects `null` but accepts `undefined` (genuinely optional). A
 * field whose schema is `.nullable()` — where `null` is a meaningful, intentional value —
 * is left untouched. Only inspects top-level keys, matching what OpenAI's compat layer
 * actually mangles (the target action's own handler is still responsible for anything
 * nested inside `value`-shaped blobs).
 *
 * This mirrors what Mastra's own OpenAI-model tool pipeline already does before
 * `proposeAction` ever runs (`transformNullToUndefined` /
 * `@mastra/schema-compat`'s `OpenAISchemaCompatLayer`, which Missy's agent applies
 * per-request since her model is an OpenAI-family one — see
 * src/mastra/agents/missy-agent.ts) — but that package is a transitive dependency of
 * `@mastra/core`, not one of ours, and isn't part of any package.json we control, so it
 * isn't safe to import directly here — reimplemented as the small, local, schema-aware
 * piece it is instead.
 */
function normalizeNullOptionalFields(schema: ZodTypeAny, input: Record<string, unknown>): Record<string, unknown> {
  if (!(schema instanceof ZodObject)) return input;
  const shape = schema.shape as Record<string, ZodTypeAny>;
  const result = { ...input };
  for (const [key, value] of Object.entries(input)) {
    if (value !== null) continue;
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const rejectsNull = !fieldSchema.safeParse(null).success;
    const acceptsUndefined = fieldSchema.safeParse(undefined).success;
    if (rejectsNull && acceptsUndefined) {
      delete result[key];
    }
  }
  return result;
}

/**
 * The single, HTTP-reachable entry point for the "Approve" button on a confirmation card
 * (03-missy-foundation.md criterion 4/5) — never tool-exposed, so the model itself can
 * never call this; only the user's own click does, via `POST /api/actions/ai.approveAction`.
 *
 * `risk: 'ordinary'` deliberately: approving is not itself the sensitive act, so it does
 * not call `ctx.audit()`. The sensitive act is the *target* action (always `risk: 'high'`,
 * since only those get proposed), executed below via a nested `executeAction()` call with
 * `actorKind: 'MISSY'` — its own handler calls `ctx.audit()` inside that nested call's own
 * transaction, which is where the real `audit_logs` row comes from.
 *
 * Marking the confirmation consumed (this handler's own `ctx.db` update) and running the
 * target action (the nested `executeAction()`, its own separate transaction/connection —
 * `executeAction` always opens its own `withTenantContext`) are therefore two distinct
 * transactions, not one atomic unit: if the nested call fails, throwing `ActionError` here
 * rolls back *this* transaction's consumed-at write, so the token remains usable for a
 * retry (the nested transaction, having failed, already rolled back its own side effects).
 * The reverse — nested call succeeds, then something after it here fails — is not a real
 * risk: nothing follows the nested call except returning its already-committed result.
 */
export const approveActionAction = defineAction({
  id: 'ai.approveAction',
  title: 'Approve a proposed action',
  input: z
    .object({
      confirmationId: z.string().uuid(),
      token: z.string().min(1),
      // The exact input the confirmation card displayed, resubmitted by the client —
      // never trusted as-is; re-hashed and compared against what was proposed below.
      input: z.record(z.string(), z.unknown()),
    })
    .strict(),
  output: z.object({ actionId: z.string(), result: z.unknown() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  toolExposed: false,
  async handler(input, ctx) {
    const tokenConfirmationId = verifyConfirmationToken(input.token);
    if (!tokenConfirmationId || tokenConfirmationId !== input.confirmationId) {
      throw new ActionError('VALIDATION_ERROR', 'Invalid or tampered confirmation token.');
    }

    const [row] = await ctx.db
      .select()
      .from(aiConfirmations)
      .where(eq(aiConfirmations.id, input.confirmationId))
      .limit(1);

    // Uniform NOT_FOUND for "doesn't exist" and "belongs to someone else" — never confirm
    // to a caller that a given confirmationId belongs to another user.
    if (!row || row.userId !== ctx.userId) {
      throw new ActionError('NOT_FOUND', 'Confirmation not found.');
    }

    if (row.consumedAt) {
      throw new ActionError('CONFLICT', 'This confirmation has already been used.');
    }
    if (row.expiresAt.getTime() <= ctx.now.getTime()) {
      throw new ActionError('CONFLICT', 'This confirmation has expired. Please ask again.');
    }

    if (hashInput(input.input) !== row.inputHash) {
      throw new ActionError(
        'VALIDATION_ERROR',
        'The submitted values do not match what was proposed. Please re-confirm.',
      );
    }

    const targetDef = getAction(row.actionId);
    if (!targetDef || targetDef.risk !== 'high') {
      // Should not happen — only risk:'high' actions ever get proposed (see
      // proposeAction). Surfacing this as a defect rather than silently proceeding.
      throw new ActionError('INTERNAL', 'This action is not eligible for confirmation.');
    }

    // Atomic single-use guard: whichever concurrent approval reaches this UPDATE first
    // wins (0 affected rows means we lost the race against another approval of the same
    // token) — the earlier consumedAt/expiresAt checks above are optimistic, this is what
    // actually enforces "single-use" under concurrency.
    const [consumed] = await ctx.db
      .update(aiConfirmations)
      .set({ consumedAt: ctx.now })
      .where(and(eq(aiConfirmations.id, row.id), isNull(aiConfirmations.consumedAt)))
      .returning({ id: aiConfirmations.id });
    if (!consumed) {
      throw new ActionError('CONFLICT', 'This confirmation has already been used.');
    }

    const session: VerifiedSession = {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      userId: ctx.userId ?? row.userId,
      employeeId: ctx.employeeId ?? null,
      roles: ctx.roles,
      sessionId: ctx.sessionId ?? '',
    };

    // Applied *after* the hash check above, never before: the hash is a proof that this
    // is the same input the user was shown, and must keep comparing against exactly what
    // the client resubmitted. Safe to apply only now, because it cannot change the hash
    // anyway — `hashInput`'s `stableStringify` already collapses an explicit `null` and an
    // `undefined` value at the same key to the same serialized token, so normalizing here
    // vs. before the hash check is equivalent for any input that already hashed correctly.
    const normalizedInput = normalizeNullOptionalFields(targetDef.input, input.input);

    const result = await executeAction(row.actionId, normalizedInput, {
      session,
      actorKind: 'MISSY',
      confirmationToken: input.token,
    });

    if (!result.ok) {
      throw new ActionError(result.error.code, result.error.message);
    }

    return { actionId: row.actionId, result: result.data };
  },
});
