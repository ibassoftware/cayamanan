import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { locations } from '../schema';

export const archiveLocationAction = defineAction({
  id: 'org.archiveLocation',
  title: 'Archive location',
  input: z.object({ id: z.string().uuid() }).strict(),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Archive (soft-delete) a location.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.id), eq(locations.tenantId, ctx.tenantId), eq(locations.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Location not found.');
    }

    await ctx.db
      .update(locations)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(locations.id, existing.id));

    return { id: existing.id, isActive: false };
  },
});
