import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction, type Role } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { userRoles, users } from '@/modules/identity/schema';
import { roleSchema } from '../service/role-schema';

// High-risk: audited (permission change). Replaces a user's whole role set.
export const setUserRolesAction = defineAction({
  id: 'identity.setUserRoles',
  title: 'Set user roles',
  input: z
    .object({
      userId: z.string().uuid(),
      roles: z.array(roleSchema).min(1, 'Select at least one role.'),
    })
    .strict(),
  output: z.object({ id: z.string().uuid(), roles: z.array(roleSchema) }),
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  toolExposed: false,
  async handler(input, ctx) {
    // `users` has no company_id RLS predicate — this explicit filter confirms the
    // target user is actually in the caller's company before mutating anything.
    const [user] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.tenantId), eq(users.companyId, ctx.companyId)))
      .limit(1);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'User not found.');
    }

    const existingRoleRows = await ctx.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));
    const beforeRoles = existingRoleRows.map((row) => row.role as Role);

    const newRoles = Array.from(new Set(input.roles)) as Role[];

    await ctx.db.delete(userRoles).where(eq(userRoles.userId, user.id));
    await ctx.db.insert(userRoles).values(
      newRoles.map((role) => ({
        tenantId: ctx.tenantId,
        userId: user.id,
        role,
        createdBy: ctx.userId,
      })),
    );

    ctx.audit({
      entityType: 'user',
      entityId: user.id,
      before: { roles: beforeRoles },
      after: { roles: newRoles },
    });

    return { id: user.id, roles: newRoles };
  },
});
