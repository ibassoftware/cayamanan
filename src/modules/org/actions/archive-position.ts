import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { positions } from '../schema';

// See update-position.ts for why `code` is `keyIsUnique: true` (a real DB unique index)
// but, unlike there, `keyIsAlsoMutableField` is left `false`: this action takes no other
// fields, so `code` is a pure selector and both-supplied gets full reconciliation.
const POSITION_SELECTOR: NaturalKeySelectorConfig = {
  table: positions,
  idColumn: positions.id,
  idField: 'id',
  keyColumn: positions.code,
  tenantIdColumn: positions.tenantId,
  companyIdColumn: positions.companyId,
  keyField: 'code',
  entityLabel: 'Position',
  keyIsUnique: true,
};

export const archivePositionAction = defineAction({
  id: 'org.archivePosition',
  title: 'Archive position',
  input: z.object({ ...idOrKeyShape('id', 'code') }).strict().superRefine(requireIdOrKey('id', 'code')),
  output: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Archive (soft-delete) a position. Identify it by its code (e.g. "HR-MGR") rather than id whenever you have it — codes are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<{ id: string; isActive: boolean }>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      POSITION_SELECTOR,
      input,
    );

    await ctx.db
      .update(positions)
      .set({ isActive: false, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(positions.id, existing.id));

    // Ordinary risk: a trail, not a confirmation card.
    ctx.audit({
      entityType: 'position',
      entityId: existing.id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });

    return { id: existing.id, isActive: false };
  },
});
