import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { users } from '@/modules/identity/schema';
import { revokeAllSessionsForUser } from '../service/session';

// High-risk: audited. An explicit "sign this user out everywhere" without deactivating
// them (e.g. suspected compromised session) — distinct from identity.deactivateUser,
// which also revokes sessions but as a side effect of disabling the account entirely.
export const revokeSessionsAction = defineAction({
  id: 'identity.revokeSessions',
  title: "Revoke a user's sessions",
  input: z.object({ userId: z.string().uuid() }).strict(),
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  toolExposed: false,
  async handler(input, ctx) {
    const [user] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.tenantId), eq(users.companyId, ctx.companyId)))
      .limit(1);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'User not found.');
    }

    await revokeAllSessionsForUser(ctx.db, user.id);

    ctx.audit({
      entityType: 'user',
      entityId: user.id,
      before: null,
      after: { action: 'sessions_revoked' },
    });

    return { id: user.id };
  },
});
