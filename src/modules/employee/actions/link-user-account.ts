import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { normalizeEmail } from '@/modules/identity/service/hash';
import { findUserByEmailForLink, findUserLinkedToEmployee, setUserEmployeeId } from '@/modules/identity/service/employee-link';
import { employees } from '../schema';

// High-risk (self-service account linkage — CLAUDE.md's high-risk list includes
// "permission change"; this is the closer analogue among slice-04 actions and grants a
// user their own employee's data going forward, so it gets the same confirm+audit
// treatment). ADMIN only.
//
// Input takes `userEmail` (not `userId`): the confirmation card is a pure, synchronous
// function of the parsed input (src/platform/actions.ts `confirmationPreview`), so there
// is no way for it to resolve an opaque uuid into a human-readable value — the email
// itself IS the human-readable identifier ("link Maria's account to user maria@...").
const inputSchema = z.object({ employeeId: z.string().uuid(), userEmail: z.string().email() }).strict();

export const linkUserAccountAction = defineAction({
  id: 'employee.linkUserAccount',
  title: 'Link employee to user account',
  input: inputSchema,
  output: z.object({ employeeId: z.string().uuid(), userId: z.string().uuid() }),
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Link an employee record to a user account for self-service login (admin only, requires confirmation).',
  confirmationPreview(input) {
    return { employeeId: input.employeeId, userEmail: input.userEmail };
  },
  async handler(input, ctx) {
    const [employee] = await ctx.db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.id, input.employeeId),
          eq(employees.tenantId, ctx.tenantId),
          eq(employees.companyId, ctx.companyId),
        ),
      )
      .limit(1);
    if (!employee) {
      throw new ActionError('NOT_FOUND', 'Employee not found.');
    }

    const email = normalizeEmail(input.userEmail);
    const user = await findUserByEmailForLink(ctx.db, ctx.tenantId, ctx.companyId, email);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'No user with this email exists in this company.');
    }

    if (user.employeeId && user.employeeId !== employee.id) {
      throw new ActionError('CONFLICT', 'This user account is already linked to a different employee.');
    }

    const linkedUser = await findUserLinkedToEmployee(ctx.db, ctx.tenantId, ctx.companyId, employee.id);
    if (linkedUser && linkedUser.id !== user.id) {
      throw new ActionError('CONFLICT', 'This employee is already linked to a different user account.');
    }

    if (user.employeeId !== employee.id) {
      await setUserEmployeeId(ctx.db, user.id, employee.id);
    }

    ctx.audit({
      entityType: 'employee',
      entityId: employee.id,
      before: { userId: linkedUser?.id ?? null },
      after: { userId: user.id },
    });

    return { employeeId: employee.id, userId: user.id };
  },
});
