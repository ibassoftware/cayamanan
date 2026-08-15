import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { users } from '@/modules/identity/schema';
import { revokeAllSessionsForUser } from '../service/session';

// High-risk: audited. Also revokes every active session for the user in the same
// transaction — 02-identity-auth.md criterion 3: a deactivated user's live session must
// stop working on its next request, not merely at expiry.
export const deactivateUserAction = defineAction({
  id: 'identity.deactivateUser',
  title: 'Deactivate user',
  input: z.object({ userId: z.string().uuid() }).strict(),
  output: z.object({ id: z.string().uuid(), status: z.string() }),
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  async handler(input, ctx) {
    if (input.userId === ctx.userId) {
      throw new ActionError('VALIDATION_ERROR', 'You cannot deactivate your own account.');
    }

    const [user] = await ctx.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.tenantId), eq(users.companyId, ctx.companyId)))
      .limit(1);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'User not found.');
    }

    await ctx.db
      .update(users)
      .set({ status: 'INACTIVE', updatedAt: ctx.now, updatedBy: ctx.userId })
      .where(eq(users.id, user.id));

    await revokeAllSessionsForUser(ctx.db, user.id);

    ctx.audit({
      entityType: 'user',
      entityId: user.id,
      before: { status: user.status },
      after: { status: 'INACTIVE' },
    });

    return { id: user.id, status: 'INACTIVE' };
  },
});
