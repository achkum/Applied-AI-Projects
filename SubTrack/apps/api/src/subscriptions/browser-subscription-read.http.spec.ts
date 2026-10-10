import { describe, expect, it, vi } from 'vitest';
import { TLSSocket } from 'node:tls';
import type { Request, Response } from 'express';
import { NotFoundException } from '@nestjs/common';
import { hashBrowserBindingCookie } from '../auth/sessions-v2/v2-web-session-binding.js';
import { BrowserSubscriptionReadHttpService } from './browser-subscription-read.http.js';
import type { BrowserSubscriptionReadHttpConfig } from './browser-subscription-read.http.js';

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
const owner = { visibility: 'owner', id: TARGET, categoryCode: 'SOFTWARE_PRODUCTIVITY', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '-9007199254740993', currency: 'SEK', customName: 'Private', merchantId: null, merchantName: 'Canonical', nextChargeDate: null, alwaysPrivate: true };
const peer = { visibility: 'household', id: TARGET, categoryCode: 'SOFTWARE_PRODUCTIVITY', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '123', currency: 'SEK' };

type Harness = ReturnType<typeof harness>;
function harness() {
  let time = NOW;
  const verify = vi.fn().mockReturnValue(claims);
  const readSession = vi.fn().mockReturnValue(session);
  const webContextForCurrentSession = vi.fn().mockReturnValue({ transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' });
  const resolve = vi.fn().mockResolvedValue({ identityId: ID, sessionId: SID });
  const csrf = vi.fn();
  const detail = vi.fn().mockResolvedValue(owner);
  const config = { environment: 'development', enabled: true, allowedOrigins: [ORIGIN], bindingCookieName: 'st_v2_binding', accessTokens: { verify }, principal: { resolve }, repository: { readSession, webContextForCurrentSession }, csrf: { verify: csrf }, subscriptions: { detail }, clock: () => time } as unknown as BrowserSubscriptionReadHttpConfig;
  const service = new BrowserSubscriptionReadHttpService(config);
  const headers = ['content-type', 'application/json', 'content-length', '2', 'origin', ORIGIN, 'cookie', `st_v2_access=${ACCESS}; st_v2_binding=${BINDING}`, 'x-session-csrf', CSRF];
  const request = { rawHeaders: headers, method: 'POST', originalUrl: `/v2/subscriptions/${TARGET}/read`, rawBody: Buffer.from('{}'), body: {}, socket: Object.create(TLSSocket.prototype) as TLSSocket } as unknown as Request;
  const result: { status?: number; mime?: string; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const response = { headersSent: false, setHeader: (key: string, value: string) => { result.headers[key] = value; }, status: (value: number) => { result.status = value; return response; }, type: (value: string) => { result.mime = value; return response; }, json: (value: unknown) => { result.body = value; return response; } } as unknown as Response;
  return { service, request, response, result, headers, verify, readSession, webContextForCurrentSession, resolve, csrf, detail, setTime: (n: number) => { time = n; } };
}
async function run(h: Harness): Promise<number | undefined> { await h.service.handle(TARGET, h.request, h.response); return h.result.status; }
function setHeader(h: Harness, key: string, value: string): void { const index = h.headers.findIndex((part, i) => i % 2 === 0 && part.toLowerCase() === key); if (index < 0) h.headers.push(key, value); else h.headers[index + 1] = value; }
function removeHeader(h: Harness, key: string): void { const index = h.headers.findIndex((part, i) => i % 2 === 0 && part.toLowerCase() === key); if (index >= 0) h.headers.splice(index, 2); }
function assertProblem(h: Harness, status: number, code: string): void {
  expect(h.result.status).toBe(status);
  expect(h.result.mime).toBe('application/problem+json');
  expect(h.result.body).toEqual({ type: 'about:blank', title: status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Internal Server Error', status, code });
  expect(h.result.headers).toEqual({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
}

describe('private browser subscription read adapter', () => {
  it('derives owner authority from verified token, observed binding and current session, then returns owner strings', async () => {
    const h = harness();
    expect(await run(h)).toBe(200);
    expect(h.result.body).toEqual(owner);
    expect(h.result.headers['Cache-Control']).toBe('no-store');
    expect(h.readSession).toHaveBeenCalledTimes(2);
    expect(h.readSession).toHaveBeenNthCalledWith(1, SID, { userId: ID }, NOW);
    expect(h.webContextForCurrentSession).toHaveBeenNthCalledWith(1, SID, { userId: ID }, hashBrowserBindingCookie(BINDING), ORIGIN, NOW);
    expect(h.resolve).toHaveBeenCalledWith(ACCESS, { transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' });
    expect(h.csrf).toHaveBeenCalledWith({ identityId: ID, sessionId: SID }, CSRF);
    expect(h.detail).toHaveBeenCalledWith({ userId: ID }, TARGET);
    expect(h.detail).toHaveBeenCalledTimes(1);
  });
  it('returns only the peer-safe projection and identical missing/invisible 404', async () => {
    const h = harness(); h.detail.mockResolvedValue(peer);
    expect(await run(h)).toBe(200);
    expect(h.result.body).toEqual(peer);
    const missing = harness(); missing.detail.mockRejectedValue(new NotFoundException('SUBSCRIPTION_NOT_FOUND'));
    const invisible = harness(); invisible.detail.mockRejectedValue(new NotFoundException('SUBSCRIPTION_NOT_FOUND'));
    expect(await run(missing)).toBe(404); expect(await run(invisible)).toBe(404);
    expect(missing.result.body).toEqual(invisible.result.body);
    assertProblem(missing, 404, 'SUBSCRIPTION_NOT_FOUND');
  });
  it('accepts uppercase UUID path spelling and uses a canonical lookup id', async () => {
    const h = harness();
    const upper = TARGET.toUpperCase();
    (h.request as { originalUrl: string }).originalUrl = `/v2/subscriptions/${upper}/read`;
    await h.service.handle(upper, h.request, h.response);
    expect(h.result.status).toBe(200);
    expect(h.detail).toHaveBeenCalledWith({ userId: ID }, TARGET);
  });
  it.each([
    ['wrong method', (h: Harness) => { (h.request as { method: string }).method = 'GET'; }],
    ['query', (h: Harness) => { (h.request as { originalUrl: string }).originalUrl += '?scope=me'; }],
    ['path encoding', (h: Harness) => { (h.request as { originalUrl: string }).originalUrl = `/v2/subscriptions/%34${TARGET.slice(1)}/read`; }],
    ['missing content type', (h: Harness) => removeHeader(h, 'content-type')],
    ['duplicate content type', (h: Harness) => h.headers.push('Content-Type', 'application/json')],
    ['content type charset', (h: Harness) => setHeader(h, 'content-type', 'application/json; charset=utf-8')],
    ['missing length', (h: Harness) => removeHeader(h, 'content-length')],
    ['duplicate length', (h: Harness) => h.headers.push('Content-Length', '2')],
    ['oversize body', (h: Harness) => setHeader(h, 'content-length', '65')],
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
    assertProblem(h, 400, 'INVALID_SUBSCRIPTION_QUERY');
    expect(h.verify).not.toHaveBeenCalled(); expect(h.detail).not.toHaveBeenCalled();
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
      expect(h.verify).not.toHaveBeenCalled(); expect(h.detail).not.toHaveBeenCalled();
    }
  });
  it('maps an absent or invalid access cookie to 401', async () => {
    for (const cookie of [null, `st_v2_binding=${BINDING}`, `st_v2_access=bad; st_v2_binding=${BINDING}`]) {
      const h = harness();
      if (cookie === null) removeHeader(h, 'cookie'); else setHeader(h, 'cookie', cookie);
      expect(await run(h)).toBe(401); assertProblem(h, 401, 'AUTHENTICATION_REQUIRED');
      expect(h.verify).not.toHaveBeenCalled(); expect(h.detail).not.toHaveBeenCalled();
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
    expect(h.detail).not.toHaveBeenCalled();
  });
  it('rechecks owner and binding after the resolver await before CSRF or detail', async () => {
    const h = harness(); h.readSession.mockReturnValueOnce(session).mockReturnValueOnce(null);
    expect(await run(h)).toBe(401); expect(h.csrf).not.toHaveBeenCalled(); expect(h.detail).not.toHaveBeenCalled();
    const binding = harness(); binding.webContextForCurrentSession.mockReturnValueOnce({ transport: 'web', exactOrigin: ORIGIN, browserChainId: 'chain' }).mockReturnValueOnce(null);
    expect(await run(binding)).toBe(401); expect(binding.csrf).not.toHaveBeenCalled();
  });
  it('maps invalid session CSRF to 403 without consuming or mutating it', async () => {
    const h = harness(); h.csrf.mockImplementation(() => { throw Error('token value'); });
    expect(await run(h)).toBe(403); assertProblem(h, 403, 'AUTH_CSRF_UNAVAILABLE'); expect(h.detail).not.toHaveBeenCalled();
  });
  it('masks storage faults and rejects malformed projections', async () => {
    const h = harness(); h.detail.mockRejectedValue(Error('database secret'));
    expect(await run(h)).toBe(500); assertProblem(h, 500, 'INTERNAL_ERROR');
    const output = harness(); output.detail.mockResolvedValue({ ...peer, customName: 'leak' });
    expect(await run(output)).toBe(500); assertProblem(output, 500, 'INTERNAL_ERROR');
    const calendar = harness(); calendar.detail.mockResolvedValue({ ...owner, nextChargeDate: '2026-99-99' });
    expect(await run(calendar)).toBe(500); assertProblem(calendar, 500, 'INTERNAL_ERROR');
    const hostile = harness(); hostile.detail.mockRejectedValue(Object.defineProperty({}, 'getStatus', { get: () => { throw Error('leak'); } }));
    expect(await run(hostile)).toBe(500); assertProblem(hostile, 500, 'INTERNAL_ERROR');
  });
  it('requires explicit development HTTPS configuration and trusted method ports', () => {
    const h = harness();
    const base = { environment: 'development', enabled: true, allowedOrigins: [ORIGIN], bindingCookieName: 'st_v2_binding', accessTokens: { verify: h.verify }, principal: { resolve: h.resolve }, repository: { readSession: h.readSession, webContextForCurrentSession: h.webContextForCurrentSession }, csrf: { verify: h.csrf }, subscriptions: { detail: h.detail }, clock: () => NOW };
    expect(() => new BrowserSubscriptionReadHttpService({ ...base, environment: 'production' } as unknown as BrowserSubscriptionReadHttpConfig)).toThrow();
    expect(() => new BrowserSubscriptionReadHttpService({ ...base, allowedOrigins: ['http://localhost:3000'] } as BrowserSubscriptionReadHttpConfig)).toThrow();
    expect(() => new BrowserSubscriptionReadHttpService({ ...base, csrf: { verify: undefined } } as unknown as BrowserSubscriptionReadHttpConfig)).toThrow();
  });
});
