import { createHash } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard.js';
import { MobileEnrollmentChallengeStore } from '../proofs-v2/mobile-enrollment-challenge-store.js';
import { InMemoryOtpChallengeRepository, OtpProofProducer } from '../proofs-v2/otp-proof-producer.js';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store.js';
import { OtpRateLimiter } from './otp-http.js';
import { DevelopmentMobileEnrollmentOtpHttpService, copySeparatedBindingKey, type MobileEnrollmentOtpHttpConfig } from './mobile-enrollment-otp-http.js';

const NOW = 1_800_000_000_000;
const TTL = 300_000;
let sequence = 0;
const startBody = (identifier = '070-123 45 67', channel: 'sms' | 'email' = 'sms') =>
  ({ channel, identifier, purpose: 'enroll_identifier', transport: 'mobile' });
function request(path: string, body: object, key = `st210-unit-${++sequence}-idempotency-key`): Request {
  const socket = Object.create(TLSSocket.prototype) as TLSSocket;
  Object.defineProperties(socket, { encrypted: { value: true }, remoteAddress: { value: '127.0.0.1' } });
  const content = JSON.stringify(body);
  return { originalUrl: path, socket, secure: true, rawBody: Buffer.from(content),
    headers: { 'content-length': String(Buffer.byteLength(content)) },
    rawHeaders: ['Host', 'localhost', 'Content-Type', 'application/json', 'Content-Length', String(Buffer.byteLength(content)), 'Idempotency-Key', key] } as unknown as Request;
}
function response(throwOnSend = false): Response & { statusCode: number; payload: unknown; headers: Record<string, string> } {
  const result = { statusCode: 0, payload: undefined as unknown, headers: {} as Record<string, string>, headersSent: false,
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; return this; },
    status(value: number) { this.statusCode = value; return this; }, type(value: string) { this.headers['content-type'] = value; return this; },
    send(value: unknown) { if (throwOnSend) throw new Error('broken response'); this.payload = value; this.headersSent = true; return this; } };
  return result as unknown as Response & typeof result;
}
function fixture(capacity = 10_000) {
  let now = NOW;
  const clock = () => now;
  const keys = { anonymousBindingKey: new Uint8Array(32).fill(1), otpKey: new Uint8Array(32).fill(2),
    rateKey: new Uint8Array(32).fill(3), idempotencyKey: new Uint8Array(32).fill(4),
    originKeys: [new Uint8Array(32).fill(5)], credentialKeys: [new Uint8Array(32).fill(6)] };
  const config: MobileEnrollmentOtpHttpConfig = { environment: 'development', enabled: true, ...keys, clock };
  const challenges = new MobileEnrollmentChallengeStore(clock, capacity);
  const idempotency = new InMemoryIdempotencyGuard({ key: keys.idempotencyKey, ttlMs: 86_400_000, clock });
  const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  const producer = new OtpProofProducer(keys.otpKey, new InMemoryOtpChallengeRepository(), proofStore, clock);
  const rates = new OtpRateLimiter(keys.rateKey, clock);
  const service = new DevelopmentMobileEnrollmentOtpHttpService(config, { challenges, idempotency, producer, rates });
  const start = async (body = startBody(), key?: string, broken = false) => {
    const res = response(broken); await service.start(body, request('/v2/auth/otp/start', body, key), res); return res;
  };
  const verify = async (challengeId: string, code: string, key?: string) => {
    const body = { challengeId, code, transport: 'mobile' };
    const res = response(); await service.verify(body, request('/v2/auth/otp/verify', body, key), res); return res;
  };
  return { config, challenges, idempotency, proofStore, producer, rates, service, start, verify,
    setNow(value: number) { now = value; } };
}
function accepted(value: unknown): { challengeId: string } { return value as { challengeId: string }; }

describe('standalone mobile enrollment OTP transitions', () => {
  it('requires a copied, distinct binding key and development opt-in', () => {
    const f = fixture(); const copy = copySeparatedBindingKey(f.config);
    f.config.anonymousBindingKey.fill(8);
    expect(copy).toEqual(Buffer.alloc(32, 1));
    for (const candidate of [f.config.otpKey, f.config.rateKey, f.config.idempotencyKey,
      ...f.config.originKeys, ...f.config.credentialKeys]) {
      expect(() => copySeparatedBindingKey({ ...f.config, anonymousBindingKey: candidate })).toThrow();
    }
    expect(() => new DevelopmentMobileEnrollmentOtpHttpService({ ...f.config, environment: 'production' },
      { challenges: f.challenges, producer: f.producer, idempotency: f.idempotency, rates: f.rates })).toThrow();
  });

  it('normalizes SMS and email, publishes exact envelopes, and issues enrollment-only proof', async () => {
    for (const [channel, identifier, normalized] of [
      ['sms', '070-123 45 67', '+46701234567'], ['email', '  A@EXAMPLE.COM  ', 'A@example.com'],
    ] as const) {
      const f = fixture();
      const begun = await f.start(startBody(identifier, channel));
      expect(begun.statusCode).toBe(202);
      expect(begun.payload).toEqual({ challengeId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), status: 'accepted', nextBrowserNonce: null });
      const challengeId = accepted(begun.payload).challengeId;
      const row = f.challenges.lookup(challengeId)!;
      expect(row.identifierHash).toBe(createHash('sha256').update(normalized).digest('hex'));
      expect(row.channel).toBe(channel);
      const code = f.challenges.peekCodeForTest(challengeId)!;
      const result = await f.verify(challengeId, code);
      expect(result.statusCode).toBe(200);
      const payload = result.payload as { proof: string };
      expect(payload).toEqual({ purpose: 'enroll_identifier', proof: expect.stringMatching(/^v2\.[A-Za-z0-9_-]{43}$/), nextBrowserNonce: null });
      expect(f.challenges.lookup(challengeId)).toBeNull();
      expect(await f.proofStore.consumeLogin(payload.proof, { transport: 'mobile' })).toEqual({ valid: false });
      expect(await f.proofStore.consume(payload.proof, { purpose: 'account-delete', challenge: challengeId,
        transport: 'mobile', identityId: 'a', sessionId: 'b', identifierHash: row.identifierHash })).toEqual({ valid: false });
      expect(await f.proofStore.consume(payload.proof, { purpose: 'enrollment', challenge: challengeId,
        transport: 'mobile', identifierHash: row.identifierHash })).toEqual({ valid: true });
    }
  });

  it('burns pending, completed and failed keys globally without replay', async () => {
    const f = fixture(); const key = 'st210-one-global-key-0001';
    const first = await f.start(startBody(), key);
    expect((await f.start(startBody('a@example.com', 'email'), key)).statusCode).toBe(409);
    const challengeId = accepted(first.payload).challengeId;
    const code = f.challenges.peekCodeForTest(challengeId)!;
    expect((await f.verify(challengeId, code, key)).statusCode).toBe(409);
    vi.spyOn(f.producer, 'provisionMobileEnrollment').mockRejectedValueOnce(new Error('fault'));
    const failedKey = 'st210-failed-global-key-0002';
    expect((await f.start(startBody(), failedKey)).statusCode).toBe(500);
    expect((await f.start(startBody(), failedKey)).statusCode).toBe(409);
    expect(f.idempotency.snapshot().map(row => row.state)).toContain('failed');
  });

  it('reserves idempotency and capacity before producer mutation, and hides all start faults', async () => {
    const f = fixture(1);
    const mutate = vi.spyOn(f.producer, 'provisionMobileEnrollment');
    vi.spyOn(f.idempotency, 'reserve').mockImplementationOnce(() => { throw new Error('AUTH_RESTART_REQUIRED'); });
    expect((await f.start()).statusCode).toBe(409);
    expect(mutate).not.toHaveBeenCalled();
    expect((await f.start()).statusCode).toBe(202);
    expect((await f.start()).statusCode).toBe(500);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(f.idempotency.snapshot().at(-1)?.state).toBe('failed');
    f.setNow(NOW + TTL + 1);
    vi.spyOn(f.producer, 'provisionMobileEnrollment').mockRejectedValueOnce(new Error('producer'));
    expect((await f.start()).statusCode).toBe(500);
    const failedSettle = vi.spyOn(f.idempotency, 'settle').mockImplementationOnce(() => { throw new Error('settle'); });
    expect((await f.start()).statusCode).toBe(500);
    expect(failedSettle.mock.calls.at(-1)?.[2]).toBe('completed');
    f.setNow(NOW + 900_001);
    const publish = vi.spyOn(f.challenges, 'publish').mockImplementationOnce(() => { throw new Error('publish'); });
    expect((await f.start()).statusCode).toBe(500);
    expect(publish).toHaveBeenCalledTimes(1);
    const responseFailure = await f.start(startBody(), undefined, true);
    expect(responseFailure.payload).toBeUndefined();
    expect(f.idempotency.snapshot().at(-1)?.state).toBe('completed');
  });

  it('uses four fresh-key wrong attempts then retires the terminal fifth', async () => {
    const f = fixture(); const begun = await f.start(); const id = accepted(begun.payload).challengeId;
    const code = f.challenges.peekCodeForTest(id)!;
    const wrong = code === '000000' ? '999999' : '000000';
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect((await f.verify(id, wrong)).statusCode).toBe(401);
      expect(f.challenges.lookup(id)).not.toBeNull();
    }
    expect((await f.verify(id, wrong)).statusCode).toBe(401);
    expect(f.challenges.lookup(id)).toBeNull();
    expect((await f.verify(id, code)).statusCode).toBe(409);
  });

  it('allows at most one concurrent correct proof and retires ambiguous/cleanup faults', async () => {
    const f = fixture(); const begun = await f.start(); const id = accepted(begun.payload).challengeId;
    const code = f.challenges.peekCodeForTest(id)!;
    const results = await Promise.all([f.verify(id, code), f.verify(id, code)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const second = accepted((await f.start()).payload).challengeId;
    vi.spyOn(f.producer, 'verifyMobileEnrollment').mockRejectedValueOnce(new Error('ambiguous'));
    expect((await f.verify(second, f.challenges.peekCodeForTest(second)!)).statusCode).toBe(500);
    expect(f.challenges.lookup(second)).toBeNull();
    const third = accepted((await f.start()).payload).challengeId;
    vi.spyOn(f.challenges, 'retire').mockImplementationOnce(() => { throw new Error('cleanup'); });
    expect((await f.verify(third, f.challenges.peekCodeForTest(third)!)).statusCode).toBe(500);
    expect(f.challenges.lookup(third)).toBeNull();
  });

  it('fails closed for expiry, clock regression and overflow', async () => {
    const f = fixture(); const begun = await f.start(); const id = accepted(begun.payload).challengeId;
    f.setNow(NOW + TTL);
    expect((await f.verify(id, '000000')).statusCode).toBe(409);
    f.setNow(NOW - 1);
    expect((await f.start()).statusCode).toBe(500);
    f.setNow(Number.MAX_SAFE_INTEGER);
    expect((await f.start()).statusCode).toBe(500);
  });
});
