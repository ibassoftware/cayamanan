import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { encryptSecret } from '@/platform/secrets';
import { writeSettingRow } from '@/modules/system/service/settings-store';
import { OPENAI_KEY_SETTING_KEY, last4Of } from '@/modules/system/service/openai-key-setting';

const inputSchema = z
  .object({
    apiKey: z
      .string()
      .min(20, 'That does not look like a valid OpenAI API key.')
      .describe("The company's OpenAI API key. Stored encrypted; never returned or logged in plaintext."),
  })
  .strict();

const outputSchema = z.object({
  configured: z.literal(true),
  last4: z.string(),
});

/**
 * Deliberately NOT `toolExposed` — Missy must never be able to rotate her own model
 * credentials, however she's prompted or jailbroken. This is the one place in the
 * codebase a plaintext OpenAI key is ever handled outside `resolve-openai-key.ts`'s
 * decrypt call, and it never leaves this handler: the response, the confirmation
 * preview, and the audit entry all carry only `last4`.
 */
export const setOpenAiKeyAction = defineAction({
  id: 'system.setOpenAiKey',
  title: 'Set OpenAI API key',
  input: inputSchema,
  output: outputSchema,
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  toolExposed: false,
  confirmationPreview(input) {
    return { last4: last4Of(input.apiKey) };
  },
  async handler(input, ctx) {
    const last4 = last4Of(input.apiKey);
    const ciphertext = encryptSecret(input.apiKey);

    const { created, previous } = await writeSettingRow(ctx, OPENAI_KEY_SETTING_KEY, { ciphertext, last4 });

    ctx.audit({
      entityType: 'system_settings',
      entityId: created.id,
      // Only the masked value — never the ciphertext (which, unlike a hash, is
      // reversible given the encryption key) and never the plaintext.
      before:
        previous && typeof previous.value === 'object' && previous.value !== null
          ? { last4: (previous.value as { last4?: unknown }).last4 ?? null }
          : null,
      after: { last4 },
    });

    return { configured: true, last4 };
  },
});
