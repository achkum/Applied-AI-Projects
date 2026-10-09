import {
  assertValidCurrencyCode,
  equals,
  money,
  type Money,
} from '@subtrack/money';

export interface DuplicateChargeInput {
  readonly id: string;
  readonly accountId: string;
  readonly date: Date;
  readonly merchantKey: string;
  readonly amount: Money;
}

export interface DuplicateChargeAnomaly {
  readonly transactionIds: readonly [string, string];
  readonly reason: 'DUPLICATE_CHARGE';
}

interface ValidatedCharge {
  readonly id: string;
  readonly accountId: string;
  readonly day: number;
  readonly merchantKey: string;
  readonly amount: Money;
}

const MAX_CHARGES = 1_000;
const MAX_OUTPUT_PAIRS = 10_000;
const MAX_IDENTIFIER_LENGTH = 128;
const DAY_MS = 86_400_000;
const UNAVAILABLE = 'Duplicate charge detection unavailable';

function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a, (character) => character.codePointAt(0)!);
  const right = Array.from(b, (character) => character.codePointAt(0)!);
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index]! !== right[index]!)
      return left[index]! < right[index]! ? -1 : 1;
  }
  return left.length - right.length;
}

function unavailable(): never {
  throw new Error(UNAVAILABLE);
}

/** Detect same-day-nearby exact charges from one caller-authorized owner's debit rows. */
export function detectDuplicateCharges(
  charges: readonly DuplicateChargeInput[],
): readonly DuplicateChargeAnomaly[] {
  try {
    if (!Array.isArray(charges) || charges.length > MAX_CHARGES) unavailable();

    const validated: ValidatedCharge[] = [];
    const seenIds = new Set<string>();
    for (const charge of charges) {
      if (charge === null || typeof charge !== 'object') unavailable();
      const { id, accountId, date, merchantKey, amount } = charge;
      for (const identifier of [id, accountId, merchantKey]) {
        if (
          typeof identifier !== 'string' ||
          identifier.trim().length === 0 ||
          identifier.length > MAX_IDENTIFIER_LENGTH
        ) {
          unavailable();
        }
      }
      if (seenIds.has(id)) unavailable();
      seenIds.add(id);

      if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
        unavailable();
      if (
        amount === null ||
        typeof amount !== 'object' ||
        typeof amount.minorUnits !== 'bigint' ||
        typeof amount.currency !== 'string'
      ) {
        unavailable();
      }
      assertValidCurrencyCode(amount.currency);

      validated.push({
        id,
        accountId,
        day: Math.floor(date.getTime() / DAY_MS),
        merchantKey,
        amount: money(amount.minorUnits, amount.currency),
      });
    }

    validated.sort((a, b) => compareCodePoints(a.id, b.id));
    const anomalies: DuplicateChargeAnomaly[] = [];
    for (let firstIndex = 0; firstIndex < validated.length; firstIndex += 1) {
      const first = validated[firstIndex]!;
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < validated.length;
        secondIndex += 1
      ) {
        const second = validated[secondIndex]!;
        if (
          first.accountId !== second.accountId ||
          first.merchantKey !== second.merchantKey
        )
          continue;
        if (
          Math.abs(first.day - second.day) > 3 ||
          !equals(first.amount, second.amount)
        )
          continue;
        if (anomalies.length >= MAX_OUTPUT_PAIRS) unavailable();
        const transactionIds = Object.freeze([
          first.id,
          second.id,
        ]) as readonly [string, string];
        anomalies.push(
          Object.freeze({
            transactionIds,
            reason: 'DUPLICATE_CHARGE' as const,
          }),
        );
      }
    }
    return Object.freeze(anomalies);
  } catch {
    return unavailable();
  }
}
