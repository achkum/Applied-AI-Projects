import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
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
