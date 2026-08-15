import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { users } from '@/modules/identity/schema';
import { roleSchema } from '../service/role-schema';

// Tool-exposed to Missy starting slice 03 (so she knows who she's talking to) — see
// docs/plan/02-identity-auth.md "Missy tools". Never returns password_hash or anything
// beyond what a user is already entitled to know about their own account.
export const meAction = defineAction({
  id: 'identity.me',
  title: 'Who am I',
  input: z.object({}).strict(),
  output: z.object({
    userId: z.string().uuid(),
    email: z.string(),
    name: z.string(),
    roles: z.array(roleSchema),
    mustChangePassword: z.boolean(),
  }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'self',
  async handler(_input, ctx) {
    const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.userId ?? '')).limit(1);
    if (!user) {
      // Should not happen — resolveSessionFromCookie already confirmed the user exists
      // and is active for this exact request. Surfacing NOT_FOUND (not INTERNAL) keeps
      // the message generic and safe either way.
      throw new ActionError('NOT_FOUND', 'User not found.');
    }
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: ctx.roles,
      mustChangePassword: user.mustChangePassword,
    };
  },
});
