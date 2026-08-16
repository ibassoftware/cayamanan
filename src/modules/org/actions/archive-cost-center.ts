import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { costCenters } from '../schema';

export const archiveCostCenterAction = defineAction({
  id: 'org.archiveCostCenter',
  title: 'Archive cost center',
  input: z.object({ id: z.string().uuid() }).strict(),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Archive (soft-delete) a cost center.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select({ id: costCenters.id, isActive: costCenters.isActive })
      .from(costCenters)
      .where(and(eq(costCenters.id, input.id), eq(costCenters.tenantId, ctx.tenantId), eq(costCenters.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Cost center not found.');
    }

    await ctx.db
      .update(costCenters)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(costCenters.id, existing.id));

    // Ordinary risk: a trail, not a confirmation card.
    ctx.audit({
      entityType: 'cost_center',
      entityId: existing.id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });

    return { id: existing.id, isActive: false };
  },
});
