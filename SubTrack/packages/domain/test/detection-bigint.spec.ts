import {describe, expect, it} from 'vitest';
import {detectRecurring, detectRecurringBigint, type BigintTransactionSeries, type TransactionSeries} from '../detection/index.js';

function series(amount = -9007199254740993n): BigintTransactionSeries {
  return {
    ownerId: 'owner-test', accountId: 'account-test', merchantKey: 'merchant-test', currency: 'SEK',
    transactions: [0, 1, 2, 3].map((month) => ({
      id: `charge-${month}`, accountId: 'account-test', date: new Date(Date.UTC(2025, month, 15)),
      amountMinor: amount, currency: 'SEK', direction: 'DEBIT', pending: false,
    })),
  };
}

describe('bigint recurring detection', () => {
  it('retains exact minor units beyond safe number range through the shared amount band', () => {
    const result = detectRecurringBigint(series());
    expect(result).toHaveLength(1);
    expect(result[0]?.cadence).toBe('MONTHLY');
    expect(result[0]?.amountBand).toEqual({
      minimum: {minorUnits: 9007199254740993n, currency: 'SEK'},
      maximum: {minorUnits: 9007199254740993n, currency: 'SEK'},
      representative: {minorUnits: 9007199254740993n, currency: 'SEK'},
    });
    const wire = result[0]!.amountBand.representative.minorUnits.toString();
    expect(BigInt(JSON.parse(JSON.stringify({amountMinor: wire})).amountMinor)).toBe(9007199254740993n);
  });

  it('matches legacy outputs for every cadence and preserves input order', () => {
    const schedules = [
      [0, 7, 14, 21, 28].map((day) => new Date(Date.UTC(2025, 0, 6 + day))),
      [0, 1, 2, 3].map((month) => new Date(Date.UTC(2024, month, 15))),
      [0, 3, 6, 9].map((month) => new Date(Date.UTC(2024, month, 15))),
      [0, 6, 12].map((month) => new Date(Date.UTC(2024, month, 15))),
      [0, 12].map((month) => new Date(Date.UTC(2024, month, 15))),
    ];
    for (const dates of schedules) {
      const input = series(-1000n);
      input.transactions = dates.map((date, i) => ({...input.transactions[0]!, id: `charge-${i}`, date})).reverse();
      const legacy: TransactionSeries = {...input, transactions: input.transactions.map((transaction) => ({...transaction, amountMinor: -1000}))};
      expect(detectRecurringBigint(input)).toEqual(detectRecurring(legacy));
      expect(input.transactions.map(({id}) => id)).toEqual(dates.map((_, i) => `charge-${i}`).reverse());
    }
  });

  it('accepts signed storage bounds and rejects out-of-range or nonbigint input', () => {
    expect(detectRecurringBigint(series(-9223372036854775808n))).toHaveLength(1);
    expect(detectRecurringBigint(series(9223372036854775807n))).toEqual([]);
    for (const amount of [-9223372036854775809n, 9223372036854775808n]) {
      expect(() => detectRecurringBigint(series(amount))).toThrow('signed int64 bigint');
    }
    // The runtime boundary must reject forged JSON numbers despite the static interface.
    const invalid = {...series(), transactions: series().transactions.map((transaction) => ({...transaction, amountMinor: -1000}))};
    expect(() => detectRecurringBigint(invalid as unknown as BigintTransactionSeries)).toThrow('signed int64 bigint');
    expect(() => detectRecurring({...invalid, transactions: invalid.transactions.map((transaction) => ({...transaction, amountMinor: -9007199254740992}))})).toThrow('MAX_SAFE_INTEGER');
  });

  it('preserves owner, account, currency, date and filtering guards', () => {
    expect(detectRecurringBigint({...series(), ownerId: ''})).toEqual([]);
    expect(detectRecurringBigint({...series(), accountId: ''})).toEqual([]);
    expect(detectRecurringBigint({...series(), merchantKey: null})).toEqual([]);
    expect(detectRecurringBigint({...series(), categoryCode: 'RENT'})).toEqual([]);
    expect(() => detectRecurringBigint({...series(), currency: 'S!K'})).toThrow();
    for (const override of [
      {accountId: 'foreign-account'}, {currency: 'EUR'}, {date: new Date('invalid')},
    ]) {
      const input = series();
      expect(detectRecurringBigint({...input, transactions: [{...input.transactions[0]!, ...override}, ...input.transactions.slice(1)]})).toEqual([]);
    }
    for (const override of [{pending: true}, {direction: 'CREDIT' as const}, {amountMinor: 0n}]) {
      const input = series();
      expect(detectRecurringBigint({...input, transactions: input.transactions.map((transaction) => ({...transaction, ...override}))})).toEqual([]);
    }
    const wrongAmountPending = {...series(), transactions: series().transactions.map((transaction) => ({...transaction, amountMinor: 0, pending: true}))};
    expect(() => detectRecurringBigint(wrongAmountPending as unknown as BigintTransactionSeries)).toThrow();
    // Metadata short-circuit still precedes amount validation, as it does for the legacy API.
    expect(detectRecurringBigint({...wrongAmountPending, ownerId: ''} as unknown as BigintTransactionSeries)).toEqual([]);
  });
});
