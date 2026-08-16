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
import { resolveModuleScopes } from '@/lib/chat/tool-scope';

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
 * The always-on core, present in every *scoped* toolset regardless of the current
 * screen's module. Kept deliberately tiny — each entry earns its place:
 *   - `identity.me`: "who am I" is a fair question from any screen, and it's a single
 *     tiny read already `toolExposed` to every role.
 *   - `ui.navigate` / `ui.openRecord`: cross-cutting shell actions. Which screen to move
 *     to next isn't a property of the screen you're currently on — restricting them by
 *     module would make Missy unable to act on "take me to the employees list" from
 *     anywhere else.
 *   - `catalog.find` (added separately, see below): the escape hatch itself. If it were
 *     module-scoped it could scope itself out of existence.
 * Every other tool-exposed action is offered only when the current screen's module maps
 * to it (`resolveModuleScopes`) or a prior `catalog.find` call surfaced it this thread.
 */
const CORE_TOOL_IDS: ReadonlySet<string> = new Set(['identity.me', 'ui.navigate', 'ui.openRecord']);

export const CATALOG_FIND_TOOL_ID = 'catalog.find';

/** `action.id`'s module prefix, e.g. `'org.updateDepartment'` -> `'org'`. */
function moduleOfActionId(actionId: string): string {
  return actionId.split('.')[0] ?? actionId;
}

// Per-thread memory of action ids a `catalog.find` call has already surfaced to this
// conversation — the discovery tool's actual payoff (see the header comment on
// `buildActionTools` below): a match becomes a real, directly callable tool starting
// with the next `buildActionTools` call for the same thread, without ever routing the
// call itself through anything but that action's own schema-constrained tool.
//
// In-memory and best-effort by design, mirroring Mastra's own built-in `ToolSearchProcessor`
// (`node_modules/@mastra/core`'s `LegacyMapLoadedToolStore`) for the same "discovered
// this session" concept. Never a security boundary — losing this map (a restart, a
// different server instance) only ever narrows what's offered back to the module
// default; `executeAction`'s role check is unaffected either way. Capped so a
// long-running server can't accumulate one entry per thread forever.
const MAX_TRACKED_THREADS = 500;
const discoveredToolsByThread = new Map<string, Set<string>>();

function rememberDiscoveredTools(threadId: string, actionIds: readonly string[]): void {
  if (actionIds.length === 0) return;
  let discovered = discoveredToolsByThread.get(threadId);
  if (!discovered) {
    if (discoveredToolsByThread.size >= MAX_TRACKED_THREADS) {
      const oldestThreadId = discoveredToolsByThread.keys().next().value;
      if (oldestThreadId !== undefined) discoveredToolsByThread.delete(oldestThreadId);
    }
    discovered = new Set();
    discoveredToolsByThread.set(threadId, discovered);
  }
  for (const id of actionIds) discovered.add(id);
}

function getDiscoveredTools(threadId: string): ReadonlySet<string> {
  return discoveredToolsByThread.get(threadId) ?? new Set();
}

/** Test-only: in-memory state must not leak between unrelated test cases/threads. */
export function resetDiscoveredToolsForTests(threadId?: string): void {
  if (threadId) discoveredToolsByThread.delete(threadId);
  else discoveredToolsByThread.clear();
}

/**
 * Already-parsed, server-derived scoping input — never the raw client metadata itself.
 * `module` is untrusted in *value* (client-supplied, see `extractScreenModule`) but is
 * only ever used to look up a fixed, server-owned table (`resolveModuleScopes`); nothing
 * about it can reach outside that table or affect what `executeAction` allows.
 */
export interface ToolScopeInput {
  module: string | null;
}

export interface BuildActionToolsOptions {
  /**
   * The requesting screen's module, as published by slice 03's screen-context provider
   * and read server-side in `src/app/api/chat/route.ts`. Omitted (or `null` module)
   * means "no scoping opinion" — the caller gets today's full, unscoped list, exactly as
   * before this option existed. This keeps every existing call site (tests included)
   * byte-for-byte unaffected unless it opts in.
   */
  screenContext?: ToolScopeInput | null;
  /**
   * Escape hatch to force the pre-scoping behaviour even when a screen context is
   * supplied — set explicitly by a caller, or via `MISSY_TOOL_SCOPING=unscoped`, so
   * scoping can be A/B'd or rolled back without a redeploy if it ever mis-fires on tool
   * selection.
   */
  unscoped?: boolean;
}

function scopingDisabledByEnv(): boolean {
  return process.env.MISSY_TOOL_SCOPING === 'unscoped';
}

// Filtered out of a search query before scoring: common short words that appear as
// substrings of almost any tool description (e.g. "in" inside "administration") and would
// otherwise inflate an unrelated, verbosely-worded tool's score above a short, precisely
// worded match — observed live with `ui.navigate`'s long screen catalogue outscoring
// `identity.listUsers` on a query containing "the"/"in" until this filter was added.
const CATALOG_FIND_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'for', 'from', 'has', 'in',
  'into', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to',
  'was', 'were', 'with', 'you', 'your',
]);

function catalogFindQueryTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !CATALOG_FIND_STOPWORDS.has(word));
  return Array.from(new Set(words));
}

function scoreCatalogCandidate(def: { id: string; title: string; toolDescription?: string }, terms: readonly string[]): number {
  const haystack = `${def.id} ${def.title} ${def.toolDescription ?? ''}`.toLowerCase();
  return terms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
}

const CATALOG_FIND_MAX_MATCHES = 5;

/**
 * The one discovery tool (see this module's header + docs/plan): a deterministic keyword
 * search over every action the caller's own role can reach, *not* a generic invoke —
 * it only ever returns metadata (id/title/description/input schema), never executes
 * anything. A match is remembered for `threadId` so the very next `buildActionTools` call
 * on this thread offers it as a normal, fully schema-constrained tool — reachable in one
 * hop instead of invisible, without ever weakening the structural guarantee that a real
 * call is a real call.
 */
function buildCatalogFindTool(
  candidates: ReadonlyArray<{ id: string; title: string; toolDescription?: string; input: z.ZodType }>,
  session: VerifiedSession,
  threadId: string,
): ReturnType<typeof createTool> {
  return createTool({
    id: CATALOG_FIND_TOOL_ID,
    description:
      'Search for an action you are allowed to use but do not currently have as a tool this turn — your ' +
      'toolset is scoped to the screen the user is on. Use this whenever the user asks for something ' +
      "outside that (e.g. you're on the employees screen and they ask about user accounts or system " +
      'settings) instead of saying you cannot help. Returns matching action ids with their title and input ' +
      "schema. A match becomes available to you as a real, callable tool starting with the user's *next* " +
      'message in this conversation — tell the user what you found and that they can go ahead; never ' +
      'pretend you already ran it.',
    inputSchema: z.object({ query: z.string().min(1) }).strict(),
    outputSchema: toolResultSchema,
    async execute({ query }): Promise<ToolResult> {
      const start = Date.now();
      const terms = catalogFindQueryTerms(query);
      const matches = candidates
        .map((def) => ({ def, score: scoreCatalogCandidate(def, terms) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, CATALOG_FIND_MAX_MATCHES);

      if (matches.length > 0) {
        rememberDiscoveredTools(threadId, matches.map((entry) => entry.def.id));
      }

      // Metadata-only (no `query` text — it may contain PII the user typed), same
      // discipline as every other tool invocation logged below.
      await logInvocationSafely({
        session,
        threadId,
        actionId: CATALOG_FIND_TOOL_ID,
        status: 'success',
        durationMs: Date.now() - start,
        errorCode: null,
      });

      return {
        status: 'ok',
        data: {
          matches: matches.map(({ def }) => ({
            id: def.id,
            title: def.title,
            description: def.toolDescription ?? def.title,
            inputSchema: z.toJSONSchema(def.input),
          })),
        },
      };
    },
  });
}

/**
 * Builds Missy's toolset for one request: every registered action with
 * `toolExposed: true` whose `roles` intersects the caller's own roles — filtered purely
 * for UX (a shorter list for a narrower role, criterion 3) — never the security boundary,
 * which is `executeAction` itself, invoked identically below regardless of this filter.
 *
 * When `options.screenContext` is supplied (and scoping isn't disabled), the role-allowed
 * set above is narrowed further to: the always-on core, the current screen's module(s)
 * (`resolveModuleScopes`), and anything a prior `catalog.find` call on this thread already
 * surfaced — plus `catalog.find` itself, the escape hatch back to everything else. This
 * narrowing is UX-only, exactly like the role filter it sits alongside: a tool that was
 * not offered this way must still be refused by `executeAction` if somehow invoked, and
 * nothing here can widen what a role may actually do.
 */
export function buildActionTools(
  session: VerifiedSession,
  threadId: string,
  options: BuildActionToolsOptions = {},
): Record<string, ReturnType<typeof createTool>> {
  const roleAllowed = listActions().filter(
    (def) => def.toolExposed && def.roles.some((role) => session.roles.includes(role)),
  );

  const scopeActive = !options.unscoped && !scopingDisabledByEnv() && Boolean(options.screenContext);
  const moduleScopes = scopeActive ? resolveModuleScopes(options.screenContext!.module) : null;
  const discovered = scopeActive ? getDiscoveredTools(threadId) : null;

  const offered = scopeActive
    ? roleAllowed.filter(
        (def) => CORE_TOOL_IDS.has(def.id) || moduleScopes!.includes(moduleOfActionId(def.id)) || discovered!.has(def.id),
      )
    : roleAllowed;

  const tools: Record<string, ReturnType<typeof createTool>> = {};

  for (const def of offered) {
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

  if (scopeActive) {
    tools[CATALOG_FIND_TOOL_ID] = buildCatalogFindTool(roleAllowed, session, threadId);
  }

  return tools;
}
