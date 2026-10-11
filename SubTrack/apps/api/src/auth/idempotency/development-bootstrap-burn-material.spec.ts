import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { inspect } from 'node:util';
import { afterEach, beforeAll, beforeEach, describe, it, vi } from 'vitest';
import { createDevelopmentBootstrapBurnMaterialProducer as create } from './development-bootstrap-burn-material.js';

vi.mock('node:crypto', async importOriginal => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, randomBytes: vi.fn(original.randomBytes), createHash: vi.fn(original.createHash), createHmac: vi.fn(original.createHmac) };
});
let original: typeof import('node:crypto');
beforeAll(async () => { original = await vi.importActual<typeof import('node:crypto')>('node:crypto'); });
const random = vi.mocked(crypto.randomBytes), hash = vi.mocked(crypto.createHash), hmac = vi.mocked(crypto.createHmac);
const configuration = () => ({ enabled: true, origin: 'https://st233a.invalid', epoch: 'development-1',
  manifestHash: 'a'.repeat(64), idempotencyKey: new Uint8Array(32).fill(37), originKey: new Uint8Array(32).fill(93), retentionMs: 86_400_000 });
const key = 'A'.repeat(16);
function generic(call: () => unknown): void {
  let error: unknown;
  try { call(); } catch (caught) { error = caught; }
  assert(error instanceof Error);
  assert.equal(error.message, 'AUTH_RESTART_REQUIRED');
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.deepEqual(Object.keys(error), []);
}
const sha = (value: string) => original.createHash('sha256').update(value, 'utf8').digest('hex');
const keyed = (secret: Uint8Array, value: string) => original.createHmac('sha256', secret).update(value, 'utf8').digest('hex');

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  random.mockReset().mockImplementation(original.randomBytes);
  hash.mockReset().mockImplementation(original.createHash);
  hmac.mockReset().mockImplementation(original.createHmac);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('private development bootstrap burn material', () => {
  it.each(['enroll_identifier', 'otp_step_up', 'session'] as const)('derives complete %s witness from original Node domains', purpose => {
    const input = configuration();
    const entropy = Buffer.alloc(32, 19);
    random.mockImplementation(() => Buffer.from(entropy));
    const producer = create(input), material = producer.produce(key, purpose);
    const owner = entropy.toString('base64url');
    assert.deepEqual(Object.keys(material), ['sql']);
    assert.deepEqual(Reflect.ownKeys(material), ['sql']);
    assert.deepEqual(Object.keys(material.sql), ['keyHash', 'ownerHash', 'authorityHash', 'requestHash',
      'operation', 'authorityKind', 'transport', 'origin', 'epoch', 'manifestHash', 'purpose', 'retentionMs']);
    assert.equal(material.sql.keyHash, keyed(input.idempotencyKey, `subtrack:v2:idempotency:core:v1:key:${key}`));
    assert.equal(material.sql.ownerHash, sha(`subtrack:v2:idempotency:core:v1:owner:${owner}`));
    assert.equal(material.sql.authorityHash, keyed(input.originKey, `subtrack:v2:browser-bootstrap-origin:v1:${input.origin}`));
    assert.equal(material.sql.requestHash, sha(`subtrack:v2:browser-nonce:request:v1:${Buffer.byteLength(purpose, 'utf8')}:${purpose}`));
    assert(material.sql.requestHash !== sha(`subtrack:v2:browser-nonce:request:v1:${purpose}`));
    assert.equal(material.sql.operation, 'createV2BrowserNonce');
    assert.equal(material.sql.authorityKind, 'browser-bootstrap-origin');
    assert.equal(material.sql.transport, 'web');
    assert.equal(material.sql.origin, input.origin);
    assert.equal(material.sql.epoch, input.epoch);
    assert.equal(material.sql.manifestHash, input.manifestHash);
    assert.equal(material.sql.purpose, purpose);
    assert.equal(material.sql.retentionMs, input.retentionMs);
    assert(input.idempotencyKey.every(byte => byte === 37) && input.originKey.every(byte => byte === 93));
    assert([producer, material, material.sql].every(Object.isFrozen));
    assert.deepEqual(random.mock.calls.map(args => args[0]), [32]);
    assert.throws(() => Object.defineProperty(material.sql, 'ownerHash', { value: 'forged' }), TypeError);
    const views = [JSON.stringify(material), JSON.stringify({ ...material }), inspect(material), inspect(material, { showHidden: true })];
    const rawKey = Buffer.from(input.idempotencyKey).toString('hex');
    const rawOriginKey = Buffer.from(input.originKey).toString('hex');
    assert(views.every(view => !view.includes(owner) && !view.includes(key) &&
      !view.includes(rawKey) && !view.includes(rawOriginKey)));
  });

  it('accepts only printable primitive ASCII keys at the exact length boundaries', () => {
    const producer = create(configuration());
    producer.produce('!'.repeat(16), 'session');
    producer.produce('~'.repeat(255), 'session');
    for (const invalid of ['!'.repeat(15), '!'.repeat(256), ' '.repeat(16), '\n' + '!'.repeat(15),
      'é' + '!'.repeat(15), '🙂' + '!'.repeat(15), new String(key), null, undefined, 1])
      generic(() => Reflect.apply(producer.produce, undefined, [invalid, 'session']));
    assert.equal(random.mock.calls.length, 2);
  });

  it('copies isolated key bytes and scalar config before caller mutation or getter replacement', () => {
    const input = configuration();
    const originalKey = Uint8Array.from(input.idempotencyKey), originalOriginKey = Uint8Array.from(input.originKey);
    const producer = create(input);
    input.idempotencyKey.fill(0); input.originKey.fill(0);
    input.origin = 'https://elsewhere.invalid'; input.epoch = 'changed'; input.manifestHash = 'b'.repeat(64);
    input.retentionMs = 1; input.enabled = false;
    let reads = 0;
    Object.defineProperty(input, 'origin', { get() { reads++; throw Error('caller'); } });
    const sql = producer.produce(key, 'session').sql;
    assert.equal(reads, 0);
    assert.equal(sql.keyHash, keyed(originalKey, `subtrack:v2:idempotency:core:v1:key:${key}`));
    assert.equal(sql.authorityHash, keyed(originalOriginKey, 'subtrack:v2:browser-bootstrap-origin:v1:https://st233a.invalid'));
    assert.equal(sql.origin, configuration().origin); assert.equal(sql.epoch, configuration().epoch);
    assert.equal(sql.manifestHash, configuration().manifestHash); assert.equal(sql.retentionMs, 86_400_000);
    assert(originalKey.every(byte => byte === 37) && originalOriginKey.every(byte => byte === 93));
  });

  it('uses a fresh private owner on successive calls without exposing plaintext', () => {
    const entropy: Buffer[] = [];
    random.mockImplementation(() => { const bytes = original.randomBytes(32); entropy.push(bytes); return bytes; });
    const producer = create(configuration()), first = producer.produce(key, 'session'), second = producer.produce(key, 'session');
    assert.deepEqual(random.mock.calls.map(args => args[0]), [32, 32]);
    for (const [index, material] of [first, second].entries()) {
      const privateOwner = entropy[index]?.toString('base64url');
      assert(privateOwner && /^[A-Za-z0-9_-]{43}$/.test(privateOwner));
      assert.equal(material.sql.ownerHash, sha(`subtrack:v2:idempotency:core:v1:owner:${privateOwner}`));
      const views = [JSON.stringify(material), inspect(material), inspect(material, { showHidden: true })];
      assert(views.every(view => !view.includes(privateOwner)));
    }
  });

  it.each([undefined, 'production', 'test', '', 'Development'])('rejects construction and runtime change under %s', environment => {
    const producer = create(configuration());
    vi.stubEnv('NODE_ENV', environment);
    generic(() => create(configuration())); generic(() => producer.produce(key, 'session'));
    assert.equal(random.mock.calls.length, 0);
  });

  it('rejects descriptor, prototype, symbol, and extra config fields without getter calls', () => {
    let reads = 0;
    for (const field of Object.keys(configuration())) {
      const accessor = Object.defineProperty(configuration(), field, { enumerable: true, get() { reads++; throw Error('caller'); } });
      generic(() => create(accessor));
      generic(() => create(Object.defineProperty(configuration(), field, { enumerable: false })));
      const missing: Record<string, unknown> = configuration(); delete missing[field]; generic(() => create(missing));
    }
    const values: unknown[] = [null, undefined, true, 1, 'config', [], new Date(), Object.create(null),
      Object.create(configuration()), Object.assign(Object.create({ inherited: true }) as object, configuration()),
      { ...configuration(), [Symbol('secret')]: true }];
    for (const value of values) generic(() => create(value));
    for (const field of ['owner', 'nonce', 'digest', 'authorityHash', 'requestHash', 'clock', 'store', 'header'])
      generic(() => create({ ...configuration(), [field]: 'caller' }));
    assert.equal(reads, 0); assert.equal(random.mock.calls.length, 0);
  });

  it('rejects invalid scalars and short or aliased key material', () => {
    const invalid: Record<string, unknown[]> = {
      enabled: [false, null, 1, 'true'],
      origin: ['', ' https://st233a.invalid', 'https://st233a.invalid ', 'http://localhost', 'https://st233a.invalid/',
        'https://ST233A.invalid', 'https://st233a.invalid:443', 'https://u:p@st233a.invalid', 'https://*.invalid',
        'https://st233a.invalid/path', 'https://st233a.invalid?q=x', 'https://st233a.invalid#x', new String('https://st233a.invalid')],
      epoch: ['', ' ', ' epoch', 'epoch ', 1, new String('epoch')],
      manifestHash: ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)],
      retentionMs: [0, -1, 86_400_001, 1.5, Number.NaN, '1'],
      idempotencyKey: [undefined, Buffer.alloc(32), new Uint8Array(31), new Array(32).fill(1), 'x'.repeat(32)],
      originKey: [undefined, Buffer.alloc(32), new Uint8Array(31), new Array(32).fill(1), 'x'.repeat(32)],
    };
    for (const [field, values] of Object.entries(invalid)) for (const value of values)
      generic(() => create({ ...configuration(), [field]: value }));
    assert.equal(random.mock.calls.length, 0);
  });

  it('never invokes shadowing accessors on supplied key arrays', () => {
    let reads = 0;
    for (const field of ['byteLength', 'length', 'valueOf', Symbol.iterator]) {
      const bad = new Uint8Array(32);
      Object.defineProperty(bad, field, { get() { reads++; throw Error('caller key getter'); } });
      generic(() => create({ ...configuration(), idempotencyKey: bad }));
      generic(() => create({ ...configuration(), originKey: bad }));
    }
    assert.equal(reads, 0);
    assert.equal(random.mock.calls.length, 0);
  });

  it('rejects extra arguments and caller selectors before entropy', () => {
    generic(() => Reflect.apply(create, undefined, []));
    generic(() => Reflect.apply(create, undefined, [configuration(), { owner: 'caller' }]));
    const producer = create(configuration());
    for (const value of [undefined, null, '', 'login', 1, true, {}, ['session'], new String('session'), Symbol('session')])
      generic(() => Reflect.apply(producer.produce, undefined, [key, value]));
    generic(() => Reflect.apply(producer.produce, undefined, [key]));
    generic(() => Reflect.apply(producer.produce, undefined, [key, 'session', undefined]));
    generic(() => Reflect.apply(producer.produce, undefined, [key, 'session', { owner: 'caller', digest: 'caller' }]));
    assert.equal(random.mock.calls.length, 0);
  });

  it('fails generically on entropy faults and malformed output before hashing', () => {
    for (const malformed of [Buffer.alloc(0), Buffer.alloc(31), Buffer.alloc(33), { toString: () => 'A'.repeat(43) }]) {
      random.mockImplementation(() => malformed as Buffer);
      let partial: unknown; generic(() => { partial = create(configuration()).produce(key, 'session'); });
      assert.equal(partial, undefined); assert.equal(hash.mock.calls.length, 0); assert.equal(hmac.mock.calls.length, 0);
    }
    random.mockImplementation(() => { throw Error('private entropy'); });
    generic(() => create(configuration()).produce(key, 'session'));
    const bytes = Buffer.alloc(32);
    vi.spyOn(bytes, 'toString').mockImplementation(() => '!');
    random.mockImplementation(() => bytes);
    generic(() => create(configuration()).produce(key, 'session'));
  });

  it.each(['hmac-create', 'hash-create', 'hmac-update', 'hash-update', 'hmac-digest', 'hash-digest', 'hmac-invalid', 'hash-invalid'])('fails closed on %s without a partial witness or private diagnostics', mode => {
    for (const step of [1, 2]) {
      let hmacCalls = 0, hashCalls = 0;
      hmac.mockReset().mockImplementation((algorithm: string, secret: crypto.BinaryLike | crypto.KeyObject) => {
        const targeted = mode.startsWith('hmac') && ++hmacCalls === step;
        if (targeted && mode === 'hmac-create') throw Error('private HMAC');
        const instance = original.createHmac(algorithm, secret);
        if (targeted && mode === 'hmac-update') vi.spyOn(instance, 'update').mockImplementation(() => { throw Error('private HMAC'); });
        if (targeted && mode === 'hmac-digest') vi.spyOn(instance, 'digest').mockImplementation(() => { throw Error('private HMAC'); });
        if (targeted && mode === 'hmac-invalid') vi.spyOn(instance, 'digest').mockImplementation(() => 'A'.repeat(64));
        return instance;
      });
      hash.mockReset().mockImplementation((algorithm: string) => {
        const targeted = mode.startsWith('hash') && ++hashCalls === step;
        if (targeted && mode === 'hash-create') throw Error('private SHA');
        const instance = original.createHash(algorithm);
        if (targeted && mode === 'hash-update') vi.spyOn(instance, 'update').mockImplementation(() => { throw Error('private SHA'); });
        if (targeted && mode === 'hash-digest') vi.spyOn(instance, 'digest').mockImplementation(() => { throw Error('private SHA'); });
        if (targeted && mode === 'hash-invalid') vi.spyOn(instance, 'digest').mockImplementation(() => 'A'.repeat(64));
        return instance;
      });
      let partial: unknown; generic(() => { partial = create(configuration()).produce(key, 'session'); });
      assert.equal(partial, undefined);
    }
  });
});
