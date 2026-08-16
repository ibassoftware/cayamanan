import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { costCenters } from '../schema';

const UNIQUE_CODE_CONSTRAINT = 'cost_centers_tenant_company_code_uidx';

function isDuplicateCode(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === UNIQUE_CODE_CONSTRAINT,
  );
}

export const updateCostCenterAction = defineAction({
  id: 'org.updateCostCenter',
  title: 'Update cost center',
  input: z
    .object({ id: z.string().uuid(), code: z.string().min(1).optional(), name: z.string().min(1).optional(), isActive: z.boolean().optional() })
    .strict(),
  output: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Update a cost center’s code, name or active flag.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select()
      .from(costCenters)
      .where(and(eq(costCenters.id, input.id), eq(costCenters.tenantId, ctx.tenantId), eq(costCenters.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Cost center not found.');
    }

    try {
      const [updated] = await ctx.db
        .update(costCenters)
        .set({
          code: input.code ?? existing.code,
          name: input.name ?? existing.name,
          isActive: input.isActive ?? existing.isActive,
          updatedAt: ctx.now,
          updatedBy: ctx.userId,
        })
        .where(eq(costCenters.id, existing.id))
        .returning();
      return { id: updated.id, code: updated.code, name: updated.name, isActive: updated.isActive };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A cost center with this code already exists.', { field: 'code' });
      }
      throw error;
    }
  },
});
