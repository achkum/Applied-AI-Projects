import { money, type Money } from '@subtrack/money';
import { describe, expect, it } from 'vitest';
import {
  detectDuplicateCharges,
  type DuplicateChargeInput,
} from '../detection/duplicate-charge-anomalies.js';

function charge(
  id: string,
  at: Date,
  overrides: Partial<DuplicateChargeInput> = {},
): DuplicateChargeInput {
  return {
    id,
    accountId: 'account-1',
    date: at,
    merchantKey: 'merchant-1',
    amount: money(-1250n, 'SEK'),
    ...overrides,
  };
}

function utc(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hour, minute));
}

function unavailable(charges: unknown): void {
  expect(() =>
    detectDuplicateCharges(charges as readonly DuplicateChargeInput[]),
  ).toThrowError('Duplicate charge detection unavailable');
}

describe('detectDuplicateCharges', () => {
  it('matches the same UTC day and inclusive three-day window, but not four days', () => {
    expect(
      detectDuplicateCharges([
        charge('same-day-a', utc(2025, 4, 8, 1)),
        charge('same-day-b', utc(2025, 4, 8, 23)),
      ]),
    ).toMatchObject([
      {
        transactionIds: ['same-day-a', 'same-day-b'],
        reason: 'DUPLICATE_CHARGE',
      },
    ]);

    expect(
      detectDuplicateCharges([
        charge('three-days-a', utc(2025, 4, 8)),
        charge('three-days-b', utc(2025, 4, 11)),
      ]),
    ).toHaveLength(1);
    expect(
      detectDuplicateCharges([
        charge('four-days-a', utc(2025, 4, 8)),
        charge('four-days-b', utc(2025, 4, 12)),
      ]),
    ).toEqual([]);
  });

  it('uses UTC calendar days across month, year, and pre-epoch boundaries', () => {
    expect(
      detectDuplicateCharges([
        charge('month-a', utc(2025, 0, 30)),
        charge('month-b', utc(2025, 1, 2)),
      ]),
    ).toHaveLength(1);
    expect(
      detectDuplicateCharges([
        charge('year-a', utc(2024, 11, 31)),
        charge('year-b', utc(2025, 0, 3)),
      ]),
    ).toHaveLength(1);
    expect(
      detectDuplicateCharges([
        charge('epoch-a', new Date(-1)),
        charge('epoch-b', new Date(0)),
      ]),
    ).toHaveLength(1);
  });

  it('compares UTC days rather than elapsed hours', () => {
    const almostFourCalendarDays = [
      charge('calendar-a', utc(2025, 5, 1, 0)),
      charge('calendar-b', utc(2025, 5, 4, 23, 59)),
    ];
    expect(
      almostFourCalendarDays[1]!.date.getTime() -
        almostFourCalendarDays[0]!.date.getTime(),
    ).toBeGreaterThan(72 * 60 * 60 * 1000);
    expect(detectDuplicateCharges(almostFourCalendarDays)).toHaveLength(1);
  });

  it('requires the same account, merchant, exact amount, and currency', () => {
    const base = charge('base', utc(2025, 2, 1));
    expect(
      detectDuplicateCharges([
        base,
        charge('other-account', base.date, { accountId: 'account-2' }),
      ]),
    ).toEqual([]);
    expect(
      detectDuplicateCharges([
        base,
        charge('other-merchant', base.date, { merchantKey: 'merchant-2' }),
      ]),
    ).toEqual([]);
    expect(
      detectDuplicateCharges([
        base,
        charge('other-currency', base.date, { amount: money(-1250n, 'USD') }),
      ]),
    ).toEqual([]);
    expect(
      detectDuplicateCharges([
        base,
        charge('other-amount', base.date, { amount: money(-1251n, 'SEK') }),
      ]),
    ).toEqual([]);
  });

  it('compares very large minor-unit values exactly', () => {
    const large = 9_007_199_254_740_993_000_000_000_000n;
    expect(
      detectDuplicateCharges([
        charge('large-a', utc(2025, 2, 1), { amount: money(large, 'SEK') }),
        charge('large-b', utc(2025, 2, 2), { amount: money(large, 'SEK') }),
      ]),
    ).toHaveLength(1);
    expect(
      detectDuplicateCharges([
        charge('large-c', utc(2025, 2, 1), { amount: money(large, 'SEK') }),
        charge('large-d', utc(2025, 2, 2), {
          amount: money(large + 1n, 'SEK'),
        }),
      ]),
    ).toEqual([]);
  });

  it('emits each pair once in stable codepoint order regardless of input order', () => {
    const charges = [
      charge('z', utc(2025, 3, 1)),
      charge('aa', utc(2025, 3, 2)),
      charge('a', utc(2025, 3, 3)),
    ];
    const expected = [
      { transactionIds: ['a', 'aa'], reason: 'DUPLICATE_CHARGE' },
      { transactionIds: ['a', 'z'], reason: 'DUPLICATE_CHARGE' },
      { transactionIds: ['aa', 'z'], reason: 'DUPLICATE_CHARGE' },
    ];
    expect(detectDuplicateCharges(charges)).toEqual(expected);
    expect(detectDuplicateCharges([...charges].reverse())).toEqual(expected);
  });

  it('orders supplementary Unicode IDs by code point rather than UTF-16 units', () => {
    const bmpId = '\uE000';
    const supplementaryId = '\u{10000}';
    const rows = [
      charge(supplementaryId, utc(2025, 0, 1)),
      charge(bmpId, utc(2025, 0, 1)),
    ];
    expect(detectDuplicateCharges(rows)).toEqual([
      { transactionIds: [bmpId, supplementaryId], reason: 'DUPLICATE_CHARGE' },
    ]);
    expect(detectDuplicateCharges([...rows].reverse())).toEqual(
      detectDuplicateCharges(rows),
    );
  });

  it('accepts empty input, the 1000-row input limit, and exactly 10000 output pairs', () => {
    expect(detectDuplicateCharges([])).toEqual([]);
    const unrelated = Array.from({ length: 1000 }, (_, index) =>
      charge(`limit-${index}`, utc(2025, 0, 1), {
        accountId: `account-${index}`,
      }),
    );
    expect(detectDuplicateCharges(unrelated)).toEqual([]);
    const groups = [141, 16, 5].flatMap((count, group) =>
      Array.from({ length: count }, (_, index) =>
        charge(`group-${group}-${index}`, utc(2025, 0, 1), {
          accountId: `group-${group}`,
        }),
      ),
    );
    // Disjoint groups yield 9870 + 120 + 10 pairs, the inclusive output limit.
    expect(detectDuplicateCharges(groups)).toHaveLength(10000);
  });

  it('freezes every output level and leaves frozen input rows and dates unchanged', () => {
    const firstDate = utc(2025, 6, 1);
    const secondDate = utc(2025, 6, 2);
    const firstAmount: Money = Object.freeze(money(-1250n, 'SEK'));
    const secondAmount: Money = Object.freeze(money(-1250n, 'SEK'));
    const first = Object.freeze(
      charge('immutable-a', firstDate, { amount: firstAmount }),
    );
    const second = Object.freeze(
      charge('immutable-b', secondDate, { amount: secondAmount }),
    );
    const input = Object.freeze([first, second]);
    const originalTimes = input.map(({ date }) => date.getTime());

    const result = detectDuplicateCharges(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0]!.transactionIds)).toBe(true);
    expect(input.map(({ date }) => date.getTime())).toEqual(originalTimes);
    expect(input.map(({ id }) => id)).toEqual(['immutable-a', 'immutable-b']);
  });

  it('rejects nonarrays, inputs over capacity, and duplicate transaction IDs', () => {
    unavailable(null);
    unavailable({});
    unavailable(
      Array.from({ length: 1001 }, (_, index) =>
        charge(`many-${index}`, utc(2025, 0, 1)),
      ),
    );
    unavailable([
      charge('same-id', utc(2025, 0, 1)),
      charge('same-id', utc(2025, 0, 2)),
    ]);
  });

  it('rejects invalid rows, identifiers, and dates with the fixed error', () => {
    unavailable([null]);
    unavailable([{}]);
    unavailable([charge('', utc(2025, 0, 1))]);
    unavailable([charge('valid', utc(2025, 0, 1), { id: ' '.repeat(2) })]);
    unavailable([charge('valid', utc(2025, 0, 1), { accountId: '' })]);
    unavailable([charge('valid', utc(2025, 0, 1), { merchantKey: '  ' })]);
    unavailable([charge('valid', utc(2025, 0, 1), { id: 'i'.repeat(129) })]);
    unavailable([
      charge('valid', utc(2025, 0, 1), { accountId: 'a'.repeat(129) }),
    ]);
    unavailable([
      charge('valid', utc(2025, 0, 1), { merchantKey: 'm'.repeat(129) }),
    ]);
    unavailable([charge('invalid-date', new Date(Number.NaN))]);
    unavailable([charge('non-date', '2025-01-01' as unknown as Date)]);
  });

  it('rejects malformed Money values and noncanonical currency codes', () => {
    unavailable([
      charge('no-money', utc(2025, 0, 1), { amount: null as unknown as Money }),
    ]);
    unavailable([
      charge('numeric-minor', utc(2025, 0, 1), {
        amount: { minorUnits: 1250, currency: 'SEK' } as unknown as Money,
      }),
    ]);
    unavailable([
      charge('no-currency', utc(2025, 0, 1), {
        amount: { minorUnits: 1250n } as Money,
      }),
    ]);
    unavailable([
      charge('numeric-currency', utc(2025, 0, 1), {
        amount: { minorUnits: 1250n, currency: 42 } as unknown as Money,
      }),
    ]);
    unavailable([
      charge('bad-currency', utc(2025, 0, 1), {
        amount: { minorUnits: 1250n, currency: 'usd' } as Money,
      }),
    ]);
  });

  it('rejects output beyond the pair capacity', () => {
    const denseCharges = Array.from({ length: 142 }, (_, index) =>
      charge(`dense-${String(index).padStart(3, '0')}`, utc(2025, 0, 1)),
    );
    unavailable(denseCharges);
  });
});
