import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { positions } from '../schema';

const UNIQUE_CODE_CONSTRAINT = 'positions_tenant_company_code_uidx';

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

export const updatePositionAction = defineAction({
  id: 'org.updatePosition',
  title: 'Update position',
  input: z
    .object({ id: z.string().uuid(), code: z.string().min(1).optional(), title: z.string().min(1).optional(), isActive: z.boolean().optional() })
    .strict(),
  output: z.object({ id: z.string().uuid(), code: z.string(), title: z.string(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Update a position’s code, title or active flag.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select()
      .from(positions)
      .where(and(eq(positions.id, input.id), eq(positions.tenantId, ctx.tenantId), eq(positions.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Position not found.');
    }

    try {
      const [updated] = await ctx.db
        .update(positions)
        .set({
          code: input.code ?? existing.code,
          title: input.title ?? existing.title,
          isActive: input.isActive ?? existing.isActive,
          updatedAt: ctx.now,
          updatedBy: ctx.userId,
        })
        .where(eq(positions.id, existing.id))
        .returning();

      // Ordinary risk: a trail, not a confirmation card. Only the fields this call
      // actually supplied (see update-government-ids.ts).
      const suppliedFields = (['code', 'title', 'isActive'] as const).filter((field) => input[field] !== undefined);
      ctx.audit({
        entityType: 'position',
        entityId: updated.id,
        before: Object.fromEntries(suppliedFields.map((field) => [field, existing[field]])),
        after: Object.fromEntries(suppliedFields.map((field) => [field, updated[field]])),
      });

      return { id: updated.id, code: updated.code, title: updated.title, isActive: updated.isActive };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A position with this code already exists.', { field: 'code' });
      }
      throw error;
    }
  },
});
