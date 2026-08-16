import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate } from '@/platform/fields';
import { employeeWorkHistory } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    employer: z.string().min(1).describe('Name of the previous employer.'),
    position: z.string().optional().describe('Job title/position held at that employer.'),
    startDate: isoDate().optional().describe('Date employment there started.'),
    endDate: isoDate().optional().describe('Date employment there ended.'),
    reasonForLeaving: z.string().optional().describe('Reason for leaving that employer.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const addWorkHistoryAction = defineAction({
  id: 'employee.addWorkHistory',
  title: 'Add employee work history record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Add a prior-employment entry (employer, position, dates, reason for leaving) to an employee’s 201 file. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [created] = await ctx.db
      .insert(employeeWorkHistory)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        employeeId: employee.id,
        employer: input.employer,
        position: input.position ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        reasonForLeaving: input.reasonForLeaving ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({ id: employeeWorkHistory.id });

    return { id: created.id };
  },
});
