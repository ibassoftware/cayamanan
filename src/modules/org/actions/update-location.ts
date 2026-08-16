import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { locations } from '../schema';

const UNIQUE_CODE_CONSTRAINT = 'locations_tenant_company_code_uidx';

// See update-position.ts for the `keyIsUnique`/`keyIsAlsoMutableField` rationale.
const LOCATION_SELECTOR: NaturalKeySelectorConfig = {
  table: locations,
  idColumn: locations.id,
  idField: 'id',
  keyColumn: locations.code,
  tenantIdColumn: locations.tenantId,
  companyIdColumn: locations.companyId,
  keyField: 'code',
  entityLabel: 'Location',
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

export const updateLocationAction = defineAction({
  id: 'org.updateLocation',
  title: 'Update location',
  input: z
    .object({
      ...idOrKeyShape('id', 'code'),
      name: z.string().min(1).optional(),
      address: z.string().nullable().optional(),
      timezone: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .superRefine(requireIdOrKey('id', 'code')),
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
  toolDescription:
    'Update a location’s details or active flag. Identify the location by its code (e.g. "MNL") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<typeof locations.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      LOCATION_SELECTOR,
      input,
    );

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

      // Ordinary risk: a trail, not a confirmation card. Only the fields this call
      // actually supplied (see update-government-ids.ts).
      const suppliedFields = (['code', 'name', 'address', 'timezone', 'isActive'] as const).filter(
        (field) => input[field] !== undefined,
      );
      ctx.audit({
        entityType: 'location',
        entityId: updated.id,
        before: Object.fromEntries(suppliedFields.map((field) => [field, existing[field]])),
        after: Object.fromEntries(suppliedFields.map((field) => [field, updated[field]])),
      });

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
