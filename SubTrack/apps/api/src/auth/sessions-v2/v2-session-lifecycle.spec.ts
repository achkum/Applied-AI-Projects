import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionRecord } from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID2 = '123e4567-e89b-42d3-a456-426614174001';
const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const FAILURE = 'Unauthorized';
const HASH = (token: string) => createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(token, 'utf8').digest('hex');
const originalVerify = BankIdSimulator.prototype.verify;

afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });
function fixture(maxConsumed = 10_000) {
  const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
  const pair = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => NOW });
  const repo = new InMemoryV2SessionRepository([ID, ID2], 10_000, () => NOW, maxConsumed);
  let identity = ID; let serial = 50;
  const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true, simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => identity }, proofStore, clock: () => NOW });
  const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens: tokens, repository: repo, clock: () => NOW,
    randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(serial++).padStart(2, '0')}`, randomBytes: () => new Uint8Array(32).fill(serial) });
  const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader: repo, clock: () => NOW });
  return { proofStore, tokens, repo, producer, issuer, resolver, setIdentity: (value: string) => { identity = value; } };
}
async function issue(f: ReturnType<typeof fixture>, transport: typeof WEB | typeof MOBILE) {
  const proof = await f.producer.issue(transport);
  return f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: transport });
}

describe('InMemoryV2SessionRepository refresh lifecycle', () => {
  it.each([['web', WEB], ['mobile', MOBILE]] as const)('rotates and revokes a reused %s family through the shared resolver', async (_label, transport) => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture();
    const first = await issue(f, transport); const neighbor = await issue(f, MOBILE);
    f.setIdentity(ID2); const otherOwner = await issue(f, MOBILE);
    const initial = f.repo.readSession(first.sessionId, { userId: ID }, NOW);
    if (!initial) throw new Error('missing session');
    const rotated = f.repo.rotateRefresh({ refreshTokenHash: HASH(first.refreshToken), successorRefreshTokenHash: 'a'.repeat(64), transportContext: transport, observedAt: NOW });
    expect(rotated).toEqual({ kind: 'rotated', identityId: ID, sessionId: first.sessionId, familyId: initial.familyId, expiresAt: initial.expiresAt });
    const replacement = f.repo.readSession(first.sessionId, { userId: ID }, NOW);
    expect(replacement).toMatchObject({ refreshTokenHash: 'a'.repeat(64), generation: 0, createdAt: initial.createdAt, expiresAt: initial.expiresAt, familyId: initial.familyId });
    const currentAccessToken = f.tokens.issue(ID, first.sessionId);
    await expect(f.resolver.resolve(first.accessToken, transport)).resolves.toMatchObject({ identityId: ID });
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(first.refreshToken), successorRefreshTokenHash: 'b'.repeat(64), transportContext: transport, observedAt: NOW - 1 })).toEqual({ kind: 'invalid' });
    await expect(f.resolver.resolve(currentAccessToken, transport)).resolves.toMatchObject({ identityId: ID });
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(first.refreshToken), successorRefreshTokenHash: 'b'.repeat(64), transportContext: transport, observedAt: NOW })).toEqual({ kind: 'reused' });
    await expect(f.resolver.resolve(first.accessToken, transport)).rejects.toThrow(FAILURE);
    await expect(f.resolver.resolve(currentAccessToken, transport)).rejects.toThrow(FAILURE);
    await expect(f.resolver.resolve(neighbor.accessToken, MOBILE)).resolves.toMatchObject({ identityId: ID });
    await expect(f.resolver.resolve(otherOwner.accessToken, MOBILE)).resolves.toMatchObject({ identityId: ID2 });
    expect(f.repo.readSession(first.sessionId, { userId: ID }, NOW)).toBeNull();
  });

  it('rejects wrong binding and capacity before consuming the active credential', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(1); const first = await issue(f, WEB); const second = await issue(f, MOBILE);
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(first.refreshToken), successorRefreshTokenHash: 'a'.repeat(64), transportContext: { ...WEB, browserChainId: 'wrong' }, observedAt: NOW })).toEqual({ kind: 'invalid' });
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(first.refreshToken), successorRefreshTokenHash: HASH(second.refreshToken), transportContext: WEB, observedAt: NOW })).toEqual({ kind: 'invalid' });
    expect(f.repo.readSession(first.sessionId, { userId: ID }, NOW)?.refreshTokenHash).toBe(HASH(first.refreshToken));
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(first.refreshToken), successorRefreshTokenHash: 'a'.repeat(64), transportContext: WEB, observedAt: NOW })).toMatchObject({ kind: 'rotated' });
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(second.refreshToken), successorRefreshTokenHash: 'b'.repeat(64), transportContext: MOBILE, observedAt: NOW })).toEqual({ kind: 'invalid' });
    expect(f.repo.readSession(second.sessionId, { userId: ID }, NOW)?.refreshTokenHash).toBe(HASH(second.refreshToken));
  });

  it('strictly snapshots inputs, retains tombstones against creation collisions and scopes cleanup to the current tuple', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const session = await issue(f, MOBILE); const before = f.repo.readSession(session.sessionId, { userId: ID }, NOW);
    if (!before) throw new Error('missing session');
    const getter = vi.fn(() => 'a'.repeat(64)); const hostile = { refreshTokenHash: HASH(session.refreshToken), transportContext: MOBILE, observedAt: NOW } as Record<string, unknown>;
    Object.defineProperty(hostile, 'successorRefreshTokenHash', { get: getter, enumerable: true });
    expect(f.repo.rotateRefresh(hostile as never)).toEqual({ kind: 'invalid' }); expect(getter).not.toHaveBeenCalled();
    expect(f.repo.rotateRefresh({ refreshTokenHash: HASH(session.refreshToken), successorRefreshTokenHash: 'c'.repeat(64), transportContext: MOBILE, observedAt: NOW })).toMatchObject({ kind: 'rotated' });
    const expected = { identityId: ID, sessionId: session.sessionId, familyId: before.familyId, refreshTokenHash: 'c'.repeat(64) };
    expect(f.repo.revokeRotatedFamily({ ...expected, refreshTokenHash: 'd'.repeat(64) }, { userId: ID })).toBe(false);
    expect(f.repo.revokeRotatedFamily(expected, { userId: ID2 })).toBe(false);
    expect(f.repo.revokeRotatedFamily(expected, { userId: ID })).toBe(true);
    const colliding: SessionRecord = { ...before, sessionId: '123e4567-e89b-42d3-a456-426614174099', familyId: '123e4567-e89b-42d3-a456-426614174098', refreshTokenHash: HASH(session.refreshToken) };
    expect(f.repo.createForActiveIdentity(colliding, { userId: ID })).toBe(false);
  });
});

const UUID_FOR = (n: number) => `123e4567-e89b-42d3-a456-426614${String(n).padStart(6, '0')}`;
function memoryFixture(capacity = 10_000) {
  let now = NOW;
  const repo = new InMemoryV2SessionRepository([ID, ID2], 10_000, () => now, capacity);
  const row = (n: number, hash: string, owner = ID, transport: typeof WEB | typeof MOBILE = MOBILE): SessionRecord => ({
    identityId: owner, sessionId: UUID_FOR(n), familyId: UUID_FOR(n + 100), generation: 0, refreshTokenHash: hash,
    transport: transport.transport, ...(transport.transport === 'web' ? { exactOrigin: transport.exactOrigin, browserChainId: transport.browserChainId } : {}),
    deviceName: null, createdAt: now, expiresAt: now + 86_400_000,
  });
  const original = row(10, 'a'.repeat(64));
  expect(repo.createForActiveIdentity(original, { userId: ID })).toBe(true);
  const rotate = (hash = 'a'.repeat(64), successor = 'b'.repeat(64), observedAt = now) => repo.rotateRefresh({
    refreshTokenHash: hash, successorRefreshTokenHash: successor, transportContext: MOBILE, observedAt,
  });
  return { repo, original, row, rotate, setNow: (value: number) => { now = value; } };
}

describe('atomic lifecycle edge cases', () => {
  it('has one rotation winner and concurrent consumed-token reuse revokes the winning row', async () => {
    const f = memoryFixture();
    const results = await Promise.all(['b', 'c'].map((letter) => Promise.resolve().then(() => f.rotate('a'.repeat(64), letter.repeat(64)))));
    expect(results.map((r) => r.kind)).toEqual(['rotated', 'reused']);
    expect(results.every(Object.isFrozen)).toBe(true);
    expect(f.repo.readSession(f.original.sessionId, { userId: ID }, NOW)).toBeNull();
  });

  it.each([
    { refreshTokenHash: 'bad' }, { successorRefreshTokenHash: 'F'.repeat(64) },
    { successorRefreshTokenHash: 'a'.repeat(64) }, { observedAt: -1 }, { observedAt: NaN },
    { observedAt: 1.5 }, { observedAt: NOW - 1 }, { observedAt: NOW + 86_400_000 },
    { identityId: ID2 }, { transportContext: { transport: 'mobile', exactOrigin: undefined } },
    { transportContext: { ...WEB, exactOrigin: 'http://app.example' } },
    { transportContext: { ...WEB, extra: true } },
  ])('rejects malformed or out-of-scope input without burning the active credential: %j', (patch) => {
    const f = memoryFixture();
    expect(f.repo.rotateRefresh({ refreshTokenHash: 'a'.repeat(64), successorRefreshTokenHash: 'b'.repeat(64), transportContext: MOBILE, observedAt: NOW, ...patch } as never)).toEqual({ kind: 'invalid' });
    expect(f.repo.readSession(f.original.sessionId, { userId: ID }, NOW)?.refreshTokenHash).toBe('a'.repeat(64));
    expect(f.rotate()).toMatchObject({ kind: 'rotated' });
  });

  it.each(['accessor', 'hidden', 'symbol', 'prototype', 'transport-getter'])('rejects exotic %s without invoking getters', (shape) => {
    const f = memoryFixture(); const getter = vi.fn(() => 'a'.repeat(64));
    const input = { refreshTokenHash: 'a'.repeat(64), successorRefreshTokenHash: 'b'.repeat(64), transportContext: MOBILE, observedAt: NOW };
    if (shape === 'accessor') Object.defineProperty(input, 'refreshTokenHash', { get: getter, enumerable: true });
    if (shape === 'hidden') Object.defineProperty(input, 'refreshTokenHash', { value: 'a'.repeat(64), enumerable: false });
    if (shape === 'symbol') Object.defineProperty(input, Symbol('extra'), { value: true });
    if (shape === 'prototype') Object.setPrototypeOf(input, { extra: true });
    if (shape === 'transport-getter') {
      const context = {}; Object.defineProperty(context, 'transport', { get: getter, enumerable: true }); input.transportContext = context as never;
    }
    expect(f.repo.rotateRefresh(input)).toEqual({ kind: 'invalid' }); expect(getter).not.toHaveBeenCalled();
    expect(f.rotate()).toMatchObject({ kind: 'rotated' });
  });

  it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER, NOW - 1])('rejects invalid or backdated trusted time %s before mutation', (time) => {
    const f = memoryFixture(); f.setNow(time);
    expect(f.rotate('a'.repeat(64), 'b'.repeat(64), NOW)).toEqual({ kind: 'invalid' });
    f.setNow(NOW); expect(f.rotate()).toMatchObject({ kind: 'rotated' });
  });

  it('wrong binding on consumed web credentials leaves the successor usable', () => {
    const f = memoryFixture(); const web = f.row(20, 'c'.repeat(64), ID, WEB);
    expect(f.repo.createForActiveIdentity(web, { userId: ID })).toBe(true);
    const input = { refreshTokenHash: 'c'.repeat(64), successorRefreshTokenHash: 'd'.repeat(64), transportContext: WEB, observedAt: NOW };
    expect(f.repo.rotateRefresh(input)).toMatchObject({ kind: 'rotated' });
    for (const transportContext of [MOBILE, { ...WEB, browserChainId: 'wrong' }, { ...WEB, exactOrigin: 'https://other.example' }]) {
      expect(f.repo.rotateRefresh({ ...input, successorRefreshTokenHash: 'e'.repeat(64), transportContext })).toEqual({ kind: 'invalid' });
      expect(f.repo.readSession(web.sessionId, { userId: ID }, NOW)?.refreshTokenHash).toBe('d'.repeat(64));
    }
    expect(f.repo.rotateRefresh({ ...input, successorRefreshTokenHash: 'e'.repeat(64) })).toEqual({ kind: 'reused' });
  });

  it('checks consumed successor collisions before consumption and retains all earlier generations', () => {
    const f = memoryFixture(); expect(f.rotate()).toMatchObject({ kind: 'rotated' });
    expect(f.rotate('b'.repeat(64), 'a'.repeat(64))).toEqual({ kind: 'invalid' });
    expect(f.repo.readSession(f.original.sessionId, { userId: ID }, NOW)?.refreshTokenHash).toBe('b'.repeat(64));
    expect(f.rotate('b'.repeat(64), 'c'.repeat(64))).toMatchObject({ kind: 'rotated' });
    expect(f.rotate('a'.repeat(64), 'd'.repeat(64))).toEqual({ kind: 'reused' });
    expect(f.repo.readSession(f.original.sessionId, { userId: ID }, NOW)).toBeNull();
    expect(f.repo.createForActiveIdentity(f.row(20, 'b'.repeat(64)), { userId: ID })).toBe(false);
    expect(f.repo.createForActiveIdentity(f.row(21, 'a'.repeat(64)), { userId: ID })).toBe(false);
  });

  it('retains tombstones after exact rollback and prunes only when original expiry is reached', () => {
    const f = memoryFixture(1); expect(f.rotate()).toMatchObject({ kind: 'rotated' });
    const replacement = f.repo.readSession(f.original.sessionId, { userId: ID }, NOW);
    if (!replacement) throw new Error('missing replacement');
    expect(f.repo.rollbackCreatedSession(replacement, { userId: ID })).toBe(true);
    expect(f.repo.createForActiveIdentity(f.row(20, 'a'.repeat(64)), { userId: ID })).toBe(false);
    f.setNow(NOW + 86_400_000 - 1);
    expect(f.repo.createForActiveIdentity(f.row(20, 'a'.repeat(64)), { userId: ID })).toBe(false);
    f.setNow(NOW + 86_400_000);
    const next = f.row(20, 'a'.repeat(64)); expect(f.repo.createForActiveIdentity(next, { userId: ID })).toBe(true);
    expect(f.rotate()).toMatchObject({ kind: 'rotated' }); // capacity reclaimed by trusted time
  });

  it('clears deleted owner tombstones without reactivating that owner or harming others', () => {
    const f = memoryFixture(1); expect(f.rotate()).toMatchObject({ kind: 'rotated' });
    expect(f.repo.markIdentityDeleted(ID, { userId: ID2 })).toBe(false);
    expect(f.repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    expect(f.rotate()).toEqual({ kind: 'invalid' });
    expect(f.repo.createForActiveIdentity(f.row(20, 'd'.repeat(64)), { userId: ID })).toBe(false);
    const neighbor = f.row(20, 'a'.repeat(64), ID2); expect(f.repo.createForActiveIdentity(neighbor, { userId: ID2 })).toBe(true);
    expect(f.repo.rotateRefresh({ refreshTokenHash: 'a'.repeat(64), successorRefreshTokenHash: 'c'.repeat(64), transportContext: MOBILE, observedAt: NOW })).toMatchObject({ kind: 'rotated', identityId: ID2 });
  });

  it('cleanup rejects stale tuples after another rotation and preserves neighboring families', () => {
    const f = memoryFixture(); const neighbor = f.row(20, 'd'.repeat(64)); expect(f.repo.createForActiveIdentity(neighbor, { userId: ID })).toBe(true);
    expect(f.rotate()).toMatchObject({ kind: 'rotated' });
    const tuple = { identityId: ID, sessionId: f.original.sessionId, familyId: f.original.familyId, refreshTokenHash: 'b'.repeat(64) };
    expect(f.rotate('b'.repeat(64), 'c'.repeat(64))).toMatchObject({ kind: 'rotated' });
    expect(f.repo.revokeRotatedFamily(tuple, { userId: ID })).toBe(false);
    expect(f.repo.revokeRotatedFamily({ ...tuple, refreshTokenHash: 'c'.repeat(64) }, { userId: ID })).toBe(true);
    expect(f.repo.readSession(neighbor.sessionId, { userId: ID }, NOW)).toEqual(neighbor);
    expect(f.rotate('a'.repeat(64), 'e'.repeat(64))).toEqual({ kind: 'reused' });
  });

  it.each([0, -1, 10001, NaN, 1.5])('rejects invalid tombstone capacity %s', (capacity) => {
    expect(() => new InMemoryV2SessionRepository([ID], 10_000, () => NOW, capacity)).toThrow('Session unavailable');
  });
});
