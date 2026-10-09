import { describe, expect, it } from 'vitest';
import {
  isConvertedCostOutsideMedianBand,
  money,
  MoneyError,
  type ConvertedChargeCost,
  type Money,
} from '../src/index.js';

const pair = (
  billed: bigint | number,
  settled: bigint | number,
  billedCurrency = 'USD',
  settledCurrency = 'EUR',
): ConvertedChargeCost => ({
  billed: money(billed, billedCurrency),
  settled: money(settled, settledCurrency),
});
const refs = (settled: readonly (bigint | number)[]) =>
  settled.map((amount) => pair(10_000, amount));

function expectUnavailable(action: () => unknown): void {
  try {
    action();
    throw new Error('expected converted-cost validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(MoneyError);
    expect((error as Error).message).toBe(
      'Converted cost detection unavailable',
    );
  }
}

describe('isConvertedCostOutsideMedianBand', () => {
  it('keeps exact five-percent upper and lower boundaries inside the band', () => {
    const history = refs([10_000, 10_000, 10_000, 10_000]);
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_500), history),
    ).toBe(false);
    expect(isConvertedCostOutsideMedianBand(pair(10_000, 9_500), history)).toBe(
      false,
    );
  });

  it('flags amounts immediately beyond either five-percent boundary', () => {
    const history = refs([10_000, 10_000, 10_000, 10_000]);
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_501), history),
    ).toBe(true);
    expect(isConvertedCostOutsideMedianBand(pair(10_000, 9_499), history)).toBe(
      true,
    );
  });

  it('uses the ordinary even-count median, including its fractional midpoint', () => {
    const history = refs([10_000, 10_000, 20_000, 20_000]); // median ratio 1.5
    expect(isConvertedCostOutsideMedianBand(pair(40, 57), history)).toBe(false); // 1.425
    expect(isConvertedCostOutsideMedianBand(pair(40, 63), history)).toBe(false); // 1.575
    expect(isConvertedCostOutsideMedianBand(pair(250, 356), history)).toBe(
      true,
    ); // 1.424
    expect(isConvertedCostOutsideMedianBand(pair(125, 197), history)).toBe(
      true,
    ); // 1.576
  });

  it('uses the middle value for an odd-sized reference set', () => {
    const history = refs([10_000, 20_000, 10_000, 30_000, 10_000]);
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_500), history),
    ).toBe(false);
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_501), history),
    ).toBe(true);
  });

  it('compares equivalent ratios and does not treat a changed billed price as a swing', () => {
    const history = [
      pair(100, 100),
      pair(200, 200),
      pair(300, 300),
      pair(400, 400),
    ];
    expect(isConvertedCostOutsideMedianBand(pair(700, 700), history)).toBe(
      false,
    );
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_000), history),
    ).toBe(false);
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_501), history),
    ).toBe(true);
  });

  it('keeps billed currency pairs independent', () => {
    const usdHistory = refs([10_000, 10_000, 10_000, 10_000]);
    const eurHistory = Array.from({ length: 4 }, () =>
      pair(10_000, 10_000, 'EUR', 'JPY'),
    );
    expect(
      isConvertedCostOutsideMedianBand(pair(10_000, 10_501), usdHistory),
    ).toBe(true);
    expect(
      isConvertedCostOutsideMedianBand(
        pair(10_000, 10_501, 'EUR', 'JPY'),
        eurHistory,
      ),
    ).toBe(true);
  });

  it('compares signed magnitudes without changing caller values', () => {
    const history = refs([-10_000, 10_000, -10_000, 10_000]);
    const candidate = pair(-10_000, -10_501);
    expect(isConvertedCostOutsideMedianBand(candidate, history)).toBe(true);
    expect(candidate.billed.minorUnits).toBe(-10_000n);
    expect(candidate.settled.minorUnits).toBe(-10_501n);
  });

  it('handles large BigInt values and exact ratio scaling', () => {
    const base = 10n ** 90n;
    const history = Array.from({ length: 4 }, () => pair(base, base));
    expect(
      isConvertedCostOutsideMedianBand(pair(base * 7n, base * 7n), history),
    ).toBe(false);
    expect(
      isConvertedCostOutsideMedianBand(
        pair(base, (base * 10501n) / 10000n),
        history,
      ),
    ).toBe(true);
  });

  it('returns false for zero through three valid references and accepts four', () => {
    const candidate = pair(10_000, 10_501);
    for (const count of [0, 1, 2, 3]) {
      expect(
        isConvertedCostOutsideMedianBand(
          candidate,
          refs(Array(count).fill(10_000)),
        ),
      ).toBe(false);
    }
    expect(
      isConvertedCostOutsideMedianBand(
        candidate,
        refs([10_000, 10_000, 10_000, 10_000]),
      ),
    ).toBe(true);
  });

  it('accepts fifty references and rejects fifty-one', () => {
    expect(
      isConvertedCostOutsideMedianBand(
        pair(10_000, 10_000),
        refs(Array(50).fill(10_000)),
      ),
    ).toBe(false);
    expectUnavailable(() =>
      isConvertedCostOutsideMedianBand(
        pair(10_000, 10_000),
        refs(Array(51).fill(10_000)),
      ),
    );
  });

  it('validates every history pair even when there are too few references', () => {
    expectUnavailable(() =>
      isConvertedCostOutsideMedianBand(pair(10_000, 10_000), [
        pair(10_000, 10_000),
        null as unknown as ConvertedChargeCost,
      ]),
    );
  });

  it('rejects null and malformed Money values, numeric amounts, and zero amounts', () => {
    const valid = pair(10_000, 10_000);
    const badMoney = (minorUnits: unknown, currency: unknown): Money =>
      ({ minorUnits, currency }) as Money;
    const malformed: unknown[] = [
      null,
      undefined,
      {},
      { billed: valid.billed, settled: null },
      { billed: badMoney(10_000, 'USD'), settled: valid.settled },
      { billed: badMoney(0n, 'USD'), settled: valid.settled },
      { billed: valid.billed, settled: badMoney(10_000, 'EUR') },
      { billed: valid.billed, settled: badMoney(0n, 'EUR') },
      { billed: valid.billed, settled: badMoney(10_000n, 42) },
    ];
    for (const candidate of malformed) {
      expectUnavailable(() =>
        isConvertedCostOutsideMedianBand(candidate as ConvertedChargeCost, []),
      );
    }
  });

  it('rejects unsupported billed currencies, identical currencies, and noncanonical currency codes', () => {
    const history = refs([10_000, 10_000, 10_000, 10_000]);
    for (const invalid of [
      pair(10_000, 10_000, 'GBP', 'EUR'),
      pair(10_000, 10_000, 'USD', 'USD'),
      {
        ...pair(10_000, 10_000),
        billed: { minorUnits: 10_000n, currency: 'usd' },
      },
      pair(10_000, 10_000, 'US1', 'EUR'),
      {
        ...pair(10_000, 10_000),
        settled: { minorUnits: 10_000n, currency: 'eur' },
      },
    ]) {
      expectUnavailable(() =>
        isConvertedCostOutsideMedianBand(invalid, history),
      );
    }
  });

  it('rejects history entries with a different billed or settled currency', () => {
    const candidate = pair(10_000, 10_000);
    expectUnavailable(() =>
      isConvertedCostOutsideMedianBand(candidate, [
        ...refs([10_000, 10_000, 10_000]),
        pair(10_000, 10_000, 'EUR', 'JPY'),
      ]),
    );
    expectUnavailable(() =>
      isConvertedCostOutsideMedianBand(candidate, [
        ...refs([10_000, 10_000, 10_000]),
        pair(10_000, 10_000, 'USD', 'JPY'),
      ]),
    );
  });

  it('rejects non-array history and non-integer or oversized history length', () => {
    const candidate = pair(10_000, 10_000);
    expectUnavailable(() =>
      isConvertedCostOutsideMedianBand(
        candidate,
        null as unknown as readonly ConvertedChargeCost[],
      ),
    );
    for (const length of [1.5, -1, 51, '4']) {
      const history = new Proxy([], {
        get(target, property, receiver) {
          return property === 'length'
            ? length
            : Reflect.get(target, property, receiver);
        },
      }) as readonly ConvertedChargeCost[];
      expectUnavailable(() =>
        isConvertedCostOutsideMedianBand(candidate, history),
      );
    }
  });

  it('reads pair fields and captured history length once', () => {
    let billedReads = 0;
    let settledReads = 0;
    const candidate = Object.defineProperties(
      {},
      {
        billed: {
          get: () => {
            billedReads += 1;
            return money(10_000, 'USD');
          },
        },
        settled: {
          get: () => {
            settledReads += 1;
            return money(10_501, 'EUR');
          },
        },
      },
    ) as ConvertedChargeCost;
    const stored = refs([10_000, 10_000, 10_000, 10_000]);
    let indexReads = 0;
    const history = new Proxy(stored, {
      get(target, property, receiver) {
        if (property === 'length') indexReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(isConvertedCostOutsideMedianBand(candidate, history)).toBe(true);
    expect(billedReads).toBe(1);
    expect(settledReads).toBe(1);
    expect(indexReads).toBe(1);
  });

  it('supports frozen input and produces the same result for history permutations', () => {
    const freezePair = (value: ConvertedChargeCost): ConvertedChargeCost =>
      Object.freeze({
        billed: Object.freeze(value.billed),
        settled: Object.freeze(value.settled),
      });
    const history = Object.freeze(
      refs([10_000, 10_000, 20_000, 20_000]).map(freezePair),
    );
    const candidate = freezePair(pair(10_000, 15_000));
    expect(isConvertedCostOutsideMedianBand(candidate, history)).toBe(false);
    expect(
      isConvertedCostOutsideMedianBand(candidate, [
        history[3]!,
        history[1]!,
        history[0]!,
        history[2]!,
      ]),
    ).toBe(false);
  });

  it('maps throwing input getters to the fixed unavailable error', () => {
    const candidate = Object.defineProperty({}, 'billed', {
      get: () => {
        throw new Error('private input');
      },
    }) as ConvertedChargeCost;
    expectUnavailable(() => isConvertedCostOutsideMedianBand(candidate, []));
    const valid = pair(10_000, 10_000);
    const throwingHistory = new Proxy([valid], {
      get(target, property, receiver) {
        if (property === '0') throw new Error('private history');
        return Reflect.get(target, property, receiver);
      },
    });
    expectUnavailable(() =>
      isConvertedCostOutsideMedianBand(valid, throwingHistory),
    );
  });
});
