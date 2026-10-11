import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { inspect } from 'node:util';
import { afterEach, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createDevelopmentBootstrapMaterialProducer as create } from './development-bootstrap-material.js';

vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes), createHash: vi.fn(actual.createHash) };
});
let actual: typeof import('node:crypto');
beforeAll(async () => { actual = await vi.importActual<typeof import('node:crypto')>('node:crypto'); });
const random = vi.mocked(crypto.randomBytes), hash = vi.mocked(crypto.createHash);
const config = () => ({ enabled: true, origin: 'https://st233a.invalid', epoch: 'development-1', manifestHash: 'a'.repeat(64) });
const generic = (call: () => unknown) => {
  let error: unknown;
  try { call(); } catch (caught) { error = caught; }
  assert(error instanceof Error);
  assert.equal(error.message, 'Browser nonce unavailable');
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.deepEqual(Object.keys(error), []);
};
const encoded = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value) &&
  Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value;
const sha = (kind: string, value: string) => actual.createHash('sha256')
  .update(`subtrack:browser-nonce:v2:${kind}:${value}`, 'utf8').digest('hex');

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  random.mockReset().mockImplementation(actual.randomBytes);
  hash.mockReset().mockImplementation(actual.createHash);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('private development bootstrap material', () => {
  it.each(['enroll_identifier', 'otp_step_up', 'session'] as const)('derives unbound %s material privately with unchanged digest domains', purpose => {
    const producer = create(config()), handle = producer.produce(purpose);
    const before = [JSON.stringify(handle), JSON.stringify({ ...handle }), inspect(handle), inspect(handle, { showHidden: true })];
    const secrets = handle.discloseSecrets();
    // Boolean assertions keep random plaintext out of failure diagnostics.
    assert(encoded(secrets.nonce) && encoded(secrets.cookieSecret) && encoded(handle.sql.chainId));
    assert(new Set([secrets.nonce, secrets.cookieSecret, handle.sql.chainId]).size === 3);
    assert(before.every(view => !view.includes(secrets.nonce) && !view.includes(secrets.cookieSecret)));
    assert.equal(handle.sql.nonceHash, sha('nonce', secrets.nonce));
    assert.equal(handle.sql.bindingHash, sha('cookie', secrets.cookieSecret));
    assert(handle.sql.nonceHash !== sha('cookie', secrets.nonce));
    assert(handle.sql.bindingHash !== sha('nonce', secrets.cookieSecret));
    assert.deepEqual(random.mock.calls.map(args => args[0]), [32, 32, 32]);
    assert.deepEqual(Reflect.ownKeys(handle), ['sql', 'discloseSecrets']);
    assert.deepEqual(Object.keys(handle), ['sql']);
    assert.deepEqual(Object.keys(secrets), ['nonce', 'cookieSecret']);
    assert.deepEqual(Object.keys(handle.sql), ['nonceHash', 'bindingHash', 'chainId', 'transport', 'origin', 'epoch', 'manifestHash', 'purpose', 'authorityHash']);
    assert.equal(handle.sql.transport, 'web');
    assert.equal(handle.sql.authorityHash, null);
    assert.equal(handle.sql.purpose, purpose);
    assert.equal(handle.sql.origin, config().origin);
    assert.equal(handle.sql.epoch, config().epoch);
    assert.equal(handle.sql.manifestHash, config().manifestHash);
    assert([producer, handle, handle.sql, secrets].every(Object.isFrozen));
    const descriptor = Object.getOwnPropertyDescriptor(handle, 'discloseSecrets');
    assert(descriptor && 'value' in descriptor);
    assert.equal(typeof descriptor.value, 'function');
    assert.equal(descriptor.enumerable, false);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.value.length, 0);
    assert.throws(() => Object.defineProperty(handle, 'discloseSecrets', { value: () => ({}) }), TypeError);
    assert.throws(() => Object.defineProperty(handle.sql, 'authorityHash', { value: 'forged' }), TypeError);
    generic(() => Reflect.apply(handle.discloseSecrets, undefined, ['commit assertion']));
  });

  it('captures data configuration before caller mutation or getter replacement', () => {
    const input = config(), producer = create(input);
    input.origin = 'https://elsewhere.invalid'; input.epoch = 'other'; input.manifestHash = 'b'.repeat(64); input.enabled = false;
    let reads = 0;
    Object.defineProperty(input, 'origin', { get() { reads++; throw new Error('caller'); } });
    const handle = producer.produce('session');
    assert.equal(reads, 0);
    assert.equal(handle.sql.origin, config().origin);
    assert.equal(handle.sql.epoch, config().epoch);
    assert.equal(handle.sql.manifestHash, config().manifestHash);
  });

  it('uses fresh independent entropy on successive productions', () => {
    const producer = create(config()), first = producer.produce('session'), second = producer.produce('session');
    const a = first.discloseSecrets(), b = second.discloseSecrets();
    assert(new Set([a.nonce, a.cookieSecret, first.sql.chainId, b.nonce, b.cookieSecret, second.sql.chainId]).size === 6);
    assert.deepEqual(random.mock.calls.map(args => args[0]), [32, 32, 32, 32, 32, 32]);
  });

  it.each([undefined, 'production', 'test', '', 'Development'])('refuses construction and production under environment %s', environment => {
    const producer = create(config());
    vi.stubEnv('NODE_ENV', environment);
    generic(() => create(config())); generic(() => producer.produce('session'));
    assert.equal(random.mock.calls.length, 0);
  });

  it('rejects all non-data configuration without invoking getters', () => {
    let reads = 0;
    for (const key of Object.keys(config())) {
      const accessor = Object.defineProperty(config(), key, { enumerable: true, get() { reads++; throw new Error('caller'); } });
      generic(() => create(accessor));
      generic(() => create(Object.defineProperty(config(), key, { enumerable: false })));
      const missing: Record<string, unknown> = config(); delete missing[key]; generic(() => create(missing));
    }
    const inherited = Object.create(config()) as unknown;
    const inputs: unknown[] = [null, undefined, [], true, 1, 'config', new Date(), Object.create(null), inherited,
      Object.assign(Object.create({ inherited: true }) as object, config()),
      { ...config(), [Symbol('secret')]: 'caller' }];
    for (const value of inputs) generic(() => create(value));
    for (const key of ['nonce', 'cookieSecret', 'chainId', 'bindingHash', 'nonceHash', 'owner', 'principal', 'material', 'clock', 'randomBytes', 'store', 'previousCookie'])
      generic(() => create({ ...config(), [key]: 'caller' }));
    assert.equal(reads, 0); assert.equal(random.mock.calls.length, 0);
  });

  it('rejects malformed scalar configuration with no fallback entropy', () => {
    const invalid: Record<string, unknown[]> = {
      enabled: [false, undefined, null, 1, 'true', new Boolean(true)],
      origin: [null, 1, '', 'null', ' https://st233a.invalid', 'https://st233a.invalid ', 'http://localhost',
        'https://st233a.invalid/', 'https://ST233A.invalid', 'https://st233a.invalid:443', 'https://u:p@st233a.invalid',
        'https://*.invalid', 'https://st233a.invalid/path', 'https://st233a.invalid?q=x', 'https://st233a.invalid#x', new String(config().origin)],
      epoch: [null, 1, '', ' ', ' epoch', 'epoch ', new String('epoch')],
      manifestHash: [null, 1, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), new String('a'.repeat(64))],
    };
    for (const [key, values] of Object.entries(invalid)) for (const value of values) generic(() => create({ ...config(), [key]: value }));
    assert.equal(random.mock.calls.length, 0);
  });

  it('refuses missing/extra arguments and runtime purpose selectors before entropy', () => {
    generic(() => Reflect.apply(create, undefined, []));
    generic(() => Reflect.apply(create, undefined, [config(), { nonce: 'caller' }]));
    const producer = create(config());
    for (const value of [undefined, null, '', 'login', 'Session', 1, true, {}, ['session'], new String('session'), Symbol('session')])
      generic(() => Reflect.apply(producer.produce, undefined, [value]));
    generic(() => Reflect.apply(producer.produce, undefined, []));
    generic(() => Reflect.apply(producer.produce, undefined, ['session', undefined]));
    generic(() => Reflect.apply(producer.produce, undefined, ['session', { authorityHash: 'caller', nonce: 'caller' }]));
    assert.equal(random.mock.calls.length, 0);
  });

  it.each([1, 2, 3])('entropy fault at step %s returns no partial material or cause', step => {
    let calls = 0, partial: unknown;
    random.mockImplementation((size: number) => {
      if (++calls === step) throw new Error('private entropy fault');
      return actual.randomBytes(size);
    });
    generic(() => { partial = create(config()).produce('session'); });
    assert.equal(partial, undefined); assert.equal(calls, step); assert.equal(hash.mock.calls.length, 0);
  });

  it.each([0, 31, 33])('refuses entropy of incorrect byte length %s', size => {
    random.mockImplementation(() => Buffer.alloc(size));
    generic(() => create(config()).produce('session'));
    assert.equal(hash.mock.calls.length, 0);
  });

  it('refuses nonbuffer, noncanonical or duplicate generated entropy without retry', () => {
    random.mockImplementation(() => ({ toString: () => 'A'.repeat(43) } as Buffer));
    generic(() => create(config()).produce('session'));
    for (const malformed of ['!', 'A'.repeat(42), 'A'.repeat(42) + 'B']) {
      const bytes = Buffer.alloc(32);
      vi.spyOn(bytes, 'toString').mockReturnValue(malformed);
      random.mockImplementation(() => bytes); generic(() => create(config()).produce('session'));
    }
    for (const duplicate of [[1, 1, 2], [1, 2, 1], [1, 2, 2]]) {
      random.mockClear(); let index = 0;
      random.mockImplementation(() => Buffer.alloc(32, duplicate[index++]));
      generic(() => create(config()).produce('session'));
      assert.equal(random.mock.calls.length, 3);
    }
    assert.equal(hash.mock.calls.length, 0);
  });

  it.each([1, 2])('hash fault at step %s yields generic failure with no partial handle', step => {
    let calls = 0, partial: unknown;
    hash.mockImplementation((algorithm: string) => {
      if (++calls === step) throw new Error('private digest fault');
      return actual.createHash(algorithm);
    });
    generic(() => { partial = create(config()).produce('session'); });
    assert.equal(partial, undefined); assert.equal(calls, step);
  });

  it.each(['update', 'digest', 'invalid'])('fails closed on hash %s output without secret diagnostics', mode => {
    hash.mockImplementation((algorithm: string) => {
      const hasher = actual.createHash(algorithm);
      if (mode === 'update') vi.spyOn(hasher, 'update').mockImplementation(() => { throw new Error('private hash'); });
      else vi.spyOn(hasher, 'digest').mockImplementation(() => {
        if (mode === 'digest') throw new Error('private hash');
        return 'A'.repeat(64);
      });
      return hasher;
    });
    let partial: unknown;
    generic(() => { partial = create(config()).produce('session'); });
    assert.equal(partial, undefined);
  });
});
