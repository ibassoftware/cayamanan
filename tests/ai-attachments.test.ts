import { eq, lt } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { chatAttachments } from '@/modules/ai/schema';
import { getAttachmentContent } from '@/modules/ai/service/attachments';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb, withTenantContext } from '@/platform/db';
import { testSession } from './helpers/session';

function base64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

async function seedTenant(name: string) {
  const db = getBootstrapDb();
  const [tenant] = await db.insert(tenants).values({ name, status: 'active' }).returning();
  const [company] = await db
    .insert(companies)
    .values({ tenantId: tenant.id, name: `${name} Co`, legalName: `${name} Co Legal` })
    .returning();
  return { tenantId: tenant.id, companyId: company.id };
}

async function cleanupTenant(tenantId: string) {
  const db = getBootstrapDb();
  await db.delete(chatAttachments).where(eq(chatAttachments.tenantId, tenantId));
  await db.delete(companies).where(eq(companies.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

describe('ai.createAttachment / ai.listAttachments', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    for (const tenantId of createdTenantIds) await cleanupTenant(tenantId);
  });

  it('stages a CSV, reports its real row count, and lists metadata only — never content — scoped to the owner', async () => {
    const { tenantId, companyId } = await seedTenant('Attachments Owner Test');
    createdTenantIds.push(tenantId);

    const ownerSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    const otherUserSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const csv = 'name,age\nAlice,30\nBob,40\n';
    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'employees.csv', contentBase64: base64(csv) },
      { session: ownerSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({ filename: 'employees.csv', rowCount: 2 });
    const attachmentId = (created.data as { id: string }).id;

    const listedByOwner = await executeAction('ai.listAttachments', {}, { session: ownerSession });
    expect(listedByOwner.ok).toBe(true);
    if (listedByOwner.ok) {
      const serialized = JSON.stringify(listedByOwner.data);
      // Metadata only — the row data ("Alice"/"Bob") must never appear in a listing.
      expect(serialized).not.toContain('Alice');
      const attachments = (listedByOwner.data as { attachments: { id: string }[] }).attachments;
      expect(attachments.map((a) => a.id)).toContain(attachmentId);
    }

    // Invisible to a different user in the same tenant/company.
    const listedByOther = await executeAction('ai.listAttachments', {}, { session: otherUserSession });
    expect(listedByOther.ok).toBe(true);
    if (listedByOther.ok) {
      const attachments = (listedByOther.data as { attachments: { id: string }[] }).attachments;
      expect(attachments.map((a) => a.id)).not.toContain(attachmentId);
    }
  });

  it('rejects a binary payload that is not valid UTF-8 text', async () => {
    const { tenantId, companyId } = await seedTenant('Attachments Binary Test');
    createdTenantIds.push(tenantId);
    const session = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const binary = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]).toString('base64');
    const result = await executeAction(
      'ai.createAttachment',
      { filename: 'weird.csv', contentBase64: binary },
      { session },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('is invisible across tenants (RLS), even for the same attachment id', async () => {
    const a = await seedTenant('Attachments Tenant Iso A');
    const b = await seedTenant('Attachments Tenant Iso B');
    createdTenantIds.push(a.tenantId, b.tenantId);

    const sessionA = testSession(a.tenantId, a.companyId, { roles: ['HR_PAYROLL'] });
    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'a.csv', contentBase64: base64('h\nv\n') },
      { session: sessionA },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const attachmentId = (created.data as { id: string }).id;

    // Tenant B's own scoped transaction never sees tenant A's row at all — RLS confines
    // it to zero rows before getAttachmentContent's own userId/expiry checks even run.
    const resultInTenantB = await withTenantContext({ tenantId: b.tenantId, companyId: b.companyId }, (db) =>
      getAttachmentContent({ db, userId: sessionA.userId }, attachmentId),
    );
    expect(resultInTenantB).toBeNull();
  });
});

describe('getAttachmentContent', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    for (const tenantId of createdTenantIds) await cleanupTenant(tenantId);
  });

  it('resolves content for the owner, and refuses the same attachment for a different user', async () => {
    const { tenantId, companyId } = await seedTenant('Attachments Content Owner Test');
    createdTenantIds.push(tenantId);

    const ownerSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    const otherUserId = crypto.randomUUID();

    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'a.csv', contentBase64: base64('h\nvalue-only-the-owner-should-see\n') },
      { session: ownerSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const attachmentId = (created.data as { id: string }).id;

    const forOwner = await withTenantContext({ tenantId, companyId }, (db) =>
      getAttachmentContent({ db, userId: ownerSession.userId }, attachmentId),
    );
    expect(forOwner?.content).toContain('value-only-the-owner-should-see');

    const forOther = await withTenantContext({ tenantId, companyId }, (db) =>
      getAttachmentContent({ db, userId: otherUserId }, attachmentId),
    );
    expect(forOther).toBeNull();
  });

  it('does not resolve, or list, an expired attachment', async () => {
    const { tenantId, companyId } = await seedTenant('Attachments Expiry Test');
    createdTenantIds.push(tenantId);
    const session = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'a.csv', contentBase64: base64('h\nv\n') },
      { session },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const attachmentId = (created.data as { id: string }).id;

    // Force expiry directly (bootstrap connection — outside the 1-hour TTL a real clock
    // would take an hour to reach).
    const bootstrapDb = getBootstrapDb();
    await bootstrapDb
      .update(chatAttachments)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(chatAttachments.id, attachmentId));

    const content = await withTenantContext({ tenantId, companyId }, (db) =>
      getAttachmentContent({ db, userId: session.userId }, attachmentId),
    );
    expect(content).toBeNull();

    const listed = await executeAction('ai.listAttachments', {}, { session });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const attachments = (listed.data as { attachments: { id: string }[] }).attachments;
      expect(attachments.map((a) => a.id)).not.toContain(attachmentId);
    }
  });

  it('deleteExpiredAttachments (called opportunistically by ai.createAttachment) reaps an already-expired row', async () => {
    const { tenantId, companyId } = await seedTenant('Attachments Reap Test');
    createdTenantIds.push(tenantId);
    const session = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'stale.csv', contentBase64: base64('h\nv\n') },
      { session },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const staleId = (created.data as { id: string }).id;

    const bootstrapDb = getBootstrapDb();
    await bootstrapDb
      .update(chatAttachments)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(chatAttachments.id, staleId));

    // A second, unrelated create triggers the opportunistic sweep.
    const second = await executeAction(
      'ai.createAttachment',
      { filename: 'fresh.csv', contentBase64: base64('h\nv\n') },
      { session },
    );
    expect(second.ok).toBe(true);

    const remaining = await bootstrapDb.select().from(chatAttachments).where(lt(chatAttachments.expiresAt, new Date()));
    expect(remaining.find((row) => row.id === staleId)).toBeUndefined();
  });
});

describe('ai.getAttachment', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    for (const tenantId of createdTenantIds) await cleanupTenant(tenantId);
  });

  it('returns filename/mimeType/content for the owner', async () => {
    const { tenantId, companyId } = await seedTenant('Get Attachment Owner Test');
    createdTenantIds.push(tenantId);
    const session = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const csv = 'employeeNo,firstName\nEMP-1,Maria\n';
    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'roster.csv', contentBase64: base64(csv) },
      { session },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const attachmentId = (created.data as { id: string }).id;

    const fetched = await executeAction('ai.getAttachment', { attachmentId }, { session });
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data).toEqual({ filename: 'roster.csv', mimeType: 'text/csv', content: csv });
    }
  });

  it('returns the same generic NOT_FOUND for another user’s attachment as for a nonexistent id', async () => {
    const { tenantId, companyId } = await seedTenant('Get Attachment Not Found Test');
    createdTenantIds.push(tenantId);
    const ownerSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    const otherSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });

    const created = await executeAction(
      'ai.createAttachment',
      { filename: 'a.csv', contentBase64: base64('h\nv\n') },
      { session: ownerSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const attachmentId = (created.data as { id: string }).id;

    const byOther = await executeAction('ai.getAttachment', { attachmentId }, { session: otherSession });
    expect(byOther.ok).toBe(false);

    const nonexistent = await executeAction(
      'ai.getAttachment',
      { attachmentId: crypto.randomUUID() },
      { session: ownerSession },
    );
    expect(nonexistent.ok).toBe(false);

    if (!byOther.ok && !nonexistent.ok) {
      expect(byOther.error.code).toBe('NOT_FOUND');
      expect(nonexistent.error.code).toBe('NOT_FOUND');
      expect(byOther.error.message).toBe(nonexistent.error.message);
    }
  });

  it('is FORBIDDEN for an EMPLOYEE role', async () => {
    const { tenantId, companyId } = await seedTenant('Get Attachment Forbidden Test');
    createdTenantIds.push(tenantId);
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const result = await executeAction(
      'ai.getAttachment',
      { attachmentId: crypto.randomUUID() },
      { session: employeeSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});
