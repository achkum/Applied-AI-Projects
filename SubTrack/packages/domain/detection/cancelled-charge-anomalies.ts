export interface CancelledChargeInput {
  readonly transactionId: string;
  readonly subscriptionId: string;
  readonly chargedAt: Date;
  readonly cancelledAt: Date;
}

export interface CancelledChargeAnomaly {
  readonly transactionId: string;
  readonly subscriptionId: string;
  readonly reason: 'CHARGE_AFTER_CANCELLATION';
}

const MAX_INPUTS = 1_000;
const MAX_IDENTIFIER_CODE_UNITS = 128;
const FAILURE_MESSAGE = 'Cancelled charge detection unavailable';

interface Snapshot {
  readonly transactionId: string;
  readonly subscriptionId: string;
  readonly chargedAt: number;
  readonly cancelledAt: number;
}

function isValidIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_IDENTIFIER_CODE_UNITS
  );
}

function compareCodepoints(a: string, b: string): number {
  const left = Array.from(a, (character) => character.codePointAt(0)!);
  const right = Array.from(b, (character) => character.codePointAt(0)!);
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index]! !== right[index]!)
      return left[index]! < right[index]! ? -1 : 1;
  }
  return left.length - right.length;
}

function readInstant(value: unknown): number {
  if (!(value instanceof Date)) throw new Error(FAILURE_MESSAGE);
  const instant = Date.prototype.getTime.call(value);
  if (!Number.isFinite(instant)) throw new Error(FAILURE_MESSAGE);
  return instant;
}

export function detectChargesAfterCancellation(
  charges: readonly CancelledChargeInput[],
): readonly CancelledChargeAnomaly[] {
  try {
    if (!Array.isArray(charges) || charges.length > MAX_INPUTS) {
      throw new Error(FAILURE_MESSAGE);
    }

    const snapshots: Snapshot[] = [];
    const transactionIds = new Set<string>();

    for (let index = 0; index < charges.length; index += 1) {
      const charge: unknown = charges[index];
      if (charge === null || typeof charge !== 'object') {
        throw new Error(FAILURE_MESSAGE);
      }

      const row = charge as Record<string, unknown>;
      const transactionId = row.transactionId;
      const subscriptionId = row.subscriptionId;
      if (
        !isValidIdentifier(transactionId) ||
        !isValidIdentifier(subscriptionId)
      ) {
        throw new Error(FAILURE_MESSAGE);
      }
      if (transactionIds.has(transactionId)) throw new Error(FAILURE_MESSAGE);
      transactionIds.add(transactionId);

      const chargedAt = readInstant(row.chargedAt);
      const cancelledAt = readInstant(row.cancelledAt);
      snapshots.push({ transactionId, subscriptionId, chargedAt, cancelledAt });
    }

    snapshots.sort((left, right) =>
      compareCodepoints(left.transactionId, right.transactionId),
    );
    const anomalies: CancelledChargeAnomaly[] = [];
    for (const snapshot of snapshots) {
      if (snapshot.chargedAt > snapshot.cancelledAt) {
        anomalies.push(
          Object.freeze({
            transactionId: snapshot.transactionId,
            subscriptionId: snapshot.subscriptionId,
            reason: 'CHARGE_AFTER_CANCELLATION' as const,
          }),
        );
      }
    }

    return Object.freeze(anomalies);
  } catch {
    throw new Error(FAILURE_MESSAGE);
  }
}
