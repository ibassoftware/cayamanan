import { describe, expect, it } from 'vitest';

import { redact } from '@/platform/redact';

describe('redact', () => {
  it('redacts object keys matching a known-sensitive name, case-insensitively', () => {
    expect(redact({ Salary: 50000, bankAccountNumber: '12345', name: 'ok' })).toEqual({
      Salary: '[REDACTED]',
      bankAccountNumber: '[REDACTED]',
      name: 'ok',
    });
  });

  it('redacts a bare string that contains a sensitive-looking token', () => {
    expect(redact('failed to update salary to 999999')).toBe('[REDACTED]');
    expect(redact('bankAccountNumber lookup failed')).toBe('[REDACTED]');
  });

  it('leaves a string with no sensitive token untouched', () => {
    expect(redact('connection timed out after 5s')).toBe('connection timed out after 5s');
  });

  it('redacts a sensitive string nested inside an unrelated key', () => {
    expect(redact({ message: 'update failed for tin 123-456-789' })).toEqual({
      message: '[REDACTED]',
    });
  });

  it('redacts password-prefixed keys, case-insensitively', () => {
    expect(redact({ passwordHash: '$argon2id$...', PASSWORD: 'hunter2' })).toEqual({
      passwordHash: '[REDACTED]',
      PASSWORD: '[REDACTED]',
    });
  });

  it('does not recurse into a value already redacted by its key name', () => {
    expect(redact({ bankDetails: { accountNumber: '12345' } })).toEqual({
      bankDetails: '[REDACTED]',
    });
  });
});
