// The `system_settings` value shape for the encrypted OpenAI key, shared by every
// reader/writer of it: `set-openai-key.ts` (writer), `resolve-openai-key.ts` (the only
// place the ciphertext is ever decrypted), and `get-openai-key-status.ts` (reads
// `last4` only, never `ciphertext`).
export const OPENAI_KEY_SETTING_KEY = 'ai.openaiApiKey';

export interface OpenAiKeySettingValue {
  ciphertext: string;
  last4: string;
}

export function isOpenAiKeySettingValue(value: unknown): value is OpenAiKeySettingValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).ciphertext === 'string' &&
    typeof (value as Record<string, unknown>).last4 === 'string'
  );
}

export function last4Of(apiKey: string): string {
  return apiKey.slice(-4);
}
