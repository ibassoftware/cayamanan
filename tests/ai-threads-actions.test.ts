import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

describe('ai.createThread / ai.listThreads / ai.renameThread', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'AI Threads Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'AI Threads Co', legalName: 'AI Threads Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('creates a thread, lists it, and renames it — scoped to the creating user only', async () => {
    const userASession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
    const userBSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const created = await executeAction('ai.createThread', {}, { session: userASession });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const threadId = (created.data as { id: string }).id;

    const listA = await executeAction('ai.listThreads', {}, { session: userASession });
    expect(listA.ok).toBe(true);
    if (listA.ok) {
      const threads = (listA.data as { threads: { id: string }[] }).threads;
      expect(threads.map((t) => t.id)).toContain(threadId);
    }

    // A different user in the same tenant/company never sees another user's thread.
    const listB = await executeAction('ai.listThreads', {}, { session: userBSession });
    expect(listB.ok).toBe(true);
    if (listB.ok) {
      const threads = (listB.data as { threads: { id: string }[] }).threads;
      expect(threads.map((t) => t.id)).not.toContain(threadId);
    }

    const renamed = await executeAction('ai.renameThread', { threadId, title: 'Renamed thread' }, { session: userASession });
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect((renamed.data as { title: string }).title).toBe('Renamed thread');
    }

    // The other user cannot rename a thread they don't own.
    const renameAttempt = await executeAction(
      'ai.renameThread',
      { threadId, title: 'Hijacked title' },
      { session: userBSession },
    );
    expect(renameAttempt.ok).toBe(false);
    if (!renameAttempt.ok) {
      expect(renameAttempt.error.code).toBe('NOT_FOUND');
    }
  });
});
