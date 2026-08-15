import type { Role, VerifiedSession } from '@/platform/actions';

// Test-only construction of a `VerifiedSession` — the same level of trust tests already
// extend to `getBootstrapDb()` directly. No HTTP-reachable code path can build one of
// these; only `resolveSessionFromCookie` (src/modules/identity/service/session.ts) does,
// from a real verified cookie.
export function testSession(
  tenantId: string,
  companyId: string,
  overrides: Partial<Omit<VerifiedSession, 'tenantId' | 'companyId'>> = {},
): VerifiedSession {
  return {
    tenantId,
    companyId,
    userId: overrides.userId ?? crypto.randomUUID(),
    employeeId: overrides.employeeId ?? null,
    roles: overrides.roles ?? (['ADMIN'] as Role[]),
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
  };
}
