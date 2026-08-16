import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { locations } from '../schema';

const locationSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  timezone: z.string(),
  isActive: z.boolean(),
});

export const listLocationsAction = defineAction({
  id: 'org.listLocations',
  title: 'List locations',
  input: z.object({ includeInactive: z.boolean().optional() }).strict(),
  output: z.object({ locations: z.array(locationSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'List the company’s work locations.',
  async handler(input, ctx) {
    const conditions = [eq(locations.tenantId, ctx.tenantId), eq(locations.companyId, ctx.companyId)];
    if (!input.includeInactive) conditions.push(eq(locations.isActive, true));

    const rows = await ctx.db
      .select()
      .from(locations)
      .where(and(...conditions))
      .orderBy(locations.name);

    return {
      locations: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        address: row.address,
        timezone: row.timezone,
        isActive: row.isActive,
      })),
    };
  },
});
