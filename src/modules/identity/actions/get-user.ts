import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction, type Role } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { userRoles, users } from '@/modules/identity/schema';
import { roleSchema } from '../service/role-schema';

export const getUserAction = defineAction({
  id: 'identity.getUser',
  title: 'Get user',
  input: z.object({ userId: z.string().uuid() }).strict(),
  output: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string(),
    status: z.string(),
    mustChangePassword: z.boolean(),
    lastLoginAt: z.string().nullable(),
    roles: z.array(roleSchema),
  }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN'],
  scope: 'company',
  toolExposed: false,
  async handler(input, ctx) {
    // `users` has no company_id RLS predicate (see schema.ts) — this explicit filter is
    // what keeps this scoped to the caller's company, not just their tenant.
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.tenantId), eq(users.companyId, ctx.companyId)))
      .limit(1);
    if (!user) {
      throw new ActionError('NOT_FOUND', 'User not found.');
    }

    const roleRows = await ctx.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      roles: roleRows.map((row) => row.role as Role),
    };
  },
});
