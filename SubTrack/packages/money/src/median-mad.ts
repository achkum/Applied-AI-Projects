import { MoneyError, type Money } from './money.js';
import { assertValidCurrencyCode } from './validate.js';

const UNAVAILABLE = 'Amount outlier detection unavailable';
const MAX_HISTORY_LENGTH = 1_000;

interface Snapshot {
  readonly minorUnits: bigint;
  readonly currency: string;
}

function snapshotMoney(value: unknown): Snapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error(UNAVAILABLE);
  }

  const candidate = value as {
    readonly minorUnits?: unknown;
    readonly currency?: unknown;
  };
  const minorUnits = candidate.minorUnits;
  const currency = candidate.currency;

  if (typeof minorUnits !== 'bigint' || typeof currency !== 'string') {
    throw new Error(UNAVAILABLE);
  }
  assertValidCurrencyCode(currency);
  return { minorUnits, currency };
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** Return twice the ordinary median, retaining half-unit medians exactly. */
function median2(sorted: readonly bigint[]): bigint {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return 2n * sorted[middle]!;
  }
  return sorted[middle - 1]! + sorted[middle]!;
}

/**
 * Determine whether a candidate amount lies strictly outside the ordinary
 * median ± 3×MAD interval of caller-provided reference amounts.
 */
export function isAmountOutsideMedianMad(
  candidate: Money,
  history: readonly Money[],
): boolean {
  try {
    const candidateSnapshot = snapshotMoney(candidate);
    if (!Array.isArray(history)) {
      throw new Error(UNAVAILABLE);
    }

    const historyLength = history.length;
    if (historyLength < 1 || historyLength > MAX_HISTORY_LENGTH) {
      throw new Error(UNAVAILABLE);
    }

    const values: bigint[] = [];
    for (let index = 0; index < historyLength; index += 1) {
      const entry = snapshotMoney(history[index]);
      if (entry.currency !== candidateSnapshot.currency) {
        throw new Error(UNAVAILABLE);
      }
      values.push(entry.minorUnits);
    }

    values.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const historyMedian2 = median2(values);
    const doubledDeviations = values
      .map((value) => absolute(2n * value - historyMedian2))
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const mad4 = median2(doubledDeviations);
    const candidateDeviation4 =
      2n * absolute(2n * candidateSnapshot.minorUnits - historyMedian2);

    return candidateDeviation4 > 3n * mad4;
  } catch {
    throw new MoneyError(UNAVAILABLE);
  }
}
