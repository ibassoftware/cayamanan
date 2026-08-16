// Session lifecycle: resolving the cookie on every request, and creating/revoking
// session rows. See src/platform/db.ts for the pre-tenant-context lookup design this
// relies on, and src/modules/identity/service/cookie.ts for the signed-cookie format.
import { and, eq, isNull, ne } from 'drizzle-orm';

import type { Role } from '@/platform/actions';
import { lookupSessionForAuth, withTenantOnlyContext, type ScopedDb } from '@/platform/db';
import { sessions, userRoles, users } from '@/modules/identity/schema';
import { signSessionCookie, verifySessionCookie } from './cookie';

// Fixed-length absolute session lifetime (no sliding renewal) — simple, and short
// enough for an HRIS handling salary/bank data. Revocation (deactivation, explicit
// revoke) takes effect immediately regardless of this TTL — see resolveSessionFromCookie.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface ResolvedSession {
  tenantId: string;
  companyId: string;
  userId: string;
  /** From `users.employee_id` (slice 04 self-service link); null until an ADMIN links
   * the account via `employee.linkUserAccount`. */
  employeeId: string | null;
  roles: Role[];
  sessionId: string;
}

/**
 * Resolves the signed session cookie into a verified session, or `null` if the cookie
 * is absent, tampered with, expired, revoked, or its user is no longer active. This is
 * the ONLY place a `ResolvedSession` is constructed from request-supplied data — nothing
 * in this function trusts anything from the cookie beyond the session id it names, and
 * every field on the returned object comes from a fresh DB read, not the cookie.
 *
 * Runs on every authenticated request, so session revocation (deactivating a user,
 * `identity.revokeSessions`) takes effect on the very next call — there is no caching of
 * `status`/`revoked_at` across requests.
 */
export async function resolveSessionFromCookie(
  cookieValue: string | undefined | null,
): Promise<ResolvedSession | null> {
  const sessionId = verifySessionCookie(cookieValue);
  if (!sessionId) return null;

  const [sessionRow] = await lookupSessionForAuth(sessionId);
  if (!sessionRow) return null;
  if (sessionRow.revokedAt) return null;
  if (sessionRow.expiresAt.getTime() <= Date.now()) return null;

  return withTenantOnlyContext(sessionRow.tenantId, async (tenantDb) => {
    const [user] = await tenantDb.select().from(users).where(eq(users.id, sessionRow.userId)).limit(1);
    if (!user || user.status !== 'ACTIVE') return null;

    const roleRows = await tenantDb
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    return {
      tenantId: sessionRow.tenantId,
      companyId: user.companyId,
      userId: user.id,
      employeeId: user.employeeId,
      roles: roleRows.map((row) => row.role as Role),
      sessionId: sessionRow.id,
    };
  });
}

export interface CreateSessionParams {
  tenantId: string;
  userId: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

/**
 * Inserts a new session row and returns the raw cookie value for the caller (identity.login)
 * to hand back via `ctx.setSessionCookie`. Must be called with a `db` already scoped to
 * the session's tenant (identity.login opens its own `withTenantContext` once the tenant
 * is resolved — see src/modules/identity/actions/login.ts).
 */
export async function createSession(
  tenantDb: ScopedDb,
  params: CreateSessionParams,
): Promise<{ sessionId: string; cookieValue: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [row] = await tenantDb
    .insert(sessions)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      expiresAt,
      ipHash: params.ipHash,
      userAgentHash: params.userAgentHash,
    })
    .returning({ id: sessions.id });

  return { sessionId: row.id, cookieValue: signSessionCookie(row.id), expiresAt };
}

/** Revokes exactly one session (identity.logout: the caller's own current session). */
export async function revokeSession(tenantDb: ScopedDb, sessionId: string): Promise<void> {
  await tenantDb.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/**
 * Revokes every currently-active session for a user — used by identity.deactivateUser
 * (so a deactivated user's live session stops working on its next request, not just at
 * expiry) and identity.revokeSessions (an explicit admin "sign this user out everywhere").
 */
export async function revokeAllSessionsForUser(tenantDb: ScopedDb, userId: string): Promise<void> {
  await tenantDb
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Revokes every currently-active session for a user except one — used by
 * identity.changeOwnPassword. A successful self password change is the standard
 * "I think my account might be compromised" remediation reflex, so it should kill every
 * *other* live session (stolen-session mitigation) while keeping the caller logged in on
 * the session/browser they just used to make the change, rather than logging them out
 * with no path forward.
 */
export async function revokeOtherSessionsForUser(
  tenantDb: ScopedDb,
  userId: string,
  exceptSessionId: string,
): Promise<void> {
  await tenantDb
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId)));
}
