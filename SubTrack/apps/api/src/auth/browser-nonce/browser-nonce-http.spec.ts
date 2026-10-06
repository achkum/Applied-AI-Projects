import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { BrowserNonceGuard, InMemoryBrowserNonceStore } from './browser-nonce';
import { BrowserNonceHttpService, OriginThrottle } from './browser-nonce-http';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard';

const origin = 'https://localhost';
const config = { origins: [origin], cookieName: 'st_v2_browser', cookiePath: '/v2/auth', allowLoopbackHttp: false,
  idempotencyKey: Buffer.alloc(32, 1), originKey: Buffer.alloc(32, 2) };
const evidence = { origin, isHttps: true, explicitLoopbackDevelopment: false, bindingCookie: null };
function response() {
  const headers = new Map<string, string>();
  const result = { statusCode: 0, body: undefined as unknown, headers,
    status(code: number) { this.statusCode = code; return this; },
    type(contentType: string) { void contentType; return this; },
    send(body: unknown) { this.body = body; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { headers.set(name, value); return this; } };
  return { result, wire: result as unknown as Response };
}

describe('browser nonce HTTP service safety', () => {
  it('limits each configured origin and the global bucket, resets at the window boundary, and bounds unknown origins', () => {
    let now = 1000;
    const origins = Array.from({ length: 6 }, (_, index) => `https://site${index}.example`);
    const throttle = new OriginThrottle(origins, () => now);
    for (const value of origins.slice(0, 5)) {
      for (let count = 0; count < 60; count++) expect(throttle.take(value)).toBe(true);
      expect(throttle.take(value)).toBe(false);
    }
    expect(throttle.take(origins[5]!)).toBe(false);
    expect(throttle.take('https://unconfigured.example')).toBe(false);
    now = 60_999;
    expect(throttle.take(origins[0]!)).toBe(false);
    now = 61_000;
    expect(throttle.take(origins[0]!)).toBe(true);
    expect(new OriginThrottle(origins, () => now).take(origins[0]!)).toBe(true);
    expect(new OriginThrottle(origins, () => Number.NaN).take(origins[0]!)).toBe(false);
  });

  it('emits no cookie or nonce when completion settlement fails and burns the reservation', () => {
    const guard = new InMemoryIdempotencyGuard({ key: config.idempotencyKey, ttlMs: 60_000 });
    const service = new BrowserNonceHttpService(config, { idempotency: {
      reserve: (input) => guard.reserve(input),
      settle: (input, owner, outcome) => { if (outcome === 'completed') throw new Error('settlement unavailable'); guard.settle(input, owner, outcome); },
    } });
    const first = response();
    service.issue({ purpose: 'session' }, 'settlement-failure-key', evidence, first.wire);
    expect(first.result.statusCode).toBe(500);
    expect(first.result.headers.size).toBe(0);
    expect(first.result.body).not.toHaveProperty('nonce');
    const duplicate = response();
    service.issue({ purpose: 'session' }, 'settlement-failure-key', evidence, duplicate.wire);
    expect(duplicate.result.statusCode).toBe(409);
    expect(duplicate.result.headers.size).toBe(0);
  });

  it('burns a failed issuance key without returning secrets', () => {
    const issue = vi.fn(() => { throw new Error('issuance unavailable'); });
    const service = new BrowserNonceHttpService(config, { nonce: { issue } });
    for (const expected of [500, 409]) {
      const res = response();
      service.issue({ purpose: 'session' }, 'issuance-failure-key', evidence, res.wire);
      expect(res.result.statusCode).toBe(expected);
      expect(res.result.headers.size).toBe(0);
      expect(res.result.body).not.toHaveProperty('nonce');
    }
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it('invalidates the presented previous chain while preserving a chain whose cookie was absent', () => {
    const nonce = new BrowserNonceGuard({ allowedOrigins: [origin] }, new InMemoryBrowserNonceStore());
    const service = new BrowserNonceHttpService(config, { nonce });
    const first = response();
    service.issue({ purpose: 'session' }, 'previous-chain-key-1', evidence, first.wire);
    const oldNonce = (first.result.body as { nonce: string }).nonce;
    const oldCookie = first.result.headers.get('Set-Cookie')!.split(';')[0]!.split('=')[1]!;
    const independent = response();
    service.issue({ purpose: 'session' }, 'independent-chain-key', evidence, independent.wire);
    const rotated = nonce.consumeAndRotate('session', evidence, oldNonce, oldCookie);
    const replacement = response();
    service.issue({ purpose: 'session' }, 'previous-chain-key-2', { ...evidence, bindingCookie: oldCookie }, replacement.wire);
    expect(replacement.result.statusCode).toBe(200);
    expect(() => nonce.consumeAndRotate('session', evidence, rotated.nonce, oldCookie)).toThrow();
  });

  it('rejects a malformed cookie before issuing secrets or reserving the key', () => {
    const service = new BrowserNonceHttpService(config);
    const bad = response();
    service.issue({ purpose: 'session' }, 'malformed-cookie-key', { ...evidence, bindingCookie: 'short' }, bad.wire);
    expect(bad.result.statusCode).toBe(400);
    const valid = response();
    service.issue({ purpose: 'session' }, 'malformed-cookie-key', evidence, valid.wire);
    expect(valid.result.statusCode).toBe(200);
  });
});
