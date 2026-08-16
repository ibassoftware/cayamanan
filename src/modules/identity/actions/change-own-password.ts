import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { users } from '@/modules/identity/schema';
import { hashPassword, verifyPassword } from '../service/password';
import { revokeAllSessionsForUser, revokeOtherSessionsForUser } from '../service/session';

export const changeOwnPasswordAction = defineAction({
  id: 'identity.changeOwnPassword',
  title: 'Change my password',
  input: z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
    })
    .strict(),
  output: z.object({ ok: z.literal(true) }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  // Never a Missy tool: a password change must come from the user typing their current
  // password into a real form, not from a conversational side-channel.
  toolExposed: false,
  async handler(input, ctx) {
    const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.userId ?? '')).limit(1);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'User not found.');
    }

    const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!currentOk) {
      throw new ActionError('UNAUTHORIZED', 'Current password is incorrect.');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await ctx.db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: ctx.now, updatedBy: user.id })
      .where(eq(users.id, user.id));

    // Self password change is the universal "I think my account is compromised"
    // remediation reflex — revoke every *other* live session (a stolen session
    // shouldn't survive the fix) while keeping the caller's current one alive, since
    // they're presumably still using it. ctx.sessionId is only ever null for the
    // anonymous identity.login action, never here; the fallback keeps this correct
    // even if that ever changed, rather than assuming.
    if (ctx.sessionId) {
      await revokeOtherSessionsForUser(ctx.db, user.id, ctx.sessionId);
    } else {
      await revokeAllSessionsForUser(ctx.db, user.id);
    }

    return { ok: true as const };
  },
});
