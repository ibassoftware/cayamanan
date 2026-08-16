import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { uuidRef } from '@/platform/fields';
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
  .object({ ...employeeIdOrNoShape, id: uuidRef('work history record') })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const removeWorkHistoryAction = defineAction({
  id: 'employee.removeWorkHistory',
  title: 'Remove employee work history record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Remove one of an employee’s prior-employment records. Identify the employee by employeeNo whenever you have it. This permanently deletes the record.',
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

    await ctx.db.delete(employeeWorkHistory).where(eq(employeeWorkHistory.id, existing.id));

    ctx.audit({
      entityType: 'employee_work_history',
      entityId: existing.id,
      before: existing,
      after: null,
    });

    return { id: existing.id };
  },
});
