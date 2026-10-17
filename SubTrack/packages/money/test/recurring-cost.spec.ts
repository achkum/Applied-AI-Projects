import { describe, expect, it } from 'vitest';
import { money } from '../src/money.js';
import { chartPercent, recurringCost, recurringCostDifference } from '../src/recurring-cost.js';

describe('exact recurring planning costs', () => {
  it.each([
    ['WEEKLY', 433n, 5200n], ['MONTHLY', 100n, 1200n], ['QUARTERLY', 33n, 400n],
    ['SEMIANNUAL', 17n, 200n], ['ANNUAL', 8n, 100n],
  ] as const)('normalizes %s without converting Money to Number', (cadence, monthly, annual) => {
    expect(recurringCost(money(100n, 'SEK'), cadence)).toEqual({ monthly: money(monthly, 'SEK'), annual: money(annual, 'SEK') });
  });
  it('keeps annual costs exact instead of multiplying rounded monthly prices', () => {
    expect(recurringCost(money(101n, 'SEK'), 'ANNUAL')?.annual.minorUnits).toBe(101n);
    expect(recurringCost(money(6n, 'SEK'), 'ANNUAL')?.monthly.minorUnits).toBe(1n);
    expect(recurringCost(money(900719925474099312n, 'SEK'), 'MONTHLY')?.annual.minorUnits).toBe(10808639105689191744n);
  });
  it('does not invent a custom cycle', () => {
    expect(recurringCost(money(100n, 'SEK'), 'CUSTOM')).toBeNull();
    expect(recurringCostDifference(money(100n, 'SEK'), 'CUSTOM', money(10n, 'SEK'), 'MONTHLY')).toBeNull();
    expect(recurringCostDifference(money(100n, 'SEK'), 'MONTHLY', money(10n, 'SEK'), 'CUSTOM')).toBeNull();
  });
  it('compares actual normalized costs and preserves increases', () => {
    expect(recurringCostDifference(money(100n, 'SEK'), 'MONTHLY', money(1000n, 'SEK'), 'ANNUAL')).toEqual({ monthly: money(17n, 'SEK'), annual: money(200n, 'SEK') });
    expect(recurringCostDifference(money(100n, 'SEK'), 'MONTHLY', money(200n, 'SEK'), 'MONTHLY')?.annual.minorUnits).toBe(-1200n);
    expect(() => recurringCostDifference(money(100n, 'SEK'), 'MONTHLY', money(100n, 'EUR'), 'MONTHLY')).toThrow();
    expect(() => recurringCost(money(-1n, 'SEK'), 'MONTHLY')).toThrow();
    expect(() => recurringCost(money(1n, 'SEK'), 'INVALID' as never)).toThrow();
  });
  it('provides only bounded chart geometry with exact source values', () => {
    expect(chartPercent(money(0n, 'SEK'), money(0n, 'SEK'))).toBe(0);
    expect(chartPercent(money(1n, 'SEK'), money(3n, 'SEK'))).toBe(33);
    expect(chartPercent(money(900719925474099312n, 'SEK'), money(900719925474099312n, 'SEK'))).toBe(100);
    expect(() => chartPercent(money(2n, 'SEK'), money(1n, 'SEK'))).toThrow();
    expect(() => chartPercent(money(-1n, 'SEK'), money(1n, 'SEK'))).toThrow();
    expect(() => chartPercent(money(0n, 'SEK'), money(-1n, 'SEK'))).toThrow();
    expect(() => chartPercent(money(1n, 'EUR'), money(1n, 'SEK'))).toThrow();
  });
});
