import { describe, expect, it, vi } from 'vitest';
import { TLSSocket } from 'node:tls';
import type { Request, Response } from 'express';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { hashBrowserBindingCookie } from '../auth/sessions-v2/v2-web-session-binding.js';
import { BrowserSubscriptionLifecycleHttpService } from './browser-subscription-lifecycle.http.js';
import { BrowserSubscriptionLifecycleHttpController } from './browser-subscription-lifecycle.http.js';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service.js';
import type { SubscriptionLifecycleRepository } from './subscription-lifecycle.repository.js';
import { getNextSubscriptionStatus, type SubscriptionLifecycleStatus, type SubscriptionLifecycleAction } from '@subtrack/domain/subscription-lifecycle';
import type { BrowserSubscriptionLifecycleHttpConfig } from './browser-subscription-lifecycle.http.js';

const ID = '11111111-1111-4111-8111-111111111111';
const SID = '22222222-2222-4222-8222-222222222222';
const FAMILY = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';
const ORIGIN = 'https://subtrack.example';
const ACCESS = ['e30', 'e30', 'c2ln'].join('.');
const BINDING = Buffer.alloc(32, 4).toString('base64url');
const CSRF = Buffer.alloc(32, 5).toString('base64url');
const NOW = 1_780_000_000_000;
const claims = { iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development', sub: ID, sid: SID, iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 900, ver: 2 };
const session = { identityId: ID, sessionId: SID, familyId: FAMILY, generation: 0, refreshTokenHash: 'a'.repeat(64), transport: 'web', deviceName: null, createdAt: NOW - 10_000, expiresAt: NOW - 10_000 + 86_400_000, exactOrigin: ORIGIN, browserChainId: 'chain', browserBindingCookieHash: hashBrowserBindingCookie(BINDING) };
const owner = { id: TARGET, status: 'PAUSED' };

type Harness = ReturnType<typeof harness>;
function harness() {
  let time = NOW;
  const verify = vi.fn().mockReturnValue(claims);
  const readSession = vi.fn().mockReturnValue(session);
  const webContextForCurrentSession = vi.fn().mockReturnValue({ transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' });
  const resolve = vi.fn().mockResolvedValue({ identityId: ID, sessionId: SID });
  const csrf = vi.fn();
  const update = vi.fn().mockResolvedValue(owner);
  const config = { environment: 'development', enabled: true, allowedOrigins: [ORIGIN], bindingCookieName: 'st_v2_binding', accessTokens: { verify }, principal: { resolve }, repository: { readSession, webContextForCurrentSession }, csrf: { verify: csrf }, subscriptions: { update }, clock: () => time } as unknown as BrowserSubscriptionLifecycleHttpConfig;
  const service = new BrowserSubscriptionLifecycleHttpService(config);
  const headers = ['content-type', 'application/json', 'content-length', '19', 'origin', ORIGIN, 'cookie', `st_v2_access=${ACCESS}; st_v2_binding=${BINDING}`, 'x-session-csrf', CSRF];
  const request = { rawHeaders: headers, method: 'PATCH', originalUrl: `/v2/subscriptions/${TARGET}`, rawBody: Buffer.from('{"status":"PAUSED"}'), body: { status: 'PAUSED' }, socket: Object.create(TLSSocket.prototype) as TLSSocket } as unknown as Request;
  const result: { status?: number; mime?: string; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const response = { headersSent: false, setHeader: (key: string, value: string) => { result.headers[key] = value; }, status: (value: number) => { result.status = value; return response; }, type: (value: string) => { result.mime = value; return response; }, json: (value: unknown) => { result.body = value; return response; } } as unknown as Response;
  return { config, service, request, response, result, headers, verify, readSession, webContextForCurrentSession, resolve, csrf, update, setTime: (n: number) => { time = n; } };
}
async function run(h: Harness): Promise<number | undefined> { await h.service.handle(TARGET, h.request, h.response); return h.result.status; }
function setHeader(h: Harness, key: string, value: string): void { const index = h.headers.findIndex((part, i) => i % 2 === 0 && part.toLowerCase() === key); if (index < 0) h.headers.push(key, value); else h.headers[index + 1] = value; }
function removeHeader(h: Harness, key: string): void { const index = h.headers.findIndex((part, i) => i % 2 === 0 && part.toLowerCase() === key); if (index >= 0) h.headers.splice(index, 2); }
function assertProblem(h: Harness, status: number, code: string): void {
  expect(h.result.status).toBe(status);
  expect(h.result.mime).toBe('application/problem+json');
  expect(h.result.body).toEqual({ type: 'about:blank', title: status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : 'Internal Server Error', status, code });
  expect(h.result.headers).toEqual({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
}

describe('private browser subscription lifecycle adapter', () => {
  it('derives authority, rechecks current session, verifies CSRF and dispatches the exact frozen target', async () => {
    const h = harness();
    expect(await run(h)).toBe(200);
    expect(h.result.body).toEqual(owner);
    expect(h.result.headers['Cache-Control']).toBe('no-store');
    expect(h.readSession).toHaveBeenCalledTimes(2);
    expect(h.readSession).toHaveBeenNthCalledWith(1, SID, { userId: ID }, NOW);
    expect(h.webContextForCurrentSession).toHaveBeenNthCalledWith(1, SID, { userId: ID }, hashBrowserBindingCookie(BINDING), ORIGIN, NOW);
    expect(h.resolve).toHaveBeenCalledWith(ACCESS, { transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' });
    expect(h.csrf).toHaveBeenCalledWith({ identityId: ID, sessionId: SID }, CSRF);
    expect(h.update).toHaveBeenCalledWith({ userId: ID }, TARGET, { status: 'PAUSED' });
    expect(h.update).toHaveBeenCalledTimes(1);
  });
  it('returns identical missing/invisible 404', async () => {
    const missing = harness(); missing.update.mockRejectedValue(new NotFoundException('SUBSCRIPTION_NOT_FOUND'));
    const invisible = harness(); invisible.update.mockRejectedValue(new NotFoundException('SUBSCRIPTION_NOT_FOUND'));
    expect(await run(missing)).toBe(404); expect(await run(invisible)).toBe(404);
    expect(missing.result.body).toEqual(invisible.result.body); assertProblem(missing, 404, 'SUBSCRIPTION_NOT_FOUND');
  });
  it('accepts uppercase UUID path spelling and uses a canonical lookup id', async () => {
    const h = harness();
    const upper = TARGET.toUpperCase();
    (h.request as { originalUrl: string }).originalUrl = `/v2/subscriptions/${upper}`;
    await h.service.handle(upper, h.request, h.response);
    expect(h.result.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({ userId: ID }, TARGET, { status: 'PAUSED' });
  });
  it.each([
    ['wrong method', (h: Harness) => { (h.request as { method: string }).method = 'GET'; }],
    ['query', (h: Harness) => { (h.request as { originalUrl: string }).originalUrl += '?scope=me'; }],
    ['path encoding', (h: Harness) => { (h.request as { originalUrl: string }).originalUrl = `/v2/subscriptions/%34${TARGET.slice(1)}`; }],
    ['missing content type', (h: Harness) => removeHeader(h, 'content-type')],
    ['duplicate content type', (h: Harness) => h.headers.push('Content-Type', 'application/json')],
    ['content type charset', (h: Harness) => setHeader(h, 'content-type', 'application/json; charset=utf-8')],
    ['missing length', (h: Harness) => removeHeader(h, 'content-length')],
    ['duplicate length', (h: Harness) => h.headers.push('Content-Length', '2')],
    ['oversize body', (h: Harness) => setHeader(h, 'content-length', '257')],
    ['transfer encoding', (h: Harness) => h.headers.push('Transfer-Encoding', 'chunked')],
    ['nonempty body', (h: Harness) => { (h.request as unknown as { rawBody: Buffer; body: object }).rawBody = Buffer.from('{"x":1}'); (h.request as unknown as { rawBody: Buffer; body: object }).body = { x: 1 }; setHeader(h, 'content-length', '7'); }],
    ['missing raw body', (h: Harness) => { delete (h.request as { rawBody?: Buffer }).rawBody; }],
    ['authorization', (h: Harness) => h.headers.push('Authorization', 'Bearer secret')],
    ['refresh cookie', (h: Harness) => setHeader(h, 'cookie', `st_v2_access=${ACCESS}; st_v2_binding=${BINDING}; st_v2_refresh=secret`)],
    ['duplicate cookie', (h: Harness) => h.headers.push('Cookie', `st_v2_access=${ACCESS}`)],
    ['duplicate access', (h: Harness) => setHeader(h, 'cookie', `st_v2_access=${ACCESS}; st_v2_access=${ACCESS}; st_v2_binding=${BINDING}`)],
    ['missing origin', (h: Harness) => removeHeader(h, 'origin')],
    ['duplicate origin', (h: Harness) => h.headers.push('Origin', ORIGIN)],
    ['wrong origin', (h: Harness) => setHeader(h, 'origin', 'https://evil.example')],
    ['duplicate csrf', (h: Harness) => h.headers.push('X-Session-CSRF', CSRF)],
    ['idempotency key', (h: Harness) => h.headers.push('Idempotency-Key', 'one')],
    ['identity selector', (h: Harness) => h.headers.push('X-User-Id', ID)],
    ['household selector', (h: Harness) => h.headers.push('X-Household-Id', ID)],
    ['transport selector', (h: Harness) => h.headers.push('X-Transport', 'web')],
  ] as const)('rejects malformed %s before callbacks', async (_label, alter) => {
    const h = harness(); alter(h);
    expect(await run(h)).toBe(400);
    assertProblem(h, 400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST');
    expect(h.verify).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it('rejects a forwarded HTTPS claim over a plain socket', async () => {
    const h = harness(); (h.request as { socket: object }).socket = { remoteAddress: '127.0.0.1' }; h.headers.push('X-Forwarded-Proto', 'https');
    expect(await run(h)).toBe(400); expect(h.verify).not.toHaveBeenCalled();
  });
  it('maps absent or invalid CSRF to 403 before any authority callbacks', async () => {
    for (const value of [null, 'bad']) {
      const h = harness();
      if (value === null) removeHeader(h, 'x-session-csrf'); else setHeader(h, 'x-session-csrf', value);
      expect(await run(h)).toBe(403); assertProblem(h, 403, 'AUTH_CSRF_UNAVAILABLE');
      expect(h.verify).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
    }
  });
  it('maps an absent or invalid access cookie to 401', async () => {
    for (const cookie of [null, `st_v2_binding=${BINDING}`, `st_v2_access=bad; st_v2_binding=${BINDING}`]) {
      const h = harness();
      if (cookie === null) removeHeader(h, 'cookie'); else setHeader(h, 'cookie', cookie);
      expect(await run(h)).toBe(401); assertProblem(h, 401, 'AUTHENTICATION_REQUIRED');
      expect(h.verify).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
    }
  });
  it.each([
    ['invalid token', (h: Harness) => h.verify.mockImplementation(() => { throw Error('secret'); })],
    ['wrong owner', (h: Harness) => h.readSession.mockReturnValue({ ...session, identityId: TARGET })],
    ['revoked', (h: Harness) => h.readSession.mockReturnValue(null)],
    ['wrong binding', (h: Harness) => h.webContextForCurrentSession.mockReturnValue(null)],
    ['wrong chain', (h: Harness) => h.webContextForCurrentSession.mockReturnValue({ transport: 'web', exactOrigin: ORIGIN, browserChainId: 'forged' })],
    ['wrong resolver identity', (h: Harness) => h.resolve.mockResolvedValue({ identityId: TARGET, sessionId: SID })],
    ['expired', (h: Harness) => h.setTime(NOW + 901_000)],
  ] as const)('does not read on %s', async (_label, alter) => {
    const h = harness(); alter(h);
    expect(await run(h)).toBe(401); assertProblem(h, 401, 'AUTHENTICATION_REQUIRED');
    expect(h.update).not.toHaveBeenCalled();
  });
  it('rechecks owner and binding after the resolver await before CSRF or update', async () => {
    const h = harness(); h.readSession.mockReturnValueOnce(session).mockReturnValueOnce(null);
    expect(await run(h)).toBe(401); expect(h.csrf).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
    const binding = harness(); binding.webContextForCurrentSession.mockReturnValueOnce({ transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' }).mockReturnValueOnce(null);
    expect(await run(binding)).toBe(401); expect(binding.csrf).not.toHaveBeenCalled();
  });
  it('maps invalid session CSRF to 403 without consuming or mutating it', async () => {
    const h = harness(); h.csrf.mockImplementation(() => { throw Error('token value'); });
    expect(await run(h)).toBe(403); assertProblem(h, 403, 'AUTH_CSRF_UNAVAILABLE'); expect(h.update).not.toHaveBeenCalled();
  });
  it('masks storage faults and rejects malformed projections', async () => {
    const h = harness(); h.update.mockRejectedValue(Error('database secret'));
    expect(await run(h)).toBe(500); assertProblem(h, 500, 'INTERNAL_ERROR');
    const output = harness(); output.update.mockResolvedValue({ ...owner, extra: 'private' });
    expect(await run(output)).toBe(500); assertProblem(output, 500, 'INTERNAL_ERROR');
    const hostile = harness(); hostile.update.mockRejectedValue(Object.defineProperty({}, 'getStatus', { get: () => { throw Error('leak'); } }));
    expect(await run(hostile)).toBe(500); assertProblem(hostile, 500, 'INTERNAL_ERROR');
  });
  it('requires explicit development HTTPS configuration and trusted method ports', () => {
    const h = harness();
    const base = { environment: 'development', enabled: true, allowedOrigins: [ORIGIN], bindingCookieName: 'st_v2_binding', accessTokens: { verify: h.verify }, principal: { resolve: h.resolve }, repository: { readSession: h.readSession, webContextForCurrentSession: h.webContextForCurrentSession }, csrf: { verify: h.csrf }, subscriptions: { update: h.update }, clock: () => NOW };
    expect(() => new BrowserSubscriptionLifecycleHttpService({ ...base, environment: 'production' } as unknown as BrowserSubscriptionLifecycleHttpConfig)).toThrow();
    expect(() => new BrowserSubscriptionLifecycleHttpService({ ...base, allowedOrigins: ['http://localhost:3000'] } as BrowserSubscriptionLifecycleHttpConfig)).toThrow();
    expect(() => new BrowserSubscriptionLifecycleHttpService({ ...base, csrf: { verify: undefined } } as unknown as BrowserSubscriptionLifecycleHttpConfig)).toThrow();
  });
  it('delegates the private controller and freezes dispatch inputs with synchronous CSRF ordering', async () => {
    const h = harness(); const order: string[] = [];
    h.csrf.mockImplementation(authority => { expect(Object.isFrozen(authority)).toBe(true); order.push('csrf'); });
    h.update.mockImplementation(async (context, id, body) => {
      order.push('write'); expect(Object.isFrozen(context)).toBe(true); expect(Object.isFrozen(body)).toBe(true);
      expect(context).toEqual({ userId: ID }); return { id, status: body.status };
    });
    await new BrowserSubscriptionLifecycleHttpController(h.service).update(TARGET, h.request, h.response);
    expect(order).toEqual(['csrf', 'write']); expect(h.result.status).toBe(200);
  });
  it.each(['{}', '[]', 'null', '{"status":true}', '{"status":"DETECTED"}', '{"status":"paused"}',
    '{"status":"PAUSED","status":"PAUSED"}', '{"status":"ACTIVE","sta\\u0074us":"PAUSED"}',
    '{"status":"PAUSED","ownerId":"x"}', '{"status":"PAUSED","action":"pause"}',
    '{"__proto__":{},"status":"PAUSED"}', '{"status":"PAUSED"} trailing', '{"status":"PAUSED",}',
    '{"status":"PAUSED"}\u000b', ' '.repeat(257)])('rejects raw body %s without authority', async text => {
    const h = harness(); (h.request as unknown as { rawBody: Buffer }).rawBody = Buffer.from(text);
    setHeader(h, 'content-length', String(Buffer.byteLength(text)));
    expect(await run(h)).toBe(400); expect(h.verify).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it('accepts one escaped key/value and JSON whitespace, rejects invalid UTF8 and parsed disagreement', async () => {
    const h = harness(); const text = ' \n{ "sta\\u0074us" : "PAU\\u0053ED" }\t';
    (h.request as unknown as { rawBody: Buffer }).rawBody = Buffer.from(text); setHeader(h, 'content-length', String(Buffer.byteLength(text)));
    expect(await run(h)).toBe(200);
    const invalid = harness(); (invalid.request as unknown as { rawBody: Buffer }).rawBody = Buffer.from([0xff]); setHeader(invalid, 'content-length', '1');
    expect(await run(invalid)).toBe(400);
    const mismatch = harness(); mismatch.request.body = { status: 'ACTIVE' }; expect(await run(mismatch)).toBe(400);
  });
  it.each(['X-Identity-Id', 'X-Owner-Id', 'X-Session-Id', 'X-Scope', 'X-Browser-Nonce', 'X-CSRF-Token', 'CSRF-Token', 'X-XSRF-Token', 'Transfer-Encoding'])('rejects %s', async key => {
    const h = harness(); h.headers.push(key, 'x'); expect(await run(h)).toBe(400); expect(h.verify).not.toHaveBeenCalled();
  });
  it.each(['st_v2_access', 'st_v2_binding', 'unrelated'])('rejects duplicate %s cookie', async name => {
    const h = harness(); setHeader(h, 'cookie', `st_v2_access=${ACCESS}; st_v2_binding=${BINDING}; ${name}=x; ${name}=x`);
    expect(await run(h)).toBe(400); expect(h.update).not.toHaveBeenCalled();
  });
  it.each(['bad', 'st_v2_access =x', 'st_v2_access="x"', 'st_v2_access=x,y', 'st_v2_access=x\\y', 'st_v2_access=x;'])('rejects malformed cookie syntax %s', async cookie => {
    const h = harness(); setHeader(h, 'cookie', cookie); expect(await run(h)).toBe(400); expect(h.verify).not.toHaveBeenCalled();
  });
  it.each(['', 'bad', Buffer.alloc(32, 255).toString('base64url').slice(0, -1) + '_'])('rejects invalid binding authority', async value => {
    const h = harness(); setHeader(h, 'cookie', `st_v2_access=${ACCESS}; st_v2_binding=${value}`);
    expect(await run(h)).toBe(401); expect(h.verify).not.toHaveBeenCalled();
  });
  it.each(['019', '+19', '19 ', '0', '1e2'])('rejects noncanonical length %s', async value => {
    const h = harness(); setHeader(h, 'content-length', value); expect(await run(h)).toBe(400);
  });
  it('rejects odd, duplicate unrelated, invalid and excessive headers', async () => {
    for (const suffix of [['odd'], ['Accept', 'x', 'accept', 'y'], ['bad name', 'x'], ['accept', 'x\r\ny'], ['accept', 'x'.repeat(8193)], Array(130).fill('x')]) {
      const h = harness(); h.headers.push(...suffix); expect(await run(h)).toBe(400); expect(h.verify).not.toHaveBeenCalled();
    }
  });
  it.each(['iss', 'aud', 'ver', 'sub', 'sid', 'iat', 'exp'])('rejects invalid claim %s', async key => {
    const h = harness(); h.verify.mockReturnValue({ ...claims, [key]: 'invalid' });
    expect(await run(h)).toBe(401); expect(h.update).not.toHaveBeenCalled();
  });
  it.each(['identityId', 'sessionId', 'familyId', 'generation', 'refreshTokenHash', 'transport', 'deviceName', 'createdAt', 'expiresAt', 'exactOrigin', 'browserChainId', 'browserBindingCookieHash'])('rejects hostile initial row %s', async key => {
    const h = harness(); h.readSession.mockReturnValue({ ...session, [key]: undefined });
    expect(await run(h)).toBe(500); expect(h.csrf).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it.each([
    ['identityId', TARGET], ['sessionId', TARGET], ['familyId', TARGET], ['refreshTokenHash', 'b'.repeat(64)],
    ['createdAt', session.createdAt - 1], ['expiresAt', session.expiresAt - 1], ['browserBindingCookieHash', 'b'.repeat(64)],
    ['exactOrigin', 'https://other.example'], ['browserChainId', 'other'],
  ] as const)('rechecks changed row %s after await', async (key, value) => {
    const h = harness(); let release!: (value: unknown) => void;
    h.resolve.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const running = run(h); h.readSession.mockReturnValue({ ...session, [key]: value }); release({ identityId: ID, sessionId: SID });
    expect([401, 500]).toContain(await running); expect(h.csrf).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it.each([null, { transport: 'web', exactOrigin: ORIGIN, browserChainId: 'other' }, { transport: 'web', exactOrigin: 'https://other.example', browserChainId: 'chain' }, { transport: 'mobile' }])('rechecks post-await context', async value => {
    const h = harness(); h.webContextForCurrentSession.mockReturnValueOnce({ transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' }).mockReturnValueOnce(value);
    expect([401, 500]).toContain(await run(h)); expect(h.csrf).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it.each([NOW - 1, NOW + 900_000, NaN, -1, Number.MAX_SAFE_INTEGER])('rejects post-await clock %s', async time => {
    const h = harness(); h.resolve.mockImplementation(async () => { h.setTime(time); return { identityId: ID, sessionId: SID }; });
    expect(await run(h)).toBe(401); expect(h.csrf).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it('rejects future issuance, expired session and invalid initial clock', async () => {
    const future = harness(); future.verify.mockReturnValue({ ...claims, iat: claims.iat + 1, exp: claims.exp + 1 }); expect(await run(future)).toBe(401);
    const expired = harness(); expired.readSession.mockReturnValue({ ...session, createdAt: NOW - 86_400_000, expiresAt: NOW }); expect(await run(expired)).toBe(401);
    const clock = harness(); clock.setTime(NaN); expect(await run(clock)).toBe(500);
  });
  it('rejects hostile data descriptors without invoking getters', async () => {
    const getter = vi.fn(() => { throw Error('private'); });
    const values = [Object.create({ identityId: ID }), [], { ...claims, extra: true }, { ...claims, [Symbol('x')]: true }, Object.defineProperty({ ...claims }, 'sub', { get: getter }), Object.defineProperty({ ...claims }, 'sub', { value: ID, enumerable: false })];
    for (const value of values) { const h = harness(); h.verify.mockReturnValue(value); expect(await run(h)).toBe(500); expect(h.update).not.toHaveBeenCalled(); }
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects hostile resolver/principal/CSRF/writer results and stage-confused exceptions', async () => {
    const getter = vi.fn(); const thenable = Object.defineProperty({}, 'then', { get: getter });
    for (const value of [thenable, Object.assign(Promise.resolve({ identityId: ID, sessionId: SID }), { extra: true }), Object.setPrototypeOf(Promise.resolve({}), null)]) {
      const h = harness(); h.resolve.mockReturnValue(value); expect(await run(h)).toBe(500); expect(h.update).not.toHaveBeenCalled();
    }
    expect(getter).not.toHaveBeenCalled();
    const rejected = harness(); rejected.resolve.mockRejectedValue(Error('private')); expect(await run(rejected)).toBe(401);
    for (const value of [{ identityId: ID, sessionId: TARGET }, { identityId: ID, sessionId: SID, extra: true }, null]) {
      const h = harness(); h.resolve.mockResolvedValue(value); expect([401, 500]).toContain(await run(h)); expect(h.update).not.toHaveBeenCalled();
    }
    const csrf = harness(); csrf.csrf.mockReturnValue(true); expect(await run(csrf)).toBe(500); expect(csrf.update).not.toHaveBeenCalled();
    const confused = harness(); confused.readSession.mockImplementation(() => { throw new NotFoundException('SUBSCRIPTION_NOT_FOUND'); }); expect(await run(confused)).toBe(500);
    for (const value of [{ ...owner, id: ID }, { ...owner, status: 'ACTIVE' }, null, thenable]) {
      const h = harness(); h.update.mockResolvedValue(value); expect(await run(h)).toBe(500);
    }
    const promise = harness(); promise.update.mockReturnValue({}); expect(await run(promise)).toBe(500);
    for (const error of [new NotFoundException('private'), new ConflictException('private'), Object.create(NotFoundException.prototype), 'private']) {
      const h = harness(); h.update.mockRejectedValue(error); expect(await run(h)).toBe(500); assertProblem(h, 500, 'INTERNAL_ERROR');
    }
  });
  it('requires descriptor-safe config, canonical unique origins and methods', () => {
    const base = harness().config; const getter = vi.fn();
    const configs = [{ ...base, enabled: false }, { ...base, allowedOrigins: [] }, { ...base, allowedOrigins: ['invalid'] }, { ...base, allowedOrigins: [ORIGIN, ORIGIN] },
      { ...base, allowedOrigins: [`${ORIGIN}/`] }, { ...base, bindingCookieName: 'st_v2_access' }, { ...base, clock: null },
      { ...base, accessTokens: null }, { ...base, principal: {} }, { ...base, csrf: Object.defineProperty({}, 'verify', { get: getter }) },
      { ...base, allowedOrigins: Object.assign([ORIGIN], { extra: true }) }, { ...base, allowedOrigins: Object.defineProperty([ORIGIN], '0', { get: getter }) },
      Object.defineProperty({ ...base }, 'clock', { get: getter }), { ...base, [Symbol('x')]: true }];
    for (const config of configs) expect(() => new BrowserSubscriptionLifecycleHttpService(config as unknown as BrowserSubscriptionLifecycleHttpConfig)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('proves seven pairs and every conflict using the accepted service and a bounded repository double', async () => {
    let accepted = 0;
    for (const current of ['DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED']) {
      for (const target of ['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED']) {
        const h = harness(); let next: string | undefined;
        const apply = vi.fn(async (context, id, action: SubscriptionLifecycleAction) => {
          expect(context).toEqual({ userId: ID }); expect(id).toBe(TARGET);
          if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(current)) throw Error('LIFECYCLE_CONFLICT');
          try { next = getNextSubscriptionStatus(current as SubscriptionLifecycleStatus, action); } catch { throw Error('LIFECYCLE_CONFLICT'); }
          return { id, status: next };
        });
        const real = new SubscriptionLifecycleService({ apply } as unknown as SubscriptionLifecycleRepository);
        h.update.mockImplementation(real.update.bind(real));
        const text = JSON.stringify({ status: target }); h.request.body = { status: target };
        (h.request as unknown as { rawBody: Buffer }).rawBody = Buffer.from(text); setHeader(h, 'content-length', String(text.length));
        const status = await run(h); expect(apply).toHaveBeenCalledTimes(1);
        if (next) { expect(status).toBe(200); expect(h.result.body).toEqual({ id: TARGET, status: target }); accepted++; }
        else { expect(status).toBe(409); assertProblem(h, 409, 'LIFECYCLE_CONFLICT'); }
      }
    }
    expect(accepted).toBe(7);
  });

  it('masks hostile thrown error traps and never dispatches after live session expiry', async () => {
    const hostile = harness(); hostile.update.mockRejectedValue(new Proxy({}, { getPrototypeOf: () => { throw Error('private'); } }));
    expect(await run(hostile)).toBe(500); assertProblem(hostile, 500, 'INTERNAL_ERROR');
    const expiry = harness(); expiry.readSession.mockReturnValue({ ...session, createdAt: NOW - 86_400_000 + 10_000, expiresAt: NOW + 10_000 });
    expiry.resolve.mockImplementation(async () => { expiry.setTime(NOW + 10_000); return { identityId: ID, sessionId: SID }; });
    expect(await run(expiry)).toBe(401); expect(expiry.csrf).not.toHaveBeenCalled(); expect(expiry.update).not.toHaveBeenCalled();
  });

});
