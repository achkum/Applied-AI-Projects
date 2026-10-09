import { describe, expect, it } from 'vitest';
import { MoneyError, money, type Money } from '../src/money.js';
import { isConfirmedSekPriceIncrease } from '../src/price-increase.js';

const sek = (minorUnits: bigint): Money => money(minorUnits, 'SEK');
const history = (a: bigint, b: bigint, c: bigint): readonly Money[] => [
  sek(a),
  sek(b),
  sek(c),
];

function expectUnavailable(run: () => unknown): void {
  let thrown: unknown;
  try { run(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(MoneyError);
  expect((thrown as Error).message).toBe('Price increase confirmation unavailable');
  expect((thrown as Error & { cause?: unknown }).cause).toBeUndefined();
}

describe('isConfirmedSekPriceIncrease', () => {
  it('uses strict percentage and absolute thresholds with the specified OR', () => {
    expect(isConfirmedSekPriceIncrease(sek(10_300n), sek(10_300n), history(10_000n, 10_000n, 10_000n))).toBe(false);
    expect(isConfirmedSekPriceIncrease(sek(10_301n), sek(10_301n), history(10_000n, 10_000n, 10_000n))).toBe(true);

    expect(isConfirmedSekPriceIncrease(sek(20_500n), sek(20_500n), history(20_000n, 20_000n, 20_000n))).toBe(false);
    expect(isConfirmedSekPriceIncrease(sek(20_501n), sek(20_501n), history(20_000n, 20_000n, 20_000n))).toBe(true);

    // Each equality case still passes the other strict threshold.
    expect(isConfirmedSekPriceIncrease(sek(10_500n), sek(10_500n), history(10_000n, 10_000n, 10_000n))).toBe(true);
    expect(isConfirmedSekPriceIncrease(sek(20_600n), sek(20_600n), history(20_000n, 20_000n, 20_000n))).toBe(true);
  });

  it('takes the middle prior magnitude, regardless of order, rather than the mean', () => {
    const values = [100n, 100n, 10_000n];
    for (const prior of [values, [100n, 10_000n, 100n], [10_000n, 100n, 100n]]) {
      expect(isConfirmedSekPriceIncrease(sek(104n), sek(104n), history(prior[0]!, prior[1]!, prior[2]!))).toBe(true);
    }
    expect(isConfirmedSekPriceIncrease(sek(103n), sek(103n), history(100n, 100n, 10_000n))).toBe(false);
  });

  it('requires an unchanged repeated price and an increase over the median', () => {
    const prior = history(10_000n, 10_000n, 10_000n);
    expect(isConfirmedSekPriceIncrease(sek(10_301n), sek(10_302n), prior)).toBe(false);
    expect(isConfirmedSekPriceIncrease(sek(10_000n), sek(10_000n), prior)).toBe(false);
    expect(isConfirmedSekPriceIncrease(sek(9_000n), sek(9_000n), prior)).toBe(false);
  });

  it('compares signed charges by magnitude and remains exact for very large BigInts', () => {
    expect(isConfirmedSekPriceIncrease(money(-10_301n, 'sek'), money(10_301n, 'SEK'), history(-10_000n, 10_000n, -10_000n))).toBe(true);

    const baseline = 10n ** 40n;
    // Adjacent minor-unit amounts at a huge baseline exercise the absolute
    // threshold without floating-point precision loss or percentage override.
    expect(isConfirmedSekPriceIncrease(sek(baseline + 500n), sek(baseline + 500n), history(baseline, baseline, baseline))).toBe(false);
    expect(isConfirmedSekPriceIncrease(sek(baseline + 501n), sek(baseline + 501n), history(baseline, baseline, baseline))).toBe(true);
    const oneMinorUnitBeyondThreePercent = (baseline * 103n) / 100n + 1n;
    expect(isConfirmedSekPriceIncrease(
      sek(oneMinorUnitBeyondThreePercent),
      sek(oneMinorUnitBeyondThreePercent),
      history(baseline, baseline, baseline),
    )).toBe(true);
  });

  it('validates all five logical positions before returning a non-repeat false', () => {
    const valid = sek(10_301n);
    const badCurrency = { minorUnits: 10_000n, currency: 'sek' } as Money;
    const zero = { minorUnits: 0n, currency: 'SEK' } as Money;
    const numberAmount = { minorUnits: 10_000, currency: 'SEK' } as unknown as Money;

    for (const [first, next, prior] of [
      [badCurrency, sek(10_302n), history(10_000n, 10_000n, 10_000n)],
      [valid, badCurrency, history(10_000n, 10_000n, 10_000n)],
      [valid, sek(10_302n), [zero, sek(10_000n), sek(10_000n)]],
      [valid, sek(10_302n), [sek(10_000n), numberAmount, sek(10_000n)]],
      [valid, sek(10_302n), [sek(10_000n), sek(10_000n), badCurrency]],
    ] as const) {
      expectUnavailable(() => isConfirmedSekPriceIncrease(first, next, prior));
    }
  });

  it('rejects invalid values, array shapes and currencies with one fixed MoneyError', () => {
    const call = (first: unknown, next: unknown, prior: unknown): unknown =>
      isConfirmedSekPriceIncrease(first as Money, next as Money, prior as readonly Money[]);
    const valid = sek(10_301n);
    const validHistory = history(10_000n, 10_000n, 10_000n);
    const cases: Array<() => unknown> = [
      () => call(null, valid, validHistory),
      () => call(() => valid, valid, validHistory),
      () => call(valid, valid, [sek(10_000n), sek(10_000n)]),
      () => call(valid, valid, [sek(10_000n), sek(10_000n), sek(10_000n), sek(10_000n)]),
      () => call(valid, valid, { 0: sek(10_000n), 1: sek(10_000n), 2: sek(10_000n), length: 3 }),
      () => call({ minorUnits: 1n, currency: 'SEK ' }, valid, validHistory),
      () => call({ minorUnits: 1n, currency: 'USD' }, valid, validHistory),
    ];
    for (const run of cases) expectUnavailable(run);

    const revoked = Proxy.revocable({ minorUnits: 1n, currency: 'SEK' }, {});
    revoked.revoke();
    expectUnavailable(() => call(revoked.proxy, valid, validHistory));
  });

  it('snapshots each distinct Money identity once, including aliases, and never mutates inputs', () => {
    let minorReads = 0;
    let currencyReads = 0;
    const observed = Object.freeze({
      get minorUnits(): bigint { minorReads += 1; return 10_301n; },
      get currency(): string { currencyReads += 1; return 'SEK'; },
    }) as Money;
    const prior = Object.freeze([Object.freeze(sek(10_000n)), Object.freeze(sek(10_000n)), Object.freeze(sek(10_000n))]);
    const before = [...prior];

    expect(isConfirmedSekPriceIncrease(observed, observed, prior)).toBe(true);
    expect(minorReads).toBe(1);
    expect(currencyReads).toBe(1);
    expect(prior).toEqual(before);
    expect(Object.isFrozen(prior)).toBe(true);
  });

  it('captures history length and numeric indexes once and does not consult its iterator', () => {
    let lengthReads = 0;
    const reads: [number, number, number] = [0, 0, 0];
    const target = Object.freeze([sek(10_000n), sek(10_000n), sek(10_000n)]);
    const prior = new Proxy(target, {
      get(array, property, receiver) {
        if (property === 'length') lengthReads += 1;
        if (property === '0' || property === '1' || property === '2') reads[Number(property) as 0 | 1 | 2] += 1;
        if (property === Symbol.iterator) throw new Error('iterator must not be read');
        return Reflect.get(array, property, receiver);
      },
    });

    expect(isConfirmedSekPriceIncrease(sek(10_301n), sek(10_301n), prior)).toBe(true);
    expect(lengthReads).toBe(1);
    expect(reads).toEqual([1, 1, 1]);
  });

  it('rejects malformed captured lengths and throwing array or currency access', () => {
    for (const length of ['3', 2.5, -1, NaN]) {
      const prior = new Proxy([sek(1n), sek(1n), sek(1n)], {
        get(target, property, receiver) {
          return property === 'length' ? length : Reflect.get(target, property, receiver);
        },
      });
      expectUnavailable(() => isConfirmedSekPriceIncrease(sek(2n), sek(2n), prior));
    }
    for (const propertyToThrow of ['length', '0', '1', '2']) {
      const prior = new Proxy([sek(1n), sek(1n), sek(1n)], {
        get(target, property, receiver) {
          if (property === propertyToThrow) throw new Error('private array detail');
          return Reflect.get(target, property, receiver);
        },
      });
      expectUnavailable(() => isConfirmedSekPriceIncrease(sek(2n), sek(2n), prior));
    }
    const revoked = Proxy.revocable([sek(1n), sek(1n), sek(1n)], {});
    revoked.revoke();
    expectUnavailable(() => isConfirmedSekPriceIncrease(sek(2n), sek(2n), revoked.proxy));
    const badCurrency = { minorUnits: 1n, get currency(): string { throw new Error('private currency detail'); } };
    expectUnavailable(() => isConfirmedSekPriceIncrease(sek(2n), sek(2n), [sek(1n), sek(1n), badCurrency]));
  });

  it('shares one captured snapshot even when the same object appears in candidate and history slots', () => {
    let amountReads = 0;
    let currencyReads = 0;
    const shared: Money = Object.freeze({
      get minorUnits(): bigint { amountReads += 1; return 10_301n; },
      get currency(): string { currencyReads += 1; return 'SEK'; },
    });
    const prior = Object.freeze([Object.freeze(sek(10_000n)), shared, Object.freeze(sek(10_000n))]);
    expect(isConfirmedSekPriceIncrease(shared, shared, prior)).toBe(true);
    expect([amountReads, currencyReads]).toEqual([1, 1]);
  });

  it('wraps getter failures and rejects noncanonical currency without exposing input errors', () => {
    const badGetter = Object.defineProperty({}, 'minorUnits', {
      get: () => { throw new Error('private getter detail'); },
    }) as Money;
    expectUnavailable(() => isConfirmedSekPriceIncrease(badGetter, sek(1n), history(1n, 1n, 1n)));
    expectUnavailable(() => isConfirmedSekPriceIncrease({ minorUnits: 1n, currency: 'sek' }, sek(1n), history(1n, 1n, 1n)));
  });
});
