import { z } from 'zod';

import { defineAction } from '@/platform/actions';

/**
 * Health/plumbing smoke action (01-foundation.md). Also proves the tenancy boundary:
 * a client-supplied `tenantId` in the body is ignored, never reflected back.
 */
export const pingAction = defineAction({
  id: 'system.ping',
  title: 'Ping',
  input: z.object({}).strict(),
  output: z.object({ tenantId: z.string().uuid(), companyId: z.string().uuid(), now: z.string() }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'company',
  // Slice 03 "Missy tools": the health-check smoke test that proves the tool bridge
  // itself works, before any real domain tool exists.
  toolExposed: true,
  toolDescription: 'Health check — confirms the assistant can reach the server for the current tenant/company.',
  async handler(_input, ctx) {
    return { tenantId: ctx.tenantId, companyId: ctx.companyId, now: ctx.now.toISOString() };
  },
});
