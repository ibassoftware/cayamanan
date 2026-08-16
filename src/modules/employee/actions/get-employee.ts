import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { loadEmployeeDetail } from '../service/load-employee-detail';

// ADMIN/HR_PAYROLL only — the PII boundary's "returned only to ADMIN/HR or the employee
// themself" is satisfied by this role list alone (criterion 6: an EMPLOYEE-only caller,
// including via Missy, gets FORBIDDEN from executeAction's own role check before this
// handler ever runs — no separate check needed here).
const governmentIdsSchema = z
  .object({
    sssNo: z.string().nullable(),
    philhealthNo: z.string().nullable(),
    pagibigNo: z.string().nullable(),
    tin: z.string().nullable(),
    hdmfMid: z.string().nullable(),
  })
  .nullable();

const contactSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  name: z.string(),
  relationship: z.string().nullable(),
  mobile: z.string().nullable(),
});

export const employeeDetailSchema = z.object({
  id: z.string().uuid(),
  employeeNo: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  suffix: z.string().nullable(),
  birthDate: z.string().nullable(),
  sex: z.string().nullable(),
  civilStatus: z.string().nullable(),
  emailPersonal: z.string().nullable(),
  emailWork: z.string().nullable(),
  mobile: z.string().nullable(),
  address: z.unknown(),
  hireDate: z.string(),
  status: z.string(),
  photoUrl: z.string().nullable(),
  departmentId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  locationId: z.string().uuid().nullable(),
  governmentIds: governmentIdsSchema,
  contacts: z.array(contactSchema),
});

export const getEmployeeAction = defineAction({
  id: 'employee.get',
  title: 'Get employee',
  input: z.object({ employeeId: z.string().uuid() }).strict(),
  output: employeeDetailSchema,
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Get one employee’s full profile, government IDs and contacts (admin/HR only).',
  async handler(input, ctx) {
    const detail = await loadEmployeeDetail(ctx.db, ctx.tenantId, ctx.companyId, input.employeeId);
    if (!detail) {
      throw new ActionError('NOT_FOUND', 'Employee not found.');
    }
    return detail;
  },
});
