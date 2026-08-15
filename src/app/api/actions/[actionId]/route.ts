import { NextResponse, type NextRequest } from 'next/server';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import { executeAction } from '@/platform/actions';
import type { ErrorCode } from '@/platform/errors';
import { SESSION_COOKIE_NAME } from '@/modules/identity/service/cookie';
import { resolveSessionFromCookie, SESSION_TTL_MS } from '@/modules/identity/service/session';

// The only mutation endpoint (00-overview.md §4.3). No business logic here — every
// request is a thin pass-through to the action registry. Session resolution from the
// signed cookie happens here (not inside executeAction, which is transport-agnostic and
// used directly by tests without any cookie) — this is the ONLY place a `VerifiedSession`
// is built from a real request, never from the request body.
export async function POST(request: NextRequest, context: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await context.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await resolveSessionFromCookie(cookieValue);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  let cookieToSet: string | null | undefined;
  const result = await executeAction(actionId, body, {
    session,
    ip,
    userAgent,
    onSetCookie: (token) => {
      cookieToSet = token;
    },
  });

  const response = NextResponse.json(result, { status: result.ok ? 200 : statusForErrorCode(result.error.code) });

  if (cookieToSet !== undefined) {
    if (cookieToSet === null) {
      response.cookies.delete(SESSION_COOKIE_NAME);
    } else {
      response.cookies.set(SESSION_COOKIE_NAME, cookieToSet, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      });
    }
  }

  return response;
}

function statusForErrorCode(code: ErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'VALIDATION_ERROR':
      return 400;
    case 'CONFLICT':
      return 409;
    case 'INTERNAL':
    default:
      return 500;
  }
}
