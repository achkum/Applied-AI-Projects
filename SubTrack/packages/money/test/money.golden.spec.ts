import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
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

// ─── add() — additional golden cases ─────────────────────────────────────────

describe('add() — golden', () => {
  it('left identity: add(zero, a) = a', () => {
    expect(add(SEK(0), SEK(42)).minorUnits).toBe(42n);
  });

  it('right identity: add(a, zero) = a', () => {
    expect(add(SEK(42), SEK(0)).minorUnits).toBe(42n);
  });

  it('commutative: add(13, 7) = add(7, 13)', () => {
    expect(add(SEK(13), SEK(7)).minorUnits).toBe(add(SEK(7), SEK(13)).minorUnits);
  });

  it('handles large values (100 000 000 öre)', () => {
    expect(add(SEK(100_000_000n), SEK(100_000_000n)).minorUnits).toBe(200_000_000n);
  });
});

// ─── subtract() — additional golden cases ────────────────────────────────────

describe('subtract() — golden', () => {
  it('self subtraction = zero', () => {
    expect(isZero(subtract(SEK(99), SEK(99)))).toBe(true);
  });

  it('result is negative when b > a', () => {
    expect(isNegative(subtract(SEK(1), SEK(100)))).toBe(true);
  });

  it('round-trip: a - b + b = a', () => {
    expect(add(subtract(SEK(12345), SEK(6789)), SEK(6789)).minorUnits).toBe(12345n);
  });
});

// ─── multiply() — additional golden cases ────────────────────────────────────

describe('multiply() — golden', () => {
  it('by 0 = zero', () => {
    expect(isZero(multiply(SEK(999), 0n))).toBe(true);
  });

  it('by 1 = identity', () => {
    expect(multiply(SEK(999), 1n).minorUnits).toBe(999n);
  });

  it('negative × negative → positive', () => {
    expect(multiply(SEK(-100), -1n).minorUnits).toBe(100n);
  });

  it('100 * 1/3 = 33 (33.33… truncates below .5 threshold)', () => {
    expect(multiply(SEK(100), 1n, 3n).minorUnits).toBe(33n);
  });

  it('10 * 1/2 = 5 (exact half)', () => {
    expect(multiply(SEK(10), 1n, 2n).minorUnits).toBe(5n);
  });

  it('preserves currency', () => {
    expect(multiply(EUR(100), 3n).currency).toBe('EUR');
  });
});

// ─── allocateEvenly() — additional golden cases ───────────────────────────────

describe('allocateEvenly() — golden', () => {
  it('1000 / 7: sum invariant (prime check)', () => {
    const parts = allocateEvenly(SEK(1000), 7);
    const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
    expect(sum).toBe(1000n);
    expect(parts).toHaveLength(7);
  });

  it('1 / 5: first gets 1, rest get 0', () => {
    const parts = allocateEvenly(SEK(1), 5);
    expect(parts.reduce((s, p) => s + p.minorUnits, 0n)).toBe(1n);
    expect(parts[0]?.minorUnits).toBe(1n);
    expect(parts[1]?.minorUnits).toBe(0n);
  });

  it('preserves currency (EUR)', () => {
    expect(allocateEvenly(EUR(100), 2).every((p) => p.currency === 'EUR')).toBe(true);
  });

  it('n=1: returns [total]', () => {
    expect(allocateEvenly(SEK(777), 1)[0]?.minorUnits).toBe(777n);
  });

  it('large prime total 999 983 / 4: sum invariant', () => {
    const parts = allocateEvenly(SEK(999_983), 4);
    expect(parts.reduce((s, p) => s + p.minorUnits, 0n)).toBe(999_983n);
  });

  it('throws on fractional n', () => {
    expect(() => allocateEvenly(SEK(100), 2.5)).toThrow(MoneyError);
  });
});

// ─── allocateByWeights() — additional golden cases ───────────────────────────

describe('allocateByWeights() — golden', () => {
  it('single weight returns [total]', () => {
    expect(allocateByWeights(SEK(500), [7])[0]?.minorUnits).toBe(500n);
  });

  it('four equal weights of 100: sum = 100', () => {
    const parts = allocateByWeights(SEK(100), [1, 1, 1, 1]);
    expect(parts.reduce((s, p) => s + p.minorUnits, 0n)).toBe(100n);
  });

  it('5:1 split of 100: sum = 100', () => {
    const parts = allocateByWeights(SEK(100), [5, 1]);
    expect(parts.reduce((s, p) => s + p.minorUnits, 0n)).toBe(100n);
  });

  it('preserves currency (EUR)', () => {
    expect(allocateByWeights(EUR(99), [3, 1]).every((p) => p.currency === 'EUR')).toBe(true);
  });

  it('throws on negative weight', () => {
    expect(() => allocateByWeights(SEK(100), [1, -1])).toThrow(MoneyError);
  });
});

// ─── predicates — additional golden cases ────────────────────────────────────

describe('predicates — golden', () => {
  it('isPositive(zero) = false', () => {
    expect(isPositive(SEK(0))).toBe(false);
  });

  it('isNegative(positive) = false', () => {
    expect(isNegative(SEK(1))).toBe(false);
  });

  it('isNegative(zero) = false', () => {
    expect(isNegative(SEK(0))).toBe(false);
  });

  it('equals: same currency different values → false', () => {
    expect(equals(SEK(100), SEK(101))).toBe(false);
  });

  it('greaterThan: positive > negative', () => {
    expect(greaterThan(SEK(0), SEK(-1))).toBe(true);
  });

  it('greaterThan: equal values → false', () => {
    expect(greaterThan(SEK(100), SEK(100))).toBe(false);
  });

  it('lessThan: equal values → false', () => {
    expect(lessThan(SEK(100), SEK(100))).toBe(false);
  });

  it('lessThan: throws on currency mismatch', () => {
    expect(() => lessThan(SEK(50), EUR(100))).toThrow(MoneyError);
  });
});

// ─── fromMajorUnits / toMajorUnits — additional golden cases ─────────────────

describe('fromMajorUnits / toMajorUnits — golden', () => {
  it('0 major units → 0 minor', () => {
    expect(fromMajorUnits(0, 'SEK').minorUnits).toBe(0n);
  });

  it('negative major units → negative minor', () => {
    expect(fromMajorUnits(-1.49, 'SEK').minorUnits).toBe(-149n);
  });

  it('toMajorUnits with negative SEK', () => {
    expect(toMajorUnits(SEK(-14900))).toBe(-149);
  });

  it('round-trip EUR 9.99', () => {
    const m = fromMajorUnits(9.99, 'EUR');
    expect(m.minorUnits).toBe(999n);
    expect(toMajorUnits(m)).toBeCloseTo(9.99, 2);
  });
});

// ─── fast-check property-based invariants ────────────────────────────────────

const smallMinor = fc.bigInt({ min: -1_000_000n, max: 1_000_000n });
const positiveN = fc.integer({ min: 1, max: 20 });

describe('fast-check: add invariants', () => {
  it('commutativity: add(a, b) = add(b, a)', () => {
    fc.assert(
      fc.property(smallMinor, smallMinor, (x, y) => {
        expect(add(SEK(x), SEK(y)).minorUnits).toBe(add(SEK(y), SEK(x)).minorUnits);
      }),
    );
  });

  it('associativity: (a + b) + c = a + (b + c)', () => {
    fc.assert(
      fc.property(smallMinor, smallMinor, smallMinor, (x, y, z) => {
        expect(add(add(SEK(x), SEK(y)), SEK(z)).minorUnits).toBe(
          add(SEK(x), add(SEK(y), SEK(z))).minorUnits,
        );
      }),
    );
  });

  it('identity: add(a, zero) = a', () => {
    fc.assert(
      fc.property(smallMinor, (x) => {
        expect(add(SEK(x), SEK(0)).minorUnits).toBe(x);
      }),
    );
  });
});

describe('fast-check: subtract invariants', () => {
  it('round-trip: a - b + b = a', () => {
    fc.assert(
      fc.property(smallMinor, smallMinor, (x, y) => {
        expect(add(subtract(SEK(x), SEK(y)), SEK(y)).minorUnits).toBe(x);
      }),
    );
  });
});

describe('fast-check: multiply invariants', () => {
  it('multiply by 1 is identity', () => {
    fc.assert(
      fc.property(smallMinor, (x) => {
        expect(multiply(SEK(x), 1n).minorUnits).toBe(x);
      }),
    );
  });

  it('multiply by 0 is zero', () => {
    fc.assert(
      fc.property(smallMinor, (x) => {
        expect(multiply(SEK(x), 0n).minorUnits).toBe(0n);
      }),
    );
  });
});

describe('fast-check: allocateEvenly sum invariant', () => {
  it('sum of parts = total for any total and n ∈ [1, 20]', () => {
    fc.assert(
      fc.property(smallMinor, positiveN, (total, n) => {
        const parts = allocateEvenly(SEK(total), n);
        const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
        expect(sum).toBe(total);
        expect(parts).toHaveLength(n);
      }),
    );
  });
});

describe('fast-check: allocateByWeights sum invariant', () => {
  it('sum of parts = total for any non-empty positive-integer weights', () => {
    const weights = fc.array(fc.integer({ min: 1, max: 100 }), {
      minLength: 1,
      maxLength: 6,
    });
    fc.assert(
      fc.property(smallMinor, weights, (total, ws) => {
        const parts = allocateByWeights(SEK(total), ws);
        const sum = parts.reduce((s, p) => s + p.minorUnits, 0n);
        expect(sum).toBe(total);
        expect(parts).toHaveLength(ws.length);
      }),
    );
  });
});
