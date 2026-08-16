import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { aiThreads } from '../schema';

export const renameThreadAction = defineAction({
  id: 'ai.renameThread',
  title: 'Rename a chat thread',
  input: z.object({ threadId: z.string().uuid(), title: z.string().min(1).max(200) }).strict(),
  output: z.object({ id: z.string().uuid(), title: z.string() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  toolExposed: false,
  async handler(input, ctx) {
    const [row] = await ctx.db
      .select({ id: aiThreads.id })
      .from(aiThreads)
      .where(
        and(
          eq(aiThreads.id, input.threadId),
          eq(aiThreads.tenantId, ctx.tenantId),
          eq(aiThreads.companyId, ctx.companyId),
          eq(aiThreads.userId, ctx.userId ?? ''),
        ),
      )
      .limit(1);
    if (!row) {
      throw new ActionError('NOT_FOUND', 'Thread not found.');
    }

    await ctx.db.update(aiThreads).set({ title: input.title }).where(eq(aiThreads.id, row.id));

    return { id: row.id, title: input.title };
  },
});
