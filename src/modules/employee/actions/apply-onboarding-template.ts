import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employeeRequirements, onboardingTemplates } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';
import type { OnboardingTemplateItem } from '../service/onboarding-template';

const UNIQUE_REQUIREMENT_CONSTRAINT = 'employee_requirements_tenant_company_employee_requirement_uidx';

function isDuplicateRequirement(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === UNIQUE_REQUIREMENT_CONSTRAINT,
  );
}

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    templateId: z.string().uuid().describe('Onboarding template to apply (see onboarding.listTemplates).'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const applyOnboardingTemplateAction = defineAction({
  id: 'employee.applyOnboardingTemplate',
  title: 'Apply onboarding checklist template',
  input: inputSchema,
  output: z.object({
    created: z.array(z.string()).describe('Requirement names newly created for this employee.'),
    skipped: z.array(z.string()).describe('Requirement names the employee already had — left untouched.'),
  }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Apply a reusable onboarding checklist template to an employee, creating one PENDING requirement per template item. Already-existing requirements (by name) are left untouched, not duplicated. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [template] = await ctx.db
      .select()
      .from(onboardingTemplates)
      .where(
        and(
          eq(onboardingTemplates.id, input.templateId),
          eq(onboardingTemplates.tenantId, ctx.tenantId),
          eq(onboardingTemplates.companyId, ctx.companyId),
        ),
      )
      .limit(1);
    if (!template) {
      throw new ActionError('NOT_FOUND', 'Onboarding template not found.', { field: 'templateId' });
    }

    const items = template.items as OnboardingTemplateItem[];

    const existingRows = await ctx.db
      .select({ requirement: employeeRequirements.requirement })
      .from(employeeRequirements)
      .where(eq(employeeRequirements.employeeId, employee.id));
    const existingNames = new Set(existingRows.map((row) => row.requirement));

    const created: string[] = [];
    const skipped: string[] = [];

    // Sequential, not Promise.all: `ctx.db` is a single connection bound to this
    // transaction (see load-employee-detail.ts's identical note) — and this must stay
    // idempotent per item, not partially parallel, so a template with a duplicated
    // requirement name skips its second occurrence just like an already-existing one.
    for (const item of items) {
      if (existingNames.has(item.requirement)) {
        skipped.push(item.requirement);
        continue;
      }
      try {
        await ctx.db.insert(employeeRequirements).values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          employeeId: employee.id,
          requirement: item.requirement,
          status: 'PENDING',
          notes: item.notes ?? null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
        created.push(item.requirement);
        existingNames.add(item.requirement);
      } catch (error) {
        if (isDuplicateRequirement(error)) {
          // Race with a concurrent setRequirement/applyOnboardingTemplate call for the
          // same requirement text — the pre-check above closes the common case, this
          // closes the race (see set-requirement.ts's identical pattern).
          skipped.push(item.requirement);
          existingNames.add(item.requirement);
          continue;
        }
        throw error;
      }
    }

    // Ordinary risk: a trail, not a confirmation card — this can create several rows at
    // once from a template, worth recording which one and what happened.
    ctx.audit({
      entityType: 'employee_requirements',
      entityId: employee.id,
      before: {},
      after: { templateId: template.id, templateName: template.name, created, skipped },
    });

    return { created, skipped };
  },
});
