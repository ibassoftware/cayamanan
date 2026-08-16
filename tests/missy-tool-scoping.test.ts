import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { buildActionTools, CATALOG_FIND_TOOL_ID, resetDiscoveredToolsForTests } from '@/mastra/tools/action-tool-bridge';
import { testSession } from './helpers/session';

// The context-scoping seam: buildActionTools stays unscoped by default (every existing
// call site and test is unaffected), and only narrows the offered set when a caller
// opts in with a screenContext. Scoping is UX only — executeAction's role check, proven
// elsewhere (missy-tool-bridge.test.ts), is the real boundary regardless of what this
// file offers.
describe('Missy tool scoping', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Tool Scoping Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Tool Scoping Test Co', legalName: 'Tool Scoping Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  afterEach(() => {
    resetDiscoveredToolsForTests();
    delete process.env.MISSY_TOOL_SCOPING;
  });

  it('omitting screenContext is byte-for-byte the old unscoped behaviour — no catalog.find, full role-allowed set', () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const unscoped = buildActionTools(adminSession, 'thread-no-scope');
    const explicitlyUnscoped = buildActionTools(adminSession, 'thread-no-scope-2', { unscoped: true });

    expect(Object.keys(unscoped)).not.toContain(CATALOG_FIND_TOOL_ID);
    expect(Object.keys(unscoped).sort()).toEqual(Object.keys(explicitlyUnscoped).sort());
    expect(Object.keys(unscoped)).toContain('identity.listUsers');
    expect(Object.keys(unscoped)).toContain('system.ping');
    expect(Object.keys(unscoped)).toContain('org.updateDepartment');
  });

  it('scoping to the employees module offers employee + org tools, the always-on core, and catalog.find — not identity/system', () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const tools = buildActionTools(adminSession, 'thread-employees-scope', { screenContext: { module: 'employees' } });
    const names = Object.keys(tools);

    // Module tools.
    expect(names).toContain('employee.list');
    expect(names).toContain('employee.create');
    expect(names).toContain('org.updateDepartment');
    // Always-on core.
    expect(names).toContain('identity.me');
    expect(names).toContain('ui.navigate');
    expect(names).toContain('ui.openRecord');
    // The escape hatch.
    expect(names).toContain(CATALOG_FIND_TOOL_ID);
    // Off-module.
    expect(names).not.toContain('identity.listUsers');
    expect(names).not.toContain('system.ping');
    expect(names).not.toContain('system.updateSetting');
  });

  it('scoping to an unknown/future module offers only the always-on core and catalog.find', () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const tools = buildActionTools(adminSession, 'thread-unknown-scope', { screenContext: { module: 'payroll' } });
    const names = Object.keys(tools).sort();

    expect(names).toEqual(['catalog.find', 'identity.me', 'ui.navigate', 'ui.openRecord'].sort());
  });

  it('MISSY_TOOL_SCOPING=unscoped overrides a supplied screenContext back to the full list', () => {
    process.env.MISSY_TOOL_SCOPING = 'unscoped';
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const tools = buildActionTools(adminSession, 'thread-env-override', { screenContext: { module: 'employees' } });

    expect(Object.keys(tools)).not.toContain(CATALOG_FIND_TOOL_ID);
    expect(Object.keys(tools)).toContain('identity.listUsers');
  });

  it('catalog.find finds an off-module action by keyword and never executes it itself', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const threadId = 'thread-catalog-find';

    const tools = buildActionTools(adminSession, threadId, { screenContext: { module: 'employees' } });
    const catalogTool = tools[CATALOG_FIND_TOOL_ID];
    expect(catalogTool?.execute).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (catalogTool!.execute as any)({ query: 'list user accounts' }, {});
    expect(result.status).toBe('ok');
    const matchIds = (result.data.matches as Array<{ id: string }>).map((m) => m.id);
    expect(matchIds).toContain('identity.listUsers');
    // Metadata only — a schema, never a real result.
    const listUsersMatch = (result.data.matches as Array<{ id: string; inputSchema: unknown }>).find(
      (m) => m.id === 'identity.listUsers',
    );
    expect(listUsersMatch?.inputSchema).toBeTruthy();
  });

  it('a catalog.find match becomes a real, callable tool on the next buildActionTools call for the same thread', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const threadId = 'thread-catalog-widen';

    const firstTurnTools = buildActionTools(adminSession, threadId, { screenContext: { module: 'employees' } });
    expect(Object.keys(firstTurnTools)).not.toContain('identity.listUsers');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discovery = await (firstTurnTools[CATALOG_FIND_TOOL_ID]!.execute as any)({ query: 'list user accounts' }, {});
    expect(discovery.status).toBe('ok');

    // Still on /app/employees (same module) — but now includes the discovered tool.
    const secondTurnTools = buildActionTools(adminSession, threadId, { screenContext: { module: 'employees' } });
    expect(Object.keys(secondTurnTools)).toContain('identity.listUsers');

    // Not just present — a real, executable tool wired to the actual action.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const realCall = await (secondTurnTools['identity.listUsers']!.execute as any)({}, {});
    expect(realCall.status).toBe('ok');
  });

  it('a tool discovered on one thread does not leak into a different thread', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const toolsA = buildActionTools(adminSession, 'thread-isolated-a', { screenContext: { module: 'employees' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (toolsA[CATALOG_FIND_TOOL_ID]!.execute as any)({ query: 'list user accounts' }, {});

    const toolsB = buildActionTools(adminSession, 'thread-isolated-b', { screenContext: { module: 'employees' } });
    expect(Object.keys(toolsB)).not.toContain('identity.listUsers');
  });

  it('an EMPLOYEE never sees identity.listUsers via catalog.find either — role filtering happens before scoping', async () => {
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
    const threadId = 'thread-employee-catalog';

    const tools = buildActionTools(employeeSession, threadId, { screenContext: { module: 'employees' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tools[CATALOG_FIND_TOOL_ID]!.execute as any)({ query: 'list user accounts' }, {});
    const matchIds = (result.data.matches as Array<{ id: string }>).map((m) => m.id);
    expect(matchIds).not.toContain('identity.listUsers');

    // A tool never offered — whether via scoping or role filtering — is still a real
    // FORBIDDEN at the action layer, exactly as criterion 6 requires.
    const direct = await executeAction('identity.listUsers', {}, { session: employeeSession });
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.error.code).toBe('FORBIDDEN');
  });

  it('a scoped-out tool an ADMIN is otherwise allowed to use still executes directly — scoping never widens or narrows authorization', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const tools = buildActionTools(adminSession, 'thread-scoped-out-but-allowed', { screenContext: { module: 'me' } });
    expect(Object.keys(tools)).not.toContain('org.listDepartments');

    const direct = await executeAction('org.listDepartments', {}, { session: adminSession });
    expect(direct.ok).toBe(true);
  });
});
