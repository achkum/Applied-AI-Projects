import { describe, expect, it } from 'vitest';
import {
  isAmountOutsideMedianMad,
  money,
  MoneyError,
  type Money,
} from '../src/index.js';

const SEK = (minorUnits: bigint | number): Money => money(minorUnits, 'SEK');
const amount = (minorUnits: bigint | number): Money => SEK(minorUnits);

function expectUnavailable(run: () => unknown): void {
  try {
    run();
    throw new Error('Expected a fixed MoneyError');
  } catch (error) {
    expect(error).toBeInstanceOf(MoneyError);
    expect((error as Error).message).toBe(
      'Amount outlier detection unavailable',
    );
  }
}

describe('isAmountOutsideMedianMad', () => {
  it('uses the ordinary odd-sample median and includes both exact 3×MAD bounds', () => {
    // Median 2, MAD 1, so the inclusive interval is [-1, 5].
    const history = [1, 2, 3].map(amount);

    expect(isAmountOutsideMedianMad(SEK(-1), history)).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(5), history)).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(-2), history)).toBe(true);
    expect(isAmountOutsideMedianMad(SEK(6), history)).toBe(true);
  });

  it('uses the average of the middle pair for an even median', () => {
    // [0, 1, 2, 100] has median 1.5 and MAD 1; bounds are [-1.5, 4.5].
    const history = [0, 1, 2, 100].map(amount);

    expect(isAmountOutsideMedianMad(SEK(-1), history)).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(4), history)).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(-2), history)).toBe(true);
    expect(isAmountOutsideMedianMad(SEK(5), history)).toBe(true);
  });

  it('preserves a fractional MAD from an even deviation sample', () => {
    // [0, 1, 1, 2] has median 1 and deviations [0, 0, 1, 1], hence MAD 0.5.
    // The bounds are  -0.5 and 2.5; integer minor units cannot equal either bound.
    const history = [0, 1, 1, 2].map(amount);

    expect(isAmountOutsideMedianMad(SEK(0), history)).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(2), history)).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(-1), history)).toBe(true);
    expect(isAmountOutsideMedianMad(SEK(3), history)).toBe(true);
  });

  it('handles negative histories, zero medians, and a zero MAD', () => {
    // Median -2, MAD 1, bounds [-5, 1].
    expect(isAmountOutsideMedianMad(SEK(-5), [-3, -2, -1].map(amount))).toBe(
      false,
    );
    expect(isAmountOutsideMedianMad(SEK(1), [-3, -2, -1].map(amount))).toBe(
      false,
    );
    expect(isAmountOutsideMedianMad(SEK(-6), [-3, -2, -1].map(amount))).toBe(
      true,
    );
    expect(isAmountOutsideMedianMad(SEK(2), [-3, -2, -1].map(amount))).toBe(
      true,
    );

    // Repeated values give MAD zero: equality is inside, every other value is outside.
    expect(isAmountOutsideMedianMad(SEK(0), [0, 0, 0, 0].map(amount))).toBe(
      false,
    );
    expect(isAmountOutsideMedianMad(SEK(-1), [0, 0, 0, 0].map(amount))).toBe(
      true,
    );
    expect(isAmountOutsideMedianMad(SEK(1), [0, 0, 0, 0].map(amount))).toBe(
      true,
    );
  });

  it('defines singleton history behavior without claiming confidence', () => {
    expect(isAmountOutsideMedianMad(SEK(7), [SEK(7)])).toBe(false);
    expect(isAmountOutsideMedianMad(SEK(8), [SEK(7)])).toBe(true);
  });

  it('retains exact results for huge values and large translations', () => {
    const shift = 10n ** 80n + 17n;
    const shiftedHistory = [shift - 3n, shift - 2n, shift - 1n].map(amount);

    expect(isAmountOutsideMedianMad(SEK(shift + 1n), shiftedHistory)).toBe(
      false,
    );
    expect(isAmountOutsideMedianMad(SEK(shift + 2n), shiftedHistory)).toBe(
      true,
    );
  });

  it('is invariant to history order and does not mutate frozen inputs', () => {
    const history = Object.freeze(
      [SEK(100), SEK(101), SEK(102), SEK(200)].map(Object.freeze),
    );
    const reversed = Object.freeze([...history].reverse());

    expect(isAmountOutsideMedianMad(SEK(104), history)).toBe(
      isAmountOutsideMedianMad(SEK(104), reversed),
    );
    expect(history.map((value) => value.minorUnits)).toEqual([
      100n,
      101n,
      102n,
      200n,
    ]);
  });

  it('accepts the maximum history size', () => {
    const history = Array.from({ length: 1000 }, () => SEK(12));

    expect(isAmountOutsideMedianMad(SEK(12), history)).toBe(false);
  });

  it('rejects an over-limit history with the fixed error', () => {
    const history = Array.from({ length: 1001 }, () => SEK(12));

    expectUnavailable(() => isAmountOutsideMedianMad(SEK(12), history));
  });

  it('rejects empty and non-array histories with the fixed error', () => {
    expectUnavailable(() => isAmountOutsideMedianMad(SEK(1), []));
    expectUnavailable(() =>
      isAmountOutsideMedianMad(SEK(1), null as unknown as readonly Money[]),
    );
    expectUnavailable(() =>
      isAmountOutsideMedianMad(SEK(1), {} as unknown as readonly Money[]),
    );
  });

  it('rejects numeric minor units, missing shape, invalid currency, and mixed currencies', () => {
    expectUnavailable(() =>
      isAmountOutsideMedianMad(
        { minorUnits: 1 as unknown as bigint, currency: 'SEK' },
        [SEK(1)],
      ),
    );
    expectUnavailable(() =>
      isAmountOutsideMedianMad(SEK(1), [{ currency: 'SEK' } as Money]),
    );
    expectUnavailable(() =>
      isAmountOutsideMedianMad({ minorUnits: 1n, currency: 'sek' }, [SEK(1)]),
    );
    expectUnavailable(() =>
      isAmountOutsideMedianMad(SEK(1), [money(1n, 'EUR')]),
    );
  });

  it('rejects null, primitive, sparse and nonstring-currency Money inputs', () => {
    expectUnavailable(() =>
      isAmountOutsideMedianMad(null as unknown as Money, [SEK(1)]),
    );
    expectUnavailable(() =>
      isAmountOutsideMedianMad(1 as unknown as Money, [SEK(1)]),
    );
    expectUnavailable(() => isAmountOutsideMedianMad(SEK(1), Array<Money>(1)));
    expectUnavailable(() =>
      isAmountOutsideMedianMad(SEK(1), [
        { minorUnits: 1n, currency: 42 } as unknown as Money,
      ]),
    );
  });

  it('snapshots amount and currency properties once per input', () => {
    let candidateAmountReads = 0;
    let candidateCurrencyReads = 0;
    let historyAmountReads = 0;
    let historyCurrencyReads = 0;
    const candidate = {
      get minorUnits() {
        candidateAmountReads += 1;
        return 2n;
      },
      get currency() {
        candidateCurrencyReads += 1;
        return 'SEK';
      },
    } as Money;
    const sample = {
      get minorUnits() {
        historyAmountReads += 1;
        return 1n;
      },
      get currency() {
        historyCurrencyReads += 1;
        return 'SEK';
      },
    } as Money;

    expect(isAmountOutsideMedianMad(candidate, [sample])).toBe(true);
    expect(candidateAmountReads).toBe(1);
    expect(candidateCurrencyReads).toBe(1);
    expect(historyAmountReads).toBe(1);
    expect(historyCurrencyReads).toBe(1);
  });

  it('converts throwing getters and unexpected proxy failures to the fixed error', () => {
    const throwingAmount = Object.defineProperty({}, 'minorUnits', {
      get() {
        throw new Error('private caller detail');
      },
    }) as Money;
    const throwingArray = new Proxy([SEK(1)], {
      get() {
        throw new Error('private array detail');
      },
    });

    expectUnavailable(() => isAmountOutsideMedianMad(SEK(1), [throwingAmount]));
    expectUnavailable(() => isAmountOutsideMedianMad(SEK(1), throwingArray));
  });
});
