import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { costCenters } from '../schema';

const costCenterSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

export const listCostCentersAction = defineAction({
  id: 'org.listCostCenters',
  title: 'List cost centers',
  input: z.object({ includeInactive: z.boolean().optional() }).strict(),
  output: z.object({ costCenters: z.array(costCenterSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'List the company’s cost centers.',
  async handler(input, ctx) {
    const conditions = [eq(costCenters.tenantId, ctx.tenantId), eq(costCenters.companyId, ctx.companyId)];
    if (!input.includeInactive) conditions.push(eq(costCenters.isActive, true));

    const rows = await ctx.db
      .select()
      .from(costCenters)
      .where(and(...conditions))
      .orderBy(costCenters.name);

    return { costCenters: rows.map((row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.isActive })) };
  },
});
