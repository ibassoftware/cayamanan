import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employeeRequirements } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

// Identified by (employeeId, requirement) — the same natural key `employee.setRequirement`
// upserts by, not a raw row id: there is no separate "add requirement" action, so nothing
// else in this action's own contract ever hands the caller a row id to remove by.
const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    requirement: z.string().min(1).describe('Checklist item name to remove (e.g. "SSS E-1 form").'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const removeRequirementAction = defineAction({
  id: 'employee.removeRequirement',
  title: 'Remove employee onboarding requirement',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Remove one onboarding checklist requirement from an employee’s 201 file. Identify the employee by employeeNo whenever you have it. This permanently deletes the record.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [existing] = await ctx.db
      .select()
      .from(employeeRequirements)
      .where(
        and(eq(employeeRequirements.employeeId, employee.id), eq(employeeRequirements.requirement, input.requirement)),
      )
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Requirement not found for this employee.');
    }

    await ctx.db.delete(employeeRequirements).where(eq(employeeRequirements.id, existing.id));

    ctx.audit({
      entityType: 'employee_requirements',
      entityId: existing.id,
      before: existing,
      after: null,
    });

    return { id: existing.id };
  },
});
