// Exact-decimal money, per 00-overview.md §4.4. `Money` is a branded wrapper over
// decimal.js and can only be constructed from strings or integers — there is no
// `fromNumber`, so a binary float can never silently become money.
//
// `pg` returns `numeric` columns as strings; read them directly into `Money.fromString`,
// never `parseFloat`. JSON transport uses decimal strings ("12345.67"), never JS numbers.
import Decimal from 'decimal.js';

const DECIMAL_STRING_PATTERN = /^-?\d+(\.\d+)?$/;

export class Money {
  private readonly decimal: Decimal;

  private constructor(decimal: Decimal) {
    this.decimal = decimal;
  }

  /** Construct from a decimal string, e.g. from a `numeric` column or JSON transport. */
  static fromString(value: string): Money {
    const trimmed = value.trim();
    if (!DECIMAL_STRING_PATTERN.test(trimmed)) {
      throw new Error('Money.fromString: value is not a plain decimal string');
    }
    return new Money(new Decimal(trimmed));
  }

  /** Construct from a whole-number integer (e.g. a peso amount with no cents). */
  static fromInt(value: number): Money {
    if (!Number.isInteger(value)) {
      throw new Error('Money.fromInt: value must be an integer');
    }
    return new Money(new Decimal(value));
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  add(other: Money): Money {
    return new Money(this.decimal.plus(other.decimal));
  }

  subtract(other: Money): Money {
    return new Money(this.decimal.minus(other.decimal));
  }

  multiply(factor: Money): Money {
    return new Money(this.decimal.times(factor.decimal));
  }

  isNegative(): boolean {
    return this.decimal.isNegative() && !this.decimal.isZero();
  }

  isZero(): boolean {
    return this.decimal.isZero();
  }

  equals(other: Money): boolean {
    return this.decimal.equals(other.decimal);
  }

  /** -1 if this < other, 0 if equal, 1 if this > other. */
  compare(other: Money): -1 | 0 | 1 {
    const result = this.decimal.comparedTo(other.decimal);
    return result as -1 | 0 | 1;
  }

  /** Exact decimal string, no rounding, no exponent notation. */
  toString(): string {
    return this.decimal.toFixed();
  }

  toJSON(): string {
    return this.toString();
  }

  /** @internal — used only by `round()` below; not part of the public Money API. */
  static _unwrap(money: Money): Decimal {
    return money.decimal;
  }

  /** @internal — used only by `round()` below; not part of the public Money API. */
  static _wrap(decimal: Decimal): Money {
    return new Money(decimal);
  }
}

export type RoundingMode = 'HALF_UP';

const ROUNDING_MODES: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP,
};

/**
 * Explicit rounding — never implicit. Every rounding point in payroll must be named in
 * the calculation trace and call this directly.
 */
export function round(value: Money, decimalPlaces: number, mode: RoundingMode): Money {
  const rounded = Money._unwrap(value).toDecimalPlaces(decimalPlaces, ROUNDING_MODES[mode]);
  return Money._wrap(rounded);
}
