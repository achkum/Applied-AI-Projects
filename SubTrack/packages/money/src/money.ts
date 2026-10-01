import { minorUnitExponent } from './formatter.js';

export interface Money {
  readonly minorUnits: bigint;
  readonly currency: string;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Construct a Money value from a minor-unit integer. */
export function money(minorUnits: bigint | number, currency: string): Money {
  return { minorUnits: BigInt(minorUnits), currency: currency.toUpperCase() };
}

/** Assert that two Money values share a currency; throws if not. */
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Currency mismatch: ${a.currency} vs ${b.currency}`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

/**
 * Multiply by a rational factor expressed as numerator/denominator.
 * Rounds to nearest minor unit (half-up for positive, half-down for negative).
 */
export function multiply(m: Money, numerator: bigint, denominator: bigint = 1n): Money {
  if (denominator === 0n) throw new MoneyError('denominator must not be zero');
  const scaled = m.minorUnits * numerator;
  const half = denominator / 2n;
  // Euclidean-style rounding: add half before dividing, accounting for sign
  const rounded =
    scaled >= 0n
      ? (scaled + half) / denominator
      : (scaled - half) / denominator;
  return money(rounded, m.currency);
}

/**
 * Largest-remainder allocation: split `total` into `n` parts summing exactly to `total`.
 * Weights are equal (1/n each). No remainder is ever lost.
 *
 * Returns an array of length `n` in descending order (larger remainders first).
 */
export function allocateEvenly(total: Money, n: number): Money[] {
  if (n <= 0 || !Number.isInteger(n)) {
    throw new MoneyError('n must be a positive integer');
  }
  const count = BigInt(n);
  const base = total.minorUnits / count;
  const remainder = total.minorUnits % count;
  // `remainder` recipients get one extra minor unit; handles both positive and negative totals
  const extra = remainder < 0n ? -1n : 1n;
  const absRemainder = remainder < 0n ? -remainder : remainder;

  return Array.from({ length: n }, (_, i) => {
    const hasExtra = BigInt(i) < absRemainder;
    return money(base + (hasExtra ? extra : 0n), total.currency);
  });
}

/**
 * Weighted largest-remainder allocation.
 * `weights` must be positive integers; the sum of the result equals `total`.
 */
export function allocateByWeights(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new MoneyError('weights must not be empty');
  for (const w of weights) {
    if (!Number.isInteger(w) || w <= 0) {
      throw new MoneyError('each weight must be a positive integer');
    }
  }

  const weightSum = weights.reduce((s, w) => s + w, 0);
  const totalMinor = total.minorUnits;

  // Compute ideal (fractional) shares; track remainders for LR adjustment
  const ideals = weights.map((w) => {
    const numerator = totalMinor * BigInt(w);
    const denominator = BigInt(weightSum);
    const floor = numerator / denominator;
    // remainder as a rational — store as fraction for sorting
    const rem = numerator - floor * denominator;
    return { floor, rem, denominator };
  });

  const allocated = ideals.map((x) => x.floor);
  const residual = totalMinor - allocated.reduce((s, v) => s + v, 0n);
  const absResidual = residual < 0n ? -residual : residual;
  const unit = residual < 0n ? -1n : 1n;

  // Sort indices by remainder descending to assign the residual minor units
  const indices = ideals
    .map((x, i) => ({ i, rem: x.rem, denom: x.denominator }))
    .sort((a, b) => {
      // Compare a.rem/a.denom vs b.rem/b.denom as cross-multiply
      const lhs = a.rem * b.denom;
      const rhs = b.rem * a.denom;
      return lhs > rhs ? -1 : lhs < rhs ? 1 : 0;
    });

  for (let i = 0; i < absResidual; i++) {
    const entry = indices[i];
    if (entry !== undefined) {
      allocated[entry.i] = (allocated[entry.i] ?? 0n) + unit;
    }
  }

  return allocated.map((v) => money(v, total.currency));
}

export function isZero(m: Money): boolean {
  return m.minorUnits === 0n;
}

export function isPositive(m: Money): boolean {
  return m.minorUnits > 0n;
}

export function isNegative(m: Money): boolean {
  return m.minorUnits < 0n;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minorUnits === b.minorUnits;
}

export function greaterThan(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.minorUnits > b.minorUnits;
}

export function lessThan(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.minorUnits < b.minorUnits;
}

/** Convert a major-unit number (e.g. 149.00) to a Money value in minor units. */
export function fromMajorUnits(majorUnits: number, currency: string): Money {
  const exponent = minorUnitExponent(currency);
  const factor = Math.pow(10, exponent);
  // Round to avoid floating-point imprecision
  return money(Math.round(majorUnits * factor), currency);
}

/** Convert Money back to a major-unit number. */
export function toMajorUnits(m: Money): number {
  const exponent = minorUnitExponent(m.currency);
  return Number(m.minorUnits) / Math.pow(10, exponent);
}
