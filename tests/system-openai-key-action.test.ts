import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/system/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { auditLogs } from '@/platform/schema/audit';
import { getBootstrapDb } from '@/platform/db';
import { resolveOpenAiKey } from '@/modules/system/service/resolve-openai-key';
import { testSession } from './helpers/session';
import { cleanupTenant } from './helpers/cleanup';

// Exercises system.setOpenAiKey / system.getOpenAiKeyStatus through the real action
// registry: role enforcement, the masked confirmation preview, that only `last4` (never
// ciphertext or plaintext) ever reaches audit_logs, that the generic settings actions
// can't see or overwrite this key, and that resolveOpenAiKey (the server-internal
// decrypt path) round-trips correctly and stays tenant/company-scoped.
describe('system.setOpenAiKey / system.getOpenAiKeyStatus', () => {
  let tenantId: string;
  let companyId: string;
  let otherCompanyId: string;
  let adminSession: ReturnType<typeof testSession>;
  let hrSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'OpenAI Key Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'OpenAI Key Test Co', legalName: 'OpenAI Key Test Co Legal' })
      .returning();
    companyId = company.id;
    const [otherCompany] = await db
      .insert(companies)
      .values({ tenantId, name: 'OpenAI Key Test Co 2', legalName: 'OpenAI Key Test Co 2 Legal' })
      .returning();
    otherCompanyId = otherCompany.id;

    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
  });

  afterAll(async () => {
    await cleanupTenant(tenantId);
  });

  async function auditCountFor(actionId: string) {
    const db = getBootstrapDb();
    const [row] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, actionId)));
    return row?.n ?? 0;
  }

  it('a non-admin cannot set the key', async () => {
    const result = await executeAction('system.setOpenAiKey', { apiKey: 'sk-hr-attempt-0000' }, { session: hrSession });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('rejects an obviously-too-short input', async () => {
    const result = await executeAction('system.setOpenAiKey', { apiKey: 'short' }, { session: adminSession });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('status reports none configured before any key is set (env fallback aside)', async () => {
    const result = await executeAction('system.getOpenAiKeyStatus', {}, { session: adminSession });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { configured: boolean; last4: string | null; source: string };
      // Whether this reports 'env'/'none' depends on whether OPENAI_API_KEY happens to be
      // set in the environment running the suite — either way it must never claim 'settings'
      // before system.setOpenAiKey has ever run for this company.
      expect(data.source).not.toBe('settings');
    }
  });

  it('sets the key, returns only last4, and audits only the masked value', async () => {
    const before = await auditCountFor('system.setOpenAiKey');

    const result = await executeAction(
      'system.setOpenAiKey',
      { apiKey: 'sk-test-abcdefghijklmnop1234' },
      { session: adminSession },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ configured: true, last4: '1234' });
    }

    expect(await auditCountFor('system.setOpenAiKey')).toBe(before + 1);

    const db = getBootstrapDb();
    const [row] = await db
      .select({ before: auditLogs.before, after: auditLogs.after })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, 'system.setOpenAiKey')))
      .orderBy(auditLogs.occurredAt);

    const auditPayload = JSON.stringify(row);
    expect(auditPayload).not.toContain('sk-test-abcdefghijklmnop1234');
    expect(row?.after).toEqual({ last4: '1234' });
  });

  it('status now reports configured from settings with the masked last4', async () => {
    const result = await executeAction('system.getOpenAiKeyStatus', {}, { session: adminSession });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ configured: true, last4: '1234', source: 'settings' });
    }
  });

  it('a second set closes the old row and audits the previous last4 as before, never the ciphertext', async () => {
    const result = await executeAction(
      'system.setOpenAiKey',
      { apiKey: 'sk-test-zzzzzzzzzzzzzzzz5678' },
      { session: adminSession },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ configured: true, last4: '5678' });
    }

    const db = getBootstrapDb();
    const rows = await db
      .select({ before: auditLogs.before, after: auditLogs.after })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, 'system.setOpenAiKey')))
      .orderBy(auditLogs.occurredAt);
    const latest = rows.at(-1);
    expect(latest?.before).toEqual({ last4: '1234' });
    expect(latest?.after).toEqual({ last4: '5678' });
  });

  it('resolveOpenAiKey decrypts the stored key for this company', async () => {
    const key = await resolveOpenAiKey({ tenantId, companyId });
    expect(key).toBe('sk-test-zzzzzzzzzzzzzzzz5678');
  });

  it('resolveOpenAiKey does not leak the key across companies in the same tenant', async () => {
    const key = await resolveOpenAiKey({ tenantId, companyId: otherCompanyId });
    expect(key).not.toBe('sk-test-zzzzzzzzzzzzzzzz5678');
  });

  it('the generic settings actions never see or accept the reserved key', async () => {
    const settings = await executeAction('system.getSettings', {}, { session: adminSession });
    expect(settings.ok).toBe(true);
    if (settings.ok) {
      const data = settings.data as { settings: Array<{ key: string }> };
      expect(data.settings.some((s) => s.key === 'ai.openaiApiKey')).toBe(false);
    }

    const bypassAttempt = await executeAction(
      'system.updateSetting',
      { key: 'ai.openaiApiKey', value: { ciphertext: 'not-really-encrypted', last4: '0000' } },
      { session: adminSession },
    );
    expect(bypassAttempt.ok).toBe(false);
    if (!bypassAttempt.ok) {
      expect(bypassAttempt.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('setOpenAiKey is not one of Missy\'s tools', async () => {
    const { listActions } = await import('@/platform/actions');
    const action = listActions().find((a) => a.id === 'system.setOpenAiKey');
    expect(action?.toolExposed).toBe(false);
  });
});
