import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { positions } from '../schema';

const UNIQUE_CODE_CONSTRAINT = 'positions_tenant_company_code_uidx';

// `code` is `UNIQUE (tenant_id, company_id, code)` at the DB level (see
// drizzle/0006_organization_employee_master_data.sql) — `keyIsUnique: true` is a
// documented fact here, not an assumption. `keyIsAlsoMutableField: true` because this
// action can itself rename `code` to a new value (see id-or-key.ts's doc comment): `id`,
// when supplied, stays authoritative for finding the row so a legitimate rename isn't
// rejected as "code doesn't resolve to anything yet".
const POSITION_SELECTOR: NaturalKeySelectorConfig = {
  table: positions,
  idColumn: positions.id,
  idField: 'id',
  keyColumn: positions.code,
  tenantIdColumn: positions.tenantId,
  companyIdColumn: positions.companyId,
  keyField: 'code',
  entityLabel: 'Position',
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

export const updatePositionAction = defineAction({
  id: 'org.updatePosition',
  title: 'Update position',
  input: z
    .object({
      ...idOrKeyShape('id', 'code'),
      title: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .superRefine(requireIdOrKey('id', 'code')),
  output: z.object({ id: z.string().uuid(), code: z.string(), title: z.string(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update a position’s code, title or active flag. Identify the position by its code (e.g. "HR-MGR") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<typeof positions.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      POSITION_SELECTOR,
      input,
    );

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
