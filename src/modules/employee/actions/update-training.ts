import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate, uuidRef } from '@/platform/fields';
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

// See add-training.ts: `hours` stays a decimal string end to end, never a JS number.
const hoursSchema = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Hours must be a plain decimal number with up to 2 decimal places.')
  .describe('Training duration in hours (e.g. "7.5").');

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    id: uuidRef('training record'),
    title: z.string().min(1).optional().describe('Title of the training/seminar.'),
    provider: z.string().nullable().optional().describe('Organization that provided the training.'),
    startDate: isoDate().nullable().optional().describe('Date the training started.'),
    endDate: isoDate().nullable().optional().describe('Date the training ended.'),
    hours: hoursSchema.nullable().optional(),
    certificateNo: z.string().nullable().optional().describe('Certificate/completion number, if issued.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const updateTrainingAction = defineAction({
  id: 'employee.updateTraining',
  title: 'Update employee training record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update one of an employee’s existing training records. Identify the employee by employeeNo whenever you have it.',
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

    const patch: Partial<typeof employeeTraining.$inferInsert> = { updatedAt: ctx.now, updatedBy: ctx.userId };
    if (input.title !== undefined) patch.title = input.title;
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.hours !== undefined) patch.hours = input.hours;
    if (input.certificateNo !== undefined) patch.certificateNo = input.certificateNo;

    await ctx.db.update(employeeTraining).set(patch).where(eq(employeeTraining.id, existing.id));

    return { id: existing.id };
  },
});
