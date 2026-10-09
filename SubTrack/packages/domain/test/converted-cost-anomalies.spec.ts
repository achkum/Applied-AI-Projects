import { money, type ConvertedChargeCost } from '@subtrack/money';
import { describe, expect, it } from 'vitest';
import {
  detectConvertedCostAnomalies,
  type ConvertedCostAnomalyInput,
} from '../detection/converted-cost-anomalies.js';

const USD = (minorUnits: bigint): ReturnType<typeof money> =>
  money(minorUnits, 'USD');
const EUR = (minorUnits: bigint): ReturnType<typeof money> =>
  money(minorUnits, 'EUR');

function pair(billed: bigint, settled: bigint): ConvertedChargeCost {
  return { billed: USD(billed), settled: EUR(settled) };
}

function charge(
  transactionId: string,
  cost: ConvertedChargeCost,
  history: readonly ConvertedChargeCost[],
): ConvertedCostAnomalyInput {
  return { transactionId, cost, history };
}

function unavailable(input: unknown): void {
  let thrown: unknown;
  try {
    detectConvertedCostAnomalies(input as readonly ConvertedCostAnomalyInput[]);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe(
    'Converted cost anomaly detection unavailable',
  );
}

const flatHistory = (): ConvertedChargeCost[] =>
  Array.from({ length: 4 }, () => pair(100n, 100n));

describe('detectConvertedCostAnomalies', () => {
  it('keeps exact five-percent boundaries inside and flags the next minor unit outside', () => {
    const history = flatHistory();
    expect(
      detectConvertedCostAnomalies([
        charge('upper-bound', pair(100n, 105n), history),
        charge('lower-bound', pair(100n, 95n), history),
        charge('upper-outside', pair(100n, 106n), history),
        charge('lower-outside', pair(100n, 94n), history),
      ]),
    ).toEqual([
      { transactionId: 'lower-outside', reason: 'CONVERTED_COST_SWING' },
      { transactionId: 'upper-outside', reason: 'CONVERTED_COST_SWING' },
    ]);
  });

  it('uses odd median ratio and leaves a changed billed amount at the same ratio unflagged', () => {
    const history = [pair(100n, 120n), pair(100n, 100n), pair(100n, 110n), pair(100n, 100n), pair(100n, 140n)];
    expect(
      detectConvertedCostAnomalies([
        charge('odd-inside', pair(250n, 275n), history),
        charge('odd-outside', pair(100n, 117n), history),
        charge('same-ratio-new-price', pair(250n, 250n), flatHistory()),
      ]),
    ).toEqual([{ transactionId: 'odd-outside', reason: 'CONVERTED_COST_SWING' }]);
  });

  it('uses the exact even median of ratios without rounding its midpoint', () => {
    // Ratios 1, 1, 2, 2 have median 3/2. Candidate ratios 1.424 and 1.576 exceed 5%.
    expect(
      detectConvertedCostAnomalies([
        charge('even-inside-low', pair(40n, 57n), [pair(100n, 100n), pair(100n, 100n), pair(100n, 200n), pair(100n, 200n)]),
        charge('even-inside-high', pair(40n, 63n), [pair(100n, 100n), pair(100n, 100n), pair(100n, 200n), pair(100n, 200n)]),
        charge('even-outside-low', pair(250n, 356n), [pair(100n, 100n), pair(100n, 100n), pair(100n, 200n), pair(100n, 200n)]),
        charge('even-outside-high', pair(125n, 197n), [pair(100n, 100n), pair(100n, 100n), pair(100n, 200n), pair(100n, 200n)]),
      ]),
    ).toEqual([
      { transactionId: 'even-outside-high', reason: 'CONVERTED_COST_SWING' },
      { transactionId: 'even-outside-low', reason: 'CONVERTED_COST_SWING' },
    ]);
  });

  it('accepts a valid insufficient reference set but still rejects malformed pairs within it', () => {
    expect(
      detectConvertedCostAnomalies([
        charge('too-few-valid', pair(100n, 200n), [pair(100n, 100n), pair(100n, 100n), pair(100n, 100n)]),
      ]),
    ).toEqual([]);
    unavailable([
      charge('too-few-invalid', pair(100n, 200n), [pair(100n, 100n), pair(100n, 100n), { billed: USD(100n), settled: EUR(0n) }]),
    ]);
  });

  it('delegates signed and very large exact values without number conversion', () => {
    const base = 123456789012345678901234567890123456789012345678901234567890n;
    const history = Array.from({ length: 4 }, () => pair(base, -base));
    expect(
      detectConvertedCostAnomalies([
        charge('huge-same-ratio', pair(base * 7n, -base * 7n), history),
        charge('huge-swing', pair(base, -base * 2n), history),
      ]),
    ).toEqual([{ transactionId: 'huge-swing', reason: 'CONVERTED_COST_SWING' }]);
  });

  it('sorts flagged IDs by Unicode codepoint with prefixes first, independent of input order', () => {
    const ids = ['a\u{10000}x', 'a\uE000', 'a', 'a\u{10000}', 'a\uE000x', 'z'];
    const expected = ['a', 'a\uE000', 'a\uE000x', 'a\u{10000}', 'a\u{10000}x', 'z'];
    const rows = ids.map((id) => charge(id, pair(1n, 2n), [pair(1n, 1n), pair(1n, 1n), pair(1n, 1n), pair(1n, 1n)]));

    expect(detectConvertedCostAnomalies(rows).map(({ transactionId }) => transactionId)).toEqual(expected);
    expect(detectConvertedCostAnomalies([...rows].reverse()).map(({ transactionId }) => transactionId)).toEqual(expected);
  });

  it('accepts exact array, ID, history, and aggregate-reference limits', () => {
    expect(detectConvertedCostAnomalies([])).toEqual([]);
    const history = Array.from({ length: 50 }, () => pair(1n, 1n));
    const tenThousandReferences = Array.from({ length: 200 }, (_, index) =>
      charge(`limit-${index}`, pair(1n, 1n), history),
    );
    expect(detectConvertedCostAnomalies(tenThousandReferences)).toEqual([]);
    expect(
      detectConvertedCostAnomalies([
        charge('x'.repeat(128), pair(1n, 1n), history),
      ]),
    ).toEqual([]);
    expect(
      detectConvertedCostAnomalies(
        Array.from({ length: 1000 }, (_, index) =>
          charge(`batch-${index}`, pair(1n, 1n), []),
        ),
      ),
    ).toEqual([]);
  });

  it('rejects batch, history, aggregate, ID, duplicate, sparse, and malformed inputs uniformly', () => {
    unavailable(Array.from({ length: 1001 }, (_, index) => charge(`too-many-${index}`, pair(1n, 1n), [])));
    unavailable([charge('history-over', pair(1n, 1n), Array.from({ length: 51 }, () => pair(1n, 1n)))]);
    unavailable(Array.from({ length: 201 }, (_, index) => charge(`aggregate-${index}`, pair(1n, 1n), Array.from({ length: 50 }, () => pair(1n, 1n)))));
    unavailable([charge('x'.repeat(129), pair(1n, 1n), [])]);
    unavailable([charge('  \t', pair(1n, 1n), [])]);
    unavailable([charge('duplicate', pair(1n, 1n), []), charge('duplicate', pair(1n, 1n), [])]);
    unavailable(null);
    unavailable({});
    unavailable([null]);
    unavailable([42]);
    unavailable([{}]);
    unavailable([charge('sparse', pair(1n, 1n), Array<ConvertedChargeCost>(1))]);
  });

  it('rejects noncanonical currency codes in raw Money-shaped values and malformed or zero pairs', () => {
    const raw = (minorUnits: bigint, currency: string) => ({ minorUnits, currency });
    const rawPair = (billedCurrency: string, settledCurrency: string, billed = 1n, settled = 1n) => ({
      billed: raw(billed, billedCurrency),
      settled: raw(settled, settledCurrency),
    });
    for (const invalid of [
      rawPair('usd', 'EUR'),
      rawPair('USD', 'eur'),
      rawPair('GBP', 'EUR'),
      rawPair('USD', 'USD'),
      rawPair('USD', 'EUR', 0n, 1n),
      rawPair('USD', 'EUR', 1n, 0n),
      { billed: { minorUnits: 1, currency: 'USD' }, settled: raw(1n, 'EUR') },
    ]) {
      unavailable([charge('raw-invalid', invalid as unknown as ConvertedChargeCost, [])]);
    }
  });

  it('rejects malformed captured lengths, non-array histories and mismatched reference currencies', () => {
    const proxiedLength = <T>(values: T[], length: unknown): T[] =>
      new Proxy(values, {
        get(target, property, receiver) {
          return property === 'length' ? length : Reflect.get(target, property, receiver);
        },
      });
    for (const length of [-1, 1.5, '4']) {
      unavailable(proxiedLength([], length));
      unavailable([charge('bad-count', pair(1n, 1n), proxiedLength(flatHistory(), length))]);
    }
    unavailable([{ transactionId: 'bad-history', cost: pair(1n, 1n), history: {} }]);
    unavailable([{ transactionId: 42, cost: pair(1n, 1n), history: [] }]);
    unavailable([charge('bad-cost', null as unknown as ConvertedChargeCost, [])]);
    unavailable([charge('mismatch', pair(1n, 1n), [{ billed: USD(1n), settled: money(1n, 'SEK') }])]);
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    unavailable(revoked.proxy);
  });

  it('captures getters once, copies histories by index, and never invokes caller iterators', () => {
    let transactionReads = 0;
    let costReads = 0;
    let historyReads = 0;
    const history = flatHistory();
    Object.defineProperty(history, Symbol.iterator, { value() { throw new Error('iterator must not run'); } });
    const row = {
      get transactionId() { transactionReads += 1; return 'captured'; },
      get cost() { costReads += 1; return pair(100n, 100n); },
      get history() { historyReads += 1; return history; },
    };

    expect(detectConvertedCostAnomalies([row])).toEqual([]);
    expect({ transactionReads, costReads, historyReads }).toEqual({ transactionReads: 1, costReads: 1, historyReads: 1 });
  });

  it('maps throwing getters and invalid Money fields to a fixed private error with no partial findings', () => {
    const privateId = 'private-transaction-9842';
    const privateDetail = 'private-money-detail';
    const throwingRow = { get transactionId(): string { throw new Error(privateDetail); }, cost: pair(100n, 200n), history: flatHistory() };
    unavailable([throwingRow]);

    const throwingMoney = { get minorUnits(): bigint { throw new Error(privateDetail); }, currency: 'USD' };
    unavailable([charge('bad-money', { billed: throwingMoney, settled: EUR(1n) } as unknown as ConvertedChargeCost, [])]);

    try {
      detectConvertedCostAnomalies([
        charge(privateId, pair(100n, 106n), flatHistory()),
        charge('invalid-last', { billed: USD(1n), settled: EUR(0n) }, []),
      ]);
      throw new Error('Expected rejection');
    } catch (error) {
      expect((error as Error).message).toBe('Converted cost anomaly detection unavailable');
      expect((error as Error).message).not.toContain(privateId);
      expect((error as Error).message).not.toContain(privateDetail);
      expect((error as Error).message).not.toContain('106');
    }
  });

  it('returns only deeply frozen findings and leaves frozen inputs unchanged', () => {
    const cost = Object.freeze(pair(100n, 106n));
    const history = Object.freeze(flatHistory().map((entry) => Object.freeze(entry)));
    const rows = Object.freeze([Object.freeze(charge('frozen-flag', cost, history))]);

    const result = detectConvertedCostAnomalies(rows);
    expect(result).toEqual([{ transactionId: 'frozen-flag', reason: 'CONVERTED_COST_SWING' }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(['reason', 'transactionId']);
    expect(rows[0]?.cost.settled.minorUnits).toBe(106n);
    expect(rows[0]?.history).toHaveLength(4);
  });
});
