import { describe, expect, it } from 'vitest';

import { deriveOpenAiKeyCardState, validateOpenAiApiKey } from '@/components/settings/openai-key-state';

describe('deriveOpenAiKeyCardState', () => {
  it('is loading while no result has arrived yet', () => {
    expect(deriveOpenAiKeyCardState(null)).toEqual({ status: 'loading' });
  });

  it('maps a FORBIDDEN action error to the no-permission state (card hides itself)', () => {
    const state = deriveOpenAiKeyCardState({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
    });
    expect(state).toEqual({ status: 'no-permission' });
  });

  it('maps any other action error to the generic error state, preserving the message', () => {
    const state = deriveOpenAiKeyCardState({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(state).toEqual({ status: 'error', message: 'Something went wrong. Please try again.' });
  });

  it('is ready with the returned status, never carrying secret material by construction', () => {
    const keyStatus = { configured: true, last4: '1234', source: 'settings' as const };
    expect(deriveOpenAiKeyCardState({ ok: true, data: keyStatus })).toEqual({ status: 'ready', keyStatus });
  });
});

describe('validateOpenAiApiKey', () => {
  it('rejects an empty key', () => {
    expect(validateOpenAiApiKey('   ')).toEqual({ ok: false, message: 'Enter an API key.' });
  });

  it('rejects an obviously-too-short key', () => {
    const result = validateOpenAiApiKey('sk-short');
    expect(result.ok).toBe(false);
  });

  it('accepts and trims a plausible key', () => {
    expect(validateOpenAiApiKey('  sk-test-abcdefghijklmnop1234  ')).toEqual({
      ok: true,
      value: 'sk-test-abcdefghijklmnop1234',
    });
  });
});
