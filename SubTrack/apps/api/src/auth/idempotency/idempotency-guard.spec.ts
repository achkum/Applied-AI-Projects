import { describe, expect, it } from 'vitest';
import {
  InMemoryIdempotencyGuard,
  V2_IDEMPOTENT_OPERATIONS,
  type IdempotencyReservationInput,
  type TrustedAuthorityDigest,
} from './idempotency-guard.js';

const authority = (kind = 'browser-chain', digest = 'a'.repeat(64)): TrustedAuthorityDigest =>
  ({ kind, digest } as TrustedAuthorityDigest);
const input = (overrides: Partial<IdempotencyReservationInput> = {}): IdempotencyReservationInput => ({
  operation: 'startV2Otp',
  transport: 'web',
  authority: authority(),
  canonicalRequestDigest: 'b'.repeat(64),
  idempotencyKey: 'i'.repeat(16),
  ...overrides,
});
const make = (overrides: Partial<ConstructorParameters<typeof InMemoryIdempotencyGuard>[0]> = {}) =>
  new InMemoryIdempotencyGuard({ key: Buffer.alloc(32, 7), ttlMs: 60_000, ...overrides });
const restart = new Error('AUTH_RESTART_REQUIRED');

describe('InMemoryIdempotencyGuard', () => {
  it('restricts operations to the seven keyed v2 mutating POST contracts', () => {
    expect(V2_IDEMPOTENT_OPERATIONS).toEqual([
      'startV2Otp', 'verifyV2Otp', 'createV2Session', 'refreshV2Session',
      'startV2DeleteOtpReauth', 'verifyV2DeleteOtpReauth', 'createV2BrowserNonce',
    ]);
    const guard = make();
    for (const operation of V2_IDEMPOTENT_OPERATIONS) expect(() => guard.reserve(input({ operation, idempotencyKey: `operation-key-${operation}` }))).not.toThrow();
    expect(() => guard.reserve(input({ operation: 'deleteV2Me' as IdempotencyReservationInput['operation'] }))).toThrow(restart);
  });

  it('rejects malformed key, digests, operation, transport, and authority with one generic error', () => {
    const guard = make();
    const malformed = [
      input({ idempotencyKey: 'short' }), input({ idempotencyKey: ' '.repeat(16) }),
      input({ idempotencyKey: 'a'.repeat(256) }), input({ idempotencyKey: 'key\n' + 'a'.repeat(12) }),
      input({ canonicalRequestDigest: 'g'.repeat(64) }), input({ canonicalRequestDigest: 'a'.repeat(63) }),
      input({ transport: 'desktop' as IdempotencyReservationInput['transport'] }),
      input({ authority: authority('caller-id') }), input({ authority: authority('verified-principal', 'f'.repeat(63)) }),
    ];
    for (const item of malformed) expect(() => guard.reserve(item)).toThrow(restart);
    expect(guard.snapshot()).toHaveLength(0);
  });

  it('copies the mandatory HMAC key and binds operation, transport, authority, and request digest', () => {
    const key = Buffer.alloc(32, 11);
    const guard = make({ key });
    key.fill(0);
    const base = input();
    const owner = guard.reserve(base);
    for (const changed of [
      input({ operation: 'verifyV2Otp' }), input({ transport: 'mobile' }),
      input({ authority: authority('browser-chain', 'c'.repeat(64)) }),
      input({ canonicalRequestDigest: 'd'.repeat(64) }),
    ]) expect(() => guard.settle(changed, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(guard.snapshot()).toHaveLength(1);
    guard.settle(base, owner.ownerHandle, 'completed');
  });

  it('rejects duplicate pending and settled keys without returning results or disclosing binding', () => {
    const guard = make();
    const first = input();
    const owner = guard.reserve(first);
    expect(() => guard.reserve(first)).toThrow(restart);
    guard.settle(first, owner.ownerHandle, 'completed');
    expect(() => guard.reserve(first)).toThrow(restart);
    expect(() => guard.reserve(input({ canonicalRequestDigest: 'c'.repeat(64) }))).toThrow(restart);
    expect(guard.snapshot()[0]?.state).toBe('completed');
  });

  it('requires the right pending owner, is single-settlement, and preserves state after invalid attempts', () => {
    const guard = make();
    const request = input();
    const owner = guard.reserve(request);
    const before = guard.snapshot();
    expect(() => guard.settle(request, 'x'.repeat(43), 'failed')).toThrow(restart);
    expect(() => guard.settle(input({ canonicalRequestDigest: 'c'.repeat(64) }), owner.ownerHandle, 'failed')).toThrow(restart);
    expect(guard.snapshot()).toEqual(before);
    guard.settle(request, owner.ownerHandle, 'failed');
    expect(() => guard.settle(request, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(guard.snapshot()[0]?.state).toBe('failed');
    expect(() => guard.settle(input({ idempotencyKey: 'another-key-12345' }), owner.ownerHandle, 'failed')).toThrow(restart);
  });

  it('uses safe injected time, expires tombstones, and rejects invalid clocks and unsafe expiry', () => {
    let now = 10_000;
    const guard = make({ ttlMs: 25, clock: () => now });
    const request = input();
    const owner = guard.reserve(request);
    expect(owner.expiresAt).toBe(10_025);
    now = 10_025;
    expect(() => guard.settle(request, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(guard.snapshot()).toHaveLength(0);
    expect(() => guard.reserve(request)).not.toThrow();
    for (const invalid of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      const bad = make({ clock: () => invalid });
      expect(() => bad.reserve(input())).toThrow(restart);
    }
    expect(() => make({ clock: () => Number.MAX_SAFE_INTEGER - 10 }).reserve(input())).toThrow(restart);
  });

  it('hides thrown clock errors and leaves existing reservations unchanged', () => {
    let broken = false;
    const guard = make({ clock: () => {
      if (broken) throw new Error('clock unavailable');
      return 10;
    } });
    const request = input();
    const owner = guard.reserve(request);
    const before = guard.snapshot();
    broken = true;
    expect(() => guard.settle(request, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(() => guard.reserve(input({ idempotencyKey: 'k'.repeat(16) }))).toThrow(restart);
    expect(guard.snapshot()).toEqual(before);
  });

  it('fails closed at configured capacity and prunes expired rows before capacity checks', () => {
    let now = 1;
    const guard = make({ maxRecords: 1, ttlMs: 10, clock: () => now });
    guard.reserve(input());
    expect(() => guard.reserve(input({ idempotencyKey: 'j'.repeat(16) }))).toThrow(restart);
    now = 11;
    expect(() => guard.reserve(input({ idempotencyKey: 'j'.repeat(16) }))).not.toThrow();
    expect(guard.snapshot()).toHaveLength(1);
  });

  it('allows exactly one synchronous winner in a concurrent reservation race', async () => {
    const guard = make();
    const results = await Promise.allSettled([
      Promise.resolve().then(() => guard.reserve(input())),
      Promise.resolve().then(() => guard.reserve(input())),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });

  it('retains only copied frozen hashes and state, never caller keys, authority, or response data', () => {
    const guard = make();
    const secretKey = 's'.repeat(24);
    const secretAuthority = 'e'.repeat(64);
    const request = input({ idempotencyKey: secretKey, authority: authority('verified-principal', secretAuthority) });
    const owner = guard.reserve(request);
    const snapshot = guard.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    const storedText = JSON.stringify(snapshot);
    expect(storedText).not.toContain(secretKey);
    expect(storedText).not.toContain(secretAuthority);
    expect(storedText).not.toContain(owner.ownerHandle);
    expect(storedText).not.toContain(request.canonicalRequestDigest);
    expect(storedText).not.toContain('response');
    Object.assign(request, { authority: authority('verified-principal', 'f'.repeat(64)) });
    expect(guard.snapshot()).toEqual(snapshot);
  });

  it('requires explicit safe config and never substitutes a fallback key', () => {
    for (const config of [
      { key: Buffer.alloc(31), ttlMs: 100 }, { key: Buffer.alloc(32), ttlMs: 0 },
      { key: Buffer.alloc(32), ttlMs: 86_400_001 }, { key: Buffer.alloc(32), ttlMs: 10, maxRecords: 0 },
      { key: Buffer.alloc(32), ttlMs: 10, maxRecords: 10_001 },
    ]) expect(() => new InMemoryIdempotencyGuard(config)).toThrow(restart);
  });
});
