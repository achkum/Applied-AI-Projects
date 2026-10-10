import { describe, expect, it } from 'vitest';
import { MobileEnrollmentChallengeStore } from './mobile-enrollment-challenge-store';
import type { MobileEnrollmentIssuance } from './otp-proof-producer';

const issuance = (challengeId = 'A'.repeat(43), issuedAt = 100): MobileEnrollmentIssuance => Object.freeze({
  challengeId, purpose: 'enroll_identifier', transport: 'mobile', identifierHash: 'a'.repeat(64),
  channel: 'sms', issuedAt, expiresAt: issuedAt + 300_000,
});

describe('MobileEnrollmentChallengeStore', () => {
  it('reserves capacity before issuance and publishes metadata plus code atomically', () => {
    let now = 100; const store = new MobileEnrollmentChallengeStore(() => now, 1);
    const slot = store.reserve(); expect(() => store.reserve()).toThrow('Challenge unavailable');
    expect(store.lookup(issuance().challengeId)).toBeNull(); expect(store.peekCodeForTest(issuance().challengeId)).toBeNull();
    expect(() => store.publish(slot, { ...issuance(), channel: 'bad' } as never, '123456')).toThrow('Challenge unavailable');
    expect(store.lookup(issuance().challengeId)).toBeNull(); expect(store.peekCodeForTest(issuance().challengeId)).toBeNull();
    expect(store.publish(slot, issuance(), '123456')).toEqual(issuance());
    expect(store.peekCodeForTest(issuance().challengeId)).toBe('123456');
    expect(store.lookup(issuance().challengeId)).toEqual(issuance());
    expect(JSON.stringify(store.lookup(issuance().challengeId))).not.toContain('123456');
    expect(() => store.publish(slot, issuance(), '123456')).toThrow('Challenge unavailable');
    expect(() => store.reserve()).toThrow('Challenge unavailable');
    now = issuance().expiresAt; expect(store.lookup(issuance().challengeId)).toBeNull();
    expect(store.reserve()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('claims across awaits, restores only decreasing explicit incorrect outcomes and retires terminal results', async () => {
    const store = new MobileEnrollmentChallengeStore(() => 100); const slot = store.reserve(); store.publish(slot, issuance(), '123456');
    const claim = store.claim(issuance().challengeId)!;
    expect(Object.keys(claim.metadata)).not.toContain('code'); expect(store.lookup(issuance().challengeId)).toBeNull();
    expect(store.peekCodeForTest(issuance().challengeId)).toBeNull();
    await Promise.resolve(); expect(store.claim(issuance().challengeId)).toBeNull();
    expect(() => store.restoreIncorrect(claim, 5)).toThrow('Challenge unavailable');
    store.restoreIncorrect(claim, 4); expect(store.lookup(issuance().challengeId)).toEqual(issuance());
    const second = store.claim(issuance().challengeId)!;
    expect(() => store.restoreIncorrect(claim, 3)).toThrow('Challenge unavailable');
    expect(() => store.restoreIncorrect(second, 4)).toThrow('Challenge unavailable');
    store.retire(second); expect(store.lookup(issuance().challengeId)).toBeNull();
    expect(() => store.restoreIncorrect(second, 3)).toThrow('Challenge unavailable');
    expect(store.peekCodeForTest(issuance().challengeId)).toBeNull();
  });

  it('rejects duplicate, late, partial, regressed and overflow publication without partial visibility', () => {
    let now = 100; const store = new MobileEnrollmentChallengeStore(() => now, 2);
    const first = store.reserve(); store.publish(first, issuance(), '123456');
    const second = store.reserve();
    for (const tuple of [{ ...issuance() }, { ...issuance('B'.repeat(43)), expiresAt: 301_000 },
      { ...issuance('B'.repeat(43)), identifierHash: 'raw' }, { ...issuance('B'.repeat(43)), extra: true }]) {
      expect(() => store.publish(second, tuple as MobileEnrollmentIssuance, '123456')).toThrow('Challenge unavailable');
      expect(store.lookup('B'.repeat(43))).toBeNull();
    }
    now = 99; expect(() => store.publish(second, issuance('B'.repeat(43)), '123456')).toThrow('Challenge unavailable');
    now = 300_100; expect(() => store.publish(second, issuance('B'.repeat(43)), '123456')).toThrow('Challenge unavailable');
    expect(store.peekCodeForTest('B'.repeat(43))).toBeNull();
    const overflow = new MobileEnrollmentChallengeStore(() => Number.MAX_SAFE_INTEGER);
    expect(() => overflow.reserve()).toThrow('Challenge unavailable');
  });

  it('keeps ambiguous claims unusable until expiry and frees abandoned reservations', () => {
    let now = 100; const store = new MobileEnrollmentChallengeStore(() => now, 1);
    const abandoned = store.reserve(); store.abandon(abandoned);
    const slot = store.reserve(); store.publish(slot, issuance(), '123456');
    store.claim(issuance().challengeId);
    expect(store.claim(issuance().challengeId)).toBeNull();
    expect(() => store.reserve()).toThrow('Challenge unavailable');
    now = 300_100; expect(store.claim(issuance().challengeId)).toBeNull();
    expect(store.reserve()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('allows only one capacity contender and keeps a claim unusable after cleanup failure', async () => {
    const store = new MobileEnrollmentChallengeStore(() => 100, 1);
    const contenders = await Promise.allSettled(Array.from({ length: 8 }, async () => store.reserve()));
    expect(contenders.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const slot = (contenders.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<string>).value;
    store.publish(slot, issuance(), '123456');
    class FaultyCleanup extends MobileEnrollmentChallengeStore { override retire(): void { throw new Error('cleanup fault'); } }
    const faulty = new FaultyCleanup(() => 100);
    faulty.publish(faulty.reserve(), issuance('B'.repeat(43)), '123456');
    const claim = faulty.claim('B'.repeat(43))!;
    expect(() => faulty.retire()).toThrow('cleanup fault');
    expect(faulty.lookup(claim.metadata.challengeId)).toBeNull();
    expect(faulty.claim(claim.metadata.challengeId)).toBeNull();
    expect(faulty.peekCodeForTest(claim.metadata.challengeId)).toBeNull();
  });
});
