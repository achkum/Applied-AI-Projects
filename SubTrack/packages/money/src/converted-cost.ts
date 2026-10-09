import { MoneyError, type Money } from './money.js';
import { assertValidCurrencyCode } from './validate.js';

const UNAVAILABLE = 'Converted cost detection unavailable';
const MAX_HISTORY_LENGTH = 50;

export interface ConvertedChargeCost {
  readonly billed: Money;
  readonly settled: Money;
}

interface SnapshotMoney {
  readonly minorUnits: bigint;
  readonly currency: string;
}

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

interface SnapshotCost {
  readonly billed: SnapshotMoney;
  readonly settled: SnapshotMoney;
}

function snapshotMoney(value: unknown): SnapshotMoney {
  if (typeof value !== 'object' || value === null) {
    throw new Error(UNAVAILABLE);
  }

  const input = value as {
    readonly minorUnits?: unknown;
    readonly currency?: unknown;
  };
  const minorUnits = input.minorUnits;
  const currency = input.currency;
  if (typeof minorUnits !== 'bigint' || typeof currency !== 'string') {
    throw new Error(UNAVAILABLE);
  }
  assertValidCurrencyCode(currency);
  return { minorUnits, currency };
}

function snapshotCost(value: unknown): SnapshotCost {
  if (typeof value !== 'object' || value === null) {
    throw new Error(UNAVAILABLE);
  }

  const input = value as {
    readonly billed?: unknown;
    readonly settled?: unknown;
  };
  const billed = snapshotMoney(input.billed);
  const settled = snapshotMoney(input.settled);
  if (
    billed.minorUnits === 0n ||
    settled.minorUnits === 0n ||
    (billed.currency !== 'USD' && billed.currency !== 'EUR') ||
    billed.currency === settled.currency
  ) {
    throw new Error(UNAVAILABLE);
  }
  return { billed, settled };
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function compareFractions(left: Fraction, right: Fraction): number {
  const lhs = left.numerator * right.denominator;
  const rhs = right.numerator * left.denominator;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

function median(sorted: readonly Fraction[]): Fraction {
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle]!;
  if (sorted.length % 2 === 1) return right;

  const left = sorted[middle - 1]!;
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    2n * left.denominator * right.denominator,
  );
}

/**
 * Return true when a candidate's effective booked conversion cost differs
 * strictly by more than 5% from the ordinary median of 4–50 prior pairs.
 */
export function isConvertedCostOutsideMedianBand(
  candidate: ConvertedChargeCost,
  history: readonly ConvertedChargeCost[],
): boolean {
  try {
    const candidateSnapshot = snapshotCost(candidate);
    if (!Array.isArray(history)) throw new Error(UNAVAILABLE);

    const historyLength: unknown = history.length;
    if (
      typeof historyLength !== 'number' ||
      !Number.isInteger(historyLength) ||
      historyLength < 0 ||
      historyLength > MAX_HISTORY_LENGTH
    ) {
      throw new Error(UNAVAILABLE);
    }

    const reference: Fraction[] = [];
    for (let index = 0; index < historyLength; index += 1) {
      const entry = snapshotCost(history[index]);
      if (
        entry.billed.currency !== candidateSnapshot.billed.currency ||
        entry.settled.currency !== candidateSnapshot.settled.currency
      ) {
        throw new Error(UNAVAILABLE);
      }
      reference.push(
        fraction(
          absolute(entry.settled.minorUnits),
          absolute(entry.billed.minorUnits),
        ),
      );
    }

    if (historyLength < 4) return false;

    reference.sort(compareFractions);
    const center = median(reference);
    const value = fraction(
      absolute(candidateSnapshot.settled.minorUnits),
      absolute(candidateSnapshot.billed.minorUnits),
    );
    const delta = absolute(
      value.numerator * center.denominator -
        center.numerator * value.denominator,
    );
    return 20n * delta > center.numerator * value.denominator;
  } catch {
    throw new MoneyError(UNAVAILABLE);
  }
}
