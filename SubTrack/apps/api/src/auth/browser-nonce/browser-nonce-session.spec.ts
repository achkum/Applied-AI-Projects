import { describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { BrowserNonceGuard, BROWSER_NONCE_TTL_MS, InMemoryBrowserNonceStore, type BrowserNonceStore } from './browser-nonce.js';

const evidence = (origin = 'https://app.example') => ({ origin, isHttps: true, explicitLoopbackDevelopment: false });
const guardFor = (store: BrowserNonceStore, clock: () => number = () => 1_000) =>
  new BrowserNonceGuard({ allowedOrigins: ['https://app.example', 'https://other.example'], clock }, store);

describe('BrowserNonceGuard.consumeForSession', () => {
  it('terminally returns the frozen trusted context and creates no successor', () => {
    const store = new InMemoryBrowserNonceStore(), guard = guardFor(store);
    const issued = guard.issue('session', evidence());
    const before = store.snapshot()[0];
    assert(before);
    const context = guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret);
    assert.deepEqual(context, { chainId: before.chainId, origin: before.origin, purpose: 'session' });
    assert(Object.isFrozen(context));
    assert.deepEqual(store.snapshot(), []);
    assert.throws(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret));
    assert.throws(() => guard.validateBound('session', evidence(), issued.nonce, issued.cookieSecret));
    assert.throws(() => guard.consumeAndRotate('session', evidence(), issued.nonce, issued.cookieSecret));
    assert.deepEqual(store.snapshot(), []);
  });

  it('preserves a live row on OTP purpose, wrong origin, and wrong cookie mismatches', () => {
    const store = new InMemoryBrowserNonceStore(), guard = guardFor(store);
    const otp = guard.issue('otp_step_up', evidence());
    const live = guard.issue('session', evidence());
    const original = store.snapshot();
    assert.throws(() => guard.consumeForSession(evidence(), otp.nonce, otp.cookieSecret));
    assert.throws(() => guard.consumeForSession(evidence('https://other.example'), live.nonce, live.cookieSecret));
    assert.throws(() => guard.consumeForSession(evidence(), live.nonce, otp.cookieSecret));
    assert.deepEqual(store.snapshot(), original);
  });

  it('does not prune or mutate any row for an unsafe clock or a backdated time', () => {
    let now = 1_000;
    const store = new InMemoryBrowserNonceStore(), guard = guardFor(store, () => now);
    const first = guard.issue('session', evidence());
    const second = guard.issue('session', evidence());
    const original = store.snapshot();
    now = Number.MAX_SAFE_INTEGER;
    assert.throws(() => guard.consumeForSession(evidence(), first.nonce, first.cookieSecret));
    assert.deepEqual(store.snapshot(), original);
    now = 999;
    assert.throws(() => guard.consumeForSession(evidence(), first.nonce, first.cookieSecret));
    assert.deepEqual(store.snapshot(), original);
    assert.equal(second.nonce.length, 43);
  });

  it('rejects expiry and preserves unrelated rows', () => {
    let now = 5_000;
    const store = new InMemoryBrowserNonceStore(), guard = guardFor(store, () => now);
    const expired = guard.issue('session', evidence());
    now += 1;
    const other = guard.issue('session', evidence());
    const otherRecord = store.snapshot()[1];
    assert(otherRecord);
    now = expired.expiresAt;
    assert.throws(() => guard.consumeForSession(evidence(), expired.nonce, expired.cookieSecret));
    const rows = store.snapshot();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.nonceHash, otherRecord.nonceHash);
    assert.equal(rows[0]?.chainId, otherRecord.chainId);
    assert.equal(other.nonce.length, 43);
  });

  it('allows one winner in terminal-versus-terminal and terminal-versus-rotation races', async () => {
    for (const competeWithRotation of [false, true]) {
      const store = new InMemoryBrowserNonceStore(), guard = guardFor(store);
      const issued = guard.issue('session', evidence());
      const outcomes = await Promise.allSettled([
        Promise.resolve().then(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret)),
        Promise.resolve().then(() => competeWithRotation
          ? guard.consumeAndRotate('session', evidence(), issued.nonce, issued.cookieSecret)
          : guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret)),
      ]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
      if (competeWithRotation) assert.equal(store.snapshot().length, outcomes[0]?.status === 'fulfilled' ? 0 : 1);
      else assert.deepEqual(store.snapshot(), []);
    }
  });

  it('fails closed when the adapter has no terminal consume port', () => {
    const base = new InMemoryBrowserNonceStore();
    const adapter: BrowserNonceStore = {
      bootstrap: base.bootstrap.bind(base), peek: base.peek.bind(base), rotate: base.rotate.bind(base),
    };
    const guard = guardFor(adapter), issued = guard.issue('session', evidence());
    assert.throws(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret), { message: 'Browser nonce unavailable' });
    assert.equal(base.snapshot().length, 1);
  });
});


describe('terminal adapter boundaries and orderings', () => {
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])('fails before mutation on unsafe clock %s', (time) => {
    let now = 1_000; const store = new InMemoryBrowserNonceStore(), guard = guardFor(store, () => now);
    const issued = guard.issue('session', evidence()), before = store.snapshot(); now = time;
    assert.throws(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret), { message: 'Browser nonce unavailable' });
    assert.deepEqual(store.snapshot(), before);
  });
  it('does not invoke an adapter method accessor or fallback methods', () => {
    const base = new InMemoryBrowserNonceStore();
    const adapter: BrowserNonceStore = { bootstrap: base.bootstrap.bind(base), peek: vi.fn(base.peek.bind(base)), rotate: vi.fn(base.rotate.bind(base)) };
    const getter = vi.fn(); Object.defineProperty(adapter, 'consumeSession', { get: getter });
    const guard = guardFor(adapter), issued = guard.issue('session', evidence());
    assert.throws(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret));
    assert.equal(getter.mock.calls.length, 0); assert.equal(vi.mocked(adapter.peek).mock.calls.length, 0); assert.equal(vi.mocked(adapter.rotate).mock.calls.length, 0);
    assert.equal(base.snapshot().length, 1);
  });
  it.each(['nonceHash', 'cookieHash', 'origin', 'purpose', 'chainId', 'issuedAt', 'expiresAt', 'accessor', 'hidden', 'symbol', 'extra', 'inherited', 'thenable'])('rejects a malformed adapter %s outcome without getter calls or retries', (field) => {
    const base = new InMemoryBrowserNonceStore(), getter = vi.fn(); let calls = 0;
    const adapter: BrowserNonceStore = {
      bootstrap: base.bootstrap.bind(base), peek: base.peek.bind(base), rotate: base.rotate.bind(base),
      consumeSession(n, c, o, t) {
        calls++; const original = base.consumeSession(n, c, o, t); assert(original);
        const row = { ...original } as Record<string | symbol, unknown>;
        if (field === 'accessor') Object.defineProperty(row, 'chainId', { enumerable: true, get: getter });
        else if (field === 'hidden') Object.defineProperty(row, 'chainId', { enumerable: false, value: row.chainId });
        else if (field === 'symbol') row[Symbol('extra')] = 'extra';
        else if (field === 'extra') row.extra = 'extra';
        else if (field === 'inherited') Object.setPrototypeOf(row, {});
        else if (field === 'thenable') Object.defineProperty(row, 'then', { get: getter });
        else if (field === 'issuedAt') { row.issuedAt = -1; row.expiresAt = BROWSER_NONCE_TTL_MS - 1; }
        else row[field] = field === 'expiresAt' ? t : field === 'chainId' ? '' : 'wrong';
        return row as never;
      },
    };
    const guard = guardFor(adapter), issued = guard.issue('session', evidence());
    assert.throws(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret), { message: 'Browser nonce unavailable' });
    assert.equal(calls, 1); assert.equal(getter.mock.calls.length, 0); assert.deepEqual(base.snapshot(), []);
  });
  it('preserves method receiver and consumes a mutable valid result into an independent frozen context', () => {
    const base = new InMemoryBrowserNonceStore(); let returned: ReturnType<InMemoryBrowserNonceStore['consumeSession']> = null;
    const adapter: BrowserNonceStore = {
      bootstrap: base.bootstrap.bind(base), peek: base.peek.bind(base), rotate: base.rotate.bind(base),
      consumeSession(n, c, o, t) { assert.equal(this, adapter); const row = base.consumeSession(n,c,o,t); assert(row); returned = { ...row }; return returned; },
    };
    const guard = guardFor(adapter), issued = guard.issue('session', evidence()), expected = guard.validateBound('session', evidence(), issued.nonce, issued.cookieSecret);
    const result = guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret);
    assert(returned); Object.assign(returned, { chainId: 'mutated' }); assert.deepEqual(result, expected); assert(Object.isFrozen(result));
  });
  it('lets rotation win first and terminally consumes only its successor in the same chain', async () => {
    const store = new InMemoryBrowserNonceStore(), guard = guardFor(store), issued = guard.issue('session', evidence());
    const expected = guard.validateBound('session', evidence(), issued.nonce, issued.cookieSecret);
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => guard.consumeAndRotate('session', evidence(), issued.nonce, issued.cookieSecret)),
      Promise.resolve().then(() => guard.consumeForSession(evidence(), issued.nonce, issued.cookieSecret)),
    ]);
    assert.equal(outcomes[0]?.status, 'fulfilled'); assert.equal(outcomes[1]?.status, 'rejected');
    const winner = outcomes[0]; assert(winner?.status === 'fulfilled'); assert.equal(store.snapshot().length,1);
    assert.deepEqual(guard.consumeForSession(evidence(), winner.value.nonce, issued.cookieSecret), expected); assert.deepEqual(store.snapshot(),[]);
  });
  it('enforces actual HTTPS and only the explicitly configured loopback exception', () => {
    const store = new InMemoryBrowserNonceStore(), guard = guardFor(store), issued = guard.issue('session', evidence());
    assert.throws(() => guard.consumeForSession({ ...evidence(), isHttps: false }, issued.nonce, issued.cookieSecret));
    assert.equal(store.snapshot().length,1);
    const localStore = new InMemoryBrowserNonceStore();
    const local = new BrowserNonceGuard({ allowedOrigins:['http://localhost:3000'],allowLoopbackHttpDevelopment:true,clock:()=>1_000 },localStore);
    const localEvidence = { origin:'http://localhost:3000',isHttps:false,explicitLoopbackDevelopment:true };
    const boot = local.issue('session', localEvidence);
    assert.throws(() => local.consumeForSession({ ...localEvidence, explicitLoopbackDevelopment:false },boot.nonce,boot.cookieSecret));
    assert.equal(localStore.snapshot().length,1); assert.equal(local.consumeForSession(localEvidence,boot.nonce,boot.cookieSecret).origin,localEvidence.origin);
  });
});
