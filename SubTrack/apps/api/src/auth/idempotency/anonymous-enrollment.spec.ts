import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  InMemoryIdempotencyGuard,
  type AnonymousEnrollmentReservationInput,
  type AnonymousRequestDigest,
  type IdempotencyReservationInput,
  type TrustedAuthorityDigest,
} from './idempotency-guard.js';

const anonymous = (digest = 'a'.repeat(64)): AnonymousRequestDigest =>
  ({ kind: 'anonymous-enrollment-otp', digest } as AnonymousRequestDigest);
const trusted = (kind: 'browser-chain' | 'verified-principal' | 'browser-bootstrap-origin' = 'browser-chain'): TrustedAuthorityDigest =>
  ({ kind, digest: 'a'.repeat(64) } as TrustedAuthorityDigest);
const request = (operation: AnonymousEnrollmentReservationInput['operation'] = 'startV2Otp', key = 'i'.repeat(16)): AnonymousEnrollmentReservationInput => ({
  operation,
  transport: 'mobile',
  purpose: 'enroll_identifier',
  authority: anonymous(),
  canonicalRequestDigest: 'b'.repeat(64),
  idempotencyKey: key,
});
const oldRequest = (kind: 'browser-chain' | 'verified-principal' | 'browser-bootstrap-origin', operation: IdempotencyReservationInput['operation'], transport: 'web' | 'mobile', key = 'i'.repeat(16)): IdempotencyReservationInput => ({
  operation, transport, authority: trusted(kind), canonicalRequestDigest: 'b'.repeat(64), idempotencyKey: key,
} as IdempotencyReservationInput);
const make = (config: Partial<ConstructorParameters<typeof InMemoryIdempotencyGuard>[0]> = {}) =>
  new InMemoryIdempotencyGuard({ key: Buffer.alloc(32, 7), ttlMs: 60_000, ...config });
const restart = new Error('AUTH_RESTART_REQUIRED');
const cast = (value: unknown): IdempotencyReservationInput => value as IdempotencyReservationInput;
type CommonFields = Pick<AnonymousEnrollmentReservationInput, 'canonicalRequestDigest' | 'idempotencyKey'>;

describe('anonymous enrollment reservation scope', () => {
  it('requires a separate digest brand and literal operation, transport and purpose at type level', () => {
    expectTypeOf<AnonymousEnrollmentReservationInput>().toMatchTypeOf<IdempotencyReservationInput>();
    expectTypeOf<AnonymousRequestDigest>().not.toMatchTypeOf<TrustedAuthorityDigest>();
    expectTypeOf<TrustedAuthorityDigest>().not.toMatchTypeOf<AnonymousRequestDigest>();
    expectTypeOf<{ kind: 'anonymous-enrollment-otp'; digest: string }>().not.toMatchTypeOf<AnonymousRequestDigest>();
    expectTypeOf<CommonFields & { operation: 'createV2Session'; transport: 'mobile'; purpose: 'enroll_identifier'; authority: AnonymousRequestDigest }>()
      .not.toMatchTypeOf<AnonymousEnrollmentReservationInput>();
    expectTypeOf<CommonFields & { operation: 'startV2Otp'; transport: 'web'; purpose: 'enroll_identifier'; authority: AnonymousRequestDigest }>()
      .not.toMatchTypeOf<AnonymousEnrollmentReservationInput>();
    expectTypeOf<CommonFields & { operation: 'startV2Otp'; transport: 'mobile'; purpose: 'otp_step_up'; authority: AnonymousRequestDigest }>()
      .not.toMatchTypeOf<AnonymousEnrollmentReservationInput>();
    expectTypeOf<CommonFields & { operation: 'startV2Otp'; transport: 'mobile'; authority: AnonymousRequestDigest }>()
      .not.toMatchTypeOf<AnonymousEnrollmentReservationInput>();
    expectTypeOf<CommonFields & { operation: 'startV2Otp'; transport: 'mobile'; purpose: 'enroll_identifier'; authority: TrustedAuthorityDigest }>()
      .not.toMatchTypeOf<AnonymousEnrollmentReservationInput>();
    expectTypeOf<CommonFields & { operation: 'startV2Otp'; transport: 'web'; authority: TrustedAuthorityDigest; purpose: 'enroll_identifier' }>()
      .not.toMatchTypeOf<IdempotencyReservationInput>();
  });

  it.each(['startV2Otp', 'verifyV2Otp'] as const)('reserves and settles %s under anonymous enrollment only', operation => {
    const guard = make();
    const input = request(operation);
    const owner = guard.reserve(input);
    expect(guard.snapshot()[0]?.state).toBe('pending');
    guard.settle(input, owner.ownerHandle, 'completed');
    expect(guard.snapshot()[0]?.state).toBe('completed');
    expect(() => guard.reserve(input)).toThrow(restart);
    expect(() => guard.settle(input, owner.ownerHandle, 'failed')).toThrow(restart);
  });

  it('rejects invalid anonymous tuples during reserve and settle without changing a pending record', () => {
    const guard = make();
    const input = request();
    const owner = guard.reserve(input);
    const before = guard.snapshot();
    const invalid = [
      { ...input, operation: 'createV2Session' },
      { ...input, operation: 'startV2DeleteOtpReauth' },
      { ...input, operation: 'createV2BrowserNonce' },
      { ...input, transport: 'web' },
      { ...input, transport: 'desktop' },
      { ...input, purpose: 'otp_step_up' },
      { ...input, purpose: undefined },
      { ...input, purpose: null },
      { ...input, authority: { kind: 'anonymous-enrollment-otp', digest: 'z'.repeat(64) } },
      { ...input, authority: { kind: 'other', digest: 'a'.repeat(64) } },
      { ...input, authority: trusted() },
    ];
    for (const value of invalid) {
      expect(() => guard.reserve(cast(value))).toThrow(restart);
      expect(() => guard.settle(cast(value), owner.ownerHandle, 'completed')).toThrow(restart);
      expect(guard.snapshot()).toEqual(before);
    }
    for (const value of [null, undefined, [], 'request', {}]) {
      expect(() => guard.reserve(cast(value))).toThrow(restart);
      expect(() => guard.settle(cast(value), owner.ownerHandle, 'completed')).toThrow(restart);
    }
    guard.settle(input, owner.ownerHandle, 'completed');
  });

  it('rejects extra purpose selectors on every existing authority branch', () => {
    for (const [kind, operation, transport] of [
      ['browser-chain', 'startV2Otp', 'web'],
      ['verified-principal', 'verifyV2Otp', 'mobile'],
      ['browser-bootstrap-origin', 'createV2BrowserNonce', 'web'],
    ] as const) {
      const guard = make();
      const input = oldRequest(kind, operation, transport);
      const owner = guard.reserve(input);
      for (const purpose of ['enroll_identifier', 'otp_step_up', undefined]) {
        const tainted = cast({ ...input, purpose });
        expect(() => guard.reserve(tainted)).toThrow(restart);
        expect(() => guard.settle(tainted, owner.ownerHandle, 'completed')).toThrow(restart);
      }
      guard.settle(input, owner.ownerHandle, 'completed');
    }
  });

  it('burns caller keys globally across anonymous and trusted kinds and requires matching owner and binding', () => {
    const guard = make();
    const input = request();
    const owner = guard.reserve(input);
    expect(() => guard.reserve(oldRequest('browser-chain', 'startV2Otp', 'web'))).toThrow(restart);
    expect(() => guard.settle(input, 'x'.repeat(43), 'completed')).toThrow(restart);
    expect(() => guard.settle({ ...input, purpose: 'otp_step_up' } as unknown as IdempotencyReservationInput, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(() => guard.settle({ ...input, authority: anonymous('c'.repeat(64)) }, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(() => guard.settle({ ...input, canonicalRequestDigest: 'd'.repeat(64) }, owner.ownerHandle, 'completed')).toThrow(restart);
    guard.settle(input, owner.ownerHandle, 'failed');
    expect(() => guard.reserve(input)).toThrow(restart);
    expect(() => guard.settle(input, owner.ownerHandle, 'completed')).toThrow(restart);

    const guard2 = make();
    guard2.reserve(oldRequest('verified-principal', 'verifyV2Otp', 'mobile'));
    expect(() => guard2.reserve(request('verifyV2Otp'))).toThrow(restart);
  });

  it('preserves legacy binding digests byte-for-byte and frames anonymous purpose', () => {
    const vectors = [
      ['browser-chain', 'startV2Otp', 'web', 'bb46ebd29205a10792f478f14f3aeee79f111b2f2cc92ce5d755e4a855d02dd9'],
      ['verified-principal', 'verifyV2Otp', 'mobile', '97897274740680599f033da255a4123bf02db5d2a57ff8383ceaa1091e76883f'],
      ['browser-bootstrap-origin', 'createV2BrowserNonce', 'web', '3b62ecaeff40914e37c6e6340c28f4723a35268b939ee1af825dee9df0fad7b5'],
    ] as const;
    for (const [kind, operation, transport, digest] of vectors) {
      const guard = make();
      guard.reserve(oldRequest(kind, operation, transport));
      expect(guard.snapshot()[0]?.bindingDigest).toBe(digest);
    }
    const guard = make();
    guard.reserve(request());
    expect(guard.snapshot()[0]?.bindingDigest).toBe('a9febc9ecf9a7f2bd7838452edc61d0d2977b161084cd9c07137a1226951cb9d');
  });

  it('keeps anonymous reservations within existing TTL and capacity limits', () => {
    let now = 100;
    const guard = make({ clock: () => now, ttlMs: 10, maxRecords: 1 });
    const input = request();
    const owner = guard.reserve(input);
    expect(() => guard.reserve(request('verifyV2Otp', 'j'.repeat(16)))).toThrow(restart);
    now = 110;
    expect(() => guard.settle(input, owner.ownerHandle, 'completed')).toThrow(restart);
    expect(() => guard.reserve(request('verifyV2Otp', 'j'.repeat(16)))).not.toThrow();
    expect(guard.snapshot()).toHaveLength(1);
  });
});
