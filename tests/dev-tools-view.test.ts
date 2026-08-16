import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { getBootstrapDb } from '@/platform/db';
import { buildDevToolsData } from '@/app/dev/tools/build-view';
import { testSession } from './helpers/session';

// Covers the data-assembly logic behind the dev-only "tools available to me" panel
// (docs/plan/03-missy-foundation.md). This is not testing buildActionTools itself
// (tests/missy-tool-bridge.test.ts / tests/missy-tool-payload.test.ts already do) — it's
// testing that the panel's own view-building (role narrowing shows up, scoping can be
// previewed regardless of the env pin, the env var is left exactly as found) behaves.
describe('dev tools panel — buildDevToolsData', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Dev Tools Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Dev Tools Test Co', legalName: 'Dev Tools Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('an Employee resolves to visibly fewer tools than an Admin, unscoped', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const adminData = await buildDevToolsData(adminSession);
    const employeeData = await buildDevToolsData(employeeSession);

    expect(employeeData.unscoped.toolCount).toBeLessThan(adminData.unscoped.toolCount);

    const employeeToolIds = employeeData.unscoped.modules.flatMap((group) => group.tools.map((tool) => tool.id));
    expect(employeeToolIds).not.toContain('identity.setUserRoles');
    expect(employeeToolIds).not.toContain('identity.createUser');
  });

  it('previews the scoped view even while MISSY_TOOL_SCOPING is pinned to unscoped, and restores the env var', async () => {
    vi.stubEnv('MISSY_TOOL_SCOPING', 'unscoped');

    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const data = await buildDevToolsData(adminSession);

    expect(data.envScoping).toBe('unscoped');
    const settingsView = data.scopedByModule.settings;
    expect(settingsView).toBeDefined();
    expect(settingsView.toolCount).toBeLessThan(data.unscoped.toolCount);
    expect(settingsView.payloadChars).toBeLessThan(data.unscoped.payloadChars);

    // The scoped-preview mechanism must not leak its temporary override back out.
    expect(process.env.MISSY_TOOL_SCOPING).toBe('unscoped');

    vi.unstubAllEnvs();
  });

  it('groups tools by module and renders each field with a name, type and required flag', async () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const data = await buildDevToolsData(adminSession);

    const orgGroup = data.unscoped.modules.find((group) => group.module === 'org');
    expect(orgGroup).toBeDefined();
    expect(orgGroup!.tools.length).toBeGreaterThan(0);

    const createDepartment = orgGroup!.tools.find((tool) => tool.id === 'org.createDepartment');
    expect(createDepartment).toBeDefined();
    const nameField = createDepartment!.fields.find((field) => field.name === 'name');
    expect(nameField).toMatchObject({ name: 'name', required: true });
    expect(nameField!.type.length).toBeGreaterThan(0);
  });
});
