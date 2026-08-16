import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { employeeEducation } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    level: z
      .enum(['ELEMENTARY', 'SECONDARY', 'SENIOR_HIGH', 'VOCATIONAL', 'COLLEGE', 'GRADUATE'])
      .describe('Educational level this record is for.'),
    school: z.string().min(1).describe('Name of the school/institution attended.'),
    degree: z.string().optional().describe('Degree or diploma earned, if any (e.g. "BS Accountancy").'),
    fieldOfStudy: z.string().optional().describe('Field/major studied.'),
    startYear: z.number().int().optional().describe('Year studies started.'),
    endYear: z.number().int().optional().describe('Year studies ended (or expected to end).'),
    honors: z.string().optional().describe('Honors or distinctions received (e.g. "Cum Laude").'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const addEducationAction = defineAction({
  id: 'employee.addEducation',
  title: 'Add employee education record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Add an educational background entry (level, school, degree, years attended, honors) to an employee’s 201 file. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [created] = await ctx.db
      .insert(employeeEducation)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        employeeId: employee.id,
        level: input.level,
        school: input.school,
        degree: input.degree ?? null,
        fieldOfStudy: input.fieldOfStudy ?? null,
        startYear: input.startYear ?? null,
        endYear: input.endYear ?? null,
        honors: input.honors ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({ id: employeeEducation.id });

    return { id: created.id };
  },
});
