import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { uuidRef } from '@/platform/fields';
import { employeeContacts } from '../schema';
import { resolveChildRow, type ChildRowConfig } from '../service/child-row';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const CONTACT_ROW: ChildRowConfig = {
  table: employeeContacts,
  idColumn: employeeContacts.id,
  employeeIdColumn: employeeContacts.employeeId,
  tenantIdColumn: employeeContacts.tenantId,
  companyIdColumn: employeeContacts.companyId,
  entityLabel: 'Contact',
};

const inputSchema = z
  .object({ ...employeeIdOrNoShape, id: uuidRef('contact') })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const removeContactAction = defineAction({
  id: 'employee.removeContact',
  title: 'Remove employee contact',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Remove one of an employee’s emergency contacts, beneficiaries or dependents. Identify the employee by employeeNo whenever you have it. This permanently deletes the record.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
    const existing = await resolveChildRow<typeof employeeContacts.$inferSelect>(
      ctx.db,
      ctx.tenantId,
      ctx.companyId,
      CONTACT_ROW,
      input.id,
      employee.id,
    );

    await ctx.db.delete(employeeContacts).where(eq(employeeContacts.id, existing.id));

    ctx.audit({
      entityType: 'employee_contacts',
      entityId: existing.id,
      before: existing,
      after: null,
    });

    return { id: existing.id };
  },
});
