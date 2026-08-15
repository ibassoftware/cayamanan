// Server-only helper: resolves the signed session cookie the same way the action route
// does (src/app/api/actions/[actionId]/route.ts), so server components under
// src/app/app/** can gate rendering (redirect when signed out, show the 403 page when the
// role doesn't match) without a client round-trip. This is a convenience for the shell —
// the action layer (src/platform/actions.ts) re-verifies the session on every mutation
// regardless, so nothing here can widen what a request is actually allowed to do.
import { cookies } from "next/headers"

import { SESSION_COOKIE_NAME } from "@/modules/identity/service/cookie"
import { resolveSessionFromCookie, type ResolvedSession } from "@/modules/identity/service/session"

export type { ResolvedSession }

export async function getServerSession(): Promise<ResolvedSession | null> {
  const store = await cookies()
  const cookieValue = store.get(SESSION_COOKIE_NAME)?.value
  return resolveSessionFromCookie(cookieValue)
}
