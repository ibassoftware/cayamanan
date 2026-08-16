import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import { onboardingTemplates } from '../schema';
import { isDuplicateTemplateName, onboardingTemplateItemSchema } from '../service/onboarding-template';

// `name` doubles as the natural-key selector AND (when supplied alongside templateId)
// the rename target — same shape as org.updateDepartment's `code` (see that file's header
// comment): `keyIsAlsoMutableField: true` keeps `templateId` authoritative for finding the
// row whenever it's supplied, so a rename never gets rejected for "not resolving to
// itself" the way a plain natural-key cross-check would.
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
  keyIsAlsoMutableField: true,
};

const inputSchema = z
  .object({
    ...idOrKeyShape('templateId', 'name'),
    description: z.string().nullable().optional().describe('Free-text description of when to use this template.'),
    isDefault: z
      .boolean()
      .optional()
      .describe('Marks this the company’s default template — at most one may be default; setting this unsets any other.'),
    items: z
      .array(onboardingTemplateItemSchema)
      .min(1)
      .optional()
      .describe('Replaces the entire ordered checklist item list.'),
  })
  .strict()
  .superRefine(requireIdOrKey('templateId', 'name'));

export const updateOnboardingTemplateAction = defineAction({
  id: 'onboarding.updateTemplate',
  title: 'Update onboarding checklist template',
  input: inputSchema,
  output: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    isDefault: z.boolean(),
    items: z.array(onboardingTemplateItemSchema),
  }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // Not exposed to Missy — see create-onboarding-template.ts's identical note.
  toolExposed: false,
  async handler(input, ctx) {
    const existing = await resolveByIdOrKey<typeof onboardingTemplates.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      TEMPLATE_SELECTOR,
      input,
    );

    if (input.isDefault === true) {
      await ctx.db
        .update(onboardingTemplates)
        .set({ isDefault: false, updatedAt: ctx.now, updatedBy: ctx.userId })
        .where(
          and(
            eq(onboardingTemplates.tenantId, ctx.tenantId),
            eq(onboardingTemplates.companyId, ctx.companyId),
            eq(onboardingTemplates.isDefault, true),
            ne(onboardingTemplates.id, existing.id),
          ),
        );
    }

    try {
      const [updated] = await ctx.db
        .update(onboardingTemplates)
        .set({
          name: input.name ?? existing.name,
          description: input.description !== undefined ? input.description : existing.description,
          isDefault: input.isDefault ?? existing.isDefault,
          items: input.items ?? existing.items,
          updatedAt: ctx.now,
          updatedBy: ctx.userId,
        })
        .where(eq(onboardingTemplates.id, existing.id))
        .returning();

      // Ordinary risk: a trail, not a confirmation card. Only the fields this call
      // actually supplied — an omitted field is untouched (see update-department.ts).
      const suppliedFields = (['name', 'description', 'isDefault', 'items'] as const).filter(
        (field) => input[field] !== undefined,
      );
      ctx.audit({
        entityType: 'onboarding_templates',
        entityId: updated.id,
        before: Object.fromEntries(suppliedFields.map((field) => [field, existing[field]])),
        after: Object.fromEntries(suppliedFields.map((field) => [field, updated[field]])),
      });

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isDefault: updated.isDefault,
        items: updated.items as z.infer<typeof onboardingTemplateItemSchema>[],
      };
    } catch (error) {
      if (isDuplicateTemplateName(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A template with this name already exists.', { field: 'name' });
      }
      throw error;
    }
  },
});
