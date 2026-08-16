import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { positions } from '../schema';

export const archivePositionAction = defineAction({
  id: 'org.archivePosition',
  title: 'Archive position',
  input: z.object({ id: z.string().uuid() }).strict(),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Archive (soft-delete) a position.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.id, input.id), eq(positions.tenantId, ctx.tenantId), eq(positions.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Position not found.');
    }

    await ctx.db
      .update(positions)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(positions.id, existing.id));

    return { id: existing.id, isActive: false };
  },
});
