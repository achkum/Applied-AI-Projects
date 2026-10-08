import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionIssuerConfig, type SessionRecord, type SessionRepository } from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID2 = '123e4567-e89b-42d3-a456-426614174001';
const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const FAILURE = 'Session unavailable';
const originalVerify = BankIdSimulator.prototype.verify;

function fixture() {
  const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
  const pair = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => NOW });
  const repo = new InMemoryV2SessionRepository([ID, ID2], 10_000, () => NOW);
  const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true, simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID }, proofStore, clock: () => NOW });
  let serial = 10;
  const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens: tokens, repository: repo,
    clock: () => NOW, randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(serial++).padStart(2, '0')}`,
    randomBytes: () => new Uint8Array(32).fill(serial) });
  return { proofStore, tokens, repo, producer, issuer };
}

afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('DevelopmentV2SessionIssuer', () => {
  it.each([['web', WEB], ['mobile', MOBILE]] as const)('composes simulator proof, issuer and verifier for %s', async (_name, context) => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    try {
      const f = fixture(); const proof = await f.producer.issue(context);
      const result = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: context, ...(context.transport === 'mobile' ? { deviceName: 'Phone 📱' } : {}) });
      const claims = f.tokens.verify(result.accessToken);
      expect(claims.sub).toBe(ID); expect(claims.sid).toBe(result.sessionId);
      const record = f.repo.readSession(result.sessionId, { userId: ID }, NOW);
      expect(record).toMatchObject({ identityId: ID, sessionId: result.sessionId, generation: 0, createdAt: NOW, expiresAt: NOW + 86_400_000, transport: context.transport });
      expect(record?.refreshTokenHash).toBe(createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(result.refreshToken, 'utf8').digest('hex'));
      expect(JSON.stringify(record)).not.toContain(proof); expect(JSON.stringify(record)).not.toContain(result.refreshToken);
      expect(Object.isFrozen(result)).toBe(true); expect(await f.proofStore.consumeLogin(proof, context)).toEqual({ valid: false });
    } finally { vi.useRealTimers(); }
  });

  it('rejects malformed caller snapshots before consuming and makes replay single-winner', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    try {
      const f = fixture(); const proof = await f.producer.issue(MOBILE);
      const consume = vi.spyOn(f.proofStore, 'consumeLogin');
      const getter = vi.fn(() => ID); const bad = { loginProof: proof, transportContext: MOBILE } as Record<string, unknown>;
      Object.defineProperty(bad, 'identityId', { get: getter, enumerable: true });
      await expect(f.issuer.issueFromLoginProof(bad as never)).rejects.toThrow(FAILURE);
      expect(consume).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled();
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: MOBILE })));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const winner = results.find((r) => r.status === 'fulfilled');
      if (winner?.status !== 'fulfilled') throw new Error('No winner');
      expect(f.repo.readSession(winner.value.sessionId, { userId: ID }, NOW)?.identityId).toBe(ID);
    } finally { vi.useRealTimers(); }
  });

  it('rolls back insertion after token failure and preserves a mismatched row', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    try {
      const f = fixture(); const proof = await f.producer.issue(MOBILE);
      const insert = vi.spyOn(f.repo, 'createForActiveIdentity');
      const rollback = vi.spyOn(f.repo, 'rollbackCreatedSession');
      let serial = 10;
      const broken = { issue: () => { throw new Error('secret detail'); } };
      const failing = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore: f.proofStore, accessTokens: broken,
        repository: f.repo, clock: () => NOW, randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${serial++}`, randomBytes: () => new Uint8Array(32).fill(1) } as SessionIssuerConfig);
      await expect(failing.issueFromLoginProof({ loginProof: proof, transportContext: MOBILE })).rejects.toThrow(FAILURE);
      expect(insert).toHaveBeenCalledTimes(1); expect(rollback).toHaveBeenCalledTimes(1);
      expect(f.repo.readSession('123e4567-e89b-42d3-a456-426614174010', { userId: ID }, NOW)).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('rejects deletion before atomic create and enforces owner scope', async () => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW); const fakeRecord = { identityId: ID, sessionId: '123e4567-e89b-42d3-a456-426614174010', familyId: '123e4567-e89b-42d3-a456-426614174011', generation: 0,
      refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: NOW, expiresAt: NOW + 86_400_000 } as const;
    expect(repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    expect(repo.createForActiveIdentity(fakeRecord, { userId: ID })).toBe(false);
    expect(repo.readSession(fakeRecord.sessionId, { userId: ID }, NOW)).toBeNull();
  });
});

const SID = '123e4567-e89b-42d3-a456-426614174010';
const FAMILY = '123e4567-e89b-42d3-a456-426614174011';
const record = (changes: Partial<SessionRecord> = {}): SessionRecord => ({ identityId: ID, sessionId: SID, familyId: FAMILY, generation: 0, refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: NOW, expiresAt: NOW + 86_400_000, ...changes });
const stubProof = () => ({ consumeLogin: vi.fn(async () => Object.freeze({ valid: true, identityId: ID })) });
function configFor(proof: Pick<ProofStore, 'consumeLogin'> = stubProof(), repo: SessionRepository = new InMemoryV2SessionRepository([ID], 10_000, () => NOW), extra: Partial<SessionIssuerConfig> = {}): SessionIssuerConfig {
  let index = 0;
  return { environment: 'development', enabled: true, proofStore: proof, accessTokens: { issue: () => 'internal-test-token' }, repository: repo, clock: () => NOW,
    randomUUID: () => [SID, FAMILY][index++]!, randomBytes: () => new Uint8Array(32).fill(3), ...extra };
}
const opaqueProof = 'v2.' + 'a'.repeat(43);
const request = { loginProof: opaqueProof, transportContext: MOBILE };

describe('strict issuance boundaries', () => {
  it.each(['identityId', 'sessionId', 'challenge', 'familyId', 'action'])('rejects caller %s before proof consumption', async (key) => {
    const proof = stubProof(); const issuer = new DevelopmentV2SessionIssuer(configFor(proof));
    await expect(issuer.issueFromLoginProof({ ...request, [key]: ID } as never)).rejects.toThrow(FAILURE);
    expect(proof.consumeLogin).not.toHaveBeenCalled();
  });
  it('rejects accessor, symbol, hidden and nonplain inputs without reading getters', async () => {
    const proof = stubProof(); const issuer = new DevelopmentV2SessionIssuer(configFor(proof)); const getter = vi.fn();
    const accessor = { ...request }; Object.defineProperty(accessor, 'loginProof', { get: getter, enumerable: true });
    const symbol = { ...request, [Symbol('hidden')]: ID };
    const hidden = { ...request }; Object.defineProperty(hidden, 'identityId', { value: ID });
    const inherited = Object.assign(Object.create({}), request);
    for (const value of [accessor, symbol, hidden, inherited]) await expect(issuer.issueFromLoginProof(value as never)).rejects.toThrow(FAILURE);
    expect(getter).not.toHaveBeenCalled(); expect(proof.consumeLogin).not.toHaveBeenCalled();
  });
  it.each([
    { transport: 'mobile', exactOrigin: undefined }, { transport: 'mobile', browserChainId: 'x' },
    { transport: 'web', exactOrigin: 'http://app.example', browserChainId: 'x' },
    { transport: 'web', exactOrigin: 'https://app.example/', browserChainId: 'x' },
    { transport: 'web', exactOrigin: 'https://app.example', browserChainId: '' },
  ])('rejects malformed context before proof', async (transportContext) => {
    const proof = stubProof(); const issuer = new DevelopmentV2SessionIssuer(configFor(proof));
    await expect(issuer.issueFromLoginProof({ ...request, transportContext } as never)).rejects.toThrow(FAILURE);
    expect(proof.consumeLogin).not.toHaveBeenCalled();
  });
  it.each([undefined, 100, '📱'.repeat(101)])('rejects present invalid mobile device name', async (deviceName) => {
    const proof = stubProof(); const issuer = new DevelopmentV2SessionIssuer(configFor(proof));
    await expect(issuer.issueFromLoginProof({ ...request, deviceName } as never)).rejects.toThrow(FAILURE);
    expect(proof.consumeLogin).not.toHaveBeenCalled();
  });
  it('accepts 100 Unicode codepoints and rejects any web deviceName key', async () => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW);
    const issuer = new DevelopmentV2SessionIssuer(configFor(stubProof(), repo));
    const result = await issuer.issueFromLoginProof({ ...request, deviceName: '📱'.repeat(100) });
    expect(repo.readSession(result.sessionId, { userId: ID }, NOW)?.deviceName).toBe('📱'.repeat(100));
    await expect(issuer.issueFromLoginProof({ loginProof: opaqueProof, transportContext: WEB, deviceName: undefined } as never)).rejects.toThrow(FAILURE);
  });
  it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER, 1.5])('rejects invalid clock %s before proof', async (time) => {
    const proof = stubProof(); const issuer = new DevelopmentV2SessionIssuer(configFor(proof, undefined, { clock: () => time }));
    await expect(issuer.issueFromLoginProof(request)).rejects.toThrow(FAILURE); expect(proof.consumeLogin).not.toHaveBeenCalled();
  });
  it('validates clock after proof and does not insert on a bad later clock', async () => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW); const insert = vi.spyOn(repo, 'createForActiveIdentity');
    let count = 0; const issuer = new DevelopmentV2SessionIssuer(configFor(stubProof(), repo, { clock: () => count++ === 0 ? NOW : -1 }));
    await expect(issuer.issueFromLoginProof(request)).rejects.toThrow(FAILURE); expect(insert).not.toHaveBeenCalled();
  });
  it('rejects deletion between proof consumption and insertion', async () => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW);
    const proof = { consumeLogin: vi.fn(async () => { repo.markIdentityDeleted(ID, { userId: ID }); return { valid: true as const, identityId: ID }; }) };
    const issuer = new DevelopmentV2SessionIssuer(configFor(proof, repo));
    await expect(issuer.issueFromLoginProof(request)).rejects.toThrow(FAILURE); expect(repo.readSession(SID, { userId: ID }, NOW)).toBeNull();
  });
  it.each(['false', 'throw', 'token', 'invalid-token'])('rolls back exact committed insertion on %s failure', async (failure) => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW);
    const unrelated = record({ sessionId: ID2, familyId: ID, refreshTokenHash: 'b'.repeat(64) });
    expect(repo.createForActiveIdentity(unrelated, { userId: ID })).toBe(true);
    const rollback = vi.spyOn(repo, 'rollbackCreatedSession');
    const wrapper: SessionRepository = {
      createForActiveIdentity: (r, c) => { const ok = repo.createForActiveIdentity(r, c); if (failure === 'throw') throw new Error('private detail'); return failure === 'false' ? false : ok; },
      rollbackCreatedSession: (r, c) => repo.rollbackCreatedSession(r, c), readSession: (id, c, now) => repo.readSession(id, c, now),
    };
    const cfg = configFor(stubProof(), wrapper, { accessTokens: { issue: () => { if (failure === 'invalid-token') return ''; if (failure === 'token') throw new Error('private detail'); return 'internal-test-token'; } } });
    await expect(new DevelopmentV2SessionIssuer(cfg).issueFromLoginProof(request)).rejects.toThrow(FAILURE);
    expect(rollback).toHaveBeenCalledTimes(1); expect(rollback.mock.calls[0]?.[0].sessionId).toBe(SID);
    expect(repo.readSession(SID, { userId: ID }, NOW)).toBeNull(); expect(repo.readSession(ID2, { userId: ID }, NOW)).toEqual(unrelated);
  });
  it('keeps failure generic if rollback throws, with the orphan expiring', async () => {
    let now = NOW; const repo = new InMemoryV2SessionRepository([ID], 10_000, () => now);
    const wrapper: SessionRepository = { createForActiveIdentity: (r, c) => repo.createForActiveIdentity(r, c), readSession: (id, c, n) => repo.readSession(id, c, n), rollbackCreatedSession: () => { throw new Error('secret detail'); } };
    const issuer = new DevelopmentV2SessionIssuer(configFor(stubProof(), wrapper, { accessTokens: { issue: () => { throw new Error('secret detail'); } } }));
    await expect(issuer.issueFromLoginProof(request)).rejects.toThrow(new Error(FAILURE));
    expect(repo.readSession(SID, { userId: ID }, now)).not.toBeNull(); now += 86_400_000; expect(repo.readSession(SID, { userId: ID }, now)).toBeNull();
  });
  it('rejects bad constructor snapshots without getter invocation', () => {
    const getter = vi.fn(); const cfg = configFor(); Object.defineProperty(cfg, 'clock', { enumerable: true, get: getter });
    expect(() => new DevelopmentV2SessionIssuer(cfg)).toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
    expect(() => new DevelopmentV2SessionIssuer({ ...configFor(), environment: 'production' } as never)).toThrow(FAILURE);
    expect(() => new DevelopmentV2SessionIssuer({ ...configFor(), enabled: false } as never)).toThrow(FAILURE);
    expect(() => new DevelopmentV2SessionIssuer({ ...configFor(), randomUUID: undefined } as never)).toThrow(FAILURE);
  });
});

describe('atomic scoped reference repository', () => {
  it('prunes by trusted clock and rejects future record/read times without harming unrelated rows', () => {
    let now = NOW; const repo = new InMemoryV2SessionRepository([ID], 1, () => now); const r = record();
    expect(repo.createForActiveIdentity(r, { userId: ID })).toBe(true);
    const future = record({ sessionId: ID2, familyId: ID, refreshTokenHash: 'b'.repeat(64), createdAt: NOW + 86_400_000, expiresAt: NOW + 2 * 86_400_000 });
    expect(repo.createForActiveIdentity(future, { userId: ID })).toBe(false); expect(repo.readSession(SID, { userId: ID }, now)).toEqual(r);
    expect(repo.readSession(SID, { userId: ID }, now + 86_400_000)).toBeNull(); expect(repo.readSession(SID, { userId: ID }, now)).toEqual(r);
    now += 86_400_000; expect(repo.createForActiveIdentity(future, { userId: ID })).toBe(true);
  });
  it('rejects scope/collisions and mismatched rollback without deleting live rows', () => {
    const repo = new InMemoryV2SessionRepository([ID, ID2], 10_000, () => NOW); const r = record(); const c = { userId: ID };
    expect(repo.createForActiveIdentity(r, c)).toBe(true);
    expect(repo.createForActiveIdentity(record({ sessionId: ID2 }), c)).toBe(false);
    expect(repo.createForActiveIdentity(record({ sessionId: ID2, familyId: ID }), c)).toBe(false);
    expect(repo.createForActiveIdentity(r, { userId: ID2 })).toBe(false); expect(repo.readSession(SID, { userId: ID2 }, NOW)).toBeNull();
    expect(repo.rollbackCreatedSession(record({ familyId: ID2 }), c)).toBe(false);
    expect(repo.rollbackCreatedSession(record({ refreshTokenHash: 'b'.repeat(64) }), c)).toBe(false);
    expect(repo.rollbackCreatedSession(r, { userId: ID2 })).toBe(false); expect(repo.readSession(SID, c, NOW)).toEqual(r);
    expect(repo.markIdentityDeleted(ID, { userId: ID2 })).toBe(false); expect(repo.readSession(SID, c, NOW)).toEqual(r);
    expect(repo.markIdentityDeleted(ID, c)).toBe(true); expect(repo.readSession(SID, c, NOW)).toBeNull(); expect(repo.createForActiveIdentity(r, c)).toBe(false);
  });
  it.each([
    { generation: 1 }, { identityId: 'invalid' }, { expiresAt: NOW + 1 }, { createdAt: -1 },
    { transport: 'mobile', exactOrigin: undefined }, { transport: 'web', exactOrigin: 'http://app.example', browserChainId: 'x' },
  ])('rejects corrupt record %j', (changes) => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW);
    expect(repo.createForActiveIdentity(record(changes as never), { userId: ID })).toBe(false);
  });
  it('copies active seeds and rejects getter/coercible seeds and invalid capacity', () => {
    const ids = [ID]; const repo = new InMemoryV2SessionRepository(ids, 1, () => NOW); ids[0] = ID2;
    expect(repo.createForActiveIdentity(record(), { userId: ID })).toBe(true);
    const getter = vi.fn(() => ID); const bad = [ID]; Object.defineProperty(bad, '0', { get: getter, enumerable: true });
    expect(() => new InMemoryV2SessionRepository(bad)).toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
    const coercible = { toString: vi.fn(() => ID) }; expect(() => new InMemoryV2SessionRepository([coercible] as never)).toThrow(FAILURE); expect(coercible.toString).not.toHaveBeenCalled();
    for (const max of [0, 10_001, 1.5]) expect(() => new InMemoryV2SessionRepository([ID], max)).toThrow(FAILURE);
  });
});

describe('real proof restrictions and generated credentials', () => {
  it('wrong web scope does not burn proof; restricted-purpose proofs cannot issue a session', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    try {
      const f = fixture(); const proof = await f.producer.issue(WEB);
      const create = vi.spyOn(f.repo, 'createForActiveIdentity');
      const issuer = new DevelopmentV2SessionIssuer(configFor(f.proofStore, f.repo, { accessTokens: f.tokens }));
      for (const context of [MOBILE, { ...WEB, exactOrigin: 'https://other.example' }, { ...WEB, browserChainId: 'other' }]) {
        await expect(issuer.issueFromLoginProof({ loginProof: proof, transportContext: context })).rejects.toThrow(FAILURE);
      }
      expect(create).not.toHaveBeenCalled();
      const result = await issuer.issueFromLoginProof({ loginProof: proof, transportContext: WEB });
      expect(f.repo.readSession(result.sessionId, { userId: ID }, NOW)?.exactOrigin).toBe(WEB.exactOrigin);
      const restricted = await f.proofStore.issue({ purpose: 'stepup', challenge: 'server-challenge', transport: 'mobile', identifierHash: 'a'.repeat(64) });
      await expect(issuer.issueFromLoginProof({ loginProof: restricted, transportContext: MOBILE })).rejects.toThrow(FAILURE);
      expect(create).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('uses distinct server randomness and stores only refresh hashes', async () => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW);
    const cfg = configFor(stubProof(), repo); delete (cfg as { randomUUID?: unknown }).randomUUID; delete (cfg as { randomBytes?: unknown }).randomBytes;
    const issuer = new DevelopmentV2SessionIssuer(cfg); const first = await issuer.issueFromLoginProof(request); const second = await issuer.issueFromLoginProof(request);
    expect(first.sessionId).not.toBe(second.sessionId); expect(first.refreshToken).not.toBe(second.refreshToken);
    for (const response of [first, second]) {
      expect(Buffer.from(response.refreshToken.slice(4), 'base64url').length).toBe(32);
      const stored = repo.readSession(response.sessionId, { userId: ID }, NOW);
      expect(Object.isFrozen(stored)).toBe(true); expect(JSON.stringify(stored)).not.toContain(response.refreshToken);
    }
  });
  it.each(['same-uuid', 'bad-uuid', 'bad-bytes'])('rejects invalid server random factories %s before inserting', async (mode) => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW); const insert = vi.spyOn(repo, 'createForActiveIdentity');
    const extra: Partial<SessionIssuerConfig> = mode === 'bad-bytes' ? { randomBytes: () => new Uint8Array(31) } : { randomUUID: () => mode === 'same-uuid' ? SID : 'invalid' };
    await expect(new DevelopmentV2SessionIssuer(configFor(stubProof(), repo, extra)).issueFromLoginProof(request)).rejects.toThrow(FAILURE);
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects a session-ID collision without rolling back the preexisting tuple', async () => {
    const repo = new InMemoryV2SessionRepository([ID], 10_000, () => NOW); const existing = record({ familyId: ID2, refreshTokenHash: 'b'.repeat(64) });
    expect(repo.createForActiveIdentity(existing, { userId: ID })).toBe(true);
    const issuer = new DevelopmentV2SessionIssuer(configFor(stubProof(), repo)); await expect(issuer.issueFromLoginProof(request)).rejects.toThrow(FAILURE);
    expect(repo.readSession(SID, { userId: ID }, NOW)).toEqual(existing);
  });
});
