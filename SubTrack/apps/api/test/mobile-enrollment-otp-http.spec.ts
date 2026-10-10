import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { appModuleFor } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { InMemoryIdempotencyGuard } from '../src/auth/idempotency/idempotency-guard.js';
import { MobileEnrollmentChallengeStore } from '../src/auth/proofs-v2/mobile-enrollment-challenge-store.js';
import { InMemoryOtpChallengeRepository, OtpProofProducer } from '../src/auth/proofs-v2/otp-proof-producer.js';
import { InMemoryProofRepository, ProofStore } from '../src/auth/proofs-v2/proof-store.js';
import { OtpRateLimiter } from '../src/auth/otp-v2/otp-http.js';
import { MobileEnrollmentOtpHttpModule } from '../src/auth/otp-v2/mobile-enrollment-otp-http.module.js';

const NOW = 1_800_000_000_000;
const sms = { channel: 'sms', identifier: '070-123 45 67', purpose: 'enroll_identifier', transport: 'mobile' };
type Wire = { status: number; headers: Record<string, string | string[] | undefined>; body: string };
let active: INestApplication, plain: INestApplication, disabled: INestApplication, production: INestApplication, defaultApp: INestApplication;
let certDir = '', ca: Buffer, cert: Buffer, privateKey: Buffer;
let activePort = 0, plainPort = 0, disabledPort = 0, productionPort = 0, defaultPort = 0, sequence = 0;
let challenges: MobileEnrollmentChallengeStore, idempotency: InMemoryIdempotencyGuard;
let producer: OtpProofProducer, proofStore: ProofStore;
let now = NOW;
function port(app: INestApplication): number {
  const value = app.getHttpServer().address();
  if (!value || typeof value !== 'object') throw new Error('Server did not bind');
  return value.port;
}
function send(options: { port?: number; path?: string; body?: string; headers?: Record<string, string | string[]>;
  key?: string; plain?: boolean; method?: string; omitLength?: boolean } = {}): Promise<Wire> {
  const body = options.body ?? JSON.stringify(sms);
  const method = options.method ?? 'POST';
  const request = options.plain ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const req = request({ hostname: 'localhost', family: 4, port: options.port ?? activePort,
      path: options.path ?? '/v2/auth/otp/start', method, ...(!options.plain ? { ca } : {}),
      headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json',
        ...(!options.omitLength ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
        'Idempotency-Key': options.key ?? `st210-tls-${++sequence}-idempotency-key` } : {}), ...options.headers } }, res => {
      let value = ''; res.setEncoding('utf8'); res.on('data', chunk => { value += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: value }));
    });
    req.on('error', reject); req.end(method === 'POST' ? body : undefined);
  });
}
function parse(wire: Wire): Record<string, unknown> { return JSON.parse(wire.body) as Record<string, unknown>; }
function verifyBody(challengeId: string, code: string): string { return JSON.stringify({ challengeId, code, transport: 'mobile' }); }

beforeAll(async () => {
  certDir = mkdtempSync(join(tmpdir(), 'subtrack-st210-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'key.pem'),
    '-out', join(certDir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  ca = readFileSync(join(certDir, 'cert.pem')); cert = ca; privateKey = readFileSync(join(certDir, 'key.pem'));
  const clock = () => now;
  const keys = { anonymousBindingKey: new Uint8Array(32).fill(11), otpKey: new Uint8Array(32).fill(12),
    rateKey: new Uint8Array(32).fill(13), idempotencyKey: new Uint8Array(32).fill(14),
    originKeys: [new Uint8Array(32).fill(15)], credentialKeys: [new Uint8Array(32).fill(16)] };
  challenges = new MobileEnrollmentChallengeStore(clock);
  idempotency = new InMemoryIdempotencyGuard({ key: keys.idempotencyKey, ttlMs: 86_400_000, clock });
  proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  producer = new OtpProofProducer(keys.otpKey, new InMemoryOtpChallengeRepository(), proofStore, clock);
  const ports = { challenges, idempotency, producer, rates: new OtpRateLimiter(keys.rateKey, clock) };
  const config = { environment: 'development', enabled: true, ...keys, clock, ports };
  active = await NestFactory.create(MobileEnrollmentOtpHttpModule.register(config),
    { httpsOptions: { cert, key: privateKey }, rawBody: true, logger: false });
  plain = await NestFactory.create(MobileEnrollmentOtpHttpModule.register(config), { rawBody: true, logger: false });
  disabled = await NestFactory.create(MobileEnrollmentOtpHttpModule.register({ environment: 'development', enabled: false }),
    { httpsOptions: { cert, key: privateKey }, logger: false });
  production = await NestFactory.create(MobileEnrollmentOtpHttpModule.register({ environment: 'production', enabled: true }),
    { httpsOptions: { cert, key: privateKey }, logger: false });
  @Module({ imports: [appModuleFor()] }) class DefaultFixture {}
  const module = await Test.createTestingModule({ imports: [DefaultFixture] })
    .overrideProvider(PrismaService).useValue({ $connect: async () => {}, $disconnect: async () => {} }).compile();
  defaultApp = module.createNestApplication({ httpsOptions: { cert, key: privateKey }, logger: false });
  for (const app of [active, plain, disabled, production, defaultApp]) await app.listen(0, '127.0.0.1');
  activePort = port(active); plainPort = port(plain); disabledPort = port(disabled);
  productionPort = port(production); defaultPort = port(defaultApp);
});
afterAll(async () => {
  for (const app of [active, plain, disabled, production, defaultApp]) if (app) await app.close();
  if (certDir) rmSync(certDir, { recursive: true, force: true });
});
afterEach(() => { vi.restoreAllMocks(); now += 900_001; });
function error(wire: Wire, status: number): void {
  expect(wire.status).toBe(status);
  expect(wire.headers['content-type']).toContain('application/problem+json');
  expect(wire.headers['cache-control']).toBe('no-store');
  expect(wire.headers.pragma).toBe('no-cache');
  expect(parse(wire)).toEqual({ type: 'about:blank', title: expect.any(String), status, code: 'AUTH_RESTART_REQUIRED' });
}
async function start(identifier = '070-123 45 67'): Promise<{ id: string; code: string }> {
  const result = await send({ body: JSON.stringify({ ...sms, identifier }) });
  expect(result.status).toBe(202);
  const id = parse(result).challengeId as string;
  const code = challenges.peekCodeForTest(id);
  expect(code).toMatch(/^\d{6}$/);
  return { id, code: code! };
}
function verify(id: string, code: string, key?: string): Promise<Wire> {
  return send({ path: '/v2/auth/otp/verify', body: verifyBody(id, code), ...(key === undefined ? {} : { key }) });
}
function drop(path: string, body: string, key: string) {
  const req = httpsRequest({ hostname: 'localhost', family: 4, port: activePort, path, method: 'POST', ca,
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)), 'Idempotency-Key': key } });
  req.on('error', () => { /* Deliberately lost TLS response. */ });
  req.end(body);
  return req;
}

describe('ST-210 real standalone HTTPS routes', () => {
  it('accepts exact SMS and email envelopes over TLS without exposing code', async () => {
    for (const body of [sms, { channel: 'email', identifier: '  A@EXAMPLE.COM  ', purpose: 'enroll_identifier', transport: 'mobile' }]) {
      const started = await send({ body: JSON.stringify(body) });
      expect(started.status).toBe(202);
      expect(started.headers['cache-control']).toBe('no-store');
      expect(started.headers.pragma).toBe('no-cache');
      expect(started.headers['set-cookie']).toBeUndefined();
      const envelope = parse(started);
      expect(envelope).toEqual({ challengeId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), status: 'accepted', nextBrowserNonce: null });
      const challengeId = envelope.challengeId as string, code = challenges.peekCodeForTest(challengeId)!;
      expect(started.body).not.toContain(code);
      const verified = await send({ path: '/v2/auth/otp/verify', body: verifyBody(challengeId, code) });
      expect(verified.status).toBe(200);
      expect(parse(verified)).toEqual({ purpose: 'enroll_identifier', proof: expect.stringMatching(/^v2\.[A-Za-z0-9_-]{43}$/), nextBrowserNonce: null });
      expect(verified.headers['cache-control']).toBe('no-store');
    }
  });

  it('accepts a valid reservation when the clock advances during either operation', async () => {
    const reserve = idempotency.reserve.bind(idempotency);
    const spy = vi.spyOn(idempotency, 'reserve');
    spy.mockImplementationOnce(input => { const result = reserve(input); now += 1; return result; });
    const { id, code } = await start('070-123 45 68');
    spy.mockImplementationOnce(input => { const result = reserve(input); now += 1; return result; });
    expect((await verify(id, code)).status).toBe(200);
  });

  it('rejects plaintext, proxy claims, browser/legacy headers, framing ambiguity and queries', async () => {
    const plaintext = await send({ port: plainPort, plain: true });
    expect(plaintext.status).toBe(400);
    const cases = [
      { headers: { 'X-Forwarded-Proto': 'https' } }, { headers: { Origin: 'https://example.com' } },
      { headers: { Cookie: 'st_v2_browser=fake' } }, { headers: { Authorization: 'Bearer fake' } },
      { headers: { 'X-Browser-Nonce': 'fake' } }, { headers: { 'X-Session-CSRF': 'fake' } },
      { headers: { 'X-User-Id': 'fake' } }, { headers: { 'Transfer-Encoding': 'chunked' }, omitLength: true },
      { headers: { 'Idempotency-Key': ['st210-duplicate-0001', 'st210-duplicate-0002'] } },
      { path: '/v2/auth/otp/start?purpose=enroll_identifier' },
      { body: JSON.stringify({ ...sms, transport: 'web' }) },
      { body: JSON.stringify({ ...sms, purpose: 'otp_step_up' }) },
      { body: JSON.stringify({ ...sms, extra: 'field' }) },
      { body: '{"channel":"sms","identifier":"070-123 45 67","purpose":"enroll_identifier","transport":"mobile","channel":"email"}' },
      { body: '{"channel":"sms","identifier":"070-123 45 67","purpose":"enroll_identifier","transport":"mobile","\\u0063hannel":"sms"}' },
    ];
    for (const candidate of cases) {
      const result = await send(candidate);
      expect(result.status).toBe(400);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['content-type']).toContain('application/problem+json');
      expect(result.body).not.toContain('challengeId');
    }
    const malformed = await send({ body: '{bad', path: '/v2/auth/otp/start?extra=1' });
    expect(malformed.status).toBe(400);
    expect(malformed.headers['cache-control']).toBe('no-store');
    expect(malformed.headers['content-type']).toContain('application/problem+json');
  });

  it('does not cross a web/mobile challenge boundary or replay a global key', async () => {
    const id = 'st210-reused-global-key-001';
    const first = await send({ key: id });
    expect(first.status).toBe(202);
    const repeated = await send({ key: id });
    expect(repeated.status).toBe(409);
    expect(repeated.body).not.toContain(parse(first).challengeId as string);
    const challengeId = parse(first).challengeId as string;
    const web = await send({ path: '/v2/auth/otp/verify', body: JSON.stringify({ challengeId,
      code: challenges.peekCodeForTest(challengeId), transport: 'web' }) });
    expect(web.status).toBe(400);
    const unknown = await send({ path: '/v2/auth/otp/verify', body: verifyBody('A'.repeat(43), '000000') });
    expect(unknown.status).toBe(409);
  });

  it('rejects duplicate verify members before touching the producer', async () => {
    const { id, code } = await start();
    const mutate = vi.spyOn(producer, 'verifyMobileEnrollment');
    for (const body of [
      `{"challengeId":"${id}","code":"${code}","transport":"mobile","code":"000000"}`,
      `{"challengeId":"${id}","code":"${code}","transport":"mobile","\\u0063ode":"${code}"}`,
      `{"challengeId":"${id}","code":"${code}","transport":"mobile","challengeId":"${'A'.repeat(43)}"}`,
    ]) error(await send({ path: '/v2/auth/otp/verify', body }), 400);
    expect(mutate).not.toHaveBeenCalled();
    expect((await verify(id, code)).status).toBe(200);
  });

  it('burns pending, completed and failed keys globally without replay over HTTPS', async () => {
    const original = producer.provisionMobileEnrollment.bind(producer);
    let release: (() => void) | undefined;
    vi.spyOn(producer, 'provisionMobileEnrollment').mockImplementationOnce(async input => {
      const value = await original(input);
      await new Promise<void>(resolve => { release = resolve; });
      return value;
    });
    const key = `st210-pending-${++sequence}-idempotency-key`;
    const pending = send({ key });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    error(await send({ key }), 409);
    release!();
    const completed = await pending;
    expect(completed.status).toBe(202);
    error(await send({ key }), 409);
    error(await verify(parse(completed).challengeId as string, '000000', key), 409);
    expect((await verify(parse(completed).challengeId as string,
      challenges.peekCodeForTest(parse(completed).challengeId as string)!)).status).toBe(200);
    const failedKey = `st210-failed-${++sequence}-idempotency-key`;
    vi.spyOn(producer, 'provisionMobileEnrollment').mockRejectedValueOnce(new Error('fault'));
    error(await send({ key: failedKey }), 500);
    error(await send({ key: failedKey }), 409);
  });

  it('burns four wrong verify requests and retires the fifth', async () => {
    const { id, code } = await start();
    const wrong = code === '000000' ? '999999' : '000000';
    for (let attempt = 1; attempt <= 5; attempt++) {
      const key = `st210-wrong-${++sequence}-idempotency-key`;
      error(await verify(id, wrong, key), 401);
      error(await verify(id, wrong, key), 409);
      expect(challenges.lookup(id) !== null).toBe(attempt < 5);
    }
    error(await verify(id, code), 409);
  });

  it('allows one concurrent correct proof and binds it to enrollment', async () => {
    const { id, code } = await start();
    const metadata = challenges.lookup(id)!;
    const results = await Promise.all([verify(id, code), verify(id, code)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const proof = parse(results.find(result => result.status === 200)!).proof as string;
    expect(proof).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(await proofStore.consumeLogin(proof, { transport: 'mobile' })).toEqual({ valid: false });
    expect(await proofStore.consume(proof, { purpose: 'account-delete', challenge: id,
      transport: 'mobile', identityId: 'a', sessionId: 'b', identifierHash: metadata.identifierHash })).toEqual({ valid: false });
    expect(await proofStore.consume(proof, { purpose: 'enrollment', challenge: id,
      transport: 'mobile', identifierHash: metadata.identifierHash })).toEqual({ valid: true });
  });

  it('suppresses start disclosure after reserve, slot, producer, settlement and publication faults', async () => {
    const cases = [
      () => vi.spyOn(idempotency, 'reserve').mockImplementationOnce(() => { throw new Error('AUTH_RESTART_REQUIRED'); }),
      () => vi.spyOn(challenges, 'reserve').mockImplementationOnce(() => { throw new Error('capacity'); }),
      () => vi.spyOn(producer, 'provisionMobileEnrollment').mockRejectedValueOnce(new Error('producer')),
      () => vi.spyOn(idempotency, 'settle').mockImplementationOnce(() => { throw new Error('settlement'); }),
      () => vi.spyOn(challenges, 'publish').mockImplementationOnce(() => { throw new Error('publication'); }),
    ];
    for (const [index, inject] of cases.entries()) {
      now += 60_001;
      inject();
      const key = `st210-start-fault-${++sequence}-idempotency-key`;
      const body = JSON.stringify({ ...sms, identifier: `070-123 45 ${10 + index}` });
      error(await send({ key, body }), index === 0 ? 409 : 500);
      if (index > 0) error(await send({ key, body }), 409);
    }
  });

  it('suppresses verify disclosure after reserve, producer, settlement and cleanup faults', async () => {
    const reserve = await start('070-123 45 20');
    vi.spyOn(idempotency, 'reserve').mockImplementationOnce(() => { throw new Error('AUTH_RESTART_REQUIRED'); });
    const reserveKey = `st210-verify-reserve-${++sequence}-key`;
    error(await verify(reserve.id, reserve.code, reserveKey), 409);
    expect((await verify(reserve.id, reserve.code, reserveKey)).status).toBe(200);
    const failures = [
      () => vi.spyOn(producer, 'verifyMobileEnrollment').mockRejectedValueOnce(new Error('ambiguous')),
      () => vi.spyOn(idempotency, 'settle').mockImplementationOnce(() => { throw new Error('settlement'); }),
      () => vi.spyOn(challenges, 'retire').mockImplementation(() => { throw new Error('cleanup'); }),
    ];
    for (const [index, inject] of failures.entries()) {
      const { id, code } = await start(`070-123 45 ${21 + index}`);
      inject();
      const key = `st210-verify-fault-${++sequence}-key`;
      error(await verify(id, code, key), 500);
      error(await verify(id, code, key), 409);
      expect(challenges.lookup(id)).toBeNull();
      vi.restoreAllMocks();
    }
  });

  it('enforces expiry, rate limits, clock regression and overflow at the HTTPS boundary', async () => {
    const { id } = await start('070-123 45 30');
    const base = now;
    now += 300_000;
    error(await verify(id, '000000'), 409);
    for (let i = 0; i < 5; i++) expect((await send({ body: JSON.stringify({ ...sms, identifier: '070-123 45 31' }) })).status).toBe(202);
    error(await send({ body: JSON.stringify({ ...sms, identifier: '070-123 45 31' }) }), 429);
    now = base - 1;
    error(await send({ body: JSON.stringify({ ...sms, identifier: '070-123 45 32' }) }), 500);
    now = Number.MAX_SAFE_INTEGER;
    error(await send({ body: JSON.stringify({ ...sms, identifier: '070-123 45 33' }) }), 500);
    now = base + 900_001;
  });

  it('reserves one bounded store slot before either concurrent producer mutation', async () => {
    const clock = () => now;
    const keys = { anonymousBindingKey: new Uint8Array(32).fill(31), otpKey: new Uint8Array(32).fill(32),
      rateKey: new Uint8Array(32).fill(33), idempotencyKey: new Uint8Array(32).fill(34),
      originKeys: [new Uint8Array(32).fill(35)], credentialKeys: [new Uint8Array(32).fill(36)] };
    const bounded = new MobileEnrollmentChallengeStore(clock, 1);
    const boundedProducer = new OtpProofProducer(keys.otpKey, new InMemoryOtpChallengeRepository(),
      new ProofStore(new InMemoryProofRepository(), clock), clock);
    const mutation = vi.spyOn(boundedProducer, 'provisionMobileEnrollment');
    const app = await NestFactory.create(MobileEnrollmentOtpHttpModule.register({ environment: 'development', enabled: true,
      ...keys, clock, ports: { challenges: bounded, producer: boundedProducer,
        idempotency: new InMemoryIdempotencyGuard({ key: keys.idempotencyKey, ttlMs: 86_400_000, clock }),
        rates: new OtpRateLimiter(keys.rateKey, clock) } }), { httpsOptions: { cert, key: privateKey }, rawBody: true, logger: false });
    await app.listen(0, '127.0.0.1');
    try {
      const results = await Promise.all([send({ port: port(app) }), send({ port: port(app) })]);
      expect(results.map(result => result.status).sort()).toEqual([202, 500]);
      error(results.find(result => result.status === 500)!, 500);
      expect(mutation).toHaveBeenCalledTimes(1);
      const id = parse(results.find(result => result.status === 202)!).challengeId as string;
      expect((await send({ port: port(app), path: '/v2/auth/otp/verify', body: verifyBody(id, bounded.peekCodeForTest(id)!) })).status).toBe(200);
      expect((await send({ port: port(app) })).status).toBe(202);
    } finally { await app.close(); }
  });

  it('burns the key and one-use challenge when a TLS response is lost', async () => {
    const originalStart = producer.provisionMobileEnrollment.bind(producer);
    let releaseStart: (() => void) | undefined;
    let issuedId = '';
    vi.spyOn(producer, 'provisionMobileEnrollment').mockImplementationOnce(async input => {
      const value = await originalStart(input);
      issuedId = value.issuance.challengeId;
      await new Promise<void>(resolve => { releaseStart = resolve; });
      return value;
    });
    const startKey = `st210-lost-start-${++sequence}-key`;
    const startSocket = drop('/v2/auth/otp/start', JSON.stringify(sms), startKey);
    await vi.waitFor(() => expect(releaseStart).toBeTypeOf('function'));
    startSocket.destroy(); releaseStart!();
    await vi.waitFor(() => expect(challenges.peekCodeForTest(issuedId)).toMatch(/^\d{6}$/));
    error(await send({ key: startKey }), 409);
    const code = challenges.peekCodeForTest(issuedId)!;
    const originalVerify = producer.verifyMobileEnrollment.bind(producer);
    let releaseVerify: (() => void) | undefined;
    vi.spyOn(producer, 'verifyMobileEnrollment').mockImplementationOnce(async input => {
      const value = await originalVerify(input);
      await new Promise<void>(resolve => { releaseVerify = resolve; });
      return value;
    });
    const verifyKey = `st210-lost-verify-${++sequence}-key`;
    const verifySocket = drop('/v2/auth/otp/verify', verifyBody(issuedId, code), verifyKey);
    await vi.waitFor(() => expect(releaseVerify).toBeTypeOf('function'));
    verifySocket.destroy(); releaseVerify!();
    await vi.waitFor(() => expect(idempotency.snapshot().at(-1)?.state).toBe('completed'));
    expect(challenges.lookup(issuedId)).toBeNull();
    error(await verify(issuedId, code, verifyKey), 409);
  });

  it('excludes routes from disabled, production and default graphs', async () => {
    for (const value of [disabledPort, productionPort]) {
      const start = await send({ port: value });
      const verify = await send({ port: value, path: '/v2/auth/otp/verify', body: verifyBody('A'.repeat(43), '000000') });
      for (const response of [start, verify]) {
        expect(response.status).toBe(404);
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers.pragma).toBe('no-cache');
        expect(parse(response)).toEqual({ type: 'about:blank', title: 'Not Found', status: 404, code: 'AUTH_RESTART_REQUIRED' });
      }
    }
    expect((await send({ port: defaultPort })).status).toBe(404);
    expect((await send({ port: defaultPort, path: '/v2/auth/otp/verify', body: verifyBody('A'.repeat(43), '000000') })).status).toBe(404);
  });
});
