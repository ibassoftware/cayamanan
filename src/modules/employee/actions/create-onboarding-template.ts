import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { onboardingTemplates } from '../schema';
import { isDuplicateTemplateName, onboardingTemplateItemSchema } from '../service/onboarding-template';

const inputSchema = z
  .object({
    name: z.string().min(1).describe('Unique template name within the company (e.g. "Standard Rank-and-File").'),
    description: z.string().nullable().optional().describe('Free-text description of when to use this template.'),
    isDefault: z
      .boolean()
      .optional()
      .describe('Marks this the company’s default template — at most one may be default; setting this unsets any other.'),
    items: z
      .array(onboardingTemplateItemSchema)
      .min(1)
      .describe('Ordered checklist items this template creates (as employee_requirements rows) when applied.'),
  })
  .strict();

export const createOnboardingTemplateAction = defineAction({
  id: 'onboarding.createTemplate',
  title: 'Create onboarding checklist template',
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
  // Not exposed to Missy — the task packet calls out toolExposed only for
  // onboarding.listTemplates (a read) and employee.applyOnboardingTemplate (applying an
  // existing template). Authoring the checklist a template creates for every future hire
  // stays an admin-UI action for now; nothing prevents this from being flipped to true
  // later, but that is a product decision, not a default to assume.
  toolExposed: false,
  async handler(input, ctx) {
    if (input.isDefault) {
      // At most one default per company (onboarding_templates_one_default_per_company_uidx)
      // — unset any existing default rather than reject the create, since "make this the
      // new default" is the obviously intended behavior of setting the flag.
      await ctx.db
        .update(onboardingTemplates)
        .set({ isDefault: false, updatedAt: ctx.now, updatedBy: ctx.userId })
        .where(
          and(
            eq(onboardingTemplates.tenantId, ctx.tenantId),
            eq(onboardingTemplates.companyId, ctx.companyId),
            eq(onboardingTemplates.isDefault, true),
          ),
        );
    }

    try {
      const [created] = await ctx.db
        .insert(onboardingTemplates)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          name: input.name,
          description: input.description ?? null,
          isDefault: input.isDefault ?? false,
          items: input.items,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      // Ordinary risk: a trail, not a confirmation card — same rationale as
      // org.createDepartment (CLAUDE.md's audit list is a floor, not a ceiling; this
      // configures the checklist every future hire under it gets).
      ctx.audit({
        entityType: 'onboarding_templates',
        entityId: created.id,
        before: {},
        after: { name: created.name, isDefault: created.isDefault, items: created.items },
      });

      return {
        id: created.id,
        name: created.name,
        description: created.description,
        isDefault: created.isDefault,
        items: created.items as z.infer<typeof onboardingTemplateItemSchema>[],
      };
    } catch (error) {
      if (isDuplicateTemplateName(error)) {
        throw new ActionError('VALIDATION_ERROR', 'A template with this name already exists.', { field: 'name' });
      }
      throw error;
    }
  },
});
