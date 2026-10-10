import { describe, expect, it } from 'vitest';
import { getDetectionMergeDecision } from '../detection/detection-merge.js';
import type { SubscriptionLifecycleStatus } from '../detection/subscription-lifecycle.js';

const STATUSES = [
  'DETECTED',
  'TRIAL',
  'ACTIVE',
  'PAUSED',
  'CANCELLED',
  'ARCHIVED',
  'REJECTED',
] as const satisfies readonly SubscriptionLifecycleStatus[];

type ExpectedPair = readonly [source: SubscriptionLifecycleStatus, survivor: SubscriptionLifecycleStatus, allowed: boolean];

// Independent literal oracle for every status combination.
const EXPECTED_STATUS_PAIRS: readonly ExpectedPair[] = [
  ['DETECTED', 'DETECTED', true],
  ['DETECTED', 'TRIAL', false],
  ['DETECTED', 'ACTIVE', false],
  ['DETECTED', 'PAUSED', false],
  ['DETECTED', 'CANCELLED', false],
  ['DETECTED', 'ARCHIVED', false],
  ['DETECTED', 'REJECTED', false],
  ['TRIAL', 'DETECTED', false],
  ['TRIAL', 'TRIAL', false],
  ['TRIAL', 'ACTIVE', false],
  ['TRIAL', 'PAUSED', false],
  ['TRIAL', 'CANCELLED', false],
  ['TRIAL', 'ARCHIVED', false],
  ['TRIAL', 'REJECTED', false],
  ['ACTIVE', 'DETECTED', false],
  ['ACTIVE', 'TRIAL', false],
  ['ACTIVE', 'ACTIVE', false],
  ['ACTIVE', 'PAUSED', false],
  ['ACTIVE', 'CANCELLED', false],
  ['ACTIVE', 'ARCHIVED', false],
  ['ACTIVE', 'REJECTED', false],
  ['PAUSED', 'DETECTED', false],
  ['PAUSED', 'TRIAL', false],
  ['PAUSED', 'ACTIVE', false],
  ['PAUSED', 'PAUSED', false],
  ['PAUSED', 'CANCELLED', false],
  ['PAUSED', 'ARCHIVED', false],
  ['PAUSED', 'REJECTED', false],
  ['CANCELLED', 'DETECTED', false],
  ['CANCELLED', 'TRIAL', false],
  ['CANCELLED', 'ACTIVE', false],
  ['CANCELLED', 'PAUSED', false],
  ['CANCELLED', 'CANCELLED', false],
  ['CANCELLED', 'ARCHIVED', false],
  ['CANCELLED', 'REJECTED', false],
  ['ARCHIVED', 'DETECTED', false],
  ['ARCHIVED', 'TRIAL', false],
  ['ARCHIVED', 'ACTIVE', false],
  ['ARCHIVED', 'PAUSED', false],
  ['ARCHIVED', 'CANCELLED', false],
  ['ARCHIVED', 'ARCHIVED', false],
  ['ARCHIVED', 'REJECTED', false],
  ['REJECTED', 'DETECTED', false],
  ['REJECTED', 'TRIAL', false],
  ['REJECTED', 'ACTIVE', false],
  ['REJECTED', 'PAUSED', false],
  ['REJECTED', 'CANCELLED', false],
  ['REJECTED', 'ARCHIVED', false],
  ['REJECTED', 'REJECTED', false],
];

function callMerge(args: readonly unknown[]) {
  return getDetectionMergeDecision(
    args[0] as string,
    args[1] as SubscriptionLifecycleStatus,
    args[2] as string,
    args[3] as string,
    args[4] as SubscriptionLifecycleStatus,
    args[5] as string,
  );
}

function expectConflict(args: readonly unknown[]): Error {
  let thrown: unknown;
  try {
    callMerge(args);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  const error = thrown as Error;
  expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
  expect(error.constructor).toBe(Error);
  expect(error.message).toBe('MERGE_CONFLICT');
  expect(Object.prototype.hasOwnProperty.call(error, 'cause')).toBe(false);
  return error;
}

const VALID_ARGS = ['source', 'DETECTED', 'SEK', 'survivor', 'DETECTED', 'SEK'] as const;

describe('getDetectionMergeDecision', () => {
  it('matches the complete literal seven-by-seven status matrix', () => {
    expect(STATUSES).toHaveLength(7);
    expect(EXPECTED_STATUS_PAIRS).toHaveLength(49);
    expect(EXPECTED_STATUS_PAIRS.filter(([, , allowed]) => allowed)).toHaveLength(1);
    expect(EXPECTED_STATUS_PAIRS.filter(([, , allowed]) => !allowed)).toHaveLength(48);

    const seenPairs = new Set<string>();
    for (const [sourceStatus, survivorStatus, allowed] of EXPECTED_STATUS_PAIRS) {
      const key = `${sourceStatus}\u0000${survivorStatus}`;
      expect(seenPairs.has(key)).toBe(false);
      seenPairs.add(key);
      const args = [VALID_ARGS[0], sourceStatus, VALID_ARGS[2], VALID_ARGS[3], survivorStatus, VALID_ARGS[5]];

      if (allowed) {
        expect(callMerge(args)).toEqual({
          sourceId: 'source',
          survivorId: 'survivor',
          sourceStatus: 'ARCHIVED',
          survivorStatus: 'DETECTED',
        });
      } else {
        expectConflict(args);
      }
    }
    expect(seenPairs.size).toBe(49);
  });

  it('requires distinct nonempty IDs and equal nonempty exact currency identifiers', () => {
    for (const args of [
      ['', 'DETECTED', 'SEK', 'survivor', 'DETECTED', 'SEK'],
      ['source', 'DETECTED', 'SEK', '', 'DETECTED', 'SEK'],
      ['same', 'DETECTED', 'SEK', 'same', 'DETECTED', 'SEK'],
      ['source', 'DETECTED', '', 'survivor', 'DETECTED', ''],
      ['source', 'DETECTED', 'SEK', 'survivor', 'DETECTED', 'sek'],
      ['source', 'DETECTED', 'SEK', 'survivor', 'DETECTED', 'EUR'],
    ]) {
      expectConflict(args);
    }

    for (const invalidStatus of ['', 'UNKNOWN', 'detected', 'DETECTED ', ' DETECTED']) {
      expectConflict(['source', invalidStatus, 'SEK', 'survivor', 'DETECTED', 'SEK']);
      expectConflict(['source', 'DETECTED', 'SEK', 'survivor', invalidStatus, 'SEK']);
    }

    for (const [sourceId, survivorId, sourceCurrency, survivorCurrency] of [
      [' source', 'survivor', ' SEK', ' SEK'],
      ['source ', 'survivor', 'SEK ', 'SEK '],
    ]) {
      expect(callMerge([sourceId, 'DETECTED', sourceCurrency, survivorId, 'DETECTED', survivorCurrency]).sourceId).toBe(sourceId);
    }
  });

  it('preserves source/survivor orientation and returns a fresh frozen plain result', () => {
    const first = callMerge(VALID_ARGS);
    const second = callMerge(['survivor', 'DETECTED', 'SEK', 'source', 'DETECTED', 'SEK']);

    expect(first).not.toBe(second);
    expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual({
      sourceId: 'source',
      survivorId: 'survivor',
      sourceStatus: 'ARCHIVED',
      survivorStatus: 'DETECTED',
    });
    expect(second).toEqual({
      sourceId: 'survivor',
      survivorId: 'source',
      sourceStatus: 'ARCHIVED',
      survivorStatus: 'DETECTED',
    });
    expect(VALID_ARGS).toEqual(['source', 'DETECTED', 'SEK', 'survivor', 'DETECTED', 'SEK']);
  });

  it('rejects every malformed primitive/object value in each argument with the fixed error', () => {
    const accesses = { getter: 0, toString: 0, valueOf: 0, primitive: 0 };
    const hostile = {
      get value() {
        accesses.getter += 1;
        throw new Error('getter must not run');
      },
      toString() {
        accesses.toString += 1;
        throw new Error('toString must not run');
      },
      valueOf() {
        accesses.valueOf += 1;
        throw new Error('valueOf must not run');
      },
      [Symbol.toPrimitive]() {
        accesses.primitive += 1;
        throw new Error('conversion must not run');
      },
    };
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const invalidValues: readonly unknown[] = [
      undefined,
      null,
      false,
      1,
      1n,
      Symbol('private-input'),
      () => undefined,
      hostile,
      new String('value'),
      revoked.proxy,
    ];

    for (let index = 0; index < VALID_ARGS.length; index += 1) {
      for (const invalid of invalidValues) {
        const args: unknown[] = [...VALID_ARGS];
        args[index] = invalid;
        const error = expectConflict(args);
        expect(error.message).toBe('MERGE_CONFLICT');
      }
    }
    expect(accesses).toEqual({ getter: 0, toString: 0, valueOf: 0, primitive: 0 });
  });
});
