import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { BrowserNonceGuard, BROWSER_NONCE_TTL_MS, InMemoryBrowserNonceStore } from './browser-nonce.js';

const https = (origin = 'https://app.example') => ({ origin, isHttps: true, explicitLoopbackDevelopment: false });
describe('BrowserNonceGuard', () => {
  it('requires valid exact configured origins and independent secure secrets', () => {
    for (const allowedOrigins of [[], ['https://app.example/path'], ['https://*.example'], ['http://app.example']])
      assert.throws(() => new BrowserNonceGuard({ allowedOrigins }));
    const store = new InMemoryBrowserNonceStore();
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'] }, store);
    const issued = guard.issue('session', https(), undefined);
    assert.notEqual(issued.nonce, issued.cookieSecret);
    assert.equal(Object.hasOwn(issued, 'chainId'), false);
    const row = store.snapshot()[0];
    assert(row);
    assert.notEqual(row.chainId, issued.nonce);
    assert(Object.isFrozen(row));
    assert(!JSON.stringify(row).includes(issued.nonce));
    assert(!JSON.stringify(row).includes(issued.cookieSecret));
    assert.equal(row.expiresAt - row.issuedAt, BROWSER_NONCE_TTL_MS);
  });
  it('requires actual HTTPS except explicitly configured loopback development', () => {
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'] });
    assert.throws(() => guard.issue('session', { ...https(), isHttps: false }));
    assert.throws(() => guard.issue('session', { ...https(), origin: null }));
    const local = new BrowserNonceGuard({ allowedOrigins: ['http://localhost:3000'], allowLoopbackHttpDevelopment: true });
    assert.doesNotThrow(() => local.issue('session', { origin: 'http://localhost:3000', isHttps: false, explicitLoopbackDevelopment: true }));
    assert.throws(() => local.issue('session', { origin: 'http://localhost:3000', isHttps: false, explicitLoopbackDevelopment: false }));
  });
  it('preserves valid state on wrong context, rotates on match, rejects replay and bootstrap invalidates old chain', () => {
    const store = new InMemoryBrowserNonceStore();
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'] }, store);
    const first = guard.issue('enroll_identifier', https());
    const chainId = store.snapshot()[0]?.chainId;
    assert.throws(() => guard.consumeAndRotate('session', https(), first.nonce, first.cookieSecret));
    const rotated = guard.consumeAndRotate('enroll_identifier', https(), first.nonce, first.cookieSecret);
    assert.equal(rotated.context.chainId, chainId);
    assert.equal(rotated.context.purpose, 'enroll_identifier');
    assert.throws(() => guard.consumeAndRotate('enroll_identifier', https(), first.nonce, first.cookieSecret));
    const replacement = guard.issue('session', https(), first.cookieSecret);
    assert.throws(() => guard.consumeAndRotate('enroll_identifier', https(), rotated.nonce, first.cookieSecret));
    assert.doesNotThrow(() => guard.consumeAndRotate('session', https(), replacement.nonce, replacement.cookieSecret));
  });
  it('does not consume for a wrong origin or binding cookie', () => {
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example', 'https://other.example'] });
    const issued = guard.issue('session', https());
    assert.throws(() => guard.consumeAndRotate('session', https('https://other.example'), issued.nonce, issued.cookieSecret));
    const other = guard.issue('session', https());
    assert.throws(() => guard.consumeAndRotate('session', https(), issued.nonce, other.cookieSecret));
    assert.throws(() => guard.consumeAndRotate('session', https(), other.nonce, issued.cookieSecret));
    assert.doesNotThrow(() => guard.consumeAndRotate('session', https(), issued.nonce, issued.cookieSecret));
  });
  it('expires safely and allows one concurrent winner', async () => {
    let now = 1000;
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'], clock: () => now });
    const issued = guard.issue('session', https());
    now += BROWSER_NONCE_TTL_MS;
    assert.throws(() => guard.consumeAndRotate('session', https(), issued.nonce, issued.cookieSecret));
    now = 5000;
    const active = guard.issue('session', https());
    const results = await Promise.allSettled([
      Promise.resolve().then(() => guard.consumeAndRotate('session', https(), active.nonce, active.cookieSecret)),
      Promise.resolve().then(() => guard.consumeAndRotate('session', https(), active.nonce, active.cookieSecret)),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  });
  it('uses one generic failure and rejects unsafe clock values', () => {
    const badClock = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'], clock: () => Number.MAX_SAFE_INTEGER });
    assert.throws(() => badClock.issue('session', https()), { message: 'Browser nonce unavailable' });
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'] });
    assert.throws(() => guard.consumeAndRotate('session', https(), 'wrong', 'wrong'), { message: 'Browser nonce unavailable' });
  });

  it.each(['null', 'https://*.example', 'https://user@app.example', 'https://app.example/', 'https://app.example?x=1', 'https://app.example?', 'https://app.example#x', 'https://app.example#', 'https://APP.example', 'https://app.example:443', ''])('rejects noncanonical configuration %s', origin => {
    assert.throws(() => new BrowserNonceGuard({ allowedOrigins: [origin] }), { message: 'Browser nonce unavailable' });
  });
  it.each([NaN, -1, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid clock for bootstrap and consumption %s', now => {
    const guard = new BrowserNonceGuard({ allowedOrigins: ['https://app.example'], clock: () => now });
    assert.throws(() => guard.issue('session', https()), { message: 'Browser nonce unavailable' });
    assert.throws(() => guard.consumeAndRotate('session', https(), 'a'.repeat(43), 'b'.repeat(43)), { message: 'Browser nonce unavailable' });
  });
  it('rejects lookalike origins and mutable allowlist changes', () => {
    const allowedOrigins = ['https://app.example'];
    const guard = new BrowserNonceGuard({ allowedOrigins }); allowedOrigins.push('https://evil.example');
    for (const origin of ['https://evil.example', 'https://app.example.evil', 'https://app.example/']) assert.throws(() => guard.issue('session', https(origin)));
    assert.throws(() => guard.issue('session', https(), 'invalid-cookie'));
  });
});
