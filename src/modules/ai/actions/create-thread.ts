import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { aiThreads } from '../schema';

const DEFAULT_TITLE = 'New conversation';

// The returned `id` is what the caller uses as the Mastra memory thread id for every
// message in this conversation (`memory.thread` in the chat route) — one id, shared
// between our own listing index and Mastra's own memory tables.
export const createThreadAction = defineAction({
  id: 'ai.createThread',
  title: 'Start a new chat thread',
  input: z.object({ title: z.string().min(1).max(200).optional() }).strict(),
  output: z.object({ id: z.string().uuid(), title: z.string(), createdAt: z.string(), lastMessageAt: z.string() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  toolExposed: false,
  async handler(input, ctx) {
    const [created] = await ctx.db
      .insert(aiThreads)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        userId: ctx.userId ?? '',
        title: input.title ?? DEFAULT_TITLE,
      })
      .returning();

    return {
      id: created.id,
      title: created.title,
      createdAt: created.createdAt.toISOString(),
      lastMessageAt: created.lastMessageAt.toISOString(),
    };
  },
});
