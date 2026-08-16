import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { aiThreads } from '../schema';

const threadSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  lastMessageAt: z.string(),
});

// Our own listing index, not Mastra's memory tables (see schema.ts header) — this never
// reconstructs message content, only enough to render a thread list (03-missy-foundation.md
// "Thread list" UI surface, out of scope here). Never tool-exposed: thread management is a
// UI action, not something Missy narrates about herself.
export const listThreadsAction = defineAction({
  id: 'ai.listThreads',
  title: 'List my chat threads',
  input: z.object({}).strict(),
  output: z.object({ threads: z.array(threadSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  toolExposed: false,
  async handler(_input, ctx) {
    const rows = await ctx.db
      .select()
      .from(aiThreads)
      .where(and(eq(aiThreads.tenantId, ctx.tenantId), eq(aiThreads.companyId, ctx.companyId), eq(aiThreads.userId, ctx.userId ?? '')))
      .orderBy(desc(aiThreads.lastMessageAt))
      .limit(50);

    return {
      threads: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        lastMessageAt: row.lastMessageAt.toISOString(),
      })),
    };
  },
});
