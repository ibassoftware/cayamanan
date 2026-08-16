import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { onboardingTemplates } from '../schema';

// See update-onboarding-template.ts — `keyIsAlsoMutableField` is left `false` here:
// remove takes no other fields, so `name` is a pure selector (same as
// archive-department.ts vs update-department.ts).
const TEMPLATE_SELECTOR: NaturalKeySelectorConfig = {
  table: onboardingTemplates,
  idColumn: onboardingTemplates.id,
  idField: 'templateId',
  keyColumn: onboardingTemplates.name,
  tenantIdColumn: onboardingTemplates.tenantId,
  companyIdColumn: onboardingTemplates.companyId,
  keyField: 'name',
  entityLabel: 'Onboarding template',
  keyIsUnique: true,
};

export const removeOnboardingTemplateAction = defineAction({
  id: 'onboarding.removeTemplate',
  title: 'Remove onboarding checklist template',
  input: z.object({ ...idOrKeyShape('templateId', 'name') }).strict().superRefine(requireIdOrKey('templateId', 'name')),
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // Not exposed to Missy — see create-onboarding-template.ts's identical note. A hard
  // delete of a reusable template is exactly the kind of thing that should stay a
  // deliberate admin-UI click, not a conversational one.
  toolExposed: false,
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<typeof onboardingTemplates.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      TEMPLATE_SELECTOR,
      input,
    );

    await ctx.db.delete(onboardingTemplates).where(eq(onboardingTemplates.id, existing.id));

    // Ordinary risk, still audited: hard delete, prior value unrecoverable from the row
    // itself (same rationale as employee.removeDocument/removeRequirement).
    ctx.audit({
      entityType: 'onboarding_templates',
      entityId: existing.id,
      before: { name: existing.name, isDefault: existing.isDefault, items: existing.items },
      after: null,
    });

    return { id: existing.id };
  },
});
