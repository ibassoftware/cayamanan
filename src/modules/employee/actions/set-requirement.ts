import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate } from '@/platform/fields';
import { employeeRequirements } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

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

// Upserts by (employeeId, requirement) — `requirement` is the checklist item's own free-
// text name (e.g. "SSS E-1 form"), unique per employee at the DB level
// (employee_requirements_tenant_company_employee_requirement_uidx). Calling this again
// for the same requirement text updates the existing row rather than creating a
// duplicate checklist entry.
const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    requirement: z.string().min(1).describe('Checklist item name (e.g. "SSS E-1 form", "NBI clearance").'),
    status: z.enum(['PENDING', 'SUBMITTED', 'WAIVED']).optional().describe('Checklist item status.'),
    submittedOn: isoDate().nullable().optional().describe('Date the requirement was submitted.'),
    notes: z.string().nullable().optional().describe('Free-text notes about this requirement.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const setRequirementAction = defineAction({
  id: 'employee.setRequirement',
  title: 'Set employee onboarding requirement',
  input: inputSchema,
  output: z.object({ id: z.string().uuid(), requirement: z.string(), status: z.string() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Set (create or update) one onboarding checklist requirement for an employee — e.g. mark "NBI clearance" as SUBMITTED. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [existing] = await ctx.db
      .select()
      .from(employeeRequirements)
      .where(
        and(eq(employeeRequirements.employeeId, employee.id), eq(employeeRequirements.requirement, input.requirement)),
      )
      .limit(1);

    if (existing) {
      const patch: Partial<typeof employeeRequirements.$inferInsert> = { updatedAt: ctx.now, updatedBy: ctx.userId };
      if (input.status !== undefined) patch.status = input.status;
      if (input.submittedOn !== undefined) patch.submittedOn = input.submittedOn;
      if (input.notes !== undefined) patch.notes = input.notes;
      const [updated] = await ctx.db
        .update(employeeRequirements)
        .set(patch)
        .where(eq(employeeRequirements.id, existing.id))
        .returning();
      return { id: updated.id, requirement: updated.requirement, status: updated.status };
    }

    try {
      const [created] = await ctx.db
        .insert(employeeRequirements)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          employeeId: employee.id,
          requirement: input.requirement,
          status: input.status ?? 'PENDING',
          submittedOn: input.submittedOn ?? null,
          notes: input.notes ?? null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();
      return { id: created.id, requirement: created.requirement, status: created.status };
    } catch (error) {
      if (isDuplicateRequirement(error)) {
        // Race with a concurrent setRequirement for the same requirement text — the
        // pre-check above closes the common case; this closes the race itself (see
        // create-employee.ts's identical pattern for employee_no).
        const [reloaded] = await ctx.db
          .select()
          .from(employeeRequirements)
          .where(
            and(
              eq(employeeRequirements.employeeId, employee.id),
              eq(employeeRequirements.requirement, input.requirement),
            ),
          )
          .limit(1);
        if (reloaded) {
          return { id: reloaded.id, requirement: reloaded.requirement, status: reloaded.status };
        }
      }
      throw error;
    }
  },
});
