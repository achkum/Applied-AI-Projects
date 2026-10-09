import { describe, expect, it } from 'vitest';
import { detectChargesAfterCancellation } from '../detection/cancelled-charge-anomalies.js';
import type { CancelledChargeInput } from '../detection/cancelled-charge-anomalies.js';

const charge = (
  transactionId: string,
  chargedAt: Date,
  cancelledAt: Date,
  subscriptionId = 'subscription-1',
): CancelledChargeInput => ({
  transactionId,
  subscriptionId,
  chargedAt,
  cancelledAt,
});

const instant = (value: string): Date => new Date(value);

describe('detectChargesAfterCancellation', () => {
  it('uses a strict native millisecond comparison', () => {
    const results = detectChargesAfterCancellation([
      charge('before', new Date(1_999), new Date(2_000)),
      charge('equal', new Date(2_000), new Date(2_000)),
      charge('after', new Date(2_001), new Date(2_000)),
    ]);

    expect(results).toEqual([
      {
        transactionId: 'after',
        subscriptionId: 'subscription-1',
        reason: 'CHARGE_AFTER_CANCELLATION',
      },
    ]);
  });

  it('compares instants across timezone offsets and calendar boundaries', () => {
    const results = detectChargesAfterCancellation([
      // Different local dates, same instant: equality is not after.
      charge(
        'same-instant',
        instant('2024-01-01T00:30:00+02:00'),
        instant('2023-12-31T22:30:00Z'),
      ),
      // The charged timestamp crosses UTC midnight by one millisecond.
      charge(
        'crossed-midnight',
        instant('2024-01-01T00:00:00.001+02:00'),
        instant('2023-12-31T22:00:00Z'),
      ),
      // A later calendar date in the negative offset is still an earlier instant.
      charge(
        'later-local-date',
        instant('2024-01-01T22:59:00-05:00'),
        instant('2024-01-02T04:00:00Z'),
      ),
    ]);

    expect(results.map(({ transactionId }) => transactionId)).toEqual([
      'crossed-midnight',
    ]);
  });

  it('returns unique transaction IDs in deterministic prefix-safe Unicode codepoint order', () => {
    const ids = ['a\u{10000}x', 'a\uE000', 'a', 'a\u{10000}', 'a\uE000x', 'z'];
    const expected = [
      'a',
      'a\uE000',
      'a\uE000x',
      'a\u{10000}',
      'a\u{10000}x',
      'z',
    ];

    const first = detectChargesAfterCancellation(
      ids.map((id) => charge(id, new Date(2), new Date(1))),
    );
    const permuted = detectChargesAfterCancellation(
      [...ids].reverse().map((id) => charge(id, new Date(2), new Date(1))),
    );

    expect(first.map(({ transactionId }) => transactionId)).toEqual(expected);
    expect(permuted).toEqual(first);
  });

  it('accepts empty input and a batch of 1000 entries', () => {
    expect(detectChargesAfterCancellation([])).toEqual([]);

    const atLimit = Array.from({ length: 1_000 }, (_, index) =>
      charge(`transaction-${index}`, new Date(2), new Date(1)),
    );
    expect(detectChargesAfterCancellation(atLimit)).toHaveLength(1_000);
  });

  it('rejects batches larger than 1000 with a fixed error', () => {
    const oversized = Array.from({ length: 1_001 }, (_, index) =>
      charge(`private-transaction-${index}`, new Date(2), new Date(1)),
    );

    expect(() => detectChargesAfterCancellation(oversized)).toThrow(
      new Error('Cancelled charge detection unavailable'),
    );
  });

  it('rejects duplicate transaction IDs even when associated to different subscriptions', () => {
    const duplicateAssociation = [
      charge('same-id', new Date(2), new Date(1), 'subscription-a'),
      charge('same-id', new Date(3), new Date(1), 'subscription-b'),
    ];

    expect(() => detectChargesAfterCancellation(duplicateAssociation)).toThrow(
      new Error('Cancelled charge detection unavailable'),
    );
  });

  it.each([
    ['non-array input', null],
    ['null row', [null]],
    ['primitive row', [42]],
    [
      'non-Date cancelledAt',
      [charge('transaction-1', new Date(2), 1 as unknown as Date)],
    ],
    ['array row', [[]]],
    [
      'missing identifier',
      [
        {
          subscriptionId: 'subscription-1',
          chargedAt: new Date(2),
          cancelledAt: new Date(1),
        },
      ],
    ],
    ['blank transaction ID', [charge(' \t ', new Date(2), new Date(1))]],
    [
      'blank subscription ID',
      [charge('transaction-1', new Date(2), new Date(1), '  ')],
    ],
    [
      'transaction ID too long',
      [charge('x'.repeat(129), new Date(2), new Date(1))],
    ],
    [
      'subscription ID too long',
      [charge('transaction-1', new Date(2), new Date(1), 'x'.repeat(129))],
    ],
    [
      'non-Date chargedAt',
      [charge('transaction-1', '2024-01-01' as unknown as Date, new Date(1))],
    ],
    [
      'invalid chargedAt',
      [charge('transaction-1', new Date(Number.NaN), new Date(1))],
    ],
    [
      'invalid cancelledAt',
      [charge('transaction-1', new Date(2), new Date(Number.NaN))],
    ],
  ])(
    'rejects %s with a fixed error that does not reveal input data',
    (_description, input) => {
      let thrown: unknown;
      try {
        detectChargesAfterCancellation(
          input as unknown as readonly CancelledChargeInput[],
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe(
        'Cancelled charge detection unavailable',
      );
      expect((thrown as Error).message).not.toContain('transaction-1');
    },
  );

  it('captures native Date instants even when an instance overrides getTime', () => {
    const chargedAt = new Date(2);
    chargedAt.getTime = () => {
      throw new Error('instance override');
    };
    expect(
      detectChargesAfterCancellation([
        charge('x'.repeat(128), chargedAt, new Date(1), 's'.repeat(128)),
      ]),
    ).toEqual([
      {
        transactionId: 'x'.repeat(128),
        subscriptionId: 's'.repeat(128),
        reason: 'CHARGE_AFTER_CANCELLATION',
      },
    ]);
  });

  it('maps unexpected accessor and invalid native Date receiver failures to the fixed error', () => {
    const accessorRow = {
      get transactionId(): string {
        throw new Error('synthetic caller detail');
      },
      subscriptionId: 'subscription-1',
      chargedAt: new Date(2),
      cancelledAt: new Date(1),
    };
    const invalidReceiver = new Proxy(new Date(2), {});
    for (const input of [
      [accessorRow],
      [charge('proxy-date', invalidReceiver, new Date(1))],
    ]) {
      expect(() => detectChargesAfterCancellation(input)).toThrowError(
        new Error('Cancelled charge detection unavailable'),
      );
    }
  });

  it('does not mutate input rows or dates and freezes the output array and entries', () => {
    const chargedAt = new Date(2);
    const cancelledAt = new Date(1);
    const row = {
      transactionId: 'transaction-1',
      subscriptionId: 'subscription-1',
      chargedAt,
      cancelledAt,
    };
    const input = Object.freeze([Object.freeze(row)]);
    const before = {
      transactionId: row.transactionId,
      subscriptionId: row.subscriptionId,
      chargedAt: chargedAt.getTime(),
      cancelledAt: cancelledAt.getTime(),
    };

    const result = detectChargesAfterCancellation(input);

    expect(row).toEqual({ ...before, chargedAt, cancelledAt });
    expect(chargedAt.getTime()).toBe(before.chargedAt);
    expect(cancelledAt.getTime()).toBe(before.cancelledAt);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(result[0]).toEqual({
      transactionId: 'transaction-1',
      subscriptionId: 'subscription-1',
      reason: 'CHARGE_AFTER_CANCELLATION',
    });
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      'reason',
      'subscriptionId',
      'transactionId',
    ]);
  });
});
