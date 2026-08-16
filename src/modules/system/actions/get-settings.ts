import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { systemSettings } from '@/platform/schema/settings';
import { RESERVED_SETTING_KEYS } from '@/modules/system/service/settings-store';

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
  // Not one of Missy's tools yet — she reaches settings via system.updateSetting's
  // confirmationPreview instead; exposing a raw settings dump is unnecessary surface.
  toolExposed: false,
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

    // Reserved keys (the encrypted OpenAI key) have their own status action
    // (`system.getOpenAiKeyStatus`) and must never render as raw ciphertext in the
    // generic settings list/edit form — see settings-store.ts's RESERVED_SETTING_KEYS.
    return { settings: rows.filter((row) => !RESERVED_SETTING_KEYS.has(row.key)) };
  },
});
