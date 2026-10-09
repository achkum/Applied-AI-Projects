import { money, type Money } from '@subtrack/money';
import { describe, expect, it } from 'vitest';
import {
  detectAmountAnomalies,
  type AmountAnomalyInput,
} from '../detection/amount-anomalies.js';

const SEK = (minorUnits: bigint): Money => money(minorUnits, 'SEK');

function charge(
  transactionId: string,
  amount: Money,
  history: readonly Money[],
): AmountAnomalyInput {
  return { transactionId, amount, history };
}

function unavailable(input: unknown): void {
  let thrown: unknown;
  try {
    detectAmountAnomalies(input as readonly AmountAnomalyInput[]);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe(
    'Amount anomaly detection unavailable',
  );
}

describe('detectAmountAnomalies', () => {
  it('uses odd-sample median and inclusive three-MAD bounds for positive and negative values', () => {
    const history = [1n, 2n, 3n].map(SEK);
    const negativeHistory = [-3n, -2n, -1n].map(SEK);

    const results = detectAmountAnomalies([
      charge('positive-low-bound', SEK(-1n), history),
      charge('positive-high-bound', SEK(5n), history),
      charge('positive-low-outlier', SEK(-2n), history),
      charge('positive-high-outlier', SEK(6n), history),
      charge('negative-low-bound', SEK(-5n), negativeHistory),
      charge('negative-high-bound', SEK(1n), negativeHistory),
      charge('negative-low-outlier', SEK(-6n), negativeHistory),
      charge('negative-high-outlier', SEK(2n), negativeHistory),
    ]);

    expect(results.map(({ transactionId }) => transactionId)).toEqual([
      'negative-high-outlier',
      'negative-low-outlier',
      'positive-high-outlier',
      'positive-low-outlier',
    ]);
  });

  it('preserves an even-sample fractional MAD without rounding minor units', () => {
    const history = [0n, 1n, 1n, 2n].map(SEK);
    const results = detectAmountAnomalies([
      charge('inside-low', SEK(0n), history),
      charge('inside-high', SEK(2n), history),
      charge('outside-low', SEK(-1n), history),
      charge('outside-high', SEK(3n), history),
    ]);

    expect(results.map(({ transactionId }) => transactionId)).toEqual([
      'outside-high',
      'outside-low',
    ]);
  });

  it('delegates huge minor-unit values exactly to Money', () => {
    const history = [
      123456789012345678901234567890123456789012345678901234567890n,
      123456789012345678901234567890123456789012345678901234567890n,
    ].map(SEK);
    const same =
      SEK(123456789012345678901234567890123456789012345678901234567890n);
    const adjacent =
      SEK(123456789012345678901234567890123456789012345678901234567891n);

    expect(
      detectAmountAnomalies([
        charge('huge-inside', same, history),
        charge('huge-outside', adjacent, history),
      ]),
    ).toEqual([{ transactionId: 'huge-outside', reason: 'AMOUNT_OUTLIER' }]);
  });

  it('returns flagged identifiers in prefix-safe codepoint order independent of batch order', () => {
    const ids = ['a\u{10000}x', 'a\uE000', 'a', 'a\u{10000}', 'a\uE000x', 'z'];
    const expected = [
      'a',
      'a\uE000',
      'a\uE000x',
      'a\u{10000}',
      'a\u{10000}x',
      'z',
    ];
    const rows = ids.map((id) => charge(id, SEK(1n), [SEK(0n)]));

    expect(
      detectAmountAnomalies(rows).map(({ transactionId }) => transactionId),
    ).toEqual(expected);
    expect(
      detectAmountAnomalies([...rows].reverse()).map(
        ({ transactionId }) => transactionId,
      ),
    ).toEqual(expected);
  });

  it('accepts empty batches, 1000 charges, 1- and 1000-entry histories, and exactly 10000 references', () => {
    expect(detectAmountAnomalies([])).toEqual([]);

    const atBatchLimit = Array.from({ length: 1000 }, (_, index) =>
      charge(`batch-${index}`, SEK(0n), [SEK(0n)]),
    );
    expect(detectAmountAnomalies(atBatchLimit)).toEqual([]);

    expect(
      detectAmountAnomalies([charge('one-ref', SEK(0n), [SEK(0n)])]),
    ).toEqual([]);
    const maxHistory = Array.from({ length: 1000 }, () => SEK(0n));
    expect(
      detectAmountAnomalies([charge('max-history', SEK(0n), maxHistory)]),
    ).toEqual([]);

    const exactlyTenThousandRefs = Array.from({ length: 10 }, (_, index) =>
      charge(`refs-${index}`, SEK(0n), maxHistory),
    );
    expect(detectAmountAnomalies(exactlyTenThousandRefs)).toEqual([]);
  });

  it('rejects batch, per-history, and cumulative reference overflow', () => {
    unavailable(
      Array.from({ length: 1001 }, (_, index) =>
        charge(`too-many-${index}`, SEK(0n), [SEK(0n)]),
      ),
    );
    unavailable([
      charge(
        'history-too-long',
        SEK(0n),
        Array.from({ length: 1001 }, () => SEK(0n)),
      ),
    ]);
    unavailable(
      Array.from({ length: 11 }, (_, index) =>
        charge(
          `refs-over-${index}`,
          SEK(0n),
          Array.from({ length: 1000 }, () => SEK(0n)),
        ),
      ),
    );
  });

  it('rejects malformed batches, rows, identifiers, and histories with one fixed error', () => {
    unavailable(null);
    unavailable({});
    unavailable([null]);
    unavailable([42]);
    unavailable([{}]);
    unavailable([charge('', SEK(0n), [SEK(0n)])]);
    unavailable([charge('  \t', SEK(0n), [SEK(0n)])]);
    unavailable([charge('x'.repeat(129), SEK(0n), [SEK(0n)])]);
    unavailable([charge('missing-history', SEK(0n), [] as readonly Money[])]);
    unavailable([
      charge('bad-history', SEK(0n), null as unknown as readonly Money[]),
    ]);
    unavailable([charge('bad-history-shape', SEK(0n), {} as readonly Money[])]);
    unavailable([charge('sparse-history', SEK(0n), Array<Money>(1))]);
    unavailable([
      charge('duplicate', SEK(0n), [SEK(0n)]),
      charge('duplicate', SEK(0n), [SEK(0n)]),
    ]);
  });

  it('maps malformed amount and history Money values to the fixed error without exposing their data', () => {
    const privateDetail = 'private-amount-detail';
    for (const amount of [
      null,
      7,
      { minorUnits: 7, currency: 'SEK' },
      { minorUnits: 7n },
      { minorUnits: 7n, currency: 42 },
      { minorUnits: 7n, currency: 'sek' },
    ]) {
      unavailable([charge(privateDetail, amount as Money, [SEK(0n)])]);
    }
    for (const historyEntry of [
      null,
      7,
      { minorUnits: 7, currency: 'SEK' },
      { minorUnits: 7n },
      { minorUnits: 7n, currency: 'sek' },
      { minorUnits: 7n, currency: 'USD' },
    ]) {
      unavailable([
        charge('history-invalid', SEK(0n), [historyEntry as Money]),
      ]);
    }

    try {
      detectAmountAnomalies([
        charge(privateDetail, SEK(1n), [
          { minorUnits: 0n, currency: 'sek' } as Money,
        ]),
      ]);
      throw new Error('Expected rejection');
    } catch (error) {
      expect((error as Error).message).toBe(
        'Amount anomaly detection unavailable',
      );
      expect((error as Error).message).not.toContain(privateDetail);
      expect((error as Error).message).not.toContain('sek');
    }
  });

  it('copies history by index without using a caller supplied iterator', () => {
    const history = [SEK(0n)];
    Object.defineProperty(history, Symbol.iterator, {
      value() {
        throw new Error('custom iterator must not run');
      },
    });

    expect(detectAmountAnomalies([charge('copied', SEK(1n), history)])).toEqual(
      [{ transactionId: 'copied', reason: 'AMOUNT_OUTLIER' }],
    );
  });

  it('validates captured native history length and maps getter failures to the fixed error', () => {
    const nonIntegerLength = new Proxy([SEK(0n)], {
      get(target, property, receiver) {
        if (property === 'length') return 1.5;
        return Reflect.get(target, property, receiver);
      },
    });
    unavailable([charge('fractional-length', SEK(0n), nonIntegerLength)]);

    const throwingAmount = Object.defineProperty({}, 'minorUnits', {
      get() {
        throw new Error('sensitive getter failure');
      },
    }) as Money;
    unavailable([charge('getter-failure', SEK(0n), [throwingAmount])]);

    const throwingRow = {
      get transactionId(): string {
        throw new Error('sensitive row failure');
      },
      amount: SEK(0n),
      history: [SEK(0n)],
    };
    unavailable([throwingRow]);
  });

  it('rejects malformed captured batch lengths and accepts a 128-code-unit ID', () => {
    for (const length of [-1, 1.5]) {
      const batch = new Proxy([], {
        get(target, property, receiver) {
          return property === 'length'
            ? length
            : Reflect.get(target, property, receiver);
        },
      });
      unavailable(batch);
    }
    const id = 'x'.repeat(128);
    expect(detectAmountAnomalies([charge(id, SEK(1n), [SEK(0n)])])).toEqual([
      { transactionId: id, reason: 'AMOUNT_OUTLIER' },
    ]);
  });

  it('returns no partial findings if any later row is invalid', () => {
    const first = charge('would-be-outlier', SEK(1n), [SEK(0n)]);
    const invalidLater = charge(
      'invalid-later',
      { minorUnits: 0, currency: 'SEK' } as unknown as Money,
      [SEK(0n)],
    );

    unavailable([first, invalidLater]);
  });

  it('freezes results and entries and leaves frozen input rows and histories unchanged', () => {
    const firstAmount = Object.freeze(SEK(1n));
    const firstHistory = Object.freeze([Object.freeze(SEK(0n))]);
    const secondAmount = Object.freeze(SEK(0n));
    const secondHistory = Object.freeze([Object.freeze(SEK(0n))]);
    const rows = Object.freeze([
      Object.freeze(charge('frozen-outlier', firstAmount, firstHistory)),
      Object.freeze(charge('frozen-normal', secondAmount, secondHistory)),
    ]);

    const result = detectAmountAnomalies(rows);
    expect(result).toEqual([
      { transactionId: 'frozen-outlier', reason: 'AMOUNT_OUTLIER' },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      'reason',
      'transactionId',
    ]);
    expect(
      rows.map(({ transactionId, amount, history }) => ({
        transactionId,
        amount: amount.minorUnits,
        history: history.map((value) => value.minorUnits),
      })),
    ).toEqual([
      { transactionId: 'frozen-outlier', amount: 1n, history: [0n] },
      { transactionId: 'frozen-normal', amount: 0n, history: [0n] },
    ]);
  });
});
