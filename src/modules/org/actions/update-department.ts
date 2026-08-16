import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { uuidRef } from '@/platform/fields';
import { departments } from '../schema';
import { MAX_DEPARTMENT_DEPTH, recomputeSubtreeDepths, resolveDepth, wouldCreateCycle } from '../service/department-tree';

const UNIQUE_CODE_CONSTRAINT = 'departments_tenant_company_code_uidx';

// See update-position.ts for the `keyIsUnique`/`keyIsAlsoMutableField` rationale — same
// shape here: `code` is `UNIQUE (tenant_id, company_id, code)` at the DB level, and this
// action can itself rename it, so `id` stays authoritative whenever supplied.
const DEPARTMENT_SELECTOR: NaturalKeySelectorConfig = {
  table: departments,
  idColumn: departments.id,
  idField: 'id',
  keyColumn: departments.code,
  tenantIdColumn: departments.tenantId,
  companyIdColumn: departments.companyId,
  keyField: 'code',
  entityLabel: 'Department',
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

export const updateDepartmentAction = defineAction({
  id: 'org.updateDepartment',
  title: 'Update department',
  // `parentId` deliberately keeps taking only a uuid, not a `parentCode` alternative —
  // re-parenting is a rare admin operation (unlike renaming), and adding a second
  // code-to-id lookup inside the existing cycle/depth logic isn't worth it until it's a
  // real pain point (see id-or-key.ts guarantee (3): don't invent a natural-key lookup
  // where the pain it solves is small).
  input: z
    .object({
      ...idOrKeyShape('id', 'code'),
      name: z.string().min(1).optional(),
      parentId: uuidRef('parent department').nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .superRefine(requireIdOrKey('id', 'code')),
  output: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    parentId: z.string().uuid().nullable(),
    depth: z.number().int(),
    isActive: z.boolean(),
  }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update a department’s code, name, parent or active flag. Identify the department by its code (e.g. "FIN") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<typeof departments.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      DEPARTMENT_SELECTOR,
      input,
    );

    const reparenting = input.parentId !== undefined && input.parentId !== existing.parentId;
    let depth = existing.depth;

    if (reparenting) {
      const newParentId = input.parentId;
      if (newParentId) {
        if (newParentId === existing.id) {
          throw new ActionError('VALIDATION_ERROR', 'A department cannot be its own parent.', { field: 'parentId' });
        }
        if (await wouldCreateCycle(ctx.db, ctx.tenantId, ctx.companyId, existing.id, newParentId)) {
          throw new ActionError('VALIDATION_ERROR', 'This would create a cycle in the department tree.', {
            field: 'parentId',
          });
        }
      }
      const resolved = await resolveDepth(ctx.db, ctx.tenantId, ctx.companyId, newParentId ?? null);
      if (resolved === null) {
        throw new ActionError('VALIDATION_ERROR', 'Parent department not found.', { field: 'parentId' });
      }
      if (resolved >= MAX_DEPARTMENT_DEPTH) {
        throw new ActionError(
          'VALIDATION_ERROR',
          `Department tree cannot nest deeper than ${MAX_DEPARTMENT_DEPTH} levels.`,
          { field: 'parentId' },
        );
      }
      depth = resolved;
    }

    try {
      const [updated] = await ctx.db
        .update(departments)
        .set({
          code: input.code ?? existing.code,
          name: input.name ?? existing.name,
          parentId: reparenting ? (input.parentId ?? null) : existing.parentId,
          depth,
          isActive: input.isActive ?? existing.isActive,
          updatedAt: ctx.now,
          updatedBy: ctx.userId,
        })
        .where(eq(departments.id, existing.id))
        .returning();

      if (reparenting && depth !== existing.depth) {
        await recomputeSubtreeDepths(ctx.db, ctx.tenantId, ctx.companyId, existing.id, depth);
      }

      // Ordinary risk: a trail, not a confirmation card. Only the fields this call
      // actually supplied — an omitted field is untouched, so including it would
      // misrepresent the change as wider than it was (see update-government-ids.ts).
      const suppliedFields = (['code', 'name', 'parentId', 'isActive'] as const).filter(
        (field) => input[field] !== undefined,
      );
      ctx.audit({
        entityType: 'department',
        entityId: updated.id,
        before: Object.fromEntries(suppliedFields.map((field) => [field, existing[field]])),
        after: Object.fromEntries(suppliedFields.map((field) => [field, updated[field]])),
      });

      return {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        parentId: updated.parentId,
        depth: updated.depth,
        isActive: updated.isActive,
      };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A department with this code already exists.', {
          field: 'code',
        });
      }
      throw error;
    }
  },
});
