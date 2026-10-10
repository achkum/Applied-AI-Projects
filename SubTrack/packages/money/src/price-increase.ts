import { MoneyError, type Money } from './money.js';

const unavailableMessage = 'Price increase confirmation unavailable';

/**
 * Confirm the same SEK price increase on the caller-proven next cycle.
 * The caller is responsible for supplying authoritative eligible charges.
 */
export function isConfirmedSekPriceIncrease(
  firstNewCharge: Money,
  nextCycleCharge: Money,
  previousThreeCharges: readonly Money[],
): boolean {
  try {
    const snapshots = new WeakMap<object, bigint>();

    const magnitudeOf = (value: unknown): bigint => {
      if (typeof value !== 'object' || value === null) {
        throw new MoneyError(unavailableMessage);
      }

      const existing = snapshots.get(value);
      if (existing !== undefined) return existing;

      const minorUnits: unknown = (value as { readonly minorUnits?: unknown }).minorUnits;
      const currency: unknown = (value as { readonly currency?: unknown }).currency;
      if (typeof minorUnits !== 'bigint' || minorUnits === 0n || currency !== 'SEK') {
        throw new MoneyError(unavailableMessage);
      }

      const magnitude = minorUnits < 0n ? -minorUnits : minorUnits;
      snapshots.set(value, magnitude);
      return magnitude;
    };

    if (!Array.isArray(previousThreeCharges)) {
      throw new MoneyError(unavailableMessage);
    }
    const historyLength: unknown = (previousThreeCharges as { readonly length: unknown }).length;
    if (historyLength !== 3) throw new MoneyError(unavailableMessage);
    const previous0: unknown = (previousThreeCharges as readonly unknown[])[0];
    const previous1: unknown = (previousThreeCharges as readonly unknown[])[1];
    const previous2: unknown = (previousThreeCharges as readonly unknown[])[2];

    const firstMagnitude = magnitudeOf(firstNewCharge);
    const nextMagnitude = magnitudeOf(nextCycleCharge);
    const previousMagnitudes: [bigint, bigint, bigint] = [
      magnitudeOf(previous0),
      magnitudeOf(previous1),
      magnitudeOf(previous2),
    ];

    previousMagnitudes.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const median = previousMagnitudes[1];

    if (firstMagnitude !== nextMagnitude) return false;
    const delta = firstMagnitude - median;
    if (delta <= 0n) return false;
    return 100n * delta > 3n * median || delta > 500n;
  } catch {
    throw new MoneyError(unavailableMessage);
  }
}
