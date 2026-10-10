import { money, type Money } from '@subtrack/money';
import { describe, expect, it } from 'vitest';
import {
  detectConfirmedSekPriceIncreases,
  type SekPriceIncreaseInput,
} from '../detection/price-increases.js';

const SEK = (minorUnits: bigint): Money => money(minorUnits, 'SEK');

function charge(
  transactionId: string,
  first: Money,
  next: Money,
  previous: readonly Money[],
): SekPriceIncreaseInput {
  return {
    transactionId,
    firstNewCharge: first,
    nextCycleCharge: next,
    previousThreeCharges: previous,
  };
}

const historyAt = (minorUnits: bigint): Money[] => [
  SEK(minorUnits),
  SEK(minorUnits),
  SEK(minorUnits),
];

function unavailable(input: unknown): Error {
  let thrown: unknown;
  try {
    detectConfirmedSekPriceIncreases(input as readonly SekPriceIncreaseInput[]);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe('Price increase detection unavailable');
  expect(thrown).not.toHaveProperty('cause');
  return thrown as Error;
}

describe('detectConfirmedSekPriceIncreases', () => {
  it('uses strict three-percent and 500-minor-unit thresholds joined by OR', () => {
    expect(
      detectConfirmedSekPriceIncreases([
        charge('three-percent-equal', SEK(103n), SEK(103n), historyAt(100n)),
        charge('three-percent-over', SEK(104n), SEK(104n), historyAt(100n)),
        charge('five-hundred-equal', SEK(20_500n), SEK(20_500n), historyAt(20_000n)),
        charge('five-hundred-one', SEK(100_501n), SEK(100_501n), historyAt(100_000n)),
        charge('absolute-equal-percent-passes', SEK(10_500n), SEK(10_500n), historyAt(10_000n)),
        charge('percent-equal-absolute-passes', SEK(20_600n), SEK(20_600n), historyAt(20_000n)),
      ]),
    ).toEqual([
      { transactionId: 'absolute-equal-percent-passes', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
      { transactionId: 'five-hundred-one', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
      { transactionId: 'percent-equal-absolute-passes', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
      { transactionId: 'three-percent-over', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
    ]);
  });

  it('requires exact next-cycle equality and omits nonmatching repeats', () => {
    expect(
      detectConfirmedSekPriceIncreases([
        charge('same-next-cycle', SEK(110n), SEK(110n), historyAt(100n)),
        charge('changed-next-cycle', SEK(110n), SEK(111n), historyAt(100n)),
      ]),
    ).toEqual([
      { transactionId: 'same-next-cycle', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
    ]);
  });

  it('uses the median prior magnitude and delegates signed and huge exact values', () => {
    const base = 123456789012345678901234567890123456789012345678901234567890n;
    expect(
      detectConfirmedSekPriceIncreases([
        charge('median-not-mean', SEK(104n), SEK(104n), [SEK(1n), SEK(100n), SEK(10_000n)]),
        charge('huge-boundary-inside', SEK(base + 500n), SEK(base + 500n), historyAt(base)),
        charge('signed-huge', SEK(-base - 501n), SEK(base + 501n), [SEK(-base), SEK(base), SEK(-base)]),
      ]),
    ).toEqual([
      { transactionId: 'median-not-mean', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
      { transactionId: 'signed-huge', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
    ]);
  });

  it('validates all five Money values even when an otherwise valid row is unflagged', () => {
    const valid = SEK(100n);
    const invalid = { minorUnits: 0n, currency: 'SEK' } as Money;
    unavailable([
      charge('unflagged-but-valid', valid, valid, historyAt(200n)),
      charge('invalid-fifth-value', valid, valid, [valid, valid, invalid]),
    ]);
  });

  it('requires exactly three prior values and does not iterate caller arrays', () => {
    const previous = historyAt(100n);
    Object.defineProperty(previous, Symbol.iterator, {
      value() { throw new Error('history iterator must not run'); },
    });
    expect(detectConfirmedSekPriceIncreases([
      charge('three-history-values', SEK(104n), SEK(104n), previous),
    ])).toEqual([
      { transactionId: 'three-history-values', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
    ]);

    const shortHistory = historyAt(100n).slice(0, 2);
    unavailable([charge('short-history', SEK(104n), SEK(104n), shortHistory)]);
    unavailable([charge('long-history', SEK(104n), SEK(104n), [...historyAt(100n), SEK(100n)])]);
  });

  it('sorts IDs by Unicode codepoint with prefixes before extensions and preserves the IDs', () => {
    const ids = ['a\u{10000}x', 'a\uE000', 'a', 'a\u{10000}', 'a\uE000x', 'z'];
    const expected = ['a', 'a\uE000', 'a\uE000x', 'a\u{10000}', 'a\u{10000}x', 'z'];
    const rows = ids.map((id) => charge(id, SEK(2n), SEK(2n), historyAt(1n)));

    expect(detectConfirmedSekPriceIncreases(rows).map(({ transactionId }) => transactionId)).toEqual(expected);
    expect(detectConfirmedSekPriceIncreases([...rows].reverse()).map(({ transactionId }) => transactionId)).toEqual(expected);
  });

  it('returns frozen ID-only findings and leaves inputs unchanged', () => {
    const first = Object.freeze(SEK(104n));
    const next = Object.freeze(SEK(104n));
    const previous = Object.freeze(historyAt(100n).map((item) => Object.freeze(item)));
    const row = Object.freeze(charge('frozen-id', first, next, previous));
    const rows = Object.freeze([row]);

    const result = detectConfirmedSekPriceIncreases(rows);
    expect(result).toEqual([
      { transactionId: 'frozen-id', reason: 'CONFIRMED_SEK_PRICE_INCREASE' },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(['reason', 'transactionId']);
    expect(row.firstNewCharge).toBe(first);
    expect(row.nextCycleCharge).toBe(next);
    expect(row.previousThreeCharges).toBe(previous);
    expect(previous.map(({ minorUnits }) => minorUnits)).toEqual([100n, 100n, 100n]);
  });

  it('accepts empty and 1000-row batches and rejects a 1001-row batch', () => {
    expect(detectConfirmedSekPriceIncreases([])).toEqual([]);
    const thousand = Array.from({ length: 1000 }, (_, index) =>
      charge(`row-${index}`, SEK(1n), SEK(1n), historyAt(1n)),
    );
    expect(detectConfirmedSekPriceIncreases(thousand)).toEqual([]);
    unavailable([...thousand, charge('row-1000', SEK(1n), SEK(1n), historyAt(1n))]);
  });

  it('captures array lengths once and rejects malformed captured batch lengths', () => {
    let batchLengthReads = 0;
    let batchIndexReads = 0;
    const batch = new Proxy([charge('valid', SEK(1n), SEK(1n), historyAt(1n))], {
      get(target, property, receiver) {
        if (property === '0') batchIndexReads += 1;
        if (property === 'length') {
          batchLengthReads += 1;
          return Reflect.get(target, property, receiver);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    Object.defineProperty(batch, Symbol.iterator, {
      value() { throw new Error('batch iterator must not run'); },
    });
    expect(detectConfirmedSekPriceIncreases(batch)).toEqual([]);
    expect(batchLengthReads).toBe(1);
    expect(batchIndexReads).toBe(1);

    for (const capturedLength of ['3', 1.5, -1, Number.NaN, null]) {
      const malformed = new Proxy([], {
        get(target, property, receiver) {
          return property === 'length' ? capturedLength : Reflect.get(target, property, receiver);
        },
      });
      unavailable(malformed);
    }
  });

  it('rejects null, function and sparse rows, plus blank, non-string and oversized IDs', () => {
    unavailable(null);
    unavailable({});
    unavailable(() => undefined);
    unavailable([null]);
    unavailable([() => undefined]);
    unavailable(Array<SekPriceIncreaseInput>(1));
    unavailable([charge('  \t', SEK(1n), SEK(1n), historyAt(1n))]);
    unavailable([charge('x'.repeat(129), SEK(1n), SEK(1n), historyAt(1n))]);
    unavailable([{ transactionId: 42 }]);

    expect(detectConfirmedSekPriceIncreases([
      charge('x'.repeat(128), SEK(1n), SEK(1n), historyAt(1n)),
    ])).toEqual([]);
  });

  it('rejects duplicate exact IDs within a batch', () => {
    unavailable([
      charge('duplicate', SEK(1n), SEK(1n), historyAt(1n)),
      charge('duplicate', SEK(1n), SEK(1n), historyAt(1n)),
    ]);
  });

  it('reads row and history fields once and reads each unique Money field once per row', () => {
    let transactionIdReads = 0;
    let firstReads = 0;
    let nextReads = 0;
    let previousReads = 0;
    let historyLengthReads = 0;
    const historyIndexReads: [number, number, number] = [0, 0, 0];
    const moneyReads = { minorUnits: 0, currency: 0 };
    const shared = {
      get minorUnits() { moneyReads.minorUnits += 1; return 1n; },
      get currency() { moneyReads.currency += 1; return 'SEK'; },
    } as Money;
    const history = new Proxy([shared, shared, shared], {
      get(target, property, receiver) {
        if (property === 'length') historyLengthReads += 1;
        if (property === '0' || property === '1' || property === '2') {
          historyIndexReads[Number(property) as 0 | 1 | 2] += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    Object.defineProperty(history, Symbol.iterator, {
      value() { throw new Error('history iterator must not run'); },
    });
    const row = {
      get transactionId() { transactionIdReads += 1; return 'captured'; },
      get firstNewCharge() { firstReads += 1; return shared; },
      get nextCycleCharge() { nextReads += 1; return shared; },
      get previousThreeCharges() { previousReads += 1; return history; },
    };

    expect(detectConfirmedSekPriceIncreases([row])).toEqual([]);
    expect({ transactionIdReads, firstReads, nextReads, previousReads, historyLengthReads }).toEqual({
      transactionIdReads: 1,
      firstReads: 1,
      nextReads: 1,
      previousReads: 1,
      historyLengthReads: 1,
    });
    expect(historyIndexReads).toEqual([1, 1, 1]);
    expect(moneyReads).toEqual({ minorUnits: 1, currency: 1 });
  });

  it('maps throwing row or delegated Money getters and revoked history arrays to one private error', () => {
    const privateId = 'private-transaction-9842';
    const privateDetail = 'private-money-detail';
    const rowError = unavailable([{
      get transactionId(): string { throw new Error(`${privateId} ${privateDetail}`); },
      firstNewCharge: SEK(104n),
      nextCycleCharge: SEK(104n),
      previousThreeCharges: historyAt(100n),
    }]);
    expect(rowError.message).not.toContain(privateId);
    expect(rowError.message).not.toContain(privateDetail);

    const moneyError = unavailable([charge(
      'opaque-id',
      { get minorUnits(): bigint { throw new Error(privateDetail); }, currency: 'SEK' } as Money,
      SEK(104n),
      historyAt(100n),
    )]);
    expect(moneyError.message).not.toContain(privateDetail);

    const revokedBatch = Proxy.revocable([], {});
    revokedBatch.revoke();
    unavailable(revokedBatch.proxy);
    unavailable(new Proxy([], { get() { throw new Error(privateDetail); } }));
    unavailable([charge('raw-currency', { minorUnits: 104n, currency: 'sek' }, SEK(104n), historyAt(100n))]);

    const revokedHistory = Proxy.revocable([SEK(100n), SEK(100n), SEK(100n)], {});
    revokedHistory.revoke();
    unavailable([charge('revoked', SEK(104n), SEK(104n), revokedHistory.proxy)]);
  });

  it('returns no partial findings when a later row getter throws', () => {
    const privateId = 'must-not-appear';
    const error = unavailable([
      charge(privateId, SEK(104n), SEK(104n), historyAt(100n)),
      {
        get transactionId(): string { throw new Error(privateId); },
        firstNewCharge: SEK(104n),
        nextCycleCharge: SEK(104n),
        previousThreeCharges: historyAt(100n),
      },
    ]);
    expect(error.message).not.toContain(privateId);
  });
});
