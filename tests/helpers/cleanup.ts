import { eq } from 'drizzle-orm';

import { companies, tenants } from '@/modules/org/schema';
import { sessions, userRoles, users } from '@/modules/identity/schema';
import { getBootstrapDb } from '@/platform/db';

// identity's tables deliberately carry no FK to org.tenants/org.companies (see
// src/modules/identity/schema.ts — same reasoning as audit_logs/system_settings: a
// module may never import another module's schema.ts). So deleting a tenant does NOT
// cascade to its users/sessions/user_roles — tests that seed users under a throwaway
// tenant must clean those up explicitly, in FK order, or they leak across test runs
// (and can make a later test's "exactly one user for this email" lookup ambiguous).
export async function cleanupTenant(tenantId: string): Promise<void> {
  const db = getBootstrapDb();
  const tenantUsers = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId));
  const userIds = tenantUsers.map((u) => u.id);

  if (userIds.length > 0) {
    for (const userId of userIds) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(userRoles).where(eq(userRoles.userId, userId));
    }
    await db.delete(users).where(eq(users.tenantId, tenantId));
  }

  await db.delete(companies).where(eq(companies.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
