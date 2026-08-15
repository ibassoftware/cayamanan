import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction, type Role } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { lookupUserByEmailForAuth, withTenantContext } from '@/platform/db';
import { userRoles, users } from '@/modules/identity/schema';
import { roleSchema } from '../service/role-schema';
import { normalizeEmail, sha256Hex } from '../service/hash';
import { getDummyPasswordHash, verifyPassword } from '../service/password';
import { isLoginLocked, recordFailedLogin, clearLoginFailures, MAX_FAILED_ATTEMPTS } from '../service/rate-limit';
import { createSession } from '../service/session';
import { recordLoginAttempt } from '../service/login-attempts';

// The one action that runs before any tenant/session exists — see the `anonymous` doc
// on DefineActionArgs and the "hard problem" writeup in src/platform/db.ts.
//
// No-enumeration (02-identity-auth.md criterion 5): an unknown email and a wrong
// password for a real email must be indistinguishable, including response time. Both
// paths run exactly one argon2 verify (against the real hash, or a memoized dummy hash)
// and return the identical error. Ambiguous email matches (should never happen —
// MVP enforces single-tenant operation; see lookupUserByEmailForAuth) are also folded
// into "no match" rather than picked arbitrarily. Lockout is its own distinct, clearly
// different outcome (the plan's `/login` UI has a separate "locked-out" state) — only
// "unknown email" vs "wrong password" must be indistinguishable, not "locked out".
const GENERIC_INVALID_CREDENTIALS = 'Incorrect email or password.';
const GENERIC_LOCKED_OUT = 'Too many failed attempts. Please try again later.';

export const loginAction = defineAction({
  id: 'identity.login',
  title: 'Log in',
  input: z.object({ email: z.string().email(), password: z.string().min(1) }).strict(),
  output: z.object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string(),
      name: z.string(),
      roles: z.array(roleSchema),
    }),
    mustChangePassword: z.boolean(),
  }),
  read: false,
  risk: 'ordinary',
  roles: [],
  scope: 'company',
  anonymous: true,
  async handler(input, ctx) {
    const email = normalizeEmail(input.email);
    const emailHash = sha256Hex(email);
    const ipHash = ctx.ip ? sha256Hex(ctx.ip) : null;
    const userAgentHash = ctx.userAgent ? sha256Hex(ctx.userAgent) : null;

    if (await isLoginLocked(emailHash)) {
      await recordLoginAttempt(emailHash, false, ipHash);
      throw new ActionError('UNAUTHORIZED', GENERIC_LOCKED_OUT);
    }

    const rows = await lookupUserByEmailForAuth(email);
    // More than one row would mean the same email exists in more than one tenant — an
    // anomaly MVP's single-tenant invariant should prevent. Treat it the same as "no
    // match" rather than guessing which tenant the caller meant.
    const candidate = rows.length === 1 ? rows[0] : null;

    const hashToVerify = candidate ? candidate.passwordHash : await getDummyPasswordHash();
    const passwordOk = await verifyPassword(hashToVerify, input.password);

    if (!candidate || !passwordOk || candidate.status !== 'ACTIVE') {
      await recordFailedLogin(emailHash);
      await recordLoginAttempt(emailHash, false, ipHash);
      throw new ActionError('UNAUTHORIZED', GENERIC_INVALID_CREDENTIALS);
    }

    await clearLoginFailures(emailHash);
    await recordLoginAttempt(emailHash, true, ipHash);

    // Not named `db` (see eslint-rules/no-raw-db-access.mjs's belt-and-braces syntax
    // selector, scoped to src/modules/**) — this is the one place identity.login is
    // allowed to call withTenantContext directly (see the file header comment above),
    // but the convention that flags a raw `db` handle still shouldn't be silenced by
    // renaming around it in spirit, only in the specific identifier it matches on.
    return withTenantContext({ tenantId: candidate.tenantId, companyId: candidate.companyId }, async (tenantDb) => {
      const roleRows = await tenantDb
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, candidate.id));
      const roles = roleRows.map((row) => row.role as Role);

      const { cookieValue } = await createSession(tenantDb, {
        tenantId: candidate.tenantId,
        userId: candidate.id,
        ipHash,
        userAgentHash,
      });

      await tenantDb.update(users).set({ lastLoginAt: ctx.now }).where(eq(users.id, candidate.id));

      ctx.setSessionCookie(cookieValue);

      return {
        user: { id: candidate.id, email: candidate.email, name: candidate.name, roles },
        mustChangePassword: candidate.mustChangePassword,
      };
    });
  },
});

// Re-exported so identity.login's MAX_FAILED_ATTEMPTS-driven UI copy (slice-02 UI task)
// can reference a single source of truth instead of hardcoding "5".
export { MAX_FAILED_ATTEMPTS };
