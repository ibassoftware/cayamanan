import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { uuidRef } from '@/platform/fields';
import { employeeTraining } from '../schema';
import { resolveChildRow, type ChildRowConfig } from '../service/child-row';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const TRAINING_ROW: ChildRowConfig = {
  table: employeeTraining,
  idColumn: employeeTraining.id,
  employeeIdColumn: employeeTraining.employeeId,
  tenantIdColumn: employeeTraining.tenantId,
  companyIdColumn: employeeTraining.companyId,
  entityLabel: 'Training record',
};

const inputSchema = z
  .object({ ...employeeIdOrNoShape, id: uuidRef('training record') })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const removeTrainingAction = defineAction({
  id: 'employee.removeTraining',
  title: 'Remove employee training record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Remove one of an employee’s training records. Identify the employee by employeeNo whenever you have it. This permanently deletes the record.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
    const existing = await resolveChildRow<typeof employeeTraining.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      TRAINING_ROW,
      input.id,
      employee.id,
    );

    await ctx.db.delete(employeeTraining).where(eq(employeeTraining.id, existing.id));

    ctx.audit({
      entityType: 'employee_training',
      entityId: existing.id,
      before: existing,
      after: null,
    });

    return { id: existing.id };
  },
});
