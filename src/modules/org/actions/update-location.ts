import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { locations } from '../schema';

const UNIQUE_CODE_CONSTRAINT = 'locations_tenant_company_code_uidx';

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

export const updateLocationAction = defineAction({
  id: 'org.updateLocation',
  title: 'Update location',
  input: z
    .object({
      id: z.string().uuid(),
      code: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      address: z.string().nullable().optional(),
      timezone: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
  output: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    address: z.string().nullable(),
    timezone: z.string(),
    isActive: z.boolean(),
  }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Update a location’s details or active flag.',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select()
      .from(locations)
      .where(and(eq(locations.id, input.id), eq(locations.tenantId, ctx.tenantId), eq(locations.companyId, ctx.companyId)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Location not found.');
    }

    try {
      const [updated] = await ctx.db
        .update(locations)
        .set({
          code: input.code ?? existing.code,
          name: input.name ?? existing.name,
          address: input.address !== undefined ? input.address : existing.address,
          timezone: input.timezone ?? existing.timezone,
          isActive: input.isActive ?? existing.isActive,
          updatedAt: ctx.now,
          updatedBy: ctx.userId,
        })
        .where(eq(locations.id, existing.id))
        .returning();
      return {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        address: updated.address,
        timezone: updated.timezone,
        isActive: updated.isActive,
      };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A location with this code already exists.', { field: 'code' });
      }
      throw error;
    }
  },
});
