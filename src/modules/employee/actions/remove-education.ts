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
  .object({ ...employeeIdOrNoShape, id: uuidRef('education record') })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const removeEducationAction = defineAction({
  id: 'employee.removeEducation',
  title: 'Remove employee education record',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Remove one of an employee’s education records. Identify the employee by employeeNo whenever you have it. This permanently deletes the record.',
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

    await ctx.db.delete(employeeEducation).where(eq(employeeEducation.id, existing.id));

    // Hard delete — the prior row is not recoverable from the table itself afterward
    // (CLAUDE.md: "audit anything whose prior value cannot be recovered from the row
    // itself"). Ordinary risk still permits an opt-in audit entry.
    ctx.audit({
      entityType: 'employee_education',
      entityId: existing.id,
      before: existing,
      after: null,
    });

    return { id: existing.id };
  },
});
