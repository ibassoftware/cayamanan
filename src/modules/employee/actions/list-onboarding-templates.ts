import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { onboardingTemplates } from '../schema';
import { onboardingTemplateItemSchema } from '../service/onboarding-template';

const templateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  items: z.array(onboardingTemplateItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listOnboardingTemplatesAction = defineAction({
  id: 'onboarding.listTemplates',
  title: 'List onboarding checklist templates',
  input: z.object({}).strict(),
  output: z.object({ templates: z.array(templateSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'List the company’s reusable onboarding checklist templates (name, description, default flag, and their ordered checklist items).',
  async handler(input, ctx) {
    const rows = await ctx.db
      .select()
      .from(onboardingTemplates)
      .where(and(eq(onboardingTemplates.tenantId, ctx.tenantId), eq(onboardingTemplates.companyId, ctx.companyId)))
      .orderBy(onboardingTemplates.name);

    return {
      templates: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        isDefault: row.isDefault,
        items: row.items as z.infer<typeof onboardingTemplateItemSchema>[],
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },
});
