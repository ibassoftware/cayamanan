// Adaptive reasoning effort for Missy — see missy-agent.ts's header comment for why this
// exists and what it deliberately does NOT do (no per-turn LLM classification call).
//
// Reasoning effort is a request parameter chosen *before* the model runs, so nothing about
// "the model decides its own effort" is coherent for the very turn it's about to take.
// What can adapt is the deterministic code that picks the parameter, using only what's
// already sitting in memory for this request (the message the user just typed, and the
// immediately preceding assistant turn) — no extra network call, no extra tokens spent
// classifying, so the `low`-by-default happy path ("what positions exist?") pays nothing
// for this.
//
// Rule set (each is a named, independently testable signal — not a pile of regexes):
//   1. highRisk    — the turn is about something CLAUDE.md itself names as high-risk
//                    (salary, bank details, termination, permissions, payroll
//                    approve/finalize/reopen/adjust). Getting the tool call or the
//                    read-back wrong here is exactly what extra reasoning buys.
//   2. analytical  — the user is asking Missy to reason (compare/explain/why/recommend),
//                    not to look something up. CLAUDE.md's own boundary is "AI explains,
//                    flags and assists" — explaining well is a reasoning task.
//   3. multiStep   — the turn chains more than one instruction/entity (numbered/bulleted
//                    steps, "then"/"after that", or is simply long), so there's more for a
//                    single pass to get wrong.
//   4. retryAfterToolError — the assistant turn immediately before this user message ended
//                    in a tool error. Free to reward with more thought: it costs nothing on
//                    the happy path (no error, no escalation) and is a genuine "more
//                    thinking helps" case.
//
// Scoring: each of the four signals is worth exactly one point (a message can't be "more
// high risk" by repeating a keyword, and a retry is either happening or it isn't). Two or
// more points -> `high`. Exactly one -> `medium`. None -> `low`. A retry therefore
// guarantees at least `medium` on its own, and stacks with anything else the message
// already earned (e.g. "why did that fail?" after an error is retry + analytical -> `high`).

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const REASONING_EFFORT_RANK: Record<ReasoningEffort, number> = {
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
};

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return Object.prototype.hasOwnProperty.call(REASONING_EFFORT_RANK, value);
}

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';

// `xhigh` has no eval coverage backing it yet, so the heuristic never reaches for it on its
// own — it stays reachable only via an explicit `MISSY_REASONING_EFFORT=xhigh` override.
// Operators can lower (or, once evaluated, raise) this with `MISSY_REASONING_EFFORT_CEILING`.
export const DEFAULT_REASONING_EFFORT_CEILING: ReasoningEffort = 'high';

function clampToCeiling(effort: ReasoningEffort, ceiling: ReasoningEffort): ReasoningEffort {
  return REASONING_EFFORT_RANK[effort] > REASONING_EFFORT_RANK[ceiling] ? ceiling : effort;
}

// Mirrors CLAUDE.md's own "audit high-risk actions" list verbatim (salary, bank details,
// termination, permissions, payroll approve/finalize/reopen/adjust) plus the couple of
// adjacent payroll/statutory terms that carry the same weight. Deliberately short and
// literal rather than a fuzzy classifier — every entry traces back to a named CLAUDE.md
// concept, so a reviewer can audit this list without reading the code around it.
const HIGH_RISK_TERMS = [
  'salary',
  'compensation',
  'pay rate',
  'payroll',
  'bank account',
  'bank details',
  'routing number',
  'account number',
  'terminate',
  'termination',
  'statutory deduction',
  'tax withholding',
  'finalize payroll',
  'reopen payroll',
  'approve payroll',
  'adjust payroll',
  'payroll adjust',
  'permission',
  'role change',
  'access level',
  'leave balance',
];

// Verbs/phrasings that ask Missy to reason about something rather than fetch it — the
// "explains, flags and assists" half of CLAUDE.md's payroll boundary.
const ANALYTICAL_TERMS = [
  'why',
  'explain',
  'compare',
  'comparison',
  ' versus ',
  ' vs ',
  'difference between',
  'analyze',
  'analyse',
  'analysis',
  'recommend',
  'should i',
  'should we',
  'what if',
  'discrepancy',
  'reconcile',
  'investigate',
  'root cause',
  'trend',
  'evaluate',
];

const MULTI_STEP_PHRASES = [' then ', 'after that', 'first,', 'next,', 'finally,', 'once done'];
const NUMBERED_LIST_PATTERN = /(^|\n)\s*\d+[.)]\s/;
const BULLETED_LIST_PATTERN = /(^|\n)\s*[-*]\s/;
// A proxy for "this is not a one-line lookup" when no other structural marker is present.
const LONG_MESSAGE_WORD_THRESHOLD = 80;

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export interface ReasoningEffortSignals {
  highRisk: boolean;
  analytical: boolean;
  multiStep: boolean;
  retryAfterToolError: boolean;
}

/** Detects the first three signals from the latest user message text alone. */
export function detectMessageSignals(userText: string): Pick<ReasoningEffortSignals, 'highRisk' | 'analytical' | 'multiStep'> {
  const text = userText.toLowerCase();
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;

  return {
    highRisk: containsAny(text, HIGH_RISK_TERMS),
    analytical: containsAny(text, ANALYTICAL_TERMS),
    multiStep:
      containsAny(text, MULTI_STEP_PHRASES) ||
      NUMBERED_LIST_PATTERN.test(text) ||
      BULLETED_LIST_PATTERN.test(text) ||
      wordCount > LONG_MESSAGE_WORD_THRESHOLD,
  };
}

/**
 * Maps signals to an effort level and clamps to the configured ceiling. Pure and total —
 * no I/O, no randomness, safe to call on every request.
 */
export function resolveMissyReasoningEffort(
  signals: ReasoningEffortSignals,
  ceiling: ReasoningEffort = DEFAULT_REASONING_EFFORT_CEILING,
): ReasoningEffort {
  // Each of the four signals is worth exactly one point, including a retry — it stacks
  // with whatever the message itself already earned rather than only setting a floor, so
  // "why did that fail, explain?" (analytical + retry) lands on `high`, not merely the
  // `medium` a retry alone would guarantee.
  const score = [signals.highRisk, signals.analytical, signals.multiStep, signals.retryAfterToolError].filter(
    Boolean,
  ).length;

  let effort: ReasoningEffort = DEFAULT_REASONING_EFFORT;
  if (score >= 2) effort = 'high';
  else if (score === 1) effort = 'medium';

  return clampToCeiling(effort, ceiling);
}

// Structural, framework-agnostic shape covering what both the AI SDK v5 and v6 UIMessage
// formats actually put on the wire (see node_modules/ai's ToolUIPart/DynamicToolUIPart,
// and src/mastra/tools/action-tool-bridge.ts's toolResultSchema for the `status: 'error'`
// shape a *successful-transport-but-logical-failure* tool call returns). Loose on purpose:
// this reads already-parsed request JSON, never a typed SDK object.
interface LooseMessagePart {
  type?: unknown;
  text?: unknown;
  state?: unknown;
  output?: unknown;
}

export interface LooseMessage {
  role?: unknown;
  parts?: LooseMessagePart[];
}

function extractTextParts(message: LooseMessage | undefined): string {
  if (!message?.parts) return '';
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join(' ');
}

function isFailedToolResult(output: unknown): boolean {
  return Boolean(output && typeof output === 'object' && (output as { status?: unknown }).status === 'error');
}

/** True if a tool part errored — either a thrown/transport failure (`output-error`) or a
 * structured logical failure the action layer returned (`status: 'error'`, see the tool
 * bridge's `toolResultSchema`). Both are "the last attempt didn't work". */
function isErroredToolPart(part: LooseMessagePart): boolean {
  if (part.state === 'output-error') return true;
  if (part.state === 'output-available' && isFailedToolResult(part.output)) return true;
  return false;
}

/**
 * Reads the client-supplied conversation array already present in this request's body —
 * the same array `handleChatStream` consumes — to build the signals above without any
 * extra fetch, DB read, or model call.
 */
export function extractReasoningEffortSignals(messages: LooseMessage[]): ReasoningEffortSignals {
  const latestUserIndex = messages.reduce(
    (found, message, index) => (message.role === 'user' ? index : found),
    -1,
  );
  const latestUserText = latestUserIndex === -1 ? '' : extractTextParts(messages[latestUserIndex]);

  // Only the assistant turn immediately preceding the latest user message counts — an
  // error from several turns ago that the conversation has clearly moved past shouldn't
  // keep taxing every later message with extra reasoning.
  let retryAfterToolError = false;
  for (let i = (latestUserIndex === -1 ? messages.length : latestUserIndex) - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    retryAfterToolError = (message.parts ?? []).some(isErroredToolPart);
    break;
  }

  return { ...detectMessageSignals(latestUserText), retryAfterToolError };
}
