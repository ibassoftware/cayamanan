import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate } from '@/platform/fields';
import { employeeTraining } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

// `hours` is a decimal string, never a JS number (numeric(8,2) — CLAUDE.md: never
// parseFloat a `pg` numeric). Not money, so `Money` is not required, but the same
// "string all the way through" rule applies — validated as a numeric-looking string, not
// coerced to `number` at any point.
const hoursSchema = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Hours must be a plain decimal number with up to 2 decimal places.')
  .describe('Training duration in hours (e.g. "7.5").');

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    title: z.string().min(1).describe('Title of the training/seminar.'),
    provider: z.string().optional().describe('Organization that provided the training.'),
    startDate: isoDate().optional().describe('Date the training started.'),
    endDate: isoDate().optional().describe('Date the training ended.'),
    hours: hoursSchema.optional(),
    certificateNo: z.string().optional().describe('Certificate/completion number, if issued.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const addTrainingAction = defineAction({
  id: 'employee.addTraining',
  title: 'Add employee training record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Add a training/seminar record (title, provider, dates, hours, certificate) to an employee’s 201 file. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [created] = await ctx.db
      .insert(employeeTraining)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        employeeId: employee.id,
        title: input.title,
        provider: input.provider ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        hours: input.hours ?? null,
        certificateNo: input.certificateNo ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({ id: employeeTraining.id });

    return { id: created.id };
  },
});
