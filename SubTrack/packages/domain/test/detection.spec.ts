import { describe, expect, it } from 'vitest';
import { detectRecurring, type BillingCadence, type DetectionTransaction, type TransactionSeries } from '../detection/index.js';

function date(year: number, month: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month, day, hour));
}

function tx(
  id: string,
  at: Date,
  amountMinor = -1000,
  overrides: Partial<DetectionTransaction> = {},
): DetectionTransaction {
  return {
    id,
    accountId: 'account-1',
    date: at,
    amountMinor,
    currency: 'SEK',
    direction: 'DEBIT',
    pending: false,
    ...overrides,
  };
}

function series(
  transactions: readonly DetectionTransaction[],
  overrides: Partial<TransactionSeries> = {},
): TransactionSeries {
  return {
    ownerId: 'owner-1',
    accountId: 'account-1',
    merchantKey: 'merchant-1',
    currency: 'SEK',
    transactions,
    ...overrides,
  };
}

function monthly(count: number, dayOfMonth = 15, startMonth = 0): DetectionTransaction[] {
  return Array.from({ length: count }, (_, index) => {
    const month = startMonth + index;
    const year = 2024 + Math.floor(month / 12);
    return tx(`monthly-${index}`, date(year, month % 12, dayOfMonth));
  });
}

describe('detectRecurring cadence rules', () => {
  const cadenceCases: { cadence: BillingCadence; transactions: DetectionTransaction[] }[] = [
    {
      cadence: 'WEEKLY',
      transactions: Array.from({ length: 5 }, (_, i) => tx(`weekly-${i}`, date(2025, 0, 6 + i * 7))),
    },
    { cadence: 'MONTHLY', transactions: monthly(5, 15) },
    {
      cadence: 'QUARTERLY',
      transactions: [0, 3, 6, 9].map((month, i) => tx(`quarterly-${i}`, date(2024 + Math.floor(month / 12), month % 12, 15))),
    },
    {
      cadence: 'SEMIANNUAL',
      transactions: [0, 6, 12].map((month, i) => tx(`semiannual-${i}`, date(2024 + Math.floor(month / 12), month % 12, 15))),
    },
    {
      cadence: 'ANNUAL',
      transactions: [date(2024, 5, 15), date(2025, 5, 15)].map((at, i) => tx(`annual-${i}`, at)),
    },
  ];

  it.each(cadenceCases)('detects $cadence on its calendar schedule', ({ cadence, transactions }) => {
    expect(detectRecurring(series(transactions)).map((candidate) => candidate.cadence)).toContain(cadence);
  });

  it('requires the reviewed minimum occurrence count for each cadence', () => {
    const insufficient: DetectionTransaction[][] = [
      [tx('weekly-a', date(2025, 0, 6)), tx('weekly-b', date(2025, 0, 13)), tx('weekly-c', date(2025, 0, 20))],
      monthly(2),
      [tx('quarter-a', date(2024, 0, 15)), tx('quarter-b', date(2024, 3, 15))],
      [tx('semi-a', date(2024, 0, 15)), tx('semi-b', date(2024, 6, 15))],
      [tx('annual-a', date(2024, 0, 15))],
    ];
    for (const transactions of insufficient) {
      expect(detectRecurring(series(transactions))).toEqual([]);
    }

    expect(detectRecurring(series([
      tx('annual-first', date(2024, 0, 15)),
      tx('annual-second', date(2025, 0, 15)),
    ]))).toHaveLength(1);
  });

  it('matches month end with a next-month calendar shift and leap-year boundaries', () => {
    const shiftedMonthEnd = [
      tx('jan', date(2024, 0, 31 + 2)),
      tx('feb', date(2024, 1, 29 + 2)),
      tx('mar', date(2024, 2, 31 + 2)),
      tx('apr', date(2024, 3, 30 + 2)),
    ];
    expect(detectRecurring(series(shiftedMonthEnd))[0]?.cadence).toBe('MONTHLY');
  });

  it('does not bridge a missing monthly billing slot', () => {
    const charges = monthly(4);
    expect(detectRecurring(series([charges[0]!, charges[1]!, charges[3]!]))).toEqual([]);
  });
});

describe('detectRecurring amount, scope, and eligibility rules', () => {
  it('accepts all amounts within the integer ±10 percent band and rejects outliers', () => {
    const within = monthly(4).map((item, i) => ({ ...item, amountMinor: i === 1 ? -1080 : -1000 }));
    const candidate = detectRecurring(series(within))[0];
    expect(candidate?.amountBand.representative.minorUnits).toBe(1000n);
    expect(candidate?.amountBand.minimum.minorUnits).toBe(1000n);
    expect(candidate?.amountBand.maximum.minorUnits).toBe(1080n);

    const outside = monthly(4).map((item, i) => ({ ...item, amountMinor: i === 1 ? -1120 : -1000 }));
    expect(detectRecurring(series(outside))).toEqual([]);
  });

  it('does not combine unlike currencies or accounts', () => {
    const mixedCurrency = monthly(4).map((item, i) => ({
      ...item,
      currency: i < 2 ? 'SEK' : 'USD',
    }));
    expect(detectRecurring(series(mixedCurrency))).toEqual([]);

    const sekSeries = series(monthly(3), { currency: 'SEK' });
    const usdSeries = series(monthly(3).map((item) => ({ ...item, currency: 'USD' })), { currency: 'USD' });
    expect(detectRecurring(sekSeries)[0]?.currency).toBe('SEK');
    expect(detectRecurring(usdSeries)[0]?.currency).toBe('USD');

    expect(detectRecurring(series(monthly(4).map((item, i) => ({
      ...item,
      accountId: i === 3 ? 'account-2' : 'account-1',
    })) ))).toEqual([]);
  });

  it('ignores pending, credits, refunds, and positive debit rows', () => {
    const eligible = monthly(2);
    const ineligible = [
      tx('pending', date(2024, 2, 15), -1000, { pending: true }),
      tx('credit', date(2024, 3, 15), 1000, { direction: 'CREDIT' }),
      tx('refund', date(2024, 4, 15), 1000),
      tx('positive-debit', date(2024, 5, 15), 1000),
    ];
    expect(detectRecurring(series([...eligible, ...ineligible]))).toEqual([]);
  });

  it('collapses same-amount retry duplicates within three calendar days', () => {
    const transactions = [
      tx('jan-charge', date(2024, 0, 15)),
      tx('jan-retry', date(2024, 0, 17)),
      tx('feb-charge', date(2024, 1, 15)),
      tx('mar-charge', date(2024, 2, 15)),
    ];
    expect(detectRecurring(series(transactions))[0]?.occurrenceCount).toBe(3);
  });

  it('uses locale-independent code-unit order for Unicode retry IDs across locale orderings', () => {
    const sameDayRetries = [
      tx('z', date(2024, 0, 15), -1000),
      tx('ä', date(2024, 0, 15), -1000),
    ];
    const englishOrdered = [...sameDayRetries].sort((a, b) =>
      new Intl.Collator('en').compare(a.id, b.id),
    );
    const swedishOrdered = [...sameDayRetries].sort((a, b) =>
      new Intl.Collator('sv').compare(a.id, b.id),
    );
    expect(englishOrdered.map(({ id }) => id)).toEqual(['ä', 'z']);
    expect(swedishOrdered.map(({ id }) => id)).toEqual(['z', 'ä']);

    const remainingCharges = [
      tx('feb-charge', date(2024, 1, 15), -1000),
      tx('mar-charge', date(2024, 2, 15), -1000),
    ];
    const englishResult = detectRecurring(series([...englishOrdered, ...remainingCharges]));
    const swedishResult = detectRecurring(series([...swedishOrdered, ...remainingCharges]));
    const reversedResult = detectRecurring(series([...sameDayRetries, ...remainingCharges].reverse()));

    expect(englishResult).toEqual(swedishResult);
    expect(englishResult).toEqual(reversedResult);
    expect(englishResult[0]?.cadence).toBe('MONTHLY');
    expect(englishResult[0]?.transactionIds).toEqual(['z', 'feb-charge', 'mar-charge']);
    expect(englishResult[0]?.amountBand.minimum.minorUnits).toBe(1000n);
    expect(englishResult[0]?.amountBand.maximum.minorUnits).toBe(1000n);
  });

  it('requires resolved merchant identity and rejects excluded categories', () => {
    expect(detectRecurring(series(monthly(4), { merchantKey: null }))).toEqual([]);
    for (const categoryCode of ['RENT', 'UTILITY_ELECTRICITY', 'UNION_FEE']) {
      expect(detectRecurring(series(monthly(4), { categoryCode }))).toEqual([]);
    }
  });

  it('is stable, ordered, and applies category priors only as supporting evidence', () => {
    const input = series(monthly(4), { categoryCode: 'VIDEO_STREAMING' });
    const first = detectRecurring(input);
    expect(detectRecurring(input)).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]?.confidence).toBe(0.9);
    expect(first[0]?.reasons.map(({ code }) => code)).toEqual([
      'MERCHANT_RESOLVED',
      'CADENCE_MATCHED',
      'MIN_OCCURRENCES_MET',
      'DATE_PATTERN_STABLE',
      'AMOUNT_WITHIN_BAND',
      'SUBSCRIPTION_CATEGORY_PRIOR',
    ]);
    expect(detectRecurring(series(monthly(4), { categoryCode: 'UNKNOWN' }))[0]?.confidence).toBe(0.88);
  });

  it('does not mutate the supplied series, transactions, dates, or transaction order', () => {
    const transactions = monthly(4).map((item) => Object.freeze({ ...item, date: new Date(item.date) }));
    const frozen = Object.freeze({
      ownerId: 'owner-1',
      accountId: 'account-1',
      merchantKey: 'merchant-1',
      currency: 'SEK',
      transactions: Object.freeze(transactions),
    });
    const beforeIds = frozen.transactions.map((item) => item.id);
    const beforeTimes = frozen.transactions.map((item) => item.date.getTime());

    expect(detectRecurring(frozen)).toHaveLength(1);
    expect(frozen.transactions.map((item) => item.id)).toEqual(beforeIds);
    expect(frozen.transactions.map((item) => item.date.getTime())).toEqual(beforeTimes);
  });
});
