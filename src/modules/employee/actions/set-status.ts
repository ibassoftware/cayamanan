import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employees } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

// "Non-termination transitions" only (docs/plan/04-organization-employees.md): the
// input enum deliberately excludes 'SEPARATED' — that status exists on the `employees`
// row (for slice 05+ to write) but setting it is part of the termination workflow
// (separation date/reason on `employments`), which is out of scope here and, per
// CLAUDE.md, high-risk/audited in its own right. A caller who sends 'SEPARATED' gets a
// plain zod VALIDATION_ERROR before this handler ever runs.
const inputSchema = z
  .object({ ...employeeIdOrNoShape, status: z.enum(['ACTIVE', 'ON_LEAVE']) })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

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
  toolDescription:
    'Set an employee’s status to ACTIVE or ON_LEAVE (termination is a separate, later workflow). Identify the employee by employeeNo (e.g. "QA-0001") rather than employeeId whenever you have it — employee numbers are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
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
