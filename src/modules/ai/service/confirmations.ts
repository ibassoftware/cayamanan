// Confirmation-flow service for risk:'high' tools (03-missy-foundation.md): "agent
// proposes -> UI renders a confirmation card -> user approves -> action executes".
//
// `proposeAction` is called by the tool bridge (src/mastra/tools/action-tool-bridge.ts)
// when the model invokes a tool for a `risk: 'high'` action — instead of running the
// action, it creates an `ai_confirmations` row and returns a redacted preview + signed
// token for the (separate) UI to render as a confirmation card. It is never invoked
// through `executeAction`/the action route, since nothing here mutates domain data.
//
// Approving (verifying the token, checking expiry/consumption, and actually running the
// target action) lives in `ai.approveAction` (src/modules/ai/actions/approve-action.ts)
// instead of here, so the "mark consumed" write and the target action's own execution can
// share one clear transactional story (see that file's header comment).
import type { ZodType } from 'zod';

import type { Role, VerifiedSession } from '@/platform/actions';
import { err, type ActionResult } from '@/platform/errors';
import { withTenantContext } from '@/platform/db';
import { aiConfirmations } from '../schema';
import { signConfirmationToken } from './confirmation-token';
import { hashInput } from './input-hash';

export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** The subset of a registry action definition proposeAction needs — see DefineActionArgs. */
export interface ProposableAction {
  id: string;
  title: string;
  roles: Role[];
  input: ZodType<unknown>;
  // `never`, not `unknown`: this only needs to accept whatever a *concrete* action's own
  // `confirmationPreview(input: TInput)` was declared with — using the bottom type here
  // (rather than `unknown`) keeps every real `DefineActionArgs<TInput, TOutput>` value
  // structurally assignable to `ProposableAction` regardless of its own `TInput`, since
  // function parameters are contravariant and every concrete `TInput` accepts `never`.
  confirmationPreview?: (input: never) => Record<string, unknown>;
}

export interface ConfirmationProposal {
  confirmationId: string;
  token: string;
  actionId: string;
  title: string;
  preview: Record<string, unknown>;
  expiresAt: string;
}

/**
 * Validates the caller's role and the input against the target action's own schema (the
 * same checks `executeAction` would do — a proposal for an action the caller can't
 * perform, or with input that wouldn't even parse, is refused up front rather than
 * deferred to a confusing failure at approval time), then records a single-use
 * confirmation bound to a hash of the parsed input.
 */
export async function proposeAction(
  def: ProposableAction,
  session: VerifiedSession,
  rawInput: unknown,
): Promise<ActionResult<ConfirmationProposal>> {
  if (!def.roles.some((role) => session.roles.includes(role))) {
    return { ok: false, error: err('FORBIDDEN', 'You do not have permission to perform this action.') };
  }

  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: err('VALIDATION_ERROR', issue?.message ?? 'Invalid input', { field: issue?.path.join('.') }),
    };
  }

  const input = parsed.data;
  // `as never`: safe here specifically because `input` was just produced by *this same*
  // action's own `def.input.safeParse()` above, so it always matches whatever concrete
  // `TInput` `def.confirmationPreview` actually expects at runtime.
  const preview = def.confirmationPreview ? def.confirmationPreview(input as never) : {};
  const inputHash = hashInput(input);
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);

  const created = await withTenantContext({ tenantId: session.tenantId, companyId: session.companyId }, async (tenantDb) => {
    const [row] = await tenantDb
      .insert(aiConfirmations)
      .values({
        tenantId: session.tenantId,
        companyId: session.companyId,
        userId: session.userId,
        actionId: def.id,
        inputHash,
        inputPreview: preview,
        expiresAt,
      })
      .returning();
    return row;
  });

  return {
    ok: true,
    data: {
      confirmationId: created.id,
      token: signConfirmationToken(created.id),
      actionId: def.id,
      title: def.title,
      preview,
      expiresAt: expiresAt.toISOString(),
    },
  };
}
