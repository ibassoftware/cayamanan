import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { orgCode, uuidRef } from '@/platform/fields';
import { departments } from '../schema';
import { MAX_DEPARTMENT_DEPTH, resolveDepth } from '../service/department-tree';

const UNIQUE_CODE_CONSTRAINT = 'departments_tenant_company_code_uidx';

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

export const createDepartmentAction = defineAction({
  id: 'org.createDepartment',
  title: 'Create department',
  input: z
    .object({
      code: orgCode(),
      name: z.string().min(1),
      parentId: uuidRef('parent department').nullable().optional(),
    })
    .strict(),
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
  toolDescription: 'Create a department, optionally nested under an existing parent department.',
  async handler(input, ctx) {
    const parentId = input.parentId ?? null;
    const depth = await resolveDepth(ctx.db, ctx.tenantId, ctx.companyId, parentId);
    if (depth === null) {
      throw new ActionError('VALIDATION_ERROR', 'Parent department not found.', { field: 'parentId' });
    }
    if (depth >= MAX_DEPARTMENT_DEPTH) {
      throw new ActionError(
        'VALIDATION_ERROR',
        `Department tree cannot nest deeper than ${MAX_DEPARTMENT_DEPTH} levels.`,
        { field: 'parentId' },
      );
    }

    try {
      const [created] = await ctx.db
        .insert(departments)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          code: input.code,
          name: input.name,
          parentId,
          depth,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      // Ordinary risk: a trail, not a confirmation card (CLAUDE.md's audit list is a
      // floor, not a ceiling — department names reach payslips/statutory reports, and
      // slice 05 attaches effective-dated employment records to them). `before` is
      // explicitly empty — a create has no prior state — and `after` carries only the
      // fields this call actually supplied.
      ctx.audit({
        entityType: 'department',
        entityId: created.id,
        before: {},
        after: {
          code: created.code,
          name: created.name,
          ...(input.parentId !== undefined ? { parentId: created.parentId } : {}),
        },
      });

      return {
        id: created.id,
        code: created.code,
        name: created.name,
        parentId: created.parentId,
        depth: created.depth,
        isActive: created.isActive,
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
