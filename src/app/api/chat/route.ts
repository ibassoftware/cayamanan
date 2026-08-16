import { handleChatStream } from '@mastra/ai-sdk';
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui';
import { createUIMessageStreamResponse } from 'ai';
import { NextResponse, type NextRequest } from 'next/server';
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, RequestContext } from '@mastra/core/request-context';

// Every action-registering module the tool bridge (src/mastra/tools/action-tool-bridge.ts)
// might need to expose — mirrors the composition root in
// src/app/api/actions/[actionId]/route.ts. Registration is idempotent (defineAction
// overwrites, not throws, outside a production boot — src/platform/actions.ts), so
// importing all four here is always safe even if the actions route already has.
import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';

import { mastra } from '@/mastra';
import { executeAction, type VerifiedSession } from '@/platform/actions';
import { SESSION_COOKIE_NAME } from '@/modules/identity/service/cookie';
import { resolveSessionFromCookie } from '@/modules/identity/service/session';
import { getOwnedThread, touchThread } from '@/modules/ai/service/threads';
import { MISSY_PROVIDER_OPTIONS, resolveMissyModelSettings, type MissyRequestContext } from '@/mastra/agents/missy-agent';
import { extractScreenModule } from '@/lib/chat/screen-context';

const AGENT_ID = 'missy';

function unauthorized(): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } },
    { status: 401 },
  );
}

async function resolveSession(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return resolveSessionFromCookie(cookieValue);
}

/**
 * Server-authored request context — the only place `session`/`threadId` reach Missy's
 * dynamic tool builder (src/mastra/agents/missy-agent.ts) or Mastra's own memory lookup.
 * Also sets Mastra's own reserved `MASTRA_RESOURCE_ID_KEY`/`MASTRA_THREAD_ID_KEY`, which
 * take precedence over anything a client puts in the request body's `memory` field — the
 * documented mechanism (see @mastra/core's request-context module) for preventing one
 * user's chat request from ever reaching another user's memory.
 */
function buildRequestContext(session: VerifiedSession, threadId: string, screenModule: string | null): RequestContext {
  // Untyped (not `RequestContext<MissyRequestContext>`): besides the keys the tool
  // builder reads (`session`, `threadId`, `screenModule` — see MissyRequestContext), this
  // also needs to carry Mastra's own reserved keys below, which aren't part of that
  // record type.
  const requestContext = new RequestContext();
  requestContext.set('session' satisfies keyof MissyRequestContext, session);
  requestContext.set('threadId' satisfies keyof MissyRequestContext, threadId);
  requestContext.set('screenModule' satisfies keyof MissyRequestContext, screenModule);
  requestContext.set(MASTRA_RESOURCE_ID_KEY, session.userId);
  requestContext.set(MASTRA_THREAD_ID_KEY, threadId);
  return requestContext;
}

// Untrusted client input, same discipline as everything else in this route: only ever
// used to widen/narrow Missy's tool selection (src/mastra/tools/action-tool-bridge.ts),
// never anything session/tenant/authorization related. The screen-context provider
// (src/lib/screen-context.tsx) attaches its `ScreenContext` as the *new* user message's
// own `metadata` (src/components/chat/chat-provider.tsx's `sendChatMessage`), so the
// latest user message in this request's own body is where it lives — never re-derived
// from a prior turn, which could be stale by the time this request is handled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reads already-parsed request JSON, not a typed SDK object (see reasoning-effort.ts's LooseMessage for the same discipline).
function extractLatestScreenModule(messages: any): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return extractScreenModule(messages[i]?.metadata);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const session = await resolveSession(request);
  if (!session) return unauthorized();

  // Arbitrary client JSON — `handleChatStream`'s own `params` type is intentionally loose
  // here for the same reason the original scaffold's `req.json()` result was passed
  // through untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Never trust client-supplied requestContext/memory scoping — thread/resource identity
  // is only ever derived below from the resolved session, the same discipline
  // executeAction applies to a client-supplied tenantId/companyId (src/platform/actions.ts).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { threadId: requestedThreadId, requestContext: _ignoredRequestContext, memory: _ignoredMemory, ...rest } = body;

  let threadId: string;
  if (typeof requestedThreadId === 'string' && requestedThreadId.length > 0) {
    const owned = await getOwnedThread(session, requestedThreadId);
    if (!owned) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Thread not found.' } },
        { status: 404 },
      );
    }
    threadId = owned.id;
  } else {
    const created = await executeAction('ai.createThread', {}, { session });
    if (!created.ok) {
      return NextResponse.json({ ok: false, error: created.error }, { status: 500 });
    }
    threadId = (created.data as { id: string }).id;
  }

  const stream = await handleChatStream({
    mastra,
    agentId: AGENT_ID,
    version: 'v6',
    // Defaults to false, which silently drops every reasoning part before it reaches the
    // client — the summaries requested via MISSY_PROVIDER_OPTIONS would be produced and
    // stored, but never displayable. The panel renders them collapsed.
    sendReasoning: true,
    params: {
      ...rest,
      memory: { thread: threadId, resource: session.userId },
    },
    defaultOptions: {
      requestContext: buildRequestContext(session, threadId, extractLatestScreenModule(rest.messages)),
      // Reasoning effort and summary are execution options in Mastra, not Agent config —
      // see resolveMissyModelSettings / MISSY_PROVIDER_OPTIONS for what each one buys.
      // Effort is resolved per request from this request's own message array (the
      // deterministic heuristic in src/mastra/agents/reasoning-effort.ts) — never a second
      // model call to decide the first one's effort.
      modelSettings: resolveMissyModelSettings(Array.isArray(rest.messages) ? rest.messages : []),
      providerOptions: MISSY_PROVIDER_OPTIONS,
    },
  });

  await touchThread(session, threadId);

  // `X-Missy-Thread-Id`: the UI contract for "which thread did this message land in" —
  // load-bearing when the client didn't send a threadId (a brand-new conversation), so it
  // can persist the server-generated id for the next message and for a reload
  // (acceptance criterion 1).
  return createUIMessageStreamResponse({ stream, headers: { 'X-Missy-Thread-Id': threadId } });
}

export async function GET(request: NextRequest) {
  const session = await resolveSession(request);
  if (!session) return unauthorized();

  const threadId = new URL(request.url).searchParams.get('threadId');
  if (!threadId) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'threadId is required.' } },
      { status: 400 },
    );
  }

  const owned = await getOwnedThread(session, threadId);
  if (!owned) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Thread not found.' } }, { status: 404 });
  }

  const memory = await mastra.getAgentById(AGENT_ID).getMemory();
  let response = null;

  try {
    response = await memory?.recall({ threadId, resourceId: session.userId });
  } catch {
    console.log('No previous messages found.');
  }

  const uiMessages = toAISdkV5Messages(response?.messages || []);

  return NextResponse.json(uiMessages);
}
