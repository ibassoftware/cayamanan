// Shared check for the "session-expired interception" state (docs/plan/02-identity-auth.md
// UI screens table, "Global" row): any authenticated screen's action call can come back
// UNAUTHORIZED mid-session (cookie expired, session revoked elsewhere, tampered cookie —
// src/modules/identity/service/session.ts resolveSessionFromCookie folds all of these into
// "no session"). Screens that mutate state should redirect to /login rather than show a
// bare error, since retrying the same action can never succeed without a fresh login.
import type { ActionResult } from "@/platform/errors"

// The literal, single source of this text: src/platform/actions.ts's `executeAction`,
// the "no session resolved from the cookie" branch — the one place a missing/expired/
// invalid session actually produces `UNAUTHORIZED`. Some handlers (e.g.
// identity.changeOwnPassword's "current password is incorrect") also return
// `UNAUTHORIZED` for a domain reason that is NOT a session problem, so the error code
// alone can't tell the two apart — matching this exact message is what does.
const NO_SESSION_MESSAGE = "Authentication is required to perform this action."

export function isSessionExpired(result: ActionResult<unknown>): boolean {
  return !result.ok && result.error.code === "UNAUTHORIZED" && result.error.message === NO_SESSION_MESSAGE
}

export const SESSION_EXPIRED_LOGIN_PATH = "/login?sessionExpired=1"
