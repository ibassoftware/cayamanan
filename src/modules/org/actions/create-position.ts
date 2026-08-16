import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { orgCode } from '@/platform/fields';
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

export const createPositionAction = defineAction({
  id: 'org.createPosition',
  title: 'Create position',
  input: z.object({ code: orgCode(), title: z.string().min(1) }).strict(),
  output: z.object({ id: z.string().uuid(), code: z.string(), title: z.string(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Create a job position/title.',
  async handler(input, ctx) {
    try {
      const [created] = await ctx.db
        .insert(positions)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          code: input.code,
          title: input.title,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      // Ordinary risk: a trail, not a confirmation card. `before` is explicitly empty —
      // a create has no prior state.
      ctx.audit({
        entityType: 'position',
        entityId: created.id,
        before: {},
        after: { code: created.code, title: created.title },
      });

      return { id: created.id, code: created.code, title: created.title, isActive: created.isActive };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A position with this code already exists.', { field: 'code' });
      }
      throw error;
    }
  },
});
