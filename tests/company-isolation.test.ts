import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { companies, tenants } from '@/modules/org/schema';
import { systemSettings } from '@/platform/schema/settings';
import { getBootstrapDb, withTenantContext } from '@/platform/db';

// Proves the company_isolation RLS policy (drizzle/0003_company_isolation_rls.sql)
// actually isolates companies at the DB layer — not just in application code. Runs
// against TEST_DATABASE_URL / TEST_APP_DATABASE_URL (see vitest.setup.ts), never the
// dev database. Uses two real companies under one real tenant (the dev DB only ever
// has one company, so this test creates its own second company to prove isolation
// *within* a tenant, as opposed to the pre-existing across-tenant test).
describe('company isolation (RLS)', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length === 0) return;
    const db = getBootstrapDb();
    for (const tenantId of createdTenantIds) {
      await db.delete(systemSettings).where(eq(systemSettings.tenantId, tenantId));
      await db.delete(companies).where(eq(companies.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  async function seedTenantWithTwoCompanies() {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Company Isolation Test Tenant', status: 'active' })
      .returning();
    createdTenantIds.push(tenant.id);

    const [companyA] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: 'Company A', legalName: 'Company A Legal' })
      .returning();
    const [companyB] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: 'Company B', legalName: 'Company B Legal' })
      .returning();

    await db.insert(systemSettings).values([
      {
        tenantId: tenant.id,
        companyId: companyA.id,
        key: 'test.setting',
        value: { owner: 'A' },
        effectiveFrom: '2020-01-01',
      },
      {
        tenantId: tenant.id,
        companyId: companyB.id,
        key: 'test.setting',
        value: { owner: 'B' },
        effectiveFrom: '2020-01-01',
      },
    ]);

    return { tenant, companyA, companyB };
  }

  it("company A's context returns zero of company B's rows within the same tenant", async () => {
    const { tenant, companyA, companyB } = await seedTenantWithTwoCompanies();

    const rowsForA = await withTenantContext(
      { tenantId: tenant.id, companyId: companyA.id },
      async (db) => db.select().from(systemSettings).where(eq(systemSettings.tenantId, tenant.id)),
    );

    expect(rowsForA).toHaveLength(1);
    expect(rowsForA[0]?.companyId).toBe(companyA.id);
    expect(rowsForA.some((row) => row.companyId === companyB.id)).toBe(false);
  });

  it('an unset company context yields zero rows (fail-closed), even with the tenant set', async () => {
    const { tenant } = await seedTenantWithTwoCompanies();

    // Deliberately bypasses withTenantContext (which always sets app.company_id) to
    // exercise the case that matters: a query that runs as cayamanan_app with the
    // tenant set but no company context at all. RLS must yield zero rows, not an error
    // and not every row in the tenant.
    const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenant.id]);
        // app.company_id and app.cross_company_reporting are intentionally left unset.
        const result = await client.query('select * from system_settings where tenant_id = $1', [
          tenant.id,
        ]);
        expect(result.rows).toHaveLength(0);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('the cross_company_reporting escape hatch is opt-in and must be requested explicitly', async () => {
    const { tenant, companyA, companyB } = await seedTenantWithTwoCompanies();

    // Not requested: still confined to company A, proving the escape hatch defaults off.
    const scopedRows = await withTenantContext(
      { tenantId: tenant.id, companyId: companyA.id },
      async (db) => db.select().from(systemSettings).where(eq(systemSettings.tenantId, tenant.id)),
    );
    expect(scopedRows).toHaveLength(1);

    // Explicitly requested: now sees every company's rows in the tenant.
    const crossCompanyRows = await withTenantContext(
      { tenantId: tenant.id, companyId: companyA.id },
      async (db) => db.select().from(systemSettings).where(eq(systemSettings.tenantId, tenant.id)),
      { crossCompanyReporting: true },
    );
    expect(crossCompanyRows).toHaveLength(2);
    const companyIds = crossCompanyRows.map((row) => row.companyId).sort();
    expect(companyIds).toEqual([companyA.id, companyB.id].sort());
  });
});
