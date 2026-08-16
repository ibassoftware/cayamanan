import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { normalizeEmail } from '@/modules/identity/service/hash';
import { findUserByEmailForLink, findUserLinkedToEmployee, setUserEmployeeId } from '@/modules/identity/service/employee-link';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

// High-risk (self-service account linkage — CLAUDE.md's high-risk list includes
// "permission change"; this is the closer analogue among slice-04 actions and grants a
// user their own employee's data going forward, so it gets the same confirm+audit
// treatment). ADMIN only.
//
// Input takes `userEmail` (not `userId`): the confirmation card is a pure, synchronous
// function of the parsed input (src/platform/actions.ts `confirmationPreview`), so there
// is no way for it to resolve an opaque uuid into a human-readable value — the email
// itself IS the human-readable identifier ("link Maria's account to user maria@...").
// `employeeId`/`employeeNo` follow the same "one of" contract as every other employee.*
// action (see employee-selector.ts) — the confirmation card shows whichever was supplied.
const inputSchema = z
  .object({ ...employeeIdOrNoShape, userEmail: z.string().email() })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

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
  toolDescription:
    'Link an employee record to a user account for self-service login (admin only, requires confirmation). Identify the employee by employeeNo (e.g. "QA-0001") rather than employeeId whenever you have it — employee numbers are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  confirmationPreview(input) {
    const preview: Record<string, unknown> = { userEmail: input.userEmail };
    if (input.employeeId !== undefined) preview.employeeId = input.employeeId;
    if (input.employeeNo !== undefined) preview.employeeNo = input.employeeNo;
    return preview;
  },
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

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
