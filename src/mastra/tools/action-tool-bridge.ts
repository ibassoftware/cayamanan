// The action -> tool bridge (03-missy-foundation.md): "at request time, build the
// agent's toolset from registry entries where toolExposed = true and ctx.roles allows
// them. Tool name = action id; parameters = the action's zod schema; description
// generated from title + doc string." This is the ONLY place that turns registry entries
// into Mastra tools — a later slice adding a domain action with `toolExposed: true` needs
// nothing here to become one of Missy's tools.
//
// Every tool's `execute()` is a thin wrapper around the same `executeAction()` the
// `/api/actions/[actionId]` route calls — the role/tenant/company checks happen there,
// identically, regardless of whether the caller is a human via the action route or Missy
// via a tool call. Exposure (which tools are even offered) is a UX/noise reduction; the
// authorization boundary is `executeAction` itself (docs/plan/03-missy-foundation.md
// criterion 6 — a real FORBIDDEN from the action layer, not a prompt-level refusal).
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { executeAction, listActions, type VerifiedSession } from '@/platform/actions';
import { redact } from '@/platform/redact';
import { proposeAction } from '@/modules/ai/service/confirmations';
import { recordToolInvocation } from '@/modules/ai/service/tool-invocations';

// The contract the (separate) chat panel UI renders against — every tool returns exactly
// one of these three shapes, never a bare string the model composed:
//   - 'ok': an ordinary action's real output, passed through verbatim (never restated/
//     recomputed by the model — see the guardrail note in src/mastra/agents/missy-agent.ts).
//   - 'confirmation_required': a risk:'high' action was proposed, not executed. The UI
//     renders `preview`/`title` as a confirmation card; approving calls
//     `ai.approveAction` directly (never through the model) with `{ confirmationId,
//     token, input }` — see src/modules/ai/actions/approve-action.ts.
//   - 'error': a stable `AppError.code` (src/platform/errors.ts) + safe-to-show message,
//     for the UI's tool-failed/permission-denied states — never silence, never the model
//     inventing its own explanation of *why* it failed.
export const toolResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), data: z.unknown() }),
  z.object({
    status: z.literal('confirmation_required'),
    confirmationId: z.string(),
    token: z.string(),
    actionId: z.string(),
    title: z.string(),
    preview: z.unknown(),
    expiresAt: z.string(),
  }),
  z.object({ status: z.literal('error'), code: z.string(), message: z.string() }),
]);

export type ToolResult = z.infer<typeof toolResultSchema>;

async function logInvocationSafely(
  params: Parameters<typeof recordToolInvocation>[0],
): Promise<void> {
  try {
    await recordToolInvocation(params);
  } catch (error) {
    // Metadata-only logging must never take down a tool call — redact() before this
    // reaches stdout, same as every other platform-level catch (src/platform/actions.ts).
    console.error(
      '[missy] failed to record tool invocation',
      redact({ actionId: params.actionId, message: error instanceof Error ? error.message : 'unknown error' }),
    );
  }
}

/**
 * Builds Missy's toolset for one request: every registered action with
 * `toolExposed: true` whose `roles` intersects the caller's own roles. Filtered purely
 * for UX (a shorter list for a narrower role, criterion 3) — never the security boundary,
 * which is `executeAction` itself, invoked identically below regardless of this filter.
 */
export function buildActionTools(session: VerifiedSession, threadId: string): Record<string, ReturnType<typeof createTool>> {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  for (const def of listActions()) {
    if (!def.toolExposed) continue;
    if (!def.roles.some((role) => session.roles.includes(role))) continue;

    tools[def.id] = createTool({
      id: def.id,
      description: def.toolDescription ?? def.title,
      inputSchema: def.input,
      outputSchema: toolResultSchema,
      async execute(inputData): Promise<ToolResult> {
        const start = Date.now();

        if (def.risk === 'high') {
          const proposal = await proposeAction(def, session, inputData);
          await logInvocationSafely({
            session,
            threadId,
            actionId: def.id,
            status: proposal.ok ? 'confirmation_required' : 'error',
            durationMs: Date.now() - start,
            errorCode: proposal.ok ? null : proposal.error.code,
          });
          if (!proposal.ok) {
            return { status: 'error', code: proposal.error.code, message: proposal.error.message };
          }
          return { status: 'confirmation_required', ...proposal.data };
        }

        const result = await executeAction(def.id, inputData, { session });
        await logInvocationSafely({
          session,
          threadId,
          actionId: def.id,
          status: result.ok ? 'success' : 'error',
          durationMs: Date.now() - start,
          errorCode: result.ok ? null : result.error.code,
        });
        if (!result.ok) {
          return { status: 'error', code: result.error.code, message: result.error.message };
        }
        return { status: 'ok', data: result.data };
      },
    });
  }

  return tools;
}
