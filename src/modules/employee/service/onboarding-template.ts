// Shared plumbing for onboarding.createTemplate/updateTemplate and
// employee.applyOnboardingTemplate — the `items` shape and its duplicate-name detector,
// in one place so every action that reads/writes `onboarding_templates.items` agrees on
// its contract. The natural-key selector config itself is *not* shared here: each action
// file (create/update/remove) declares its own, matching org's department/position
// convention (see update-department.ts vs archive-department.ts) — `keyIsAlsoMutableField`
// differs per action (true only where the action can rename the template), so a single
// shared config would either need a flag threaded through every call site or silently be
// wrong for one of the three.
import { z } from 'zod';

export const onboardingTemplateItemSchema = z
  .object({
    requirement: z.string().min(1).describe('Checklist item name (e.g. "SSS E-1 form", "NBI clearance").'),
    notes: z.string().nullable().optional().describe('Notes copied onto the employee_requirements row this item creates.'),
  })
  .strict();

/** One entry of `onboarding_templates.items` — see schema.ts for why this is jsonb, not a
 * child table. */
export type OnboardingTemplateItem = z.infer<typeof onboardingTemplateItemSchema>;

export const UNIQUE_TEMPLATE_NAME_CONSTRAINT = 'onboarding_templates_tenant_company_name_uidx';

export function isDuplicateTemplateName(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === UNIQUE_TEMPLATE_NAME_CONSTRAINT,
  );
}
