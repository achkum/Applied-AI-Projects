import { describe, expect, it } from 'vitest';
import {
  getNextSubscriptionStatus,
  type SubscriptionLifecycleAction,
  type SubscriptionLifecycleStatus,
} from '../detection/subscription-lifecycle.js';

type ExpectedPair = readonly [current: string, action: string, next: string | null];

// Independent acceptance oracle: every status/action pair is recorded literally.
const EXPECTED_PAIRS: readonly ExpectedPair[] = [
  ['DETECTED', 'confirm', 'ACTIVE'],
  ['DETECTED', 'reject', 'REJECTED'],
  ['DETECTED', 'archive', 'ARCHIVED'],
  ['DETECTED', 'activate', null],
  ['DETECTED', 'cancel', null],
  ['DETECTED', 'pause', null],
  ['DETECTED', 'resume', null],
  ['TRIAL', 'confirm', null],
  ['TRIAL', 'reject', null],
  ['TRIAL', 'archive', 'ARCHIVED'],
  ['TRIAL', 'activate', 'ACTIVE'],
  ['TRIAL', 'cancel', 'CANCELLED'],
  ['TRIAL', 'pause', null],
  ['TRIAL', 'resume', null],
  ['ACTIVE', 'confirm', null],
  ['ACTIVE', 'reject', null],
  ['ACTIVE', 'archive', 'ARCHIVED'],
  ['ACTIVE', 'activate', null],
  ['ACTIVE', 'cancel', 'CANCELLED'],
  ['ACTIVE', 'pause', 'PAUSED'],
  ['ACTIVE', 'resume', null],
  ['PAUSED', 'confirm', null],
  ['PAUSED', 'reject', null],
  ['PAUSED', 'archive', 'ARCHIVED'],
  ['PAUSED', 'activate', null],
  ['PAUSED', 'cancel', 'CANCELLED'],
  ['PAUSED', 'pause', null],
  ['PAUSED', 'resume', 'ACTIVE'],
  ['CANCELLED', 'confirm', null],
  ['CANCELLED', 'reject', null],
  ['CANCELLED', 'archive', 'ARCHIVED'],
  ['CANCELLED', 'activate', null],
  ['CANCELLED', 'cancel', null],
  ['CANCELLED', 'pause', null],
  ['CANCELLED', 'resume', null],
  ['ARCHIVED', 'confirm', null],
  ['ARCHIVED', 'reject', null],
  ['ARCHIVED', 'archive', null],
  ['ARCHIVED', 'activate', null],
  ['ARCHIVED', 'cancel', null],
  ['ARCHIVED', 'pause', null],
  ['ARCHIVED', 'resume', null],
  ['REJECTED', 'confirm', null],
  ['REJECTED', 'reject', null],
  ['REJECTED', 'archive', 'ARCHIVED'],
  ['REJECTED', 'activate', null],
  ['REJECTED', 'cancel', null],
  ['REJECTED', 'pause', null],
  ['REJECTED', 'resume', null],
];

function callLifecycle(currentStatus: unknown, action: unknown): SubscriptionLifecycleStatus {
  return getNextSubscriptionStatus(
    currentStatus as SubscriptionLifecycleStatus,
    action as SubscriptionLifecycleAction,
  );
}

function expectConflict(currentStatus: unknown, action: unknown): Error {
  let thrown: unknown;
  try {
    callLifecycle(currentStatus, action);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  const error = thrown as Error;
  expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
  expect(error.constructor).toBe(Error);
  expect(error.message).toBe('LIFECYCLE_CONFLICT');
  expect(Object.prototype.hasOwnProperty.call(error, 'cause')).toBe(false);
  return error;
}

describe('getNextSubscriptionStatus', () => {
  it('matches the complete literal seven-state by seven-action matrix', () => {
    expect(EXPECTED_PAIRS).toHaveLength(49);
    expect(EXPECTED_PAIRS.filter(([, , next]) => next !== null)).toHaveLength(14);
    expect(EXPECTED_PAIRS.filter(([, , next]) => next === null)).toHaveLength(35);

    const seenPairs = new Set<string>();
    for (const [current, action, next] of EXPECTED_PAIRS) {
      const key = `${current}\u0000${action}`;
      expect(seenPairs.has(key)).toBe(false);
      seenPairs.add(key);

      if (next === null) {
        expectConflict(current, action);
      } else {
        expect(callLifecycle(current, action)).toBe(next);
        expect(next).not.toBe(current);
      }
    }
    expect(seenPairs.size).toBe(49);
  });

  it('rejects invalid strings and unsupported action names with the same fixed error', () => {
    const invalidStatuses = [
      '',
      'UNKNOWN',
      'detected',
      'Detected',
      'DETECTED ',
      ' DETECTED',
      '__proto__',
      'constructor',
      'toString',
    ];
    for (const status of invalidStatuses) {
      expectConflict(status, 'confirm');
    }

    const invalidActions = [
      '',
      'unknown',
      'Confirm',
      'CONFIRM',
      ' confirm',
      'confirm ',
      '__proto__',
      'constructor',
      'toString',
      'edit',
      'merge',
      'undo',
    ];
    for (const action of invalidActions) {
      expectConflict('ACTIVE', action);
    }
  });

  it('rejects unsupported runtime primitive and wrapper values without leaking them', () => {
    const invalidValues: readonly unknown[] = [
      undefined,
      null,
      1,
      1n,
      true,
      Symbol('private-input'),
      [],
      () => undefined,
      new String('ACTIVE'),
    ];

    for (const value of invalidValues) {
      const error = expectConflict(value, 'confirm');
      expect(error.message).toBe('LIFECYCLE_CONFLICT');
      expect(expectConflict('ACTIVE', value).message).toBe('LIFECYCLE_CONFLICT');
    }
  });

  it('rejects object inputs without reading properties or invoking coercion hooks', () => {
    const accesses = { getter: 0, toString: 0, valueOf: 0, primitive: 0 };
    const hostile = {
      get status() {
        accesses.getter += 1;
        throw new Error('status getter must not run');
      },
      get action() {
        accesses.getter += 1;
        throw new Error('action getter must not run');
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
        throw new Error('primitive conversion must not run');
      },
    };

    expectConflict(hostile, 'confirm');
    expectConflict('ACTIVE', hostile);
    expect(accesses).toEqual({ getter: 0, toString: 0, valueOf: 0, primitive: 0 });
  });

  it('rejects revoked proxy inputs without touching the proxy', () => {
    const currentProxy = Proxy.revocable({}, {});
    currentProxy.revoke();
    expectConflict(currentProxy.proxy, 'confirm');

    const actionProxy = Proxy.revocable({}, {});
    actionProxy.revoke();
    expectConflict('ACTIVE', actionProxy.proxy);
  });
});
