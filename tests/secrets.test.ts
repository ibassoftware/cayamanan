import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from '@/platform/secrets';

// vitest.setup.ts loads .env, which sets SETTINGS_ENCRYPTION_KEY for the whole suite —
// these tests manipulate that env var directly, so they save/restore it around each case.
describe('platform/secrets', () => {
  const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips a plaintext value', () => {
    const stored = encryptSecret('sk-super-secret-value');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('sk-super-secret-value');
    expect(decryptSecret(stored)).toBe('sk-super-secret-value');
  });

  it('rejects a tampered ciphertext with a typed AppError, not a raw crypto error', () => {
    const stored = encryptSecret('sk-super-secret-value');
    const [version, iv, tag, ciphertext] = stored.split('.');
    // Flip a character in the ciphertext body — GCM's auth tag must reject this.
    const flipped = ciphertext.slice(0, -1) + (ciphertext.at(-1) === 'A' ? 'B' : 'A');
    const tampered = [version, iv, tag, flipped].join('.');

    expect(() => decryptSecret(tampered)).toThrow(
      expect.objectContaining({ name: 'ActionError', code: 'INTERNAL' }),
    );
  });

  it('rejects decryption under the wrong key', () => {
    const stored = encryptSecret('sk-super-secret-value');
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    expect(() => decryptSecret(stored)).toThrow(
      expect.objectContaining({ name: 'ActionError', code: 'INTERNAL' }),
    );
  });

  describe('missing/malformed key', () => {
    beforeEach(() => {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    });

    it('fails loudly on encrypt when the key is missing', () => {
      expect(() => encryptSecret('anything')).toThrow(/SETTINGS_ENCRYPTION_KEY is not set/);
    });

    it('fails loudly on decrypt when the key is missing', () => {
      expect(() => decryptSecret('v1.aa.bb.cc')).toThrow(/SETTINGS_ENCRYPTION_KEY is not set/);
    });

    it('fails loudly when the key is not valid base64 length', () => {
      process.env.SETTINGS_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
      expect(() => encryptSecret('anything')).toThrow(/must decode to exactly 32 bytes/);
    });
  });
});
