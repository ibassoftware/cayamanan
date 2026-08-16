import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { costCenters } from '../schema';

const UNIQUE_CODE_CONSTRAINT = 'cost_centers_tenant_company_code_uidx';

// See update-position.ts for the `keyIsUnique`/`keyIsAlsoMutableField` rationale.
const COST_CENTER_SELECTOR: NaturalKeySelectorConfig = {
  table: costCenters,
  idColumn: costCenters.id,
  idField: 'id',
  keyColumn: costCenters.code,
  tenantIdColumn: costCenters.tenantId,
  companyIdColumn: costCenters.companyId,
  keyField: 'code',
  entityLabel: 'Cost center',
  keyIsUnique: true,
  keyIsAlsoMutableField: true,
};

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
    .object({
      ...idOrKeyShape('id', 'code'),
      name: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .superRefine(requireIdOrKey('id', 'code')),
  output: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update a cost center’s code, name or active flag. Identify the cost center by its code (e.g. "CC-100") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<typeof costCenters.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      COST_CENTER_SELECTOR,
      input,
    );

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

      // Ordinary risk: a trail, not a confirmation card. Only the fields this call
      // actually supplied (see update-government-ids.ts).
      const suppliedFields = (['code', 'name', 'isActive'] as const).filter((field) => input[field] !== undefined);
      ctx.audit({
        entityType: 'cost_center',
        entityId: updated.id,
        before: Object.fromEntries(suppliedFields.map((field) => [field, existing[field]])),
        after: Object.fromEntries(suppliedFields.map((field) => [field, updated[field]])),
      });

      return { id: updated.id, code: updated.code, name: updated.name, isActive: updated.isActive };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A cost center with this code already exists.', { field: 'code' });
      }
      throw error;
    }
  },
});
