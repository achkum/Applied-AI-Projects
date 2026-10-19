import { money, multiply, subtract, type Money } from './money.js';

export type RecurringCadence = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';

/** Annual planning convention: 52 weekly cycles; custom cycles are unknown.
 * Round each saved plan once, directly from its original amount, half-up.
 * This is an estimate, not a calendar charge forecast or an exchange rate.
 */
export function recurringCost(amount: Money, cadence: RecurringCadence): Readonly<{ monthly: Money; annual: Money }> | null {
  if (amount.minorUnits < 0n) throw new RangeError('Negative recurring cost');
  let cycles: bigint;
  switch (cadence) {
    case 'WEEKLY': cycles = 52n; break;
    case 'MONTHLY': cycles = 12n; break;
    case 'QUARTERLY': cycles = 4n; break;
    case 'SEMIANNUAL': cycles = 2n; break;
    case 'ANNUAL': cycles = 1n; break;
    case 'CUSTOM': return null;
    default: throw new RangeError('Unknown recurring cadence');
  }
  return { monthly: multiply(amount, cycles, 12n), annual: multiply(amount, cycles) };
}

/** Only same-currency prices are comparable; positive delta means the alternative costs less. */
export function recurringCostDifference(current: Money, cadence: RecurringCadence, alternative: Money, alternativeCadence: RecurringCadence) {
  const left = recurringCost(current, cadence), right = recurringCost(alternative, alternativeCadence);
  if (!left || !right) return null;
  return { monthly: subtract(left.monthly, right.monthly), annual: subtract(left.annual, right.annual) };
}

/** Chart fractions use bigint until the final bounded integer pixel-independent percentage. */
export function chartPercent(value: Money, maximum: Money): number {
  if (value.currency !== maximum.currency || value.minorUnits < 0n || maximum.minorUnits < 0n || value.minorUnits > maximum.minorUnits) throw new RangeError('Invalid chart values');
  if (maximum.minorUnits === 0n) return 0;
  return Number(multiply(money(value.minorUnits, value.currency), 100n, maximum.minorUnits).minorUnits);
}
