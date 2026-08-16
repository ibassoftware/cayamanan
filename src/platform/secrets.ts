// AES-256-GCM helpers for secrets we must store (e.g. a company's own OpenAI API key —
// see src/modules/system/actions/set-openai-key.ts) but never as plaintext. `node:crypto`
// only — no new dependency.
//
// Format: `v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>`. The version prefix lets the
// format evolve (e.g. a future key-rotation scheme) without an ambiguous parse of
// already-stored values.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ActionError } from './errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM's recommended nonce length
const KEY_LENGTH = 32; // AES-256
const FORMAT_VERSION = 'v1';

/**
 * Loads and validates `SETTINGS_ENCRYPTION_KEY` on every call (not cached at module
 * load) so a missing/malformed key fails loudly the first time something actually tries
 * to encrypt/decrypt, with a message that says exactly what to do — never a silent
 * fallback to storing plaintext.
 */
function loadEncryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it before ' +
        'any code encrypts or decrypts a stored secret.',
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('SETTINGS_ENCRYPTION_KEY is not valid base64 — generate one with `openssl rand -base64 32`.');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `SETTINGS_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${key.length}) — generate one ` +
        'with `openssl rand -base64 32`.',
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/**
 * Throws `ActionError('INTERNAL', ...)` — never the raw `node:crypto` error — on any
 * failure: unrecognized format, corrupt base64, tampered ciphertext/auth tag, or the
 * wrong key. `node:crypto`'s own auth-tag-mismatch error carries no secret material, but
 * this codebase's rule is "never let a raw crypto/driver error reach a caller or log
 * verbatim" (see ActionError's own doc comment), so it is normalized here regardless.
 */
export function decryptSecret(stored: string): string {
  const key = loadEncryptionKey();

  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new ActionError('INTERNAL', 'Stored secret is in an unrecognized format and could not be decrypted.');
  }
  const [, ivB64, tagB64, ciphertextB64] = parts;

  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;
  try {
    iv = Buffer.from(ivB64, 'base64');
    authTag = Buffer.from(tagB64, 'base64');
    ciphertext = Buffer.from(ciphertextB64, 'base64');
  } catch {
    throw new ActionError('INTERNAL', 'Stored secret is corrupt and could not be decrypted.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new ActionError(
      'INTERNAL',
      'Stored secret could not be decrypted — it may be corrupt, tampered with, or encrypted under a different key.',
    );
  }
}
