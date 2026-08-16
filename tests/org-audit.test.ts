import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { auditLogs } from '@/platform/schema/audit';
import { testSession } from './helpers/session';

// Proves the org reference-data mutations (departments/positions/locations/cost centers
// — 04-organization-employees.md) each leave exactly one ordinary-risk audit row with
// before/after limited to the fields actually supplied, and that list* reads leave none.
describe('org reference-data audit trail', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Org Audit Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Org Audit Test Co', legalName: 'Org Audit Test Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  async function auditRowsFor(actionId: string, entityId: string) {
    const db = getBootstrapDb();
    return db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, actionId), eq(auditLogs.entityId, entityId)));
  }

  it('writes exactly one audit row for a department create, rename and archive, before/after limited to supplied fields', async () => {
    const created = await executeAction(
      'org.createDepartment',
      { code: 'AUD-FIN', name: 'Finance' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    const createRows = await auditRowsFor('org.createDepartment', id);
    expect(createRows).toHaveLength(1);
    expect(createRows[0].before).toEqual({});
    expect(createRows[0].after).toEqual({ code: 'AUD-FIN', name: 'Finance' });

    const renamed = await executeAction(
      'org.updateDepartment',
      { id, name: 'Finance & Accounting' },
      { session: adminSession },
    );
    expect(renamed.ok).toBe(true);

    const renameRows = await auditRowsFor('org.updateDepartment', id);
    expect(renameRows).toHaveLength(1);
    // Only `name` was supplied — `code`/`parentId`/`isActive` must not appear, even
    // though they exist on the row.
    expect(renameRows[0].before).toEqual({ name: 'Finance' });
    expect(renameRows[0].after).toEqual({ name: 'Finance & Accounting' });

    const archived = await executeAction('org.archiveDepartment', { id }, { session: adminSession });
    expect(archived.ok).toBe(true);

    const archiveRows = await auditRowsFor('org.archiveDepartment', id);
    expect(archiveRows).toHaveLength(1);
    expect(archiveRows[0].before).toEqual({ isActive: true });
    expect(archiveRows[0].after).toEqual({ isActive: false });

    // The actual SQL row proving the question this trail exists to answer: who renamed
    // it, and from what.
    const db = getBootstrapDb();
    const [renameRow] = await db
      .select({ before: auditLogs.before, after: auditLogs.after, actorUserId: auditLogs.actorUserId })
      .from(auditLogs)
      .where(and(eq(auditLogs.actionId, 'org.updateDepartment'), eq(auditLogs.entityId, id)));
    expect(renameRow.before).toEqual({ name: 'Finance' });
    expect(renameRow.after).toEqual({ name: 'Finance & Accounting' });
  });

  it('writes exactly one audit row for a position create, update and archive', async () => {
    const created = await executeAction(
      'org.createPosition',
      { code: 'AUD-ENG1', title: 'Software Engineer' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    expect(await auditRowsFor('org.createPosition', id)).toHaveLength(1);

    const updated = await executeAction(
      'org.updatePosition',
      { id, title: 'Senior Software Engineer' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    const updateRows = await auditRowsFor('org.updatePosition', id);
    expect(updateRows).toHaveLength(1);
    expect(updateRows[0].before).toEqual({ title: 'Software Engineer' });
    expect(updateRows[0].after).toEqual({ title: 'Senior Software Engineer' });

    const archived = await executeAction('org.archivePosition', { id }, { session: adminSession });
    expect(archived.ok).toBe(true);
    const archiveRows = await auditRowsFor('org.archivePosition', id);
    expect(archiveRows).toHaveLength(1);
    expect(archiveRows[0].before).toEqual({ isActive: true });
    expect(archiveRows[0].after).toEqual({ isActive: false });
  });

  it('writes exactly one audit row for a location create, update and archive', async () => {
    const created = await executeAction(
      'org.createLocation',
      { code: 'AUD-MNL', name: 'Manila HQ' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    const createRows = await auditRowsFor('org.createLocation', id);
    expect(createRows).toHaveLength(1);
    // address/timezone were not supplied on create, so they must not appear even
    // though the row has defaulted values.
    expect(createRows[0].after).toEqual({ code: 'AUD-MNL', name: 'Manila HQ' });

    const updated = await executeAction(
      'org.updateLocation',
      { id, address: '123 Ayala Ave' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    const updateRows = await auditRowsFor('org.updateLocation', id);
    expect(updateRows).toHaveLength(1);
    expect(updateRows[0].before).toEqual({ address: null });
    expect(updateRows[0].after).toEqual({ address: '123 Ayala Ave' });

    const archived = await executeAction('org.archiveLocation', { id }, { session: adminSession });
    expect(archived.ok).toBe(true);
    expect(await auditRowsFor('org.archiveLocation', id)).toHaveLength(1);
  });

  it('writes exactly one audit row for a cost center create, update and archive', async () => {
    const created = await executeAction(
      'org.createCostCenter',
      { code: 'AUD-CC-100', name: 'Corporate' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    expect(await auditRowsFor('org.createCostCenter', id)).toHaveLength(1);

    const updated = await executeAction(
      'org.updateCostCenter',
      { id, name: 'Corporate HQ' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    const updateRows = await auditRowsFor('org.updateCostCenter', id);
    expect(updateRows).toHaveLength(1);
    expect(updateRows[0].before).toEqual({ name: 'Corporate' });
    expect(updateRows[0].after).toEqual({ name: 'Corporate HQ' });

    const archived = await executeAction('org.archiveCostCenter', { id }, { session: adminSession });
    expect(archived.ok).toBe(true);
    expect(await auditRowsFor('org.archiveCostCenter', id)).toHaveLength(1);
  });

  it('org.list* actions write zero audit rows', async () => {
    const db = getBootstrapDb();
    const before = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId));

    for (const actionId of ['org.listDepartments', 'org.listPositions', 'org.listLocations', 'org.listCostCenters']) {
      const result = await executeAction(actionId, {}, { session: adminSession });
      expect(result.ok).toBe(true);
    }

    const after = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId));
    expect(after[0].n).toBe(before[0].n);
  });
});
