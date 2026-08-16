import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { isoDate } from '@/platform/fields';
import { employeeContacts } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    kind: z.enum(['EMERGENCY', 'BENEFICIARY', 'DEPENDENT']).describe('What kind of contact this is.'),
    name: z.string().min(1).describe('Full name of the contact/dependent.'),
    relationship: z.string().optional().describe('Relationship to the employee (e.g. "Spouse", "Child").'),
    mobile: z.string().optional().describe('Mobile number.'),
    email: z.string().email().optional().describe('Email address.'),
    address: z.string().optional().describe('Home address.'),
    birthDate: isoDate().optional().describe('Birth date — used for DEPENDENT tax-qualification age.'),
    isPrimary: z.boolean().optional().describe('Whether this is the primary contact for its kind.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const addContactAction = defineAction({
  id: 'employee.addContact',
  title: 'Add employee contact',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Add an emergency contact, beneficiary or dependent to an employee’s 201 file. Identify the employee by employeeNo whenever you have it.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [created] = await ctx.db
      .insert(employeeContacts)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        employeeId: employee.id,
        kind: input.kind,
        name: input.name,
        relationship: input.relationship ?? null,
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        birthDate: input.birthDate ?? null,
        isPrimary: input.isPrimary ?? false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({ id: employeeContacts.id });

    return { id: created.id };
  },
});
