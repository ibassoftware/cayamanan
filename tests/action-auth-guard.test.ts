import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/system/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

// Proves the fail-closed guard in executeAction(): a non-anonymous action always
// requires a verified session — there is no NODE_ENV/env-flag bypass (the slice-01
// placeholder ALLOW_UNAUTHENTICATED_ACTIONS/development guard has been retired now that
// real sessions exist — see docs/plan/02-identity-auth.md "Slice-01 debt"). The only
// action that runs with no session is the anonymous `identity.login`.
describe('executeAction requires a verified session for non-anonymous actions', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Auth Guard Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Auth Guard Test Co', legalName: 'Auth Guard Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('refuses a call with no session at all', async () => {
    const result = await executeAction('system.ping', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('refuses a call with session explicitly null', async () => {
    const result = await executeAction('system.ping', {}, { session: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('allows a call with a verified session, scoped to that session tenant/company', async () => {
    const result = await executeAction(
      'system.ping',
      {},
      { session: testSession(tenantId, companyId, { roles: ['EMPLOYEE'] }) },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { tenantId: string; companyId: string }).tenantId).toBe(tenantId);
      expect((result.data as { tenantId: string; companyId: string }).companyId).toBe(companyId);
    }
  });

  it('a session whose roles do not intersect the action roles gets FORBIDDEN, not UNAUTHORIZED', async () => {
    // system.getSettings is ADMIN-only.
    const result = await executeAction(
      'system.getSettings',
      {},
      { session: testSession(tenantId, companyId, { roles: ['EMPLOYEE'] }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });
});
