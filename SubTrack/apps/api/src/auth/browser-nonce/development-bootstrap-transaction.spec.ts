import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createDevelopmentBootstrapTransaction as create, type TrustedBootstrapTransactionPort } from './development-bootstrap-transaction.js';

vi.mock('node:crypto', async importOriginal => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, randomBytes: vi.fn(original.randomBytes), createHash: vi.fn(original.createHash),
    createHmac: vi.fn(original.createHmac) };
});
let original: typeof import('node:crypto');
beforeAll(async () => { original = await vi.importActual<typeof import('node:crypto')>('node:crypto'); });
const random = vi.mocked(crypto.randomBytes), hash = vi.mocked(crypto.createHash), hmac = vi.mocked(crypto.createHmac);
const key = '!'.repeat(16);
const config = () => ({ enabled: true, origin: 'https://st233a.invalid', epoch: 'development-1',
  manifestHash: 'a'.repeat(64), retentionMs: 86_400_000,
  idempotencyKey: new Uint8Array(32).fill(37), originKey: new Uint8Array(32).fill(93) });
type Burn = Parameters<TrustedBootstrapTransactionPort['reserve']>[0];
type Nonce = Parameters<TrustedBootstrapTransactionPort['operation']>[1];
type Outcome = Awaited<ReturnType<TrustedBootstrapTransactionPort['operation']>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function port() {
  const seen: { reserve: Burn[]; operation: Array<[Burn, Nonce]>; fail: Burn[] } =
    { reserve: [], operation: [], fail: [] };
  const adapter: TrustedBootstrapTransactionPort = {
    reserve(burn) { seen.reserve.push(burn); return Promise.resolve('knownCommitted'); },
    operation(burn, nonce) { seen.operation.push([burn, nonce]); return Promise.resolve('knownCommitted'); },
    fail(burn) { seen.fail.push(burn); return Promise.resolve('knownCommitted'); },
  };
  return { adapter, seen };
}
async function generic(call: () => Promise<unknown> | unknown): Promise<void> {
  let error: unknown;
  try { await call(); } catch (caught) { error = caught; }
  assert(error instanceof Error);
  assert.equal(error.message, 'AUTH_RESTART_REQUIRED');
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.deepEqual(Object.keys(error), []);
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  random.mockReset().mockImplementation(original.randomBytes);
  hash.mockReset().mockImplementation(original.createHash);
  hmac.mockReset().mockImplementation(original.createHmac);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('private awaited development bootstrap lifecycle', () => {
  it.each(['enroll_identifier', 'otp_step_up', 'session'] as const)('orders %s burn, operation and disclosure', async purpose => {
    const { adapter, seen } = port(), pending = deferred<'knownCommitted'>(), committed = deferred<Outcome>();
    adapter.reserve = function (burn) { seen.reserve.push(burn); return pending.promise; };
    adapter.operation = function (burn, nonce) { seen.operation.push([burn, nonce]); return committed.promise; };
    const lifecycle = create(config(), adapter);
    let disclosed = false;
    const result = lifecycle.issue(key, purpose).then(value => { disclosed = true; return value; });
    assert.equal(seen.reserve.length, 1);
    assert.equal(seen.operation.length, 0);
    assert.equal(disclosed, false);
    pending.resolve('knownCommitted');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(seen.operation.length, 1);
    assert.equal(disclosed, false);
    const burn = seen.reserve[0]!, nonce = seen.operation[0]![1];
    assert.strictEqual(seen.operation[0]![0], burn);
    assert(Object.isFrozen(burn) && Object.isFrozen(nonce));
    assert.deepEqual(Object.keys(burn), ['keyHash', 'ownerHash', 'authorityHash', 'requestHash',
      'operation', 'authorityKind', 'transport', 'origin', 'epoch', 'manifestHash', 'purpose', 'retentionMs']);
    assert.deepEqual(Object.keys(nonce), ['nonceHash', 'bindingHash', 'chainId', 'transport',
      'origin', 'epoch', 'manifestHash', 'purpose', 'authorityHash']);
    assert.equal(burn.operation, 'createV2BrowserNonce');
    assert.equal(burn.authorityKind, 'browser-bootstrap-origin');
    assert.equal(burn.transport, 'web'); assert.equal(nonce.transport, 'web');
    assert.equal(nonce.authorityHash, null);
    for (const field of ['origin', 'epoch', 'manifestHash', 'purpose'] as const)
      assert.equal(burn[field], nonce[field]);
    assert.equal(burn.purpose, purpose); assert.equal(burn.retentionMs, config().retentionMs);
    // SQL receives only hash/opaque material, never raw response secrets.
    const portView = JSON.stringify([burn, nonce]);
    committed.resolve('knownCommitted');
    const secrets = await result;
    assert(disclosed);
    assert(/^[A-Za-z0-9_-]{43}$/.test(secrets.nonce));
    assert(/^[A-Za-z0-9_-]{43}$/.test(secrets.cookieSecret));
    assert(!portView.includes(secrets.nonce) && !portView.includes(secrets.cookieSecret));
    assert.equal(seen.fail.length, 0);
  });

  it('captures own data methods and receiver before a pending reserve is mutated', async () => {
    const { adapter, seen } = port(), pending = deferred<'knownCommitted'>();
    let receiverCount = 0;
    adapter.reserve = function (burn) { assert.strictEqual(this, adapter); seen.reserve.push(burn); return pending.promise; };
    adapter.operation = function (burn, nonce) {
      assert.strictEqual(this, adapter); receiverCount++; seen.operation.push([burn, nonce]);
      return Promise.resolve('knownCommitted');
    };
    adapter.fail = function (burn) { assert.strictEqual(this, adapter); seen.fail.push(burn); return Promise.resolve('knownCommitted'); };
    const lifecycle = create(config(), adapter), result = lifecycle.issue(key, 'session');
    Object.defineProperty(adapter, 'operation', { get() { throw Error('redirected'); } });
    Object.defineProperty(adapter, 'fail', { get() { throw Error('redirected'); } });
    pending.resolve('knownCommitted');
    await result;
    assert.equal(receiverCount, 1);
    assert.equal(seen.operation.length, 1);
  });

  it('passes the same complete witness to exactly one conditional failure after known rollback', async () => {
    const { adapter, seen } = port(), pending = deferred<Outcome>();
    adapter.operation = function (burn, nonce) { seen.operation.push([burn, nonce]); return pending.promise; };
    const result = create(config(), adapter).issue(key, 'session');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(seen.fail.length, 0);
    pending.resolve('knownRollback');
    await generic(() => result);
    assert.equal(seen.reserve.length, 1); assert.equal(seen.operation.length, 1);
    assert.equal(seen.fail.length, 1);
    assert.strictEqual(seen.fail[0], seen.reserve[0]);
    assert.strictEqual(seen.operation[0]![0], seen.reserve[0]);
  });

  it.each(['unknown', 'malformed', 'throw', 'reject'] as const)('stops after %s reserve without operation', async mode => {
    const { adapter, seen } = port();
    adapter.reserve = function (burn) {
      seen.reserve.push(burn);
      if (mode === 'throw') throw Error('private reserve');
      if (mode === 'reject') return Promise.reject(Error('private reserve'));
      return Promise.resolve(mode === 'unknown' ? 'unknown' : 'other' as 'unknown');
    };
    await generic(() => create(config(), adapter).issue(key, 'session'));
    assert.equal(seen.reserve.length, 1); assert.equal(seen.operation.length, 0); assert.equal(seen.fail.length, 0);
  });

  it.each(['unknown', 'malformed', 'throw', 'reject'] as const)('stops after %s operation without compensating', async mode => {
    const { adapter, seen } = port();
    adapter.operation = function (burn, nonce) {
      seen.operation.push([burn, nonce]);
      if (mode === 'throw') throw Error('private operation');
      if (mode === 'reject') return Promise.reject(Error('private operation'));
      return Promise.resolve(mode === 'unknown' ? 'unknown' : 'other' as Outcome);
    };
    await generic(() => create(config(), adapter).issue(key, 'session'));
    assert.equal(seen.reserve.length, 1); assert.equal(seen.operation.length, 1); assert.equal(seen.fail.length, 0);
  });

  it.each(['unknown', 'malformed', 'throw', 'reject'] as const)('fails closed on %s failed settlement', async mode => {
    const { adapter, seen } = port();
    adapter.operation = function (burn, nonce) { seen.operation.push([burn, nonce]); return Promise.resolve('knownRollback'); };
    adapter.fail = function (burn) {
      seen.fail.push(burn);
      if (mode === 'throw') throw Error('private failed settlement');
      if (mode === 'reject') return Promise.reject(Error('private failed settlement'));
      return Promise.resolve(mode === 'unknown' ? 'unknown' : 'other' as Outcome);
    };
    await generic(() => create(config(), adapter).issue(key, 'session'));
    assert.equal(seen.reserve.length, 1); assert.equal(seen.operation.length, 1); assert.equal(seen.fail.length, 1);
    assert.strictEqual(seen.fail[0], seen.reserve[0]);
  });

  it('rejects config accessors, extras, invalid mode and disabled gates without port calls', async () => {
    const { adapter, seen } = port(); let reads = 0;
    for (const field of Object.keys(config())) {
      const bad = Object.defineProperty(config(), field, { get() { reads++; throw Error('getter'); } });
      await generic(() => create(bad, adapter));
    }
    for (const bad of [null, [], { ...config(), owner: 'caller' }, { ...config(), enabled: false },
      { ...config(), origin: 'http://localhost' }, { ...config(), retentionMs: 0 },
      { ...config(), idempotencyKey: new Uint8Array(31) }]) await generic(() => create(bad, adapter));
    assert.equal(reads, 0);
    const lifecycle = create(config(), adapter);
    for (const environment of ['test', 'production', undefined]) {
      vi.stubEnv('NODE_ENV', environment);
      await generic(() => create(config(), adapter));
      await generic(() => lifecycle.issue(key, 'session'));
    }
    assert.equal(seen.reserve.length, 0);
  });

  it('rejects port getters, inherited/missing/extra methods and wrong argument shape', async () => {
    let reads = 0;
    for (const field of ['reserve', 'operation', 'fail'] as const) {
      const { adapter } = port();
      Object.defineProperty(adapter, field, { get() { reads++; throw Error('getter'); } });
      await generic(() => create(config(), adapter));
      const missing = port().adapter as unknown as Record<string, unknown>;
      delete missing[field]; await generic(() => create(config(), missing as TrustedBootstrapTransactionPort));
    }
    await generic(() => create(config(), Object.assign(Object.create(port().adapter) as object, {}) as TrustedBootstrapTransactionPort));
    await generic(() => create(config(), { ...port().adapter, extra: true } as TrustedBootstrapTransactionPort));
    await generic(() => Reflect.apply(create, undefined, [config(), port().adapter, 'extra']));
    assert.equal(reads, 0);
    const { adapter, seen } = port(), lifecycle = create(config(), adapter);
    for (const invalid of [null, undefined, '', 'a'.repeat(15), 'a'.repeat(256), ' '.repeat(16),
      'é'.repeat(16), new String(key), { key, owner: 'caller' }])
      await generic(() => Reflect.apply(lifecycle.issue, undefined, [invalid, 'session']));
    for (const invalid of [null, undefined, 'login', {}, new String('session')])
      await generic(() => Reflect.apply(lifecycle.issue, undefined, [key, invalid]));
    await generic(() => Reflect.apply(lifecycle.issue, undefined, [key]));
    await generic(() => Reflect.apply(lifecycle.issue, undefined, [key, 'session', {}]));
    assert.equal(seen.reserve.length, 0); assert.equal(random.mock.calls.length, 0);
  });

  it('captures scalar config and copied keys before caller mutation', async () => {
    const input = config(), expected = config(), { adapter, seen } = port();
    const lifecycle = create(input, adapter);
    input.origin = 'https://changed.invalid'; input.epoch = 'changed'; input.manifestHash = 'b'.repeat(64);
    input.idempotencyKey.fill(0); input.originKey.fill(0); input.retentionMs = 1; input.enabled = false;
    await lifecycle.issue(key, 'session');
    const burn = seen.reserve[0]!;
    assert.equal(burn.origin, expected.origin); assert.equal(burn.epoch, expected.epoch);
    assert.equal(burn.manifestHash, expected.manifestHash); assert.equal(burn.retentionMs, expected.retentionMs);
    const expectedKey = original.createHmac('sha256', expected.idempotencyKey)
      .update(`subtrack:v2:idempotency:core:v1:key:${key}`, 'utf8').digest('hex');
    assert.equal(burn.keyHash, expectedKey);
  });

  it.each(['entropy', 'hash', 'hmac'] as const)('producer %s faults before any port call', async mode => {
    const { adapter, seen } = port();
    if (mode === 'entropy') random.mockImplementation(() => { throw Error('private entropy'); });
    if (mode === 'hash') hash.mockImplementation(() => { throw Error('private hash'); });
    if (mode === 'hmac') hmac.mockImplementation(() => { throw Error('private hmac'); });
    await generic(() => create(config(), adapter).issue(key, 'session'));
    assert.equal(seen.reserve.length, 0); assert.equal(seen.operation.length, 0); assert.equal(seen.fail.length, 0);
  });
});
