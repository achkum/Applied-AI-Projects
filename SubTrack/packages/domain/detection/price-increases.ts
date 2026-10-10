import {
  isConfirmedSekPriceIncrease,
  type Money,
} from '@subtrack/money';

export interface SekPriceIncreaseInput {
  readonly transactionId: string;
  readonly firstNewCharge: Money;
  readonly nextCycleCharge: Money;
  readonly previousThreeCharges: readonly Money[];
}

export interface SekPriceIncreaseFinding {
  readonly transactionId: string;
  readonly reason: 'CONFIRMED_SEK_PRICE_INCREASE';
}

interface Snapshot {
  readonly transactionId: string;
  readonly flagged: boolean;
}

const UNAVAILABLE = 'Price increase detection unavailable';
const MAX_CHARGES = 1_000;
const MAX_TRANSACTION_ID_LENGTH = 128;

function compareCodepointOrder(leftValue: string, rightValue: string): number {
  const left = Array.from(leftValue, (character) => character.codePointAt(0)!);
  const right = Array.from(rightValue, (character) => character.codePointAt(0)!);
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftCodepoint = left[index]!;
    const rightCodepoint = right[index]!;
    if (leftCodepoint !== rightCodepoint) {
      return leftCodepoint < rightCodepoint ? -1 : 1;
    }
  }

  return left.length - right.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasValidTransactionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_TRANSACTION_ID_LENGTH
  );
}

/**
 * Finds ID-only confirmed SEK price increase signals for caller-proven charges.
 * Callers supply eligible charges and own their source, ownership, service and
 * cadence grouping, prior-charge chronology, refund handling, and next-cycle
 * provenance. The Money primitive validates every charge and performs all
 * financial calculations.
 */
export function detectConfirmedSekPriceIncreases(
  charges: readonly SekPriceIncreaseInput[],
): readonly SekPriceIncreaseFinding[] {
  try {
    if (!Array.isArray(charges)) {
      throw new Error(UNAVAILABLE);
    }

    const chargeCount: unknown = charges.length;
    if (
      typeof chargeCount !== 'number' ||
      !Number.isInteger(chargeCount) ||
      chargeCount < 0 ||
      chargeCount > MAX_CHARGES
    ) {
      throw new Error(UNAVAILABLE);
    }

    const seenIds = new Set<string>();
    const snapshots: Snapshot[] = [];

    for (let chargeIndex = 0; chargeIndex < chargeCount; chargeIndex += 1) {
      const row: unknown = charges[chargeIndex];
      if (!isRecord(row)) {
        throw new Error(UNAVAILABLE);
      }

      const transactionId: unknown = row.transactionId;
      const firstNewCharge: unknown = row.firstNewCharge;
      const nextCycleCharge: unknown = row.nextCycleCharge;
      const previousThreeCharges: unknown = row.previousThreeCharges;

      if (!hasValidTransactionId(transactionId) || seenIds.has(transactionId)) {
        throw new Error(UNAVAILABLE);
      }
      seenIds.add(transactionId);

      const flagged = isConfirmedSekPriceIncrease(
        firstNewCharge as Money,
        nextCycleCharge as Money,
        previousThreeCharges as readonly Money[],
      );
      snapshots.push({ transactionId, flagged });
    }

    snapshots.sort((left, right) =>
      compareCodepointOrder(left.transactionId, right.transactionId),
    );

    const findings: SekPriceIncreaseFinding[] = [];
    for (const snapshot of snapshots) {
      if (snapshot.flagged) {
        findings.push(
          Object.freeze({
            transactionId: snapshot.transactionId,
            reason: 'CONFIRMED_SEK_PRICE_INCREASE' as const,
          }),
        );
      }
    }
    return Object.freeze(findings);
  } catch {
    throw new Error(UNAVAILABLE);
  }
}
