import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { buildActionTools } from '@/mastra/tools/action-tool-bridge';
import { testSession } from './helpers/session';

// Proves 03-missy-foundation.md criterion 3 (tool list differs by role) and criterion 6
// (a real FORBIDDEN from the action layer, not a prompt-level refusal) — the tool
// bridge's own role filter is a UX affordance, never the security boundary: every tool's
// execute() calls the same executeAction() the /api/actions route calls, which
// re-validates roles regardless of whether the tool was ever offered.
describe('Missy action-tool bridge', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Tool Bridge Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Tool Bridge Test Co', legalName: 'Tool Bridge Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('the tool list is shorter for an Employee than for an Admin (criterion 3)', () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const adminTools = buildActionTools(adminSession, 'thread-admin');
    const employeeTools = buildActionTools(employeeSession, 'thread-employee');

    expect(Object.keys(adminTools).length).toBeGreaterThan(Object.keys(employeeTools).length);
    expect(Object.keys(adminTools)).toContain('identity.listUsers');
    expect(Object.keys(employeeTools)).not.toContain('identity.listUsers');
  });

  it('system.ping is exposed to every role — proves the bridge itself works', () => {
    for (const roles of [['ADMIN'], ['HR_PAYROLL'], ['EMPLOYEE']] as const) {
      const session = testSession(tenantId, companyId, { roles: [...roles] });
      const tools = buildActionTools(session, 'thread-ping');
      expect(Object.keys(tools)).toContain('system.ping');
    }
  });

  it('an Employee calling identity.listUsers directly at the action layer gets a real FORBIDDEN, not just "no tool"', async () => {
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    // Reflects exactly what the model would trigger *if* it somehow called this tool
    // (e.g. a misconfigured exposure, or a compromised client bypassing the chat UI
    // entirely and hitting the action route directly) — the tool's own execute() is a
    // thin wrapper around this same call (src/mastra/tools/action-tool-bridge.ts).
    const result = await executeAction('identity.listUsers', {}, { session: employeeSession });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it("an ordinary tool's execute() returns status 'ok' with the real action output, verbatim", async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const tools = buildActionTools(adminSession, 'thread-ordinary');
    const pingTool = tools['system.ping'];
    expect(pingTool?.execute).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra's Tool.execute signature varies by generic instantiation.
    const result = await (pingTool!.execute as any)({}, {});

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ tenantId, companyId });
  });

  it("a high-risk tool's execute() returns status 'confirmation_required' instead of applying the change", async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const tools = buildActionTools(adminSession, 'thread-high-risk');
    const updateSettingTool = tools['system.updateSetting'];
    expect(updateSettingTool?.execute).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (updateSettingTool!.execute as any)(
      { key: 'test.bridgeKey', value: { mode: 'X' } },
      {},
    );

    expect(result.status).toBe('confirmation_required');
    expect(result.confirmationId).toEqual(expect.any(String));
    expect(result.token).toEqual(expect.any(String));
    expect(result.preview).toEqual({ key: 'test.bridgeKey', value: { mode: 'X' }, effectiveFrom: null });

    // The setting must NOT have actually been created yet — proposing is not executing.
    const settings = await executeAction('system.getSettings', {}, { session: adminSession });
    expect(settings.ok).toBe(true);
    if (settings.ok) {
      expect((settings.data as { settings: unknown[] }).settings).toEqual([]);
    }
  });
});
