import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { BROWSER_NONCE_TTL_MS, BrowserNonceGuard, InMemoryBrowserNonceStore, type BrowserEvidence } from '../browser-nonce/browser-nonce';
import { InMemoryIdempotencyGuard, type IdempotencyReservationInput } from '../idempotency/idempotency-guard';
import type { V2BrowserEvidence } from '../http/v2-browser-context';
import { InMemoryOtpChallengeRepository } from '../proofs-v2/otp-proof-producer';
import { InMemoryProofRepository } from '../proofs-v2/proof-store';
import { DevelopmentOtpCodeSink, OtpHttpService, OtpRateLimiter } from './otp-http';

const origin = 'https://auth.example.test';
const keyBytes = (value: number) => Buffer.alloc(32, value);
const config = { origins: [origin], cookieName: 'st_v2_browser', cookiePath: '/v2/auth', allowLoopbackHttp: false,
  idempotencyKey: keyBytes(1), originKey: keyBytes(2), otpKey: keyBytes(3), rateKey: keyBytes(4) };
const browserEvidence: BrowserEvidence = { origin, isHttps: true, explicitLoopbackDevelopment: false };
const requestEvidence = (secret: string): V2BrowserEvidence => ({ origin, isHttps: true, explicitLoopbackDevelopment: false, bindingCookie: secret });
const startBody = { channel: 'email', identifier: 'person@example.test', purpose: 'enroll_identifier', transport: 'web' };

function harness() {
  const now = 1_000_000;
  const nonce = new BrowserNonceGuard({ allowedOrigins: [origin], clock: () => now }, new InMemoryBrowserNonceStore());
  const boot = nonce.issue('enroll_identifier', browserEvidence);
  return { nonce, now, cookieSecret: boot.cookieSecret, nonceValue: boot.nonce };
}

function request(nonce: string, idempotencyKey: string): Request {
  return { rawHeaders: ['Idempotency-Key', idempotencyKey, 'X-Browser-Nonce', nonce], socket: { remoteAddress: '203.0.113.9' } } as unknown as Request;
}

function response() {
  let resolve!: () => void;
  const done = new Promise<void>(ok => { resolve = ok; });
  const result = { statusCode: 0, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    type() { return this; },
    send(body: unknown) { this.body = body; resolve(); return this; },
    json(body: unknown) { this.body = body; resolve(); return this; } };
  return { result, wire: result as unknown as Response, done };
}

function reservations(failOperation?: string) {
  const guard = new InMemoryIdempotencyGuard({ key: config.idempotencyKey, ttlMs: 60_000 });
  return { guard, repository: {
    reserve: (input: IdempotencyReservationInput) => guard.reserve(input),
    settle: (input: IdempotencyReservationInput, owner: string, outcome: 'completed' | 'failed') => {
      if (outcome === 'completed' && input.operation === failOperation) throw new Error('settlement unavailable');
      guard.settle(input, owner, outcome);
    },
  } };
}

describe('OTP HTTP settlement and nonce safety', () => {
  it('hides an issued challenge when start completion cannot settle and burns both key and old nonce', async () => {
    const h = harness();
    const idem = reservations('startV2Otp');
    const sink = new DevelopmentOtpCodeSink();
    const published = vi.spyOn(sink, 'publish');
    const service = new OtpHttpService(config, { nonce: h.nonce, idempotency: idem.repository, sink, clock: () => h.now });
    const first = response();
    service.start(startBody, request(h.nonceValue, 'settlement-failure-start-0001'), 'settlement-failure-start-0001', h.nonceValue, requestEvidence(h.cookieSecret), first.wire);
    await first.done;
    expect(first.result.statusCode).toBe(500);
    expect(first.result.body).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'AUTH_RESTART_REQUIRED' });
    expect(JSON.stringify(first.result.body)).not.toMatch(/challengeId|nextBrowserNonce|proof/);
    expect(published).not.toHaveBeenCalled();

    const duplicate = response();
    service.start(startBody, request(h.nonceValue, 'settlement-failure-start-0001'), 'settlement-failure-start-0001', h.nonceValue, requestEvidence(h.cookieSecret), duplicate.wire);
    expect(duplicate.result.statusCode).toBe(409);
    const oldNonce = response();
    service.start(startBody, request(h.nonceValue, 'settlement-failure-start-0002'), 'settlement-failure-start-0002', h.nonceValue, requestEvidence(h.cookieSecret), oldNonce.wire);
    expect(oldNonce.result.statusCode).toBe(409);
  });

  it('does not return a restricted proof or rotated nonce when verify completion settlement fails', async () => {
    const h = harness();
    const idem = reservations('verifyV2Otp');
    const sink = new DevelopmentOtpCodeSink();
    const service = new OtpHttpService(config, { nonce: h.nonce, idempotency: idem.repository, sink, clock: () => h.now });
    const started = response();
    service.start(startBody, request(h.nonceValue, 'settlement-verify-start-0001'), 'settlement-verify-start-0001', h.nonceValue, requestEvidence(h.cookieSecret), started.wire);
    await started.done;
    expect(started.result.statusCode).toBe(202);
    const accepted = started.result.body as { challengeId: string; nextBrowserNonce: string };
    const code = sink.peek(accepted.challengeId, h.now)?.code;
    expect(code).toMatch(/^\d{6}$/);

    const verified = response();
    const verifyBody = { challengeId: accepted.challengeId, code: code!, transport: 'web' };
    service.verify(verifyBody, request(accepted.nextBrowserNonce, 'settlement-verify-key-0001'), 'settlement-verify-key-0001', accepted.nextBrowserNonce, requestEvidence(h.cookieSecret), verified.wire);
    await verified.done;
    expect(verified.result.statusCode).toBe(500);
    expect(JSON.stringify(verified.result.body)).not.toMatch(/proof|nextBrowserNonce|challengeId/);
    expect(sink.peek(accepted.challengeId, h.now)).toBeNull();

    const retry = response();
    service.verify(verifyBody, request(accepted.nextBrowserNonce, 'settlement-verify-key-0002'), 'settlement-verify-key-0002', accepted.nextBrowserNonce, requestEvidence(h.cookieSecret), retry.wire);
    expect(retry.result.statusCode).toBe(409);
  });

  it('allows repeated bound preflight without consuming the nonce, then rotates once and rejects bad bindings', () => {
    let now = 5_000;
    const nonce = new BrowserNonceGuard({ allowedOrigins: [origin], clock: () => now }, new InMemoryBrowserNonceStore());
    const boot = nonce.issue('otp_step_up', browserEvidence);
    const evidence = { ...browserEvidence, bindingCookie: boot.cookieSecret };
    const trusted = nonce.validateBound('otp_step_up', evidence, boot.nonce, boot.cookieSecret);
    expect(nonce.validateBound('otp_step_up', evidence, boot.nonce, boot.cookieSecret)).toEqual(trusted);
    expect(() => nonce.validateBound('enroll_identifier', evidence, boot.nonce, boot.cookieSecret)).toThrow();
    expect(() => nonce.validateBound('otp_step_up', evidence, boot.nonce, 'd'.repeat(43))).toThrow();
    expect(() => nonce.validateBound('otp_step_up', { ...evidence, origin: 'https://other.example.test' }, boot.nonce, boot.cookieSecret)).toThrow();
    now += 1;
    const rotated = nonce.consumeAndRotate('otp_step_up', evidence, boot.nonce, boot.cookieSecret);
    expect(nonce.validateBound('otp_step_up', evidence, rotated.nonce, boot.cookieSecret).chainId).toBe(trusted.chainId);
    expect(() => nonce.validateBound('otp_step_up', evidence, boot.nonce, boot.cookieSecret)).toThrow();

    const expiring = nonce.issue('enroll_identifier', browserEvidence);
    const expiredEvidence = { ...browserEvidence, bindingCookie: expiring.cookieSecret };
    now += BROWSER_NONCE_TTL_MS;
    expect(() => nonce.validateBound('enroll_identifier', expiredEvidence, expiring.nonce, expiring.cookieSecret)).toThrow();
  });

  it('prunes expired store entries before enforcing their small configured capacity', () => {
    const challenges = new InMemoryOtpChallengeRepository(1);
    const challenge = (id: string, issuedAt: number, expiresAt: number) => ({ challengeId: id, purpose: 'enroll_identifier' as const,
      identifierHash: 'a'.repeat(64), channel: 'email' as const, transportContext: { transport: 'web' as const, exactOrigin: origin, browserChainId: 'chain' },
      issuedAt, expiresAt, attempts: 0, codeDigest: Buffer.alloc(32) });
    challenges.insert(challenge('expired', 0, 10));
    challenges.insert(challenge('live', 10, 20));
    expect(() => challenges.insert(challenge('overflow', 10, 30))).toThrow();

    const proofs = new InMemoryProofRepository(1);
    const proof = (hash: string, issuedAt: number, expiresAt: number) => ({ hash, purpose: 'enrollment' as const, action: 'enroll-credential',
      challenge: 'challenge', transport: 'web' as const, identifierHash: 'a'.repeat(64), exactOrigin: origin, browserChainId: 'chain', issuedAt, expiresAt });
    proofs.insert(proof('expired', 0, 10));
    proofs.insert(proof('live', 10, 20));
    expect(() => proofs.insert(proof('overflow', 10, 30))).toThrow();

    const sink = new DevelopmentOtpCodeSink(1);
    sink.publish('expired', { code: '000001', purpose: 'enroll_identifier', origin, chainId: 'chain', expiresAt: 10 }, 0);
    expect(sink.canAccept(10)).toBe(true);
    sink.publish('live', { code: '000002', purpose: 'enroll_identifier', origin, chainId: 'chain', expiresAt: 20 }, 10);
    expect(() => sink.publish('overflow', { code: '000003', purpose: 'enroll_identifier', origin, chainId: 'chain', expiresAt: 30 }, 10)).toThrow();
  });
});


describe('OTP start rate limits', () => {
  it('limits starts by direct socket IP despite forwarded changes and preserves nonce on rate rejection', async () => {
    const h = harness();
    const service = new OtpHttpService(config, { nonce: h.nonce, clock: () => h.now });
    for (let i = 0; i < 11; i += 1) {
      const boot = h.nonce.issue('enroll_identifier', browserEvidence);
      const id = `socket-rate-request-${i}`;
      const req = request(boot.nonce, id);
      req.headers = { 'x-forwarded-for': `192.0.2.${i}` };
      Object.defineProperty(req.socket, 'remoteAddress', { value: i === 10 ? '::ffff:203.0.113.9' : '203.0.113.9' });
      const res = response();
      service.start({ ...startBody, identifier: `fixture${i}@example.test` }, req, id, boot.nonce, requestEvidence(boot.cookieSecret), res.wire);
      await res.done;
      expect(res.result.statusCode).toBe(i === 10 ? 429 : 202);
      if (i === 10) expect(h.nonce.validateBound('enroll_identifier', browserEvidence, boot.nonce, boot.cookieSecret).origin).toBe(origin);
    }
  });

  it('limits identifiers across IPs for fifteen minutes and rejects clock rollback', () => {
    const rates = new OtpRateLimiter(config.rateKey);
    for (let i = 0; i < 5; i += 1) expect(rates.allowStart(`192.0.2.${i}`, 'same@example.test', i)).toBe(true);
    expect(rates.allowStart('198.51.100.1', 'same@example.test', 899_999)).toBe(false);
    expect(rates.allowStart('198.51.100.2', 'same@example.test', 900_000)).toBe(true);
    expect(rates.allowStart('198.51.100.3', 'same@example.test', 900_000)).toBe(false);
    expect(rates.allowVerify('203.0.113.8', 100)).toBe(true);
    expect(rates.allowVerify('203.0.113.8', 101)).toBe(true);
    expect(rates.allowVerify('203.0.113.8', 100)).toBe(false);
  });

  it('refuses invalid store capacities instead of weakening the fixed upper bound', () => {
    for (const Constructor of [DevelopmentOtpCodeSink, InMemoryProofRepository, InMemoryOtpChallengeRepository]) {
      for (const capacity of [0, -1, 1.5, 10_001]) expect(() => new Constructor(capacity)).toThrow();
    }
  });
});
