import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { companies, tenants } from '@/modules/org/schema';
import { defineAction, executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { auditLogs } from '@/platform/schema/audit';
import { testSession } from './helpers/session';

// Proves ctx.audit() may only be called once per action: a second call must fail the
// whole action (and roll back the transaction), not silently keep only the last entry
// and understate what changed in the authoritative audit table.
describe('ctx.audit() throws on a second call within the same action', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Audit Single-Call Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({
        tenantId,
        name: 'Audit Single-Call Test Co',
        legalName: 'Audit Single-Call Test Co Legal',
      })
      .returning();
    companyId = company.id;

    defineAction({
      id: 'test.auditsTwice',
      title: 'Test: calls ctx.audit() twice',
      input: z.object({}).strict(),
      output: z.object({}),
      read: false,
      risk: 'high',
      roles: ['ADMIN'],
      scope: 'company',
      async handler(_input, ctx) {
        ctx.audit({ entityType: 'test', entityId: null, before: null, after: { n: 1 } });
        ctx.audit({ entityType: 'test', entityId: null, before: null, after: { n: 2 } });
        return {};
      },
    });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('fails the action and writes no audit row, instead of overwriting the first entry', async () => {
    const result = await executeAction('test.auditsTwice', {}, { session: testSession(tenantId, companyId) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }

    const db = getBootstrapDb();
    const [row] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, 'test.auditsTwice')));
    expect(row?.n ?? 0).toBe(0);
  });
});
