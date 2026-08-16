import { describe, expect, it } from 'vitest';

import { formatCountdown, isConfirmationExpired, secondsUntilExpiry } from '@/lib/chat/confirmation';

// Criterion 5: "waiting 6 minutes and approving fails with expiry" — these pin the
// confirmation card's local expiry math (the server's own check remains authoritative).
describe('isConfirmationExpired', () => {
  it('is not expired before the deadline', () => {
    expect(isConfirmationExpired('2026-01-01T00:05:00.000Z', Date.parse('2026-01-01T00:04:59.000Z'))).toBe(false);
  });

  it('is expired exactly at the deadline', () => {
    expect(isConfirmationExpired('2026-01-01T00:05:00.000Z', Date.parse('2026-01-01T00:05:00.000Z'))).toBe(true);
  });

  it('is expired after the deadline', () => {
    expect(isConfirmationExpired('2026-01-01T00:05:00.000Z', Date.parse('2026-01-01T00:11:00.000Z'))).toBe(true);
  });

  it('treats an unparseable timestamp as expired', () => {
    expect(isConfirmationExpired('not-a-date', Date.now())).toBe(true);
  });
});

describe('secondsUntilExpiry', () => {
  it('floors to whole seconds and never goes negative', () => {
    const expiresAt = '2026-01-01T00:05:00.000Z';
    expect(secondsUntilExpiry(expiresAt, Date.parse('2026-01-01T00:04:30.500Z'))).toBe(29);
    expect(secondsUntilExpiry(expiresAt, Date.parse('2026-01-01T00:06:00.000Z'))).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats minutes:seconds with zero-padded seconds', () => {
    expect(formatCountdown(299)).toBe('4:59');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(5)).toBe('0:05');
  });
});
