import { describe, it, expect } from 'vitest';
import {
  money,
  add,
  subtract,
  multiply,
  allocateEvenly,
  allocateByWeights,
  isZero,
  isPositive,
  isNegative,
  equals,
  greaterThan,
  lessThan,
  fromMajorUnits,
  toMajorUnits,
  MoneyError,
} from '../src/index.js';

const SEK = (n: bigint | number) => money(n, 'SEK');
const EUR = (n: bigint | number) => money(n, 'EUR');

describe('money()', () => {
  it('stores minorUnits as BigInt', () => {
    expect(SEK(14900).minorUnits).toBe(14900n);
  });

  it('upcases the currency code', () => {
    expect(money(100, 'sek').currency).toBe('SEK');
  });
});

describe('add()', () => {
  it('adds two SEK values', () => {
    expect(add(SEK(100), SEK(50)).minorUnits).toBe(150n);
  });

  it('throws on currency mismatch', () => {
    expect(() => add(SEK(100), EUR(100))).toThrow(MoneyError);
  });
});

describe('subtract()', () => {
  it('subtracts and can produce negative result', () => {
    expect(subtract(SEK(50), SEK(100)).minorUnits).toBe(-50n);
  });

  it('throws on currency mismatch', () => {
    expect(() => subtract(SEK(100), EUR(50))).toThrow(MoneyError);
  });
});

describe('multiply()', () => {
  it('multiplies by whole number', () => {
    expect(multiply(SEK(100), 3n).minorUnits).toBe(300n);
  });

  it('rounds half-up for positive', () => {
    // 100 * 2 / 3 = 66.666… → 67
    expect(multiply(SEK(100), 2n, 3n).minorUnits).toBe(67n);
  });

  it('rounds toward zero for negative', () => {
    // -100 * 2 / 3 = -66.666… → -67 (half-down for negative)
    expect(multiply(SEK(-100), 2n, 3n).minorUnits).toBe(-67n);
  });

  it('throws on zero denominator', () => {
    expect(() => multiply(SEK(100), 1n, 0n)).toThrow(MoneyError);
  });
});

describe('allocateEvenly()', () => {
  it('splits 100 evenly into 3: [34, 33, 33]', () => {
    const parts = allocateEvenly(SEK(100), 3);
    expect(parts.map((p) => p.minorUnits)).toEqual([34n, 33n, 33n]);
    // sum must equal original
    const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
    expect(sum).toBe(100n);
  });

  it('splits 0 into 3: [0, 0, 0]', () => {
    const parts = allocateEvenly(SEK(0), 3);
    expect(parts.every((p) => p.minorUnits === 0n)).toBe(true);
  });

  it('splits negative amount — sum is preserved', () => {
    const parts = allocateEvenly(SEK(-7), 3);
    const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
    expect(sum).toBe(-7n);
  });

  it('splits into 1 part — identity', () => {
    expect(allocateEvenly(SEK(999), 1)[0]?.minorUnits).toBe(999n);
  });

  it('throws on n=0', () => {
    expect(() => allocateEvenly(SEK(100), 0)).toThrow(MoneyError);
  });

  it('all parts have the correct currency', () => {
    const parts = allocateEvenly(EUR(100), 3);
    expect(parts.every((p) => p.currency === 'EUR')).toBe(true);
  });
});

describe('allocateByWeights()', () => {
  it('1:1 split of 101 → [51, 50]', () => {
    const parts = allocateByWeights(SEK(101), [1, 1]);
    const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
    expect(sum).toBe(101n);
    // Larger remainder goes first
    expect(parts[0]!.minorUnits).toBeGreaterThanOrEqual(parts[1]!.minorUnits);
  });

  it('2:1 split of 100 → [67, 33]', () => {
    const parts = allocateByWeights(SEK(100), [2, 1]);
    expect(parts[0]!.minorUnits).toBe(67n);
    expect(parts[1]!.minorUnits).toBe(33n);
    expect(parts[0]!.minorUnits + parts[1]!.minorUnits).toBe(100n);
  });

  it('preserves sum for three-way unequal split', () => {
    const parts = allocateByWeights(SEK(1000), [3, 2, 1]);
    const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
    expect(sum).toBe(1000n);
  });

  it('throws on empty weights', () => {
    expect(() => allocateByWeights(SEK(100), [])).toThrow(MoneyError);
  });

  it('throws on non-positive weight', () => {
    expect(() => allocateByWeights(SEK(100), [1, 0])).toThrow(MoneyError);
  });
});

describe('predicates', () => {
  it('isZero', () => {
    expect(isZero(SEK(0))).toBe(true);
    expect(isZero(SEK(1))).toBe(false);
  });

  it('isPositive', () => {
    expect(isPositive(SEK(1))).toBe(true);
    expect(isPositive(SEK(0))).toBe(false);
    expect(isPositive(SEK(-1))).toBe(false);
  });

  it('isNegative', () => {
    expect(isNegative(SEK(-1))).toBe(true);
    expect(isNegative(SEK(0))).toBe(false);
  });

  it('equals — same value', () => {
    expect(equals(SEK(100), SEK(100))).toBe(true);
  });

  it('equals — different currency', () => {
    expect(equals(SEK(100), EUR(100))).toBe(false);
  });

  it('greaterThan', () => {
    expect(greaterThan(SEK(101), SEK(100))).toBe(true);
    expect(greaterThan(SEK(100), SEK(100))).toBe(false);
  });

  it('lessThan', () => {
    expect(lessThan(SEK(99), SEK(100))).toBe(true);
  });

  it('greaterThan throws on currency mismatch', () => {
    expect(() => greaterThan(SEK(100), EUR(50))).toThrow(MoneyError);
  });
});

describe('fromMajorUnits / toMajorUnits', () => {
  it('round-trips SEK 149.00', () => {
    const m = fromMajorUnits(149, 'SEK');
    expect(m.minorUnits).toBe(14900n);
    expect(toMajorUnits(m)).toBe(149);
  });

  it('round-trips JPY 500', () => {
    const m = fromMajorUnits(500, 'JPY');
    expect(m.minorUnits).toBe(500n);
    expect(toMajorUnits(m)).toBe(500);
  });

  it('handles fractional SEK', () => {
    const m = fromMajorUnits(1.49, 'SEK');
    expect(m.minorUnits).toBe(149n);
  });
});
