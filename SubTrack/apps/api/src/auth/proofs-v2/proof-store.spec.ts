import { createHash } from 'node:crypto';
import { DevelopmentSimulatorLoginProofProducer } from './bankid-simulator-proof-producer';
import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryProofRepository,
  PROOF_TTL_MS,
  ProofStore,
  type ProofBinding,
  type ProofRepository,
  type StoredProof,
} from './proof-store';

const binding: ProofBinding = Object.freeze({
  purpose: 'stepup', challenge: 'challenge-A', transport: 'web',
  identifierHash: 'a'.repeat(64), exactOrigin: 'https://app.example', browserChainId: 'chain-A',
});
const loginIdentity = '123e4567-e89b-42d3-a456-426614174000';
const loginMobile = Object.freeze({ purpose: 'login', challenge: 'login-challenge', transport: 'mobile', identityId: loginIdentity });
const loginWeb = Object.freeze({ ...loginMobile, transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'browser-chain' });
const hashSecret = (secret: string) => createHash('sha256').update('subtrack:auth-proof:v2:', 'utf8').update(secret, 'utf8').digest('hex');

describe('ProofStore', () => {
  it('stores only a domain-separated hash, returns a 256-bit v2 secret once, and fixes five minute expiry', async () => {
    let now = 1000;
    const records: StoredProof[] = [];
    const repo: ProofRepository = {
      insert: (record) => { records.push(record); },
      compareAndConsume: () => false,
    };
    const store = new ProofStore(repo, () => now);
    const secret = await store.issue(binding);
    expect(secret).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(records).toHaveLength(1);
    expect(records[0]?.hash).toBe(hashSecret(secret));
    expect(JSON.stringify(records[0])).not.toContain(secret);
    expect(records[0]?.issuedAt).toBe(1000);
    expect(records[0]?.expiresAt).toBe(1000 + PROOF_TTL_MS);
    now += 1;
    expect(records[0]?.issuedAt).toBe(1000);
  });

  it('accepts exactly one matching redemption, including under concurrent calls', async () => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 2000);
    const secret = await store.issue(binding);
    const results = await Promise.all(Array.from({ length: 12 }, () => store.consume(secret, binding)));
    expect(results.filter((result) => result.valid)).toHaveLength(1);
    expect(results.every((result) => Object.isFrozen(result))).toBe(true);
  });

  it('redeems a stored login proof once and returns only its canonical stored identity', async () => {
    const repo = new InMemoryProofRepository();
    const store = new ProofStore(repo, () => 4000);
    const secret = await store.issue(loginMobile);
    const [a, b] = await Promise.all([
      store.consumeLogin(secret, { transport: 'mobile' }),
      store.consumeLogin(secret, { transport: 'mobile' }),
    ]);
    expect([a, b].filter((result) => result.valid)).toHaveLength(1);
    expect([a, b].find((result) => result.valid)).toEqual({ valid: true, identityId: loginIdentity });
  });

  it('supports the fixed web transport scope and rejects a changed origin before valid redemption', async () => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 4100);
    const secret = await store.issue(loginWeb);
    expect(await store.consumeLogin(secret, { transport: 'web', exactOrigin: 'https://evil.example', browserChainId: 'browser-chain' })).toEqual({ valid: false });
    expect(await store.consumeLogin(secret, { transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'browser-chain' })).toEqual({ valid: true, identityId: loginIdentity });
  });

  it.each([
    ['caller challenge selector', { challenge: 'other', transport: 'mobile' }],
    ['transport', { transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'browser-chain' }],
    ['extra identity selector', { transport: 'mobile', identityId: loginIdentity }],
    ['non-enumerable field', Object.defineProperty({ transport: 'mobile' }, 'hidden', { value: true })],
    ['accessor', Object.defineProperty({ transport: 'mobile' }, 'challenge', { enumerable: true, get: () => 'login-challenge' })],
    ['symbol', { transport: 'mobile', [Symbol('x')]: true }],
    ['custom prototype', Object.assign(Object.create({ inherited: true }), { transport: 'mobile' })],
  ])('rejects %s context without burning a login proof', async (_label, context) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 4200);
    const secret = await store.issue(loginMobile);
    expect(await store.consumeLogin(secret, context as never)).toEqual({ valid: false });
    expect(await store.consumeLogin(secret, { transport: 'mobile' })).toEqual({ valid: true, identityId: loginIdentity });
  });

  it.each([
    ['enrollment', { ...loginMobile, purpose: 'enrollment', action: 'enroll-credential' }],
    ['login with wrong action', { ...loginMobile, action: 'step-up' }],
    ['step-up purpose with login action', { ...loginMobile, purpose: 'stepup', action: 'authenticate' }],
    ['account-delete purpose with login action', { ...loginMobile, purpose: 'account-delete', action: 'authenticate' }],
    ['mobile with web metadata', { ...loginMobile, exactOrigin: 'https://app.example', browserChainId: 'chain' }],
    ['negative issuance', { ...loginMobile, issuedAt: -1, expiresAt: PROOF_TTL_MS - 1 }],
    ['missing stored challenge', { ...loginMobile, challenge: '' }],
    ['malformed identity', { ...loginMobile, identityId: 'not-a-uuid' }],
    ['uppercase identity', { ...loginMobile, identityId: loginIdentity.toUpperCase() }],
    ['invalid timestamps', { ...loginMobile, issuedAt: 4000, expiresAt: 4000 + PROOF_TTL_MS + 1 }],
    ['future issuance', { ...loginMobile, issuedAt: 4300, expiresAt: 4300 + PROOF_TTL_MS }],
  ])('does not redeem corrupted %s records', async (_label, record) => {
    const repo = new InMemoryProofRepository();
    const store = new ProofStore(repo, () => 4250);
    const secret = await store.issue(loginMobile);
    const corrupt = record as Record<string, unknown>;
    const records = (repo as unknown as { records: Map<string, StoredProof> }).records;
    records.set(hashSecret(secret), Object.freeze({ hash: hashSecret(secret), action: 'authenticate', ...corrupt, issuedAt: corrupt.issuedAt ?? 4000, expiresAt: corrupt.expiresAt ?? 4000 + PROOF_TTL_MS }) as unknown as StoredProof);
    expect(await store.consumeLogin(secret, { transport: 'mobile' })).toEqual({ valid: false });
    expect(records.has(hashSecret(secret))).toBe(true);
  });

  it('fails closed for absent or failing atomic login repository methods and rejects invalid repository identities', async () => {
    const secret = 'v2.' + 'A'.repeat(43);
    const context = { transport: 'mobile' as const };
    const noMethod: ProofRepository = { insert: () => undefined, compareAndConsume: () => true };
    expect(await new ProofStore(noMethod, () => 1).consumeLogin(secret, context)).toEqual({ valid: false });
    const failing = { ...noMethod, compareAndConsumeLogin: () => { throw new Error('private details'); } };
    expect(await new ProofStore(failing, () => 1).consumeLogin(secret, context)).toEqual({ valid: false });
    const invalid = { ...noMethod, compareAndConsumeLogin: () => 'identity-not-valid' };
    expect(await new ProofStore(invalid, () => 1).consumeLogin(secret, context)).toEqual({ valid: false });
    expect(JSON.stringify(await new ProofStore(invalid, () => 1).consumeLogin(secret, context))).not.toContain(secret);
  });

  it('rejects at exact expiry and for invalid clock values', async () => {
    let now = 3000;
    const store = new ProofStore(new InMemoryProofRepository(), () => now);
    const secret = await store.issue(binding);
    now += PROOF_TTL_MS;
    expect(await store.consume(secret, binding)).toEqual({ valid: false });
    now = Number.NaN;
    expect(await store.consume(secret, binding)).toEqual({ valid: false });
  });

  it.each([
    ['purpose', { ...binding, purpose: 'login' }],
    ['challenge', { ...binding, challenge: 'challenge-B' }],
    ['transport', { ...binding, transport: 'mobile', exactOrigin: undefined, browserChainId: undefined }],
    ['origin', { ...binding, exactOrigin: 'https://evil.example' }],
    ['browser chain', { ...binding, browserChainId: 'chain-B' }],
    ['identifier hash', { ...binding, identifierHash: 'b'.repeat(64) }],
  ] as const)('does not burn proof after %s substitution', async (_label, altered) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 5000);
    const secret = await store.issue(binding);
    expect(await store.consume(secret, altered as ProofBinding)).toEqual({ valid: false });
    expect(await store.consume(secret, binding)).toEqual({ valid: true });
  });

  it.each([
    ['identity', { purpose: 'login', identityId: 'identity-2' }],
    ['session', { purpose: 'account-delete', identityId: 'identity-1', sessionId: 'session-2' }],
  ] as const)('binds %s for sensitive purposes', async (_label, fields) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 6000);
    const expected = { ...fields, challenge: 'c', transport: 'mobile' } as ProofBinding;
    const secret = await store.issue(expected);
    const wrong = { ...expected, [fields.purpose === 'login' ? 'identityId' : 'sessionId']: 'other' } as ProofBinding;
    expect(await store.consume(secret, wrong)).toEqual({ valid: false });
    expect(await store.consume(secret, expected)).toEqual({ valid: true });
  });

  it('copies binding fields at issue so later caller mutation cannot change stored scope', async () => {
    const mutable = { ...binding } as { -readonly [K in keyof ProofBinding]: ProofBinding[K] };
    const repo = new InMemoryProofRepository();
    const store = new ProofStore(repo, () => 7000);
    const secret = await store.issue(mutable);
    mutable.challenge = 'changed';
    expect(await store.consume(secret, binding)).toEqual({ valid: true });
  });

  it.each([
    { purpose: 'login', challenge: 'c', transport: 'mobile' },
    { purpose: 'account-delete', challenge: 'c', transport: 'mobile', identityId: 'i' },
    { purpose: 'stepup', challenge: 'c', transport: 'mobile', identifierHash: 'raw-email@example.test' },
    { purpose: 'login', challenge: 'c', transport: 'mobile', identityId: 'i', ttlMs: 1 },
    { purpose: 'enrollment', challenge: 'c', transport: 'mobile', identifierHash: 'a'.repeat(64), exactOrigin: 'https://x.test' },
  ])('rejects malformed runtime bindings without disclosing details', async (invalid) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 8000);
    await expect(store.issue(invalid as ProofBinding)).rejects.toThrow('Proof unavailable');
    expect(await store.consume('v2.secret', invalid as ProofBinding)).toEqual({ valid: false });
  });

  it.each([
    '*', 'null', 'https://app.example/path', 'https://app.example?x=1',
    'https://app.example#fragment', 'https://user@app.example', 'https://',
    'data:text/html,hi', 'file:///tmp/x', 'ftp://app.example', 'http://app.example',
    'https://*.example.test', 'https://*',
    ' https://app.example', 'https://app.example ',
  ])('rejects non-canonical or unsafe web origin %s', async (origin) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 9000);
    await expect(store.issue({ ...binding, exactOrigin: origin })).rejects.toThrow('Proof unavailable');
  });

  it.each(['https://app.example', 'http://localhost', 'http://127.0.0.1:3000', 'http://[::1]:8080'])('accepts canonical HTTPS origins and HTTP loopback origin %s', async (origin) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 9100);
    const scoped = { ...binding, exactOrigin: origin };
    const secret = await store.issue(scoped);
    expect(await store.consume(secret, scoped)).toEqual({ valid: true });
  });

  it.each([
    { purpose: 'enrollment', challenge: 'c', transport: 'mobile' },
    null, [], 4, 'binding', { ...binding, extra: true }, { ...binding, purpose: 'other' },
    { ...binding, challenge: '' }, { ...binding, transport: 'sms' },
    { ...binding, identifierHash: 5 }, { ...binding, identifierHash: 'z'.repeat(64) },
    { ...binding, identityId: 3 }, { ...binding, sessionId: '' },
    { ...binding, exactOrigin: 7 }, { ...binding, browserChainId: null },
    { purpose: 'stepup', challenge: 'c', transport: 'web', identifierHash: 'a'.repeat(64), exactOrigin: 'https://app.example' },
    { purpose: 'stepup', challenge: 'c', transport: 'web', identifierHash: 'a'.repeat(64), browserChainId: 'b' },
    { purpose: 'stepup', challenge: 'c', transport: 'mobile', identifierHash: 'a'.repeat(64), browserChainId: 'unexpected' },
  ])('rejects malformed runtime scope %#', async (invalid) => {
    const store = new ProofStore(new InMemoryProofRepository(), () => 9200);
    await expect(store.issue(invalid as ProofBinding)).rejects.toThrow('Proof unavailable');
    expect(await store.consume('v2.bad', invalid as ProofBinding)).toEqual({ valid: false });
  });

  it.each([
    { purpose: 'enrollment', identifierHash: 'a'.repeat(64) },
    { purpose: 'stepup', identifierHash: 'a'.repeat(64), identityId: 'identity' },
    { purpose: 'login', identityId: 'identity' },
    { purpose: 'account-delete', identityId: 'identity', sessionId: 'session' },
  ])('issues and consumes a valid mobile $purpose scope', async (fields) => {
    const scoped = { ...fields, challenge: 'fresh-challenge', transport: 'mobile' } as ProofBinding;
    const store = new ProofStore(new InMemoryProofRepository(), () => 9300);
    const secret = await store.issue(scoped);
    expect(await store.consume(secret, scoped)).toEqual({ valid: true });
  });

  it('collapses invalid secrets, replay, repository exceptions, and bad clocks to generic results', async () => {
    const repo = new InMemoryProofRepository();
    let now = 9400;
    const store = new ProofStore(repo, () => now);
    expect(await store.consume('', binding)).toEqual({ valid: false });
    expect(await store.consume('other.secret', binding)).toEqual({ valid: false });
    const secret = await store.issue(binding);
    expect(await store.consume(secret, binding)).toEqual({ valid: true });
    expect(await store.consume(secret, binding)).toEqual({ valid: false });
    now -= 1;
    const rollbackSecret = await store.issue(binding);
    now -= 1;
    expect(await store.consume(rollbackSecret, binding)).toEqual({ valid: false });
    const broken = new ProofStore({ insert: () => { throw new Error('storage detail'); }, compareAndConsume: () => { throw new Error('storage detail'); } }, () => 9500);
    await expect(broken.issue(binding)).rejects.toThrow('Proof unavailable');
    expect(await broken.consume('v2.secret', binding)).toEqual({ valid: false });
  });

  it('rejects invalid issue clocks and detects corrupted repository expiry and action', async () => {
    await expect(new ProofStore(new InMemoryProofRepository(), () => Infinity).issue(binding)).rejects.toThrow('Proof unavailable');
    const records: StoredProof[] = [];
    const repo: ProofRepository = { insert: (record) => { records.push(record); }, compareAndConsume: () => false };
    const secret = await new ProofStore(repo, () => 9600).issue(binding);
    const corrupt = new InMemoryProofRepository();
    const record = records[0]!;
    corrupt.insert({ ...record, expiresAt: record.expiresAt + 1 });
    const malformedSecret = `v2.${Buffer.from('tamper').toString('base64url')}`;
    // Place the altered record under the hash the supplied secret resolves to, as a corrupted adapter might.
    const keyed = new InMemoryProofRepository();
    keyed.insert({ ...record, hash: hashSecret(malformedSecret), action: 'delete-account' });
    expect(await new ProofStore(keyed, () => 9600).consume(malformedSecret, binding)).toEqual({ valid: false });
    expect(secret).toMatch(/^v2\./);
    expect(await new ProofStore(corrupt, () => 9600).consume(secret, binding)).toEqual({ valid: false });
  });
});


describe('server-owned simulator login proof redemption', () => {
  it('redeems actual web/mobile fixture proofs using no caller identity or server challenge', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-07T12:00:00.000Z'));
    try {
      const memory = new InMemoryProofRepository();
      const records: StoredProof[] = [];
      const repository: ProofRepository = {
        insert: row => { records.push(row); memory.insert(row); },
        compareAndConsume: (hash, context, now) => memory.compareAndConsume(hash, context, now),
        compareAndConsumeLogin: (hash, context, now) => memory.compareAndConsumeLogin(hash, context, now),
      };
      const store = new ProofStore(repository);
      const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true,
        simulatorHmacKey: Buffer.alloc(32, 7), identityResolver: { resolveRegisteredIdentityId: () => loginIdentity }, proofStore: store });
      for (const context of [{ transport: 'mobile' }, { transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'server-chain' }] as const) {
        const secret = await producer.issue(context);
        expect(JSON.stringify(records)).not.toContain(secret);
        if (context.transport === 'web') {
          expect(await store.consumeLogin(secret, { ...context, browserChainId: 'wrong-chain' })).toEqual({ valid: false });
          expect(await store.consumeLogin(secret, { ...context, exactOrigin: 'https://elsewhere.example' })).toEqual({ valid: false });
        }
        const results = await Promise.all(Array.from({ length: 8 }, () => store.consumeLogin(secret, context)));
        expect(results.filter(result => result.valid)).toEqual([{ valid: true, identityId: loginIdentity }]);
        expect(results.every(result => Object.isFrozen(result))).toBe(true);
        expect(await store.consumeLogin(secret, context)).toEqual({ valid: false });
      }
    } finally { vi.useRealTimers(); }
  });

  it('rejects context accessors without invoking them or the atomic repository', async () => {
    const getter = vi.fn(() => 'https://app.example');
    const atomic = vi.fn(() => loginIdentity);
    const store = new ProofStore({ insert: () => undefined, compareAndConsume: () => false, compareAndConsumeLogin: atomic });
    const context = Object.defineProperty({ transport: 'web', browserChainId: 'server-chain' }, 'exactOrigin', { enumerable: true, get: getter });
    expect(await store.consumeLogin('v2.' + 'A'.repeat(43), context as never)).toEqual({ valid: false });
    expect(getter).not.toHaveBeenCalled();
    expect(atomic).not.toHaveBeenCalled();
  });
});


it('rejects malformed login secrets and invalid login clocks without invoking atomic consumption', async () => {
  const atomic = vi.fn(() => loginIdentity);
  const repository: ProofRepository = { insert: () => undefined, compareAndConsume: () => false, compareAndConsumeLogin: atomic };
  const context = { transport: 'mobile' as const };
  for (const clock of [() => -1, () => NaN, () => Infinity, () => 1.5, () => { throw new Error('private-clock-detail'); }]) {
    expect(await new ProofStore(repository, clock).consumeLogin('v2.' + 'A'.repeat(43), context)).toEqual({ valid: false });
  }
  const store = new ProofStore(repository, () => 1);
  for (const secret of ['', 'v1.' + 'A'.repeat(43), 'v2.' + 'A'.repeat(42), 'v2.' + 'A'.repeat(44), 'v2.' + '!'.repeat(43)]) {
    expect(await store.consumeLogin(secret, context)).toEqual({ valid: false });
  }
  expect(atomic).not.toHaveBeenCalled();
});
