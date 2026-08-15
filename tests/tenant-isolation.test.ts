import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { companies, tenants } from '@/modules/org/schema';
import { getBootstrapDb, withTenantContext } from '@/platform/db';

// Proves RLS + withTenantContext actually isolate tenants at the DB layer — not just in
// application code. Runs against TEST_DATABASE_URL / TEST_APP_DATABASE_URL (see
// vitest.setup.ts), never the dev database.
describe('cross-tenant isolation', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length === 0) return;
    const db = getBootstrapDb();
    for (const tenantId of createdTenantIds) {
      await db.delete(companies).where(eq(companies.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  async function createTenantWithCompany(name: string) {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name, status: 'active' }).returning();
    createdTenantIds.push(tenant.id);
    const [company] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: `${name} Co`, legalName: `${name} Co Legal` })
      .returning();
    return { tenant, company };
  }

  it('tenant A cannot read tenant B rows through withTenantContext', async () => {
    const a = await createTenantWithCompany('Isolation Test Tenant A');
    const b = await createTenantWithCompany('Isolation Test Tenant B');

    const rowsVisibleToA = await withTenantContext(
      { tenantId: a.tenant.id, companyId: a.company.id },
      async (db) => db.select().from(tenants),
    );

    expect(rowsVisibleToA).toHaveLength(1);
    expect(rowsVisibleToA[0]?.id).toBe(a.tenant.id);
    expect(rowsVisibleToA.some((row) => row.id === b.tenant.id)).toBe(false);

    const companiesVisibleToA = await withTenantContext(
      { tenantId: a.tenant.id, companyId: a.company.id },
      async (db) => db.select().from(companies),
    );
    expect(companiesVisibleToA).toHaveLength(1);
    expect(companiesVisibleToA[0]?.id).toBe(a.company.id);
    expect(companiesVisibleToA.some((row) => row.id === b.company.id)).toBe(false);
  });

  it('the tenant context does not leak across transactions', async () => {
    const a = await createTenantWithCompany('Isolation Test Tenant C');
    const b = await createTenantWithCompany('Isolation Test Tenant D');

    const rowsForB = await withTenantContext(
      { tenantId: b.tenant.id, companyId: b.company.id },
      async (db) => db.select().from(tenants),
    );
    expect(rowsForB.map((row) => row.id)).toEqual([b.tenant.id]);

    // A fresh call scoped to A must not see B's row (and vice versa was proved above) —
    // confirms `set_config(..., is_local = true)` doesn't bleed into the next transaction.
    const rowsForA = await withTenantContext(
      { tenantId: a.tenant.id, companyId: a.company.id },
      async (db) => db.select().from(tenants),
    );
    expect(rowsForA.map((row) => row.id)).toEqual([a.tenant.id]);
  });
});
