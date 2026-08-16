import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employees } from '../schema';

// "Non-termination transitions" only (docs/plan/04-organization-employees.md): the
// input enum deliberately excludes 'SEPARATED' — that status exists on the `employees`
// row (for slice 05+ to write) but setting it is part of the termination workflow
// (separation date/reason on `employments`), which is out of scope here and, per
// CLAUDE.md, high-risk/audited in its own right. A caller who sends 'SEPARATED' gets a
// plain zod VALIDATION_ERROR before this handler ever runs.
const inputSchema = z.object({ employeeId: z.string().uuid(), status: z.enum(['ACTIVE', 'ON_LEAVE']) }).strict();

export const setStatusAction = defineAction({
  id: 'employee.setStatus',
  title: 'Set employee status',
  input: inputSchema,
  output: z.object({ id: z.string().uuid(), status: z.string() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Set an employee’s status to ACTIVE or ON_LEAVE (termination is a separate, later workflow).',
  async handler(input, ctx) {
    const [existing] = await ctx.db
      .select({ id: employees.id, status: employees.status })
      .from(employees)
      .where(
        and(
          eq(employees.id, input.employeeId),
          eq(employees.tenantId, ctx.tenantId),
          eq(employees.companyId, ctx.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Employee not found.');
    }
    if (existing.status === 'SEPARATED') {
      throw new ActionError('VALIDATION_ERROR', 'This employee is separated; status changes are no longer permitted here.');
    }

    await ctx.db
      .update(employees)
      .set({ status: input.status, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(employees.id, existing.id));

    return { id: existing.id, status: input.status };
  },
});
