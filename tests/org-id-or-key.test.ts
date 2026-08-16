import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import { companies, positions, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { auditLogs } from '@/platform/schema/audit';
import { testSession } from './helpers/session';

// Proves the "identify org reference data by its code instead of a UUID" fix
// (src/platform/id-or-key.ts, consumed by src/modules/org/actions/*.ts) — the reported
// bug being: Missy retyping a UUID transposes a hex pair and gets a plain NOT_FOUND. A
// short `code` (already UNIQUE per tenant+company at the DB level — see
// drizzle/0006_organization_employee_master_data.sql) transcribes reliably instead.
describe('org id-or-code selector', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Org Id-Or-Code Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Org Id-Or-Code Test Co', legalName: 'Org Id-Or-Code Test Co Legal' })
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
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, actionId), eq(auditLogs.entityId, entityId)))
      .orderBy(auditLogs.occurredAt);
  }

  // --- The reported scenario, reproduced end to end -------------------------------
  it('reproduces the reported bug scenario: renames HR-MGR by code, then restores the original title', async () => {
    const created = await executeAction(
      'org.createPosition',
      { code: 'HR-MGR', title: 'HR Manager' },
      { session: adminSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const positionId = (created.data as { id: string }).id;

    // The actual fix: Missy is steered (via toolDescription) to address the position by
    // its short code and skip `id` entirely — never having to transcribe the 32-hex UUID
    // that was transposed (fb -> bf) in the reported incident.
    const rename = await executeAction(
      'org.updatePosition',
      { code: 'HR-MGR', title: 'Human Resources Manager' },
      { session: adminSession },
    );
    expect(rename.ok).toBe(true);
    if (!rename.ok) return;
    expect(rename.data).toMatchObject({ id: positionId, code: 'HR-MGR', title: 'Human Resources Manager' });

    // `code` appears in before/after too — it really was supplied in this request (as
    // the selector), even though its value didn't change (existing "only supplied
    // fields are recorded" contract is about what was supplied, not whether it moved).
    const renameRows = await auditRowsFor('org.updatePosition', positionId);
    expect(renameRows).toHaveLength(1);
    expect(renameRows[0].before).toEqual({ code: 'HR-MGR', title: 'HR Manager' });
    expect(renameRows[0].after).toEqual({ code: 'HR-MGR', title: 'Human Resources Manager' });

    // Restore the original title, again addressing the position by code.
    const restored = await executeAction(
      'org.updatePosition',
      { code: 'HR-MGR', title: 'HR Manager' },
      { session: adminSession },
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.data).toMatchObject({ id: positionId, code: 'HR-MGR', title: 'HR Manager' });

    // Second audit row for this action/entity (the rename above wrote the first).
    const restoreRows = await auditRowsFor('org.updatePosition', positionId);
    expect(restoreRows).toHaveLength(2);
    const restoreRow = restoreRows[restoreRows.length - 1];
    expect(restoreRow.before).toEqual({ code: 'HR-MGR', title: 'Human Resources Manager' });
    expect(restoreRow.after).toEqual({ code: 'HR-MGR', title: 'HR Manager' });

    // Final DB state: exactly the original row, code unchanged, title restored.
    const db = getBootstrapDb();
    const [finalRow] = await db
      .select({ id: positions.id, code: positions.code, title: positions.title, isActive: positions.isActive })
      .from(positions)
      .where(eq(positions.id, positionId));
    expect(finalRow).toMatchObject({ id: positionId, code: 'HR-MGR', title: 'HR Manager', isActive: true });
  });

  // --- update actions: id still works, code works, both consistent is fine --------
  it('org.updatePosition: id alone, code alone, and id+code together (consistent) all work', async () => {
    const created = await executeAction('org.createPosition', { code: 'ENG-1', title: 'Engineer' }, { session: adminSession });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    const byId = await executeAction('org.updatePosition', { id, title: 'Engineer I' }, { session: adminSession });
    expect(byId.ok).toBe(true);

    const byCode = await executeAction('org.updatePosition', { code: 'ENG-1', title: 'Engineer II' }, { session: adminSession });
    expect(byCode.ok).toBe(true);

    // Both supplied, and consistent (code still identifies the same row `id` does) —
    // renaming the title, not the code, so there is nothing to "disagree" about.
    const both = await executeAction(
      'org.updatePosition',
      { id, code: 'ENG-1', title: 'Engineer III' },
      { session: adminSession },
    );
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.data).toMatchObject({ id, code: 'ENG-1', title: 'Engineer III' });
  });

  it('org.updatePosition: id+code together where code is a legitimate rename-to-a-new-value still works (UI compatibility)', async () => {
    const created = await executeAction('org.createPosition', { code: 'ENG-2', title: 'Engineer' }, { session: adminSession });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    // This is exactly what the position edit form sends: `id` (always correct) plus a
    // `code` that may be a brand-new value the row doesn't have yet. `id` stays
    // authoritative for finding the row (keyIsAlsoMutableField) rather than this being
    // treated as two selectors that must independently resolve.
    const renamedCode = await executeAction(
      'org.updatePosition',
      { id, code: 'ENG-2-NEW', title: 'Engineer' },
      { session: adminSession },
    );
    expect(renamedCode.ok).toBe(true);
    if (renamedCode.ok) expect(renamedCode.data).toMatchObject({ id, code: 'ENG-2-NEW' });
  });

  it('org.updatePosition: unknown code gives a clear NOT_FOUND naming the code', async () => {
    const result = await executeAction(
      'org.updatePosition',
      { code: 'NO-SUCH-CODE', title: 'Nope' },
      { session: adminSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('NO-SUCH-CODE');
    }
  });

  it('org.updatePosition: supplying neither id nor code is rejected', async () => {
    const result = await executeAction('org.updatePosition', { title: 'Nope' }, { session: adminSession });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // --- archive actions: pure selector, full reconciliation -------------------------
  it('org.archivePosition: by code works, and by id+code together (consistent) works', async () => {
    const a = await executeAction('org.createPosition', { code: 'ARC-1', title: 'Archive Me' }, { session: adminSession });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const idA = (a.data as { id: string }).id;

    const archivedByCode = await executeAction('org.archivePosition', { code: 'ARC-1' }, { session: adminSession });
    expect(archivedByCode.ok).toBe(true);
    if (archivedByCode.ok) expect(archivedByCode.data).toMatchObject({ id: idA, isActive: false });

    const b = await executeAction('org.createPosition', { code: 'ARC-2', title: 'Archive Me Too' }, { session: adminSession });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const idB = (b.data as { id: string }).id;

    const archivedBoth = await executeAction(
      'org.archivePosition',
      { id: idB, code: 'ARC-2' },
      { session: adminSession },
    );
    expect(archivedBoth.ok).toBe(true);
    if (archivedBoth.ok) expect(archivedBoth.data).toMatchObject({ id: idB, isActive: false });
  });

  it('org.archivePosition: id and code pointing at two different existing positions is rejected', async () => {
    const a = await executeAction('org.createPosition', { code: 'CONFLICT-A', title: 'A' }, { session: adminSession });
    const b = await executeAction('org.createPosition', { code: 'CONFLICT-B', title: 'B' }, { session: adminSession });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const result = await executeAction(
      'org.archivePosition',
      { id: (a.data as { id: string }).id, code: 'CONFLICT-B' },
      { session: adminSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.field).toBe('code');
    }
  });

  it('org.archivePosition: unknown code gives a clear NOT_FOUND naming the code, and neither field is rejected', async () => {
    const unknown = await executeAction('org.archivePosition', { code: 'GHOST-CODE' }, { session: adminSession });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.code).toBe('NOT_FOUND');
      expect(unknown.error.message).toContain('GHOST-CODE');
    }

    const neither = await executeAction('org.archivePosition', {}, { session: adminSession });
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error.code).toBe('VALIDATION_ERROR');
  });

  // --- one representative test per remaining org entity ---------------------------
  it('org.updateDepartment / org.archiveDepartment by code', async () => {
    const created = await executeAction('org.createDepartment', { code: 'IOC-FIN', name: 'Finance' }, { session: adminSession });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    const updated = await executeAction(
      'org.updateDepartment',
      { code: 'IOC-FIN', name: 'Finance & Accounting' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data).toMatchObject({ id, name: 'Finance & Accounting' });

    const archived = await executeAction('org.archiveDepartment', { code: 'IOC-FIN' }, { session: adminSession });
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data).toMatchObject({ id, isActive: false });
  });

  it('org.updateLocation / org.archiveLocation by code', async () => {
    const created = await executeAction('org.createLocation', { code: 'IOC-MNL', name: 'Manila HQ' }, { session: adminSession });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    const updated = await executeAction(
      'org.updateLocation',
      { code: 'IOC-MNL', address: '123 Ayala Ave' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data).toMatchObject({ id, address: '123 Ayala Ave' });

    const archived = await executeAction('org.archiveLocation', { code: 'IOC-MNL' }, { session: adminSession });
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data).toMatchObject({ id, isActive: false });
  });

  it('org.updateCostCenter / org.archiveCostCenter by code', async () => {
    const created = await executeAction('org.createCostCenter', { code: 'IOC-CC', name: 'Corporate' }, { session: adminSession });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.data as { id: string }).id;

    const updated = await executeAction(
      'org.updateCostCenter',
      { code: 'IOC-CC', name: 'Corporate HQ' },
      { session: adminSession },
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data).toMatchObject({ id, name: 'Corporate HQ' });

    const archived = await executeAction('org.archiveCostCenter', { code: 'IOC-CC' }, { session: adminSession });
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data).toMatchObject({ id, isActive: false });
  });
});
