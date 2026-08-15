import { describe, expect, it } from 'vitest';

import { Money, round } from '@/platform/money';

describe('Money', () => {
  it('adds decimal strings exactly — no binary float error', () => {
    // In plain JS, 0.1 + 0.2 === 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);

    const sum = Money.fromString('0.1').add(Money.fromString('0.2'));
    expect(sum.toString()).toBe('0.3');
  });

  it('supports larger exact decimal arithmetic', () => {
    // Exact value is 12345.70, which decimal.js normalizes to 12345.7 — mathematically
    // identical; fixed-width display formatting is a presentation concern, not Money's.
    const total = Money.fromString('12345.67').add(Money.fromString('0.03'));
    expect(total.toString()).toBe('12345.7');
    expect(total.equals(Money.fromString('12345.70'))).toBe(true);
  });

  it('never implicitly rounds — round() is an explicit, separate call', () => {
    const value = Money.fromString('0.125');
    // No rounding has happened yet.
    expect(value.toString()).toBe('0.125');
    expect(round(value, 2, 'HALF_UP').toString()).toBe('0.13');
  });

  it('rounds half up (away from zero) at the exact boundary', () => {
    expect(round(Money.fromString('1.005'), 2, 'HALF_UP').toString()).toBe('1.01');
    expect(round(Money.fromString('-1.005'), 2, 'HALF_UP').toString()).toBe('-1.01');
  });

  it('fromInt only accepts whole numbers', () => {
    expect(() => Money.fromInt(1.5)).toThrow();
    expect(Money.fromInt(100).toString()).toBe('100');
  });

  it('fromString rejects non-decimal input', () => {
    expect(() => Money.fromString('abc')).toThrow();
    expect(() => Money.fromString('1e5')).toThrow();
  });

  it('has no fromNumber escape hatch for binary floats', () => {
    expect((Money as unknown as Record<string, unknown>).fromNumber).toBeUndefined();
  });

  it('compares and checks sign correctly', () => {
    const a = Money.fromString('5.00');
    const b = Money.fromString('7.50');
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(Money.fromString('5.00'))).toBe(0);
    expect(Money.fromString('-1').isNegative()).toBe(true);
    expect(Money.zero().isNegative()).toBe(false);
  });
});
