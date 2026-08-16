import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { systemSettings } from '@/platform/schema/settings';
import { OPENAI_KEY_SETTING_KEY, isOpenAiKeySettingValue } from '@/modules/system/service/openai-key-setting';

const outputSchema = z.object({
  configured: z.boolean(),
  last4: z.string().nullable(),
  source: z.enum(['settings', 'env', 'none']),
});

/**
 * Read-only status for the settings screen — never returns secret material, only
 * whether a key is configured, its last 4 characters (already shown, non-sensitive),
 * and which source would win (settings takes precedence over the env fallback; see
 * resolve-openai-key.ts).
 */
export const getOpenAiKeyStatusAction = defineAction({
  id: 'system.getOpenAiKeyStatus',
  title: 'Get OpenAI key status',
  input: z.object({}).strict(),
  output: outputSchema,
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN'],
  scope: 'company',
  toolExposed: false,
  async handler(_input, ctx) {
    const [row] = await ctx.db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.tenantId, ctx.tenantId),
          eq(systemSettings.companyId, ctx.companyId),
          eq(systemSettings.key, OPENAI_KEY_SETTING_KEY),
          isNull(systemSettings.effectiveTo),
        ),
      );

    if (row && isOpenAiKeySettingValue(row.value)) {
      return { configured: true, last4: row.value.last4, source: 'settings' as const };
    }

    if (process.env.OPENAI_API_KEY) {
      return { configured: true, last4: null, source: 'env' as const };
    }

    return { configured: false, last4: null, source: 'none' as const };
  },
});
