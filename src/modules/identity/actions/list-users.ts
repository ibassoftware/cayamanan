import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction, type Role } from '@/platform/actions';
import { userRoles, users } from '@/modules/identity/schema';
import { roleSchema } from '../service/role-schema';

const userSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  status: z.string(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  roles: z.array(roleSchema),
});

// ADMIN-only; not audited (02-identity-auth.md criterion 4: "none for ... viewing the
// user list"). `users` has no company_id RLS predicate (see schema.ts), so the explicit
// `eq(users.companyId, ctx.companyId)` below is the only thing scoping this to the
// caller's company — never drop it.
export const listUsersAction = defineAction({
  id: 'identity.listUsers',
  title: 'List users',
  input: z.object({}).strict(),
  output: z.object({ users: z.array(userSummarySchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN'],
  scope: 'company',
  // ADMIN-only tool: the tool bridge filters this out of an Employee's/HR_PAYROLL's tool
  // list entirely (docs/plan/03-missy-foundation.md criterion 3); executeAction's own
  // role check is what actually enforces it either way (criterion 6), independent of
  // whether the tool was ever offered.
  toolExposed: true,
  toolDescription: 'List every user in the company, with their roles and status (admin only).',
  async handler(_input, ctx) {
    const userRows = await ctx.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.companyId, ctx.companyId)));

    const userIds = userRows.map((row) => row.id);
    const roleRows = userIds.length
      ? await ctx.db
          .select({ userId: userRoles.userId, role: userRoles.role })
          .from(userRoles)
          .where(inArray(userRoles.userId, userIds))
      : [];

    const rolesByUser = new Map<string, Role[]>();
    for (const row of roleRows) {
      const list = rolesByUser.get(row.userId) ?? [];
      list.push(row.role as Role);
      rolesByUser.set(row.userId, list);
    }

    return {
      users: userRows.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        roles: rolesByUser.get(user.id) ?? [],
      })),
    };
  },
});
