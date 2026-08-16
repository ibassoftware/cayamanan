import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { departments } from '../schema';

// See update-department.ts/update-position.ts — `keyIsAlsoMutableField` is left `false`
// here: archive takes no other fields, so `code` is a pure selector.
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
};

// Soft-delete only (`is_active = false`) — departments are referenced by employees'
// current-assignment fields (and, from slice 05, by employment_assignments), so rows are
// never hard-deleted. Children of an archived department are left untouched; filtering
// on `isActive` at read time decides what's visible.
export const archiveDepartmentAction = defineAction({
  id: 'org.archiveDepartment',
  title: 'Archive department',
  input: z.object({ ...idOrKeyShape('id', 'code') }).strict().superRefine(requireIdOrKey('id', 'code')),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Archive (soft-delete) a department. Identify it by its code (e.g. "FIN") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<{ id: string; isActive: boolean }>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      DEPARTMENT_SELECTOR,
      input,
    );

    await ctx.db
      .update(departments)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(departments.id, existing.id));

    // Ordinary risk: a trail, not a confirmation card.
    ctx.audit({
      entityType: 'department',
      entityId: existing.id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });

    return { id: existing.id, isActive: false };
  },
});
