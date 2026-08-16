import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { costCenters } from '../schema';

// See update-cost-center.ts/update-position.ts — `keyIsAlsoMutableField` is left `false`
// here: archive takes no other fields, so `code` is a pure selector.
const COST_CENTER_SELECTOR: NaturalKeySelectorConfig = {
  table: costCenters,
  idColumn: costCenters.id,
  idField: 'id',
  keyColumn: costCenters.code,
  tenantIdColumn: costCenters.tenantId,
  companyIdColumn: costCenters.companyId,
  keyField: 'code',
  entityLabel: 'Cost center',
  keyIsUnique: true,
};

export const archiveCostCenterAction = defineAction({
  id: 'org.archiveCostCenter',
  title: 'Archive cost center',
  input: z.object({ ...idOrKeyShape('id', 'code') }).strict().superRefine(requireIdOrKey('id', 'code')),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Archive (soft-delete) a cost center. Identify it by its code (e.g. "CC-100") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<{ id: string; isActive: boolean }>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      COST_CENTER_SELECTOR,
      input,
    );

    await ctx.db
      .update(costCenters)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(costCenters.id, existing.id));

    // Ordinary risk: a trail, not a confirmation card.
    ctx.audit({
      entityType: 'cost_center',
      entityId: existing.id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });

    return { id: existing.id, isActive: false };
  },
});
