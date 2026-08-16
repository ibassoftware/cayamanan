// Server-internal only: resolves the OpenAI API key a company should use for Missy, for
// the caller's own tenant/company scope. Nothing else reads or returns the decrypted
// value — no action's `output` schema ever includes it (see set-openai-key.ts's header
// comment), so it cannot round-trip back to any client.
import { and, eq, isNull } from 'drizzle-orm';

import { withTenantContext, type TenantScope } from '@/platform/db';
import { decryptSecret } from '@/platform/secrets';
import { systemSettings } from '@/platform/schema/settings';
import { OPENAI_KEY_SETTING_KEY, isOpenAiKeySettingValue } from './openai-key-setting';

/**
 * Falls back to `process.env.OPENAI_API_KEY` when no company-level key is configured —
 * local dev and the test suite depend on this. Returns `undefined` when neither is set.
 *
 * No in-process cache: this reads at most once per chat request (see
 * `src/app/api/chat/route.ts`), and a cache keyed on anything less specific than
 * tenant+company would be a cross-tenant leak, while one keyed correctly would only ever
 * save a single indexed `SELECT` plus one AES decrypt per turn — not worth the extra
 * invalidation surface until profiling says otherwise. Add one (tenant+company-keyed,
 * TTL ≤ 60s) only if that measurement ever justifies it.
 */
export async function resolveOpenAiKey(scope: TenantScope): Promise<string | undefined> {
  const decrypted = await withTenantContext(scope, async (tenantDb) => {
    const [row] = await tenantDb
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.tenantId, scope.tenantId),
          eq(systemSettings.companyId, scope.companyId),
          eq(systemSettings.key, OPENAI_KEY_SETTING_KEY),
          isNull(systemSettings.effectiveTo),
        ),
      );

    if (row && isOpenAiKeySettingValue(row.value)) {
      return decryptSecret(row.value.ciphertext);
    }
    return undefined;
  });

  return decrypted ?? (process.env.OPENAI_API_KEY || undefined);
}
