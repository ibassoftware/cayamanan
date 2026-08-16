import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction, type Role } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { userRoles, users } from '@/modules/identity/schema';
import { roleSchema } from '../service/role-schema';
import { normalizeEmail } from '../service/hash';
import { hashPassword } from '../service/password';

// High-risk: audited (02-identity-auth.md criterion 4). Admin sets the initial password
// directly (out of scope: invitations by email) — the new user always gets
// mustChangePassword: true regardless of input, so a leaked/shared initial password
// can't be reused past first login.
export const createUserAction = defineAction({
  id: 'identity.createUser',
  title: 'Create user',
  input: z
    .object({
      email: z.string().email(),
      name: z.string().min(1),
      initialPassword: z.string().min(8, 'Initial password must be at least 8 characters.'),
      roles: z.array(roleSchema).min(1, 'Select at least one role.'),
    })
    .strict(),
  output: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string(),
    roles: z.array(roleSchema),
  }),
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  // Out of scope for slice 03's Missy tools: creating a user sets an initial password,
  // which should never travel through a chat transcript.
  toolExposed: false,
  async handler(input, ctx) {
    const email = normalizeEmail(input.email);

    const [existing] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.email, email)))
      .limit(1);
    if (existing) {
      throw new ActionError('CONFLICT', 'A user with this email already exists.');
    }

    const passwordHash = await hashPassword(input.initialPassword);
    const uniqueRoles = Array.from(new Set(input.roles)) as Role[];

    const [created] = await ctx.db
      .insert(users)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        email,
        name: input.name,
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();

    await ctx.db.insert(userRoles).values(
      uniqueRoles.map((role) => ({
        tenantId: ctx.tenantId,
        userId: created.id,
        role,
        createdBy: ctx.userId,
      })),
    );

    ctx.audit({
      entityType: 'user',
      entityId: created.id,
      before: null,
      // Never include passwordHash/initialPassword here — audit_logs.before/after must
      // never carry password material (redact() only covers log lines, not audit rows).
      after: { email: created.email, name: created.name, roles: uniqueRoles },
    });

    return { id: created.id, email: created.email, name: created.name, roles: uniqueRoles };
  },
});
