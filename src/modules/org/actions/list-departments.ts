import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { departments } from '../schema';

const departmentSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  depth: z.number().int(),
  isActive: z.boolean(),
});

export const listDepartmentsAction = defineAction({
  id: 'org.listDepartments',
  title: 'List departments',
  input: z.object({ includeInactive: z.boolean().optional() }).strict(),
  output: z.object({ departments: z.array(departmentSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'List the company’s departments (self-referencing tree).',
  async handler(input, ctx) {
    const conditions = [eq(departments.tenantId, ctx.tenantId), eq(departments.companyId, ctx.companyId)];
    if (!input.includeInactive) conditions.push(eq(departments.isActive, true));

    const rows = await ctx.db
      .select()
      .from(departments)
      .where(and(...conditions))
      .orderBy(departments.depth, departments.name);

    return {
      departments: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        parentId: row.parentId,
        depth: row.depth,
        isActive: row.isActive,
      })),
    };
  },
});
