import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { uuidRef } from '@/platform/fields';
import { employeeEducation } from '../schema';
import { resolveChildRow, type ChildRowConfig } from '../service/child-row';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const EDUCATION_ROW: ChildRowConfig = {
  table: employeeEducation,
  idColumn: employeeEducation.id,
  employeeIdColumn: employeeEducation.employeeId,
  tenantIdColumn: employeeEducation.tenantId,
  companyIdColumn: employeeEducation.companyId,
  entityLabel: 'Education record',
};

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    id: uuidRef('education record'),
    level: z
      .enum(['ELEMENTARY', 'SECONDARY', 'SENIOR_HIGH', 'VOCATIONAL', 'COLLEGE', 'GRADUATE'])
      .optional()
      .describe('Educational level this record is for.'),
    school: z.string().min(1).optional().describe('Name of the school/institution attended.'),
    degree: z.string().nullable().optional().describe('Degree or diploma earned, if any (e.g. "BS Accountancy").'),
    fieldOfStudy: z.string().nullable().optional().describe('Field/major studied.'),
    startYear: z.number().int().nullable().optional().describe('Year studies started.'),
    endYear: z.number().int().nullable().optional().describe('Year studies ended (or expected to end).'),
    honors: z.string().nullable().optional().describe('Honors or distinctions received (e.g. "Cum Laude").'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const updateEducationAction = defineAction({
  id: 'employee.updateEducation',
  title: 'Update employee education record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update one of an employee’s existing education records. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
    const existing = await resolveChildRow<typeof employeeEducation.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      EDUCATION_ROW,
      input.id,
      employee.id,
    );

    const patch: Partial<typeof employeeEducation.$inferInsert> = { updatedAt: ctx.now, updatedBy: ctx.userId };
    if (input.level !== undefined) patch.level = input.level;
    if (input.school !== undefined) patch.school = input.school;
    if (input.degree !== undefined) patch.degree = input.degree;
    if (input.fieldOfStudy !== undefined) patch.fieldOfStudy = input.fieldOfStudy;
    if (input.startYear !== undefined) patch.startYear = input.startYear;
    if (input.endYear !== undefined) patch.endYear = input.endYear;
    if (input.honors !== undefined) patch.honors = input.honors;

    await ctx.db.update(employeeEducation).set(patch).where(eq(employeeEducation.id, existing.id));

    return { id: existing.id };
  },
});
