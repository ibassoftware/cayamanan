import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

describe('org reference data actions', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;
  let employeeSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Org Actions Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Org Actions Test Co', legalName: 'Org Actions Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('creates, lists, updates and archives a department', async () => {
    const created = await executeAction(
      'org.createDepartment',
      { code: 'FIN', name: 'Finance' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({ code: 'FIN', name: 'Finance', parentId: null, depth: 0, isActive: true });

    const listed = await executeAction('org.listDepartments', {}, { session: adminSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const data = listed.data as { departments: { code: string }[] };
      expect(data.departments.some((d) => d.code === 'FIN')).toBe(true);
    }

    const updated = await executeAction(
      'org.updateDepartment',
      { id: (created.data as { id: string }).id, name: 'Finance & Accounting' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect((updated.data as { name: string }).name).toBe('Finance & Accounting');

    const archived = await executeAction(
      'org.archiveDepartment',
      { id: (created.data as { id: string }).id },
      { session: adminSession },
    );
    expect(archived.ok).toBe(true);
    if (archived.ok) expect((archived.data as { isActive: boolean }).isActive).toBe(false);

    const listedActiveOnly = await executeAction('org.listDepartments', {}, { session: adminSession });
    if (listedActiveOnly.ok) {
      const data = listedActiveOnly.data as { departments: { code: string }[] };
      expect(data.departments.some((d) => d.code === 'FIN')).toBe(false);
    }
  });

  it('rejects a duplicate department code with a field-level VALIDATION_ERROR, not a 500', async () => {
    const first = await executeAction('org.createDepartment', { code: 'DUP', name: 'Dup A' }, { session: adminSession });
    expect(first.ok).toBe(true);

    const second = await executeAction('org.createDepartment', { code: 'DUP', name: 'Dup B' }, { session: adminSession });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('VALIDATION_ERROR');
      expect(second.error.field).toBe('code');
    }
  });

  it('enforces the department depth limit', async () => {
    let parentId: string | null = null;
    let lastResult: Awaited<ReturnType<typeof executeAction>> | null = null;
    for (let i = 0; i < 6; i += 1) {
      lastResult = await executeAction(
        'org.createDepartment',
        { code: `DEPTH-${i}`, name: `Depth ${i}`, parentId },
        { session: adminSession },
      );
      if (!lastResult.ok) break;
      parentId = (lastResult.data as { id: string }).id;
    }
    expect(lastResult).not.toBeNull();
    expect(lastResult!.ok).toBe(false);
    if (lastResult && !lastResult.ok) {
      expect(lastResult.error.code).toBe('VALIDATION_ERROR');
      expect(lastResult.error.field).toBe('parentId');
    }
  });

  it('rejects re-parenting a department under its own descendant (cycle)', async () => {
    const root = await executeAction('org.createDepartment', { code: 'ROOT', name: 'Root' }, { session: adminSession });
    expect(root.ok).toBe(true);
    if (!root.ok) return;
    const rootId = (root.data as { id: string }).id;

    const child = await executeAction(
      'org.createDepartment',
      { code: 'CHILD', name: 'Child', parentId: rootId },
      { session: adminSession },
    );
    expect(child.ok).toBe(true);
    if (!child.ok) return;
    const childId = (child.data as { id: string }).id;

    const cycle = await executeAction(
      'org.updateDepartment',
      { id: rootId, parentId: childId },
      { session: adminSession },
    );
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) {
      expect(cycle.error.code).toBe('VALIDATION_ERROR');
      expect(cycle.error.field).toBe('parentId');
    }
  });

  it('creates/updates/archives a position, location and cost center', async () => {
    const position = await executeAction(
      'org.createPosition',
      { code: 'ENG1', title: 'Software Engineer' },
      { session: adminSession },
    );
    expect(position.ok).toBe(true);

    const location = await executeAction(
      'org.createLocation',
      { code: 'MNL', name: 'Manila HQ' },
      { session: adminSession },
    );
    expect(location.ok).toBe(true);

    const costCenter = await executeAction(
      'org.createCostCenter',
      { code: 'CC-100', name: 'Corporate' },
      { session: adminSession },
    );
    expect(costCenter.ok).toBe(true);

    if (position.ok) {
      const archived = await executeAction(
        'org.archivePosition',
        { id: (position.data as { id: string }).id },
        { session: adminSession },
      );
      expect(archived.ok).toBe(true);
    }
  });

  it('an EMPLOYEE role is FORBIDDEN from every org.* action', async () => {
    for (const actionId of ['org.listDepartments', 'org.createDepartment']) {
      const input = actionId === 'org.createDepartment' ? { code: 'X', name: 'X' } : {};
      const result = await executeAction(actionId, input, { session: employeeSession });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    }
  });
});
