import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { companies, tenants } from '@/modules/org/schema';
import { getBootstrapDb } from '@/platform/db';
import { systemSettings } from '@/platform/schema/settings';

// Proves the DB-layer invariant src/platform/effective.ts documents for system_settings
// — at most one open (effective_to IS NULL) row per (tenant_id, company_id, key) — is
// actually enforced, not just documented. See
// drizzle/0002_system_settings_open_row_unique.sql.
describe('system_settings open-row uniqueness is enforced by the database', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Open Row Constraint Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Open Row Constraint Test Co', legalName: 'Open Row Constraint Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db
      .delete(systemSettings)
      .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.companyId, companyId)));
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('rejects a second open row for the same (tenant, company, key)', async () => {
    const db = getBootstrapDb();
    await db.insert(systemSettings).values({
      tenantId,
      companyId,
      key: 'payroll.roundingPolicy',
      value: { mode: 'HALF_UP' },
      effectiveFrom: '2026-01-01',
    });

    let caught: unknown;
    try {
      await db.insert(systemSettings).values({
        tenantId,
        companyId,
        key: 'payroll.roundingPolicy',
        value: { mode: 'HALF_DOWN' },
        effectiveFrom: '2026-01-02',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    const cause = (caught as { cause?: { code?: string; constraint?: string } }).cause;
    expect(cause?.code).toBe('23505');
    expect(cause?.constraint).toBe('system_settings_open_row_uidx');
  });

  it('still allows a second row for the same key once the first is closed', async () => {
    const db = getBootstrapDb();
    await db
      .update(systemSettings)
      .set({ effectiveTo: '2026-01-02' })
      .where(
        and(
          eq(systemSettings.tenantId, tenantId),
          eq(systemSettings.companyId, companyId),
          eq(systemSettings.key, 'payroll.roundingPolicy'),
        ),
      );

    await expect(
      db.insert(systemSettings).values({
        tenantId,
        companyId,
        key: 'payroll.roundingPolicy',
        value: { mode: 'HALF_DOWN' },
        effectiveFrom: '2026-01-02',
      }),
    ).resolves.toBeDefined();
  });
});
