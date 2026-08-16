// Public `service/` export (00-overview.md §4.1) — the ONLY way the `employee` module is
// allowed to touch `users.employee_id`. `employee.linkUserAccount` (src/modules/employee/
// actions/link-user-account.ts) imports these functions instead of `users` from
// `@/modules/identity/schema` directly, keeping the "a module never imports another
// module's schema.ts" boundary intact while still letting the two modules cooperate.
import { and, eq } from 'drizzle-orm';

import type { ScopedDb } from '@/platform/db';
import { users } from '../schema';

export interface LinkableUser {
  id: string;
  email: string;
  employeeId: string | null;
}

/** Looks up a user by id, scoped to tenant+company (`users` has no company_id RLS predicate). */
export async function findUserForLink(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  userId: string,
): Promise<LinkableUser | null> {
  const [user] = await tenantDb
    .select({ id: users.id, email: users.email, employeeId: users.employeeId })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), eq(users.companyId, companyId)))
    .limit(1);
  return user ?? null;
}

/** Looks up a user by normalized email, scoped to tenant+company — used to resolve
 * "link Maria's account to user maria@..." without the caller having to already know
 * the user's id. */
export async function findUserByEmailForLink(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  email: string,
): Promise<LinkableUser | null> {
  const [user] = await tenantDb
    .select({ id: users.id, email: users.email, employeeId: users.employeeId })
    .from(users)
    .where(and(eq(users.email, email), eq(users.tenantId, tenantId), eq(users.companyId, companyId)))
    .limit(1);
  return user ?? null;
}

/** Finds the user (if any) currently linked to `employeeId` — used to reject linking an
 * employee that's already linked to a *different* user before touching anything. */
export async function findUserLinkedToEmployee(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  employeeId: string,
): Promise<LinkableUser | null> {
  const [user] = await tenantDb
    .select({ id: users.id, email: users.email, employeeId: users.employeeId })
    .from(users)
    .where(and(eq(users.employeeId, employeeId), eq(users.tenantId, tenantId), eq(users.companyId, companyId)))
    .limit(1);
  return user ?? null;
}

export async function setUserEmployeeId(tenantDb: ScopedDb, userId: string, employeeId: string): Promise<void> {
  await tenantDb.update(users).set({ employeeId }).where(eq(users.id, userId));
}
