import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { systemSettings } from '@/platform/schema/settings';

const settingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  effectiveFrom: z.string(),
});

export const getSettingsAction = defineAction({
  id: 'system.getSettings',
  title: 'Get system settings',
  input: z.object({}).strict(),
  output: z.object({ settings: z.array(settingSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN'],
  scope: 'company',
  async handler(_input, ctx) {
    const rows = await ctx.db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        effectiveFrom: systemSettings.effectiveFrom,
      })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.tenantId, ctx.tenantId),
          eq(systemSettings.companyId, ctx.companyId),
          isNull(systemSettings.effectiveTo),
        ),
      );

    return { settings: rows };
  },
});
