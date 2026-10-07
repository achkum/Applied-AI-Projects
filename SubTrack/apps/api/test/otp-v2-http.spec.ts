import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { request as plainHttpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appModuleFor } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { validateConfig } from '../src/config';
import { v2BrowserContextMiddleware, v2NoStoreMiddleware } from '../src/auth/http/v2-browser-context';
import { BrowserNonceHttpService } from '../src/auth/browser-nonce/browser-nonce-http';
import type { BrowserNonceGuard } from '../src/auth/browser-nonce/browser-nonce';
import { OtpHttpService, OtpRateLimiter, type DevelopmentOtpCodeSink } from '../src/auth/otp-v2/otp-http';
import { PrismaService } from '../src/database/prisma.service';
import type { ProofBinding } from '../src/auth/proofs-v2/proof-store';

const cookieName = 'st_v2_browser';
const origin = 'https://localhost';
const env = {
  NODE_ENV: 'development', DATABASE_URL: 'postgresql://api:local@localhost:5432/subtrack',
  AUTH_V2_ENABLED: 'true', AUTH_V2_BROWSER_NONCE_ENABLED: 'true', AUTH_V2_OTP_HTTP_ENABLED: 'true',
  AUTH_V2_IDEMPOTENCY_KEY: 'ab'.repeat(32), AUTH_V2_BROWSER_ORIGIN_HMAC_KEY: 'cd'.repeat(32),
  AUTH_V2_OTP_HMAC_KEY: 'ef'.repeat(32), AUTH_V2_RATE_LIMIT_HMAC_KEY: '12'.repeat(32),
  AUTH_V2_ALLOWED_ORIGINS: JSON.stringify([origin]), AUTH_V2_BINDING_COOKIE_NAME: cookieName,
  AUTH_V2_BINDING_COOKIE_PATH: '/v2/auth',
};
type WireResponse = { status: number; headers: IncomingMessage['headers']; body: string };
function send(port: number, path: string, body: unknown, headers: Record<string, string | string[]> = {}): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: 'localhost', family: 4, port, path, method: 'POST', rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers } }, (res: IncomingMessage) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: responseBody }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
function checkCache(res: WireResponse): void {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.pragma).toBe('no-cache');
}
function json(res: WireResponse): Record<string, unknown> { return JSON.parse(res.body) as Record<string, unknown>; }

let app: INestApplication;
let port = 0;
let certDir = '';
const prismaStub = { $connect: async () => undefined, $disconnect: async () => undefined };
async function createApp(config: ReturnType<typeof validateConfig>, tls?: { key: Buffer; cert: Buffer }): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [appModuleFor(config)] })
    .overrideProvider(PrismaService).useValue(prismaStub).compile();
  const instance = module.createNestApplication(tls ? { httpsOptions: tls, logger: false } : { logger: false });
  instance.use(v2NoStoreMiddleware);
  if (config.AUTH_V2_ENABLED) instance.use('/v2', v2BrowserContextMiddleware({ allowedOrigins: config.AUTH_V2_ALLOWED_ORIGINS,
    bindingCookieName: config.AUTH_V2_BINDING_COOKIE_NAME!, allowLoopbackHttpDevelopment: config.AUTH_V2_ALLOW_LOOPBACK_HTTP }));
  instance.useGlobalFilters(new ProblemDetailsFilter());
  return instance;
}
async function bootstrap(purpose: 'enroll_identifier' | 'otp_step_up' = 'enroll_identifier') {
  const res = await send(port, '/v2/auth/browser-nonce', { purpose }, { 'Idempotency-Key': `bootstrap-${crypto.randomUUID()}` });
  expect(res.status, res.body).toBe(200);
  const cookie = res.headers['set-cookie']?.[0]?.split(';', 1)[0];
  expect(cookie).toMatch(new RegExp(`^${cookieName}=[A-Za-z0-9_-]{43}$`));
  return { nonce: json(res).nonce as string, cookie: cookie! };
}
function startHeaders(state: { nonce: string; cookie: string }, key = `start-${crypto.randomUUID()}`) {
  return { Cookie: state.cookie, 'X-Browser-Nonce': state.nonce, 'Idempotency-Key': key };
}
function verifyHeaders(state: { nonce: string; cookie: string }, key = `verify-${crypto.randomUUID()}`) {
  return { Cookie: state.cookie, 'X-Browser-Nonce': state.nonce, 'Idempotency-Key': key };
}
async function startOtp(state: { nonce: string; cookie: string }, purpose: 'enroll_identifier' | 'otp_step_up' = 'enroll_identifier') {
  const res = await send(port, '/v2/auth/otp/start', { channel: 'email', identifier: ' User@example.com ', purpose, transport: 'web' }, startHeaders(state));
  expect(res.status, res.body).toBe(202);
  expect(Object.keys(json(res)).sort()).toEqual(['challengeId', 'nextBrowserNonce', 'status']);
  checkCache(res);
  return { challengeId: json(res).challengeId as string, nonce: json(res).nextBrowserNonce as string };
}
function sink(): DevelopmentOtpCodeSink {
  const service = app.get(OtpHttpService) as unknown as { sink: DevelopmentOtpCodeSink };
  return service.sink;
}

beforeAll(async () => {
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-otp-wire-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const tls = { key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) };
  app = await createApp(validateConfig(env), tls);
  await app.listen(0, '127.0.0.1');
  port = (app.getHttpServer().address() as { port: number }).port;
});
afterAll(async () => { await app?.close(); if (certDir) rmSync(certDir, { recursive: true, force: true }); });

describe('registered development web OTP HTTP bridge', () => {
  it('runs bootstrap, start, and verify over HTTPS and returns one-use restricted proofs bound to the browser chain', async () => {
    for (const purpose of ['enroll_identifier', 'otp_step_up'] as const) {
      const state = await bootstrap(purpose);
      const started = await startOtp(state, purpose);
      const code = sink().peek(started.challengeId, Date.now());
      expect(code).not.toBeNull();
      expect(code?.purpose).toBe(purpose);
      expect(code?.origin).toBe(origin);
      const verified = await send(port, '/v2/auth/otp/verify', { challengeId: started.challengeId, code: code!.code, transport: 'web' }, verifyHeaders({ cookie: state.cookie, nonce: started.nonce }));
      expect(verified.status, verified.body).toBe(200);
      expect(Object.keys(json(verified)).sort()).toEqual(['nextBrowserNonce', 'proof', 'purpose']);
      expect(json(verified).purpose).toBe(purpose);
      expect(json(verified).proof).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
      expect(json(verified)).not.toHaveProperty('identityId');
      expect(json(verified)).not.toHaveProperty('session');
      expect(sink().peek(started.challengeId, Date.now())).toBeNull();
      checkCache(verified);
      const replayState = { cookie: state.cookie, nonce: started.nonce };
      const replay = await send(port, '/v2/auth/otp/verify', { challengeId: started.challengeId, code: code!.code, transport: 'web' }, verifyHeaders(replayState));
      expect(replay.status).toBe(409);
      checkCache(replay);
    }
  });

  it('rejects wrong codes, mismatched chains, duplicate or missing evidence, extra fields, and mobile transport without exposing secrets', async () => {
    const state = await bootstrap();
    const started = await startOtp(state);
    const code = sink().peek(started.challengeId, Date.now())!.code;
    const wrong = await send(port, '/v2/auth/otp/verify', { challengeId: started.challengeId, code: code === '000000' ? '000001' : '000000', transport: 'web' }, verifyHeaders({ cookie: state.cookie, nonce: started.nonce }));
    expect(wrong.status).toBe(401); expect(wrong.body).not.toContain(code); checkCache(wrong);

    const fresh = await bootstrap();
    const mismatch = await send(port, '/v2/auth/otp/verify', { challengeId: started.challengeId, code, transport: 'web' }, verifyHeaders(fresh));
    expect(mismatch.status).toBe(409); expect(mismatch.body).not.toContain(started.challengeId); checkCache(mismatch);
    const invalids = [
      send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'mobile' }, startHeaders(fresh)),
      send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web', extra: true }, startHeaders(fresh)),
      send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, { Cookie: fresh.cookie, 'Idempotency-Key': crypto.randomUUID() }),
      send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, { ...startHeaders(fresh), 'X-Browser-Nonce': [fresh.nonce, fresh.nonce] }),
    ];
    for (const promise of invalids) { const response = await promise; expect(response.status).toBe(400); checkCache(response); }
    expect(wrong.body).not.toContain('User@example.com');
  });

  it('rejects duplicate Origin, cookie, and idempotency headers and never replays a completed start', async () => {
    const state = await bootstrap();
    const dupOrigin = await send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, { ...startHeaders(state), Origin: [origin, origin] });
    expect(dupOrigin.status).toBe(400); checkCache(dupOrigin);
    const dupCookie = await send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, { ...startHeaders(state), Cookie: `${state.cookie}; ${state.cookie}` });
    expect(dupCookie.status).toBe(400); checkCache(dupCookie);
    const dupKey = await send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, { ...startHeaders(state), 'Idempotency-Key': [crypto.randomUUID(), crypto.randomUUID()] });
    expect(dupKey.status).toBe(400); checkCache(dupKey);
    const key = 'otp-completed-key-0000001';
    const first = await send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, startHeaders(state, key));
    expect(first.status).toBe(202);
    const replay = await send(port, '/v2/auth/otp/start', { channel: 'email', identifier: 'a@b.test', purpose: 'enroll_identifier', transport: 'web' }, startHeaders(state, key));
    expect(replay.status).toBe(409); expect(replay.body).not.toContain(json(first).challengeId as string); checkCache(replay);
  });

  it('binds the returned proof to purpose, challenge, web origin, and chain, and consumes it once', async () => {
    const state = await bootstrap('otp_step_up');
    const started = await startOtp(state, 'otp_step_up');
    const code = sink().peek(started.challengeId, Date.now())!.code;
    const nonceService = app.get(BrowserNonceHttpService) as unknown as { nonce: BrowserNonceGuard };
    const bindingCookie = state.cookie.split('=')[1]!;
    const chainId = nonceService.nonce.validateBound('otp_step_up', { origin, isHttps: true, explicitLoopbackDevelopment: false }, started.nonce, bindingCookie).chainId;
    const verified = await send(port, '/v2/auth/otp/verify', { challengeId: started.challengeId, code, transport: 'web' }, verifyHeaders({ cookie: state.cookie, nonce: started.nonce }));
    const body = json(verified);
    const proofRepo = (app.get(OtpHttpService) as unknown as { producer: { proofStore: { repository: { compareAndConsume(hash: string, binding: ProofBinding, now: number): boolean } } } });
    const proof = body.proof as string;
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update('subtrack:auth-proof:v2:').update(proof).digest('hex');
    const correct: ProofBinding = { purpose: 'stepup', challenge: started.challengeId, transport: 'web', identifierHash: createHash('sha256').update('User@example.com').digest('hex'), exactOrigin: origin, browserChainId: chainId };
    const wrongPurpose = { ...correct, purpose: 'enrollment' as const };
    expect(proofRepo.producer.proofStore.repository.compareAndConsume(hash, wrongPurpose, Date.now())).toBe(false);
    expect(proofRepo.producer.proofStore.repository.compareAndConsume(hash, { ...correct, exactOrigin: 'https://elsewhere.test' }, Date.now())).toBe(false);
    expect(proofRepo.producer.proofStore.repository.compareAndConsume(hash, correct, Date.now())).toBe(true);
    expect(proofRepo.producer.proofStore.repository.compareAndConsume(hash, correct, Date.now())).toBe(false);
  });

  it('maps SMS to the shared phone normalizer before binding the issued proof', async () => {
    const state = await bootstrap();
    const startedResponse = await send(port, '/v2/auth/otp/start', { channel: 'sms', identifier: '070 123 45 67', purpose: 'enroll_identifier', transport: 'web' }, startHeaders(state));
    expect(startedResponse.status).toBe(202);
    const started = { challengeId: json(startedResponse).challengeId as string, nonce: json(startedResponse).nextBrowserNonce as string };
    const code = sink().peek(started.challengeId, Date.now())!.code;
    const verified = await send(port, '/v2/auth/otp/verify', { challengeId: started.challengeId, code, transport: 'web' }, verifyHeaders({ cookie: state.cookie, nonce: started.nonce }));
    expect(verified.status).toBe(200);
    const proofRepo = app.get(OtpHttpService) as unknown as { producer: { proofStore: { repository: { compareAndConsume(hash: string, binding: ProofBinding, now: number): boolean } } } };
    const proofHash = createHash('sha256').update('subtrack:auth-proof:v2:').update(json(verified).proof as string).digest('hex');
    const normalized: ProofBinding = { purpose: 'enrollment', challenge: started.challengeId, transport: 'web', identifierHash: createHash('sha256').update('+46701234567').digest('hex'), exactOrigin: origin,
      browserChainId: (app.get(BrowserNonceHttpService) as unknown as { nonce: BrowserNonceGuard }).nonce.validateBound('enroll_identifier', { origin, isHttps: true, explicitLoopbackDevelopment: false }, json(verified).nextBrowserNonce as string, state.cookie.split('=')[1]!).chainId };
    expect(proofRepo.producer.proofStore.repository.compareAndConsume(proofHash, normalized, Date.now())).toBe(true);
  });

  it('keeps OTP routes absent by default and rejects enabled production/test configurations', async () => {
    const disabled = await createApp(validateConfig({ DATABASE_URL: env.DATABASE_URL }));
    await disabled.listen(0, '127.0.0.1');
    try {
      const disabledPort = (disabled.getHttpServer().address() as { port: number }).port;
      const response = await new Promise<WireResponse>((resolve, reject) => {
        const req = plainHttpRequest({ hostname: '127.0.0.1', port: disabledPort, path: '/v2/auth/otp/start', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res: IncomingMessage) => {
          let responseBody = ''; res.setEncoding('utf8'); res.on('data', (chunk: string) => { responseBody += chunk; });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: responseBody }));
        });
        req.on('error', reject); req.end('{}');
      });
      expect(response.status).toBe(404); checkCache(response);
    } finally { await disabled.close(); }
    expect(() => validateConfig({ ...env, NODE_ENV: 'test' })).toThrow(/AUTH_V2/);
    expect(() => validateConfig({ ...env, NODE_ENV: 'production' })).toThrow(/AUTH_V2/);
  });
});

describe('OTP sliding rate limiter', () => {
  it('enforces a sliding 60-request verify window and releases the bucket on expiry', () => {
    const limiter = new OtpRateLimiter(Buffer.alloc(32, 3));
    for (let i = 0; i < 60; i += 1) expect(limiter.allowVerify('127.0.0.1', i)).toBe(true);
    expect(limiter.allowVerify('127.0.0.1', 59)).toBe(false);
    expect(limiter.allowVerify('127.0.0.1', 60_000)).toBe(true);
    expect(limiter.allowVerify('127.0.0.1', 60_000)).toBe(false);
    expect(limiter.allowVerify('127.0.0.1', 60_001)).toBe(true);
  });

  it('fails closed at 10,000 active buckets and prunes expired buckets before capacity checks', () => {
    const limiter = new OtpRateLimiter(Buffer.alloc(32, 4));
    for (let i = 0; i < 10_000; i += 1) expect(limiter.allowVerify(`192.0.2.${i}`, 0)).toBe(true);
    expect(limiter.allowVerify('198.51.100.1', 0)).toBe(false);
    expect(limiter.allowVerify('198.51.100.1', 60_000)).toBe(true);
  });
});
