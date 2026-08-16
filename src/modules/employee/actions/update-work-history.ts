import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate, uuidRef } from '@/platform/fields';
import { employeeWorkHistory } from '../schema';
import { resolveChildRow, type ChildRowConfig } from '../service/child-row';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const WORK_HISTORY_ROW: ChildRowConfig = {
  table: employeeWorkHistory,
  idColumn: employeeWorkHistory.id,
  employeeIdColumn: employeeWorkHistory.employeeId,
  tenantIdColumn: employeeWorkHistory.tenantId,
  companyIdColumn: employeeWorkHistory.companyId,
  entityLabel: 'Work history record',
};

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    id: uuidRef('work history record'),
    employer: z.string().min(1).optional().describe('Name of the previous employer.'),
    position: z.string().nullable().optional().describe('Job title/position held at that employer.'),
    startDate: isoDate().nullable().optional().describe('Date employment there started.'),
    endDate: isoDate().nullable().optional().describe('Date employment there ended.'),
    reasonForLeaving: z.string().nullable().optional().describe('Reason for leaving that employer.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const updateWorkHistoryAction = defineAction({
  id: 'employee.updateWorkHistory',
  title: 'Update employee work history record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update one of an employee’s existing prior-employment records. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
    const existing = await resolveChildRow<typeof employeeWorkHistory.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      WORK_HISTORY_ROW,
      input.id,
      employee.id,
    );

    const patch: Partial<typeof employeeWorkHistory.$inferInsert> = { updatedAt: ctx.now, updatedBy: ctx.userId };
    if (input.employer !== undefined) patch.employer = input.employer;
    if (input.position !== undefined) patch.position = input.position;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.reasonForLeaving !== undefined) patch.reasonForLeaving = input.reasonForLeaving;

    await ctx.db.update(employeeWorkHistory).set(patch).where(eq(employeeWorkHistory.id, existing.id));

    return { id: existing.id };
  },
});
