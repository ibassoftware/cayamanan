import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { users } from '@/modules/identity/schema';
import { hashPassword } from '../service/password';
import { revokeAllSessionsForUser } from '../service/session';

// High-risk: audited. Admin-set reset (out of scope: password reset by email). Forces
// must_change_password and revokes existing sessions, since whatever the user knew
// about their old credentials/session no longer applies once an admin has reset it.
export const resetUserPasswordAction = defineAction({
  id: 'identity.resetUserPassword',
  title: "Reset user's password",
  input: z
    .object({
      userId: z.string().uuid(),
      newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
    })
    .strict(),
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  async handler(input, ctx) {
    const [user] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.tenantId), eq(users.companyId, ctx.companyId)))
      .limit(1);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'User not found.');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await ctx.db
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(users.id, user.id));

    await revokeAllSessionsForUser(ctx.db, user.id);

    ctx.audit({
      entityType: 'user',
      entityId: user.id,
      before: null,
      // Never include password material — see create-user.ts.
      after: { action: 'password_reset_by_admin' },
    });

    return { id: user.id };
  },
});
