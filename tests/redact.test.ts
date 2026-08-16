import { describe, expect, it } from 'vitest';

import { redact, SENSITIVE_KEY_VOCABULARY } from '@/platform/redact';

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

  it('redacts an email address embedded in free text, with no "email" key present', () => {
    expect(redact('You are jane.doe@example.com, an admin.')).toBe('You are [REDACTED], an admin.');
  });

  it('redacts an "email" key directly', () => {
    expect(redact({ email: 'jane.doe@example.com' })).toEqual({ email: '[REDACTED]' });
  });

  it('redacts an OpenAI API key by key name, case-insensitively', () => {
    expect(redact({ apiKey: 'sk-abc123', openaiApiKey: 'sk-def456' })).toEqual({
      apiKey: '[REDACTED]',
      openaiApiKey: '[REDACTED]',
    });
  });
});

describe('redact — employee government-ID and contact PII', () => {
  // Regression: `hdmfMid` and `mobile` were the only employee PII fields absent from the
  // key vocabulary, so an `employee.get` tool result could persist them in cleartext in
  // observability spans (slice-03 acceptance criterion 7).
  it('redacts every government-ID field returned by employee.get', () => {
    expect(
      redact({
        sssNo: '01-2345678-9',
        philhealthNo: '12-345678901-2',
        pagibigNo: '1234-5678-9012',
        tin: '123-456-789-000',
        hdmfMid: '1234-5678-9012',
      }),
    ).toEqual({
      sssNo: '[REDACTED]',
      philhealthNo: '[REDACTED]',
      pagibigNo: '[REDACTED]',
      tin: '[REDACTED]',
      hdmfMid: '[REDACTED]',
    });
  });

  it('redacts employee and emergency-contact mobile numbers', () => {
    expect(redact({ mobile: '+63 917 000 0000', mobileNumber: '+63 917 111 1111' })).toEqual({
      mobile: '[REDACTED]',
      mobileNumber: '[REDACTED]',
    });
  });

  it('keeps the shared vocabulary non-empty so the Mastra filter cannot silently import nothing', () => {
    expect(SENSITIVE_KEY_VOCABULARY).toEqual(expect.arrayContaining(['tin', 'hdmf', 'mobile']));
  });
});
