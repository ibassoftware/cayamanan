import { and, count, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/system/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { auditLogs } from '@/platform/schema/audit';
import { systemSettings } from '@/platform/schema/settings';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

// Exercises system.getSettings / system.updateSetting through the real action registry
// (not the DB directly), proving: effective-dating closes the old row, exactly one
// audit_logs row is written per update, and getSettings never audits. Uses a
// test-constructed ADMIN session (see tests/helpers/session.ts) scoped to its own
// seeded tenant/company — see beforeAll/afterAll.
describe('system.getSettings / system.updateSetting', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Settings Action Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Settings Action Test Co', legalName: 'Settings Action Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  async function auditCountFor(actionId: string) {
    const db = getBootstrapDb();
    const [row] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, actionId)));
    return row?.n ?? 0;
  }

  it('getSettings returns nothing yet and writes no audit row', async () => {
    const before = await auditCountFor('system.getSettings');
    const result = await executeAction('system.getSettings', {}, { session: adminSession });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ settings: [] });
    }
    expect(await auditCountFor('system.getSettings')).toBe(before);
  });

  it('updateSetting creates a row, is visible via getSettings, and audits exactly once', async () => {
    const before = await auditCountFor('system.updateSetting');

    const created = await executeAction(
      'system.updateSetting',
      {
        key: 'payroll.roundingPolicy',
        value: { mode: 'HALF_UP' },
      },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);

    expect(await auditCountFor('system.updateSetting')).toBe(before + 1);

    const afterCreate = await executeAction('system.getSettings', {}, { session: adminSession });
    expect(afterCreate.ok).toBe(true);
    if (afterCreate.ok) {
      expect(afterCreate.data).toEqual({
        settings: [
          {
            key: 'payroll.roundingPolicy',
            value: { mode: 'HALF_UP' },
            effectiveFrom: expect.any(String),
          },
        ],
      });
    }
  });

  it('a second update closes the old row (effective_to set) and audits again, exactly once', async () => {
    const before = await auditCountFor('system.updateSetting');

    const updated = await executeAction(
      'system.updateSetting',
      {
        key: 'payroll.roundingPolicy',
        value: { mode: 'HALF_DOWN' },
      },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);

    expect(await auditCountFor('system.updateSetting')).toBe(before + 1);

    // Exactly one open (effective_to IS NULL) row for this key — the new one.
    const afterUpdate = await executeAction('system.getSettings', {}, { session: adminSession });
    expect(afterUpdate.ok).toBe(true);
    if (afterUpdate.ok) {
      expect(afterUpdate.data).toEqual({
        settings: [
          {
            key: 'payroll.roundingPolicy',
            value: { mode: 'HALF_DOWN' },
            effectiveFrom: expect.any(String),
          },
        ],
      });
    }

    // The old row is preserved with effective_to set, not deleted.
    const db = getBootstrapDb();
    const closedRows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.tenantId, tenantId),
          eq(systemSettings.key, 'payroll.roundingPolicy'),
          isNotNull(systemSettings.effectiveTo),
        ),
      );
    expect(closedRows).toHaveLength(1);
    expect(closedRows[0]?.value).toEqual({ mode: 'HALF_UP' });
  });

  it('a client-supplied tenantId in the body is ignored, not reflected', async () => {
    const result = await executeAction(
      'system.ping',
      { tenantId: '00000000-0000-0000-0000-000000000000' },
      { session: adminSession },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { tenantId: string; companyId: string };
      expect(data.tenantId).not.toBe('00000000-0000-0000-0000-000000000000');
      expect(data.tenantId).toBe(tenantId);
      expect(data.companyId).toBe(companyId);
    }
  });
});
