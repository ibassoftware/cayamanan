import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { locations } from '../schema';

// See update-location.ts/update-position.ts — `keyIsAlsoMutableField` is left `false`
// here: archive takes no other fields, so `code` is a pure selector.
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
};

export const archiveLocationAction = defineAction({
  id: 'org.archiveLocation',
  title: 'Archive location',
  input: z.object({ ...idOrKeyShape('id', 'code') }).strict().superRefine(requireIdOrKey('id', 'code')),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Archive (soft-delete) a location. Identify it by its code (e.g. "MNL") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<{ id: string; isActive: boolean }>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      LOCATION_SELECTOR,
      input,
    );

    await ctx.db
      .update(locations)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(locations.id, existing.id));

    // Ordinary risk: a trail, not a confirmation card.
    ctx.audit({
      entityType: 'location',
      entityId: existing.id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });

    return { id: existing.id, isActive: false };
  },
});
