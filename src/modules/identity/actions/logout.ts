import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { revokeSession } from '../service/session';

export const logoutAction = defineAction({
  id: 'identity.logout',
  title: 'Log out',
  input: z.object({}).strict(),
  output: z.object({ ok: z.literal(true) }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'company',
  async handler(_input, ctx) {
    // ctx.sessionId is always set for an authenticated (non-anonymous) action.
    if (ctx.sessionId) {
      await revokeSession(ctx.db, ctx.sessionId);
    }
    ctx.setSessionCookie(null);
    return { ok: true as const };
  },
});
