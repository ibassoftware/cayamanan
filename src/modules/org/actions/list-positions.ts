import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { positions } from '../schema';

const positionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  isActive: z.boolean(),
});

export const listPositionsAction = defineAction({
  id: 'org.listPositions',
  title: 'List positions',
  input: z.object({ includeInactive: z.boolean().optional() }).strict(),
  output: z.object({ positions: z.array(positionSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'List the company’s job positions/titles.',
  async handler(input, ctx) {
    const conditions = [eq(positions.tenantId, ctx.tenantId), eq(positions.companyId, ctx.companyId)];
    if (!input.includeInactive) conditions.push(eq(positions.isActive, true));

    const rows = await ctx.db
      .select()
      .from(positions)
      .where(and(...conditions))
      .orderBy(positions.title);

    return { positions: rows.map((row) => ({ id: row.id, code: row.code, title: row.title, isActive: row.isActive })) };
  },
});
