import {
  isConvertedCostOutsideMedianBand,
  type ConvertedChargeCost,
} from '@subtrack/money';

export interface ConvertedCostAnomalyInput {
  readonly transactionId: string;
  readonly cost: ConvertedChargeCost;
  readonly history: readonly ConvertedChargeCost[];
}

export interface ConvertedCostAnomaly {
  readonly transactionId: string;
  readonly reason: 'CONVERTED_COST_SWING';
}

interface Snapshot {
  readonly transactionId: string;
  readonly flagged: boolean;
}

const UNAVAILABLE = 'Converted cost anomaly detection unavailable';
const MAX_CHARGES = 1_000;
const MAX_HISTORY = 50;
const MAX_TOTAL_HISTORY = 10_000;
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
 * Finds ID-only converted-cost swing signals for caller-scoped posted debit
 * charges. Callers supply authoritative billed/settled pairs and histories
 * grouped by service and currency, selected chronologically with the candidate
 * excluded. The Money primitive validates every pair and performs all money
 * calculations.
 */
export function detectConvertedCostAnomalies(
  charges: readonly ConvertedCostAnomalyInput[],
): readonly ConvertedCostAnomaly[] {
  try {
    if (!Array.isArray(charges)) {
      throw new Error(UNAVAILABLE);
    }

    const chargeCount: number = charges.length;
    if (
      !Number.isInteger(chargeCount) ||
      chargeCount < 0 ||
      chargeCount > MAX_CHARGES
    ) {
      throw new Error(UNAVAILABLE);
    }

    const seenIds = new Set<string>();
    const snapshots: Snapshot[] = [];
    let totalHistoryCount = 0;

    for (let chargeIndex = 0; chargeIndex < chargeCount; chargeIndex += 1) {
      const row: unknown = charges[chargeIndex];
      if (!isRecord(row)) {
        throw new Error(UNAVAILABLE);
      }

      const transactionId: unknown = row.transactionId;
      const cost: unknown = row.cost;
      const history: unknown = row.history;

      if (!hasValidTransactionId(transactionId) || seenIds.has(transactionId)) {
        throw new Error(UNAVAILABLE);
      }
      seenIds.add(transactionId);

      if (!Array.isArray(history)) {
        throw new Error(UNAVAILABLE);
      }
      const historyLength: number = history.length;
      if (
        !Number.isInteger(historyLength) ||
        historyLength < 0 ||
        historyLength > MAX_HISTORY
      ) {
        throw new Error(UNAVAILABLE);
      }
      totalHistoryCount += historyLength;
      if (totalHistoryCount > MAX_TOTAL_HISTORY) {
        throw new Error(UNAVAILABLE);
      }

      const copiedHistory: ConvertedChargeCost[] = [];
      for (
        let historyIndex = 0;
        historyIndex < historyLength;
        historyIndex += 1
      ) {
        copiedHistory.push(history[historyIndex] as ConvertedChargeCost);
      }

      const flagged = isConvertedCostOutsideMedianBand(
        cost as ConvertedChargeCost,
        copiedHistory,
      );
      snapshots.push({ transactionId, flagged });
    }

    snapshots.sort((left, right) =>
      compareCodepointOrder(left.transactionId, right.transactionId),
    );

    const findings: ConvertedCostAnomaly[] = [];
    for (const snapshot of snapshots) {
      if (snapshot.flagged) {
        findings.push(
          Object.freeze({
            transactionId: snapshot.transactionId,
            reason: 'CONVERTED_COST_SWING' as const,
          }),
        );
      }
    }
    return Object.freeze(findings);
  } catch {
    throw new Error(UNAVAILABLE);
  }
}
