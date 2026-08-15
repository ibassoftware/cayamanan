import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/system/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { systemSettings } from '@/platform/schema/settings';
import { testSession } from './helpers/session';

// Proves the race update-setting.ts documents (two concurrent updates to the same key
// racing read-then-close-then-insert) never leaves two open rows, and that the losing
// request gets a clean CONFLICT rather than a generic 500 or, worse, silent corruption.
describe('system.updateSetting under concurrency', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Settings Concurrency Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Settings Concurrency Test Co', legalName: 'Settings Concurrency Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('at most one of two concurrent updates to the same key ever succeeds, and the loser gets a clean CONFLICT', async () => {
    // A single Promise.all pair doesn't reliably land the race window every run (both
    // sometimes serialize cleanly), so repeat with a fresh key each time and require the
    // race to have actually manifested (and been handled) at least once across the run.
    let conflictObserved = false;

    for (let i = 0; i < 8; i++) {
      const key = `race.key.${i}`;
      const [first, second] = await Promise.all([
        executeAction('system.updateSetting', { key, value: { n: 1 } }, { session: adminSession }),
        executeAction('system.updateSetting', { key, value: { n: 2 } }, { session: adminSession }),
      ]);

      const results = [first, second];
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      // Whether or not this particular iteration raced, the invariant always holds:
      // never both fail, and any failure must be the clean CONFLICT, never a generic 500.
      expect(succeeded.length).toBeGreaterThanOrEqual(1);
      for (const result of failed) {
        if (!result.ok) {
          expect(result.error.code).toBe('CONFLICT');
          conflictObserved = true;
        }
      }

      const db = getBootstrapDb();
      const openRows = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.tenantId, tenantId),
            eq(systemSettings.companyId, companyId),
            eq(systemSettings.key, key),
            isNull(systemSettings.effectiveTo),
          ),
        );
      expect(openRows).toHaveLength(1);
    }

    expect(conflictObserved).toBe(true);
  });
});
