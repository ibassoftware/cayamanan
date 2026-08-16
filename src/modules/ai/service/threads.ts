// Thread ownership checks for the chat route (src/app/api/chat/route.ts). Mastra's own
// memory tables (mastra_threads/mastra_messages, in the same Postgres database — see
// src/mastra/index.ts) are keyed only by the resourceId/threadId strings we hand it and
// carry none of our tenant/company/RLS model — so before ever calling into Mastra with a
// client-supplied threadId, the chat route confirms the thread belongs to the caller
// against *our* tenant-scoped `ai_threads` index (RLS-enforced, unlike Mastra's tables).
import { and, eq } from 'drizzle-orm';

import type { VerifiedSession } from '@/platform/actions';
import { withTenantContext } from '@/platform/db';
import { aiThreads } from '../schema';

export async function getOwnedThread(
  session: VerifiedSession,
  threadId: string,
): Promise<{ id: string } | null> {
  return withTenantContext({ tenantId: session.tenantId, companyId: session.companyId }, async (tenantDb) => {
    const [row] = await tenantDb
      .select({ id: aiThreads.id })
      .from(aiThreads)
      .where(
        and(
          eq(aiThreads.id, threadId),
          eq(aiThreads.tenantId, session.tenantId),
          eq(aiThreads.companyId, session.companyId),
          eq(aiThreads.userId, session.userId),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

export async function touchThread(session: VerifiedSession, threadId: string): Promise<void> {
  await withTenantContext({ tenantId: session.tenantId, companyId: session.companyId }, async (tenantDb) => {
    await tenantDb
      .update(aiThreads)
      .set({ lastMessageAt: new Date() })
      .where(
        and(
          eq(aiThreads.id, threadId),
          eq(aiThreads.tenantId, session.tenantId),
          eq(aiThreads.companyId, session.companyId),
          eq(aiThreads.userId, session.userId),
        ),
      );
  });
}
