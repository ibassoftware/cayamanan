import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { loadEmployeeDetail } from '../service/load-employee-detail';
import { employeeDetailSchema } from './get-employee';

// scope:'self' — no employeeId in the input at all, so there is nothing here for a
// caller to widen (criterion 6: "asking Missy for another employee's birthdate is
// refused at the action layer" — an EMPLOYEE cannot even express "someone else's id" to
// this action; ctx.employeeId always comes from the verified session, never the input).
export const getSelfEmployeeAction = defineAction({
  id: 'employee.getSelf',
  title: 'Get my own employee profile',
  input: z.object({}).strict(),
  output: employeeDetailSchema,
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  toolExposed: true,
  toolDescription: 'Get the current user’s own employee profile, government IDs and contacts.',
  async handler(_input, ctx) {
    if (!ctx.employeeId) {
      throw new ActionError('NOT_FOUND', 'No employee record is linked to your account.');
    }
    const detail = await loadEmployeeDetail(ctx.db, ctx.tenantId, ctx.companyId, ctx.employeeId);
    if (!detail) {
      throw new ActionError('NOT_FOUND', 'No employee record is linked to your account.');
    }
    return detail;
  },
});
