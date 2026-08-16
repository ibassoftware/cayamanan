import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate, uuidRef } from '@/platform/fields';
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
  .object({
    ...employeeIdOrNoShape,
    id: uuidRef('contact'),
    kind: z.enum(['EMERGENCY', 'BENEFICIARY', 'DEPENDENT']).optional().describe('What kind of contact this is.'),
    name: z.string().min(1).optional().describe('Full name of the contact/dependent.'),
    relationship: z.string().nullable().optional().describe('Relationship to the employee (e.g. "Spouse", "Child").'),
    mobile: z.string().nullable().optional().describe('Mobile number.'),
    email: z.string().email().nullable().optional().describe('Email address.'),
    address: z.string().nullable().optional().describe('Home address.'),
    birthDate: isoDate().nullable().optional().describe('Birth date — used for DEPENDENT tax-qualification age.'),
    isPrimary: z.boolean().optional().describe('Whether this is the primary contact for its kind.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const updateContactAction = defineAction({
  id: 'employee.updateContact',
  title: 'Update employee contact',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update one of an employee’s existing emergency contacts, beneficiaries or dependents. Identify the employee by employeeNo whenever you have it.',
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

    const patch: Partial<typeof employeeContacts.$inferInsert> = { updatedAt: ctx.now, updatedBy: ctx.userId };
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.name !== undefined) patch.name = input.name;
    if (input.relationship !== undefined) patch.relationship = input.relationship;
    if (input.mobile !== undefined) patch.mobile = input.mobile;
    if (input.email !== undefined) patch.email = input.email;
    if (input.address !== undefined) patch.address = input.address;
    if (input.birthDate !== undefined) patch.birthDate = input.birthDate;
    if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;

    await ctx.db.update(employeeContacts).set(patch).where(eq(employeeContacts.id, existing.id));

    return { id: existing.id };
  },
});
