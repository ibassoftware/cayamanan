import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { departments } from '../schema';

// Soft-delete only (`is_active = false`) — departments are referenced by employees'
// current-assignment fields (and, from slice 05, by employment_assignments), so rows are
// never hard-deleted. Children of an archived department are left untouched; filtering
// on `isActive` at read time decides what's visible.
export const archiveDepartmentAction = defineAction({
  id: 'org.archiveDepartment',
  title: 'Archive department',
  input: z.object({ id: z.string().uuid() }).strict(),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Archive (soft-delete) a department.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, input.id), eq(departments.tenantId, ctx.tenantId), eq(departments.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Department not found.');
    }

    await ctx.db
      .update(departments)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(departments.id, existing.id));

    return { id: existing.id, isActive: false };
  },
});
