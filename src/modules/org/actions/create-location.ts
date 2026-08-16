import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { orgCode } from '@/platform/fields';
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

export const createLocationAction = defineAction({
  id: 'org.createLocation',
  title: 'Create location',
  input: z
    .object({
      code: orgCode(),
      name: z.string().min(1),
      address: z.string().optional(),
      timezone: z.string().min(1).describe('IANA timezone, e.g. "Asia/Manila" (default).').optional(),
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
  toolDescription: 'Create a work location.',
  async handler(input, ctx) {
    try {
      const [created] = await ctx.db
        .insert(locations)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          code: input.code,
          name: input.name,
          address: input.address ?? null,
          timezone: input.timezone ?? 'Asia/Manila',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      // Ordinary risk: a trail, not a confirmation card. `before` is explicitly empty —
      // a create has no prior state — and `after` carries only the fields this call
      // actually supplied.
      ctx.audit({
        entityType: 'location',
        entityId: created.id,
        before: {},
        after: {
          code: created.code,
          name: created.name,
          ...(input.address !== undefined ? { address: created.address } : {}),
          ...(input.timezone !== undefined ? { timezone: created.timezone } : {}),
        },
      });

      return {
        id: created.id,
        code: created.code,
        name: created.name,
        address: created.address,
        timezone: created.timezone,
        isActive: created.isActive,
      };
    } catch (error) {
      if (isDuplicateCode(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A location with this code already exists.', { field: 'code' });
      }
      throw error;
    }
  },
});
