import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionRecord } from './v2-session-issuer';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import { DevelopmentV2SessionRefresher } from './v2-session-refresher';
import { V2AccessToken } from './v2-access-token';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const originalVerify = BankIdSimulator.prototype.verify;
afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture(maxConsumed = 10, identities: string[] = [ID, OTHER]) {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  let now = NOW;
  const proofStore = new ProofStore(new InMemoryProofRepository(), () => now);
  const pair = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => now });
  const repo = new InMemoryV2SessionRepository(identities, 100, () => now, maxConsumed);
  let owner = ID; let serial = 40;
  const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true, simulatorHmacKey: new Uint8Array(32).fill(9), identityResolver: { resolveRegisteredIdentityId: () => owner }, proofStore, clock: () => now });
  const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens: tokens, repository: repo, clock: () => now,
    randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(serial++).padStart(2, '0')}`, randomBytes: () => new Uint8Array(32).fill(serial) });
  const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader: repo, clock: () => now });
  const issue = async () => issuer.issueFromLoginProof({ loginProof: await producer.issue(MOBILE), transportContext: MOBILE });
  return { repo, tokens, resolver, issue, setNow: (v: number) => { now = v; }, setOwner: (v: string) => { owner = v; } };
}

describe('current-session scoped revocation', () => {
  it('revokes only the owned target and makes access, refresh, and listing reject it', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const request = await f.issue(); const target = await f.issue(); const neighbor = await f.issue();
    f.setOwner(OTHER); const other = await f.issue(); f.setOwner(ID);
    const principal = await f.resolver.resolve(request.accessToken, MOBILE);
    expect(f.repo.revokeForCurrentSession(request.sessionId, target.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'revoked' });
    expect(f.repo.listForCurrentSession(request.sessionId, { userId: ID }, NOW)?.map((r) => r.id)).toEqual([request.sessionId, neighbor.sessionId]);
    expect(f.repo.listForCurrentSession(target.sessionId, { userId: ID }, NOW)).toBeNull();
    await expect(f.resolver.resolve(target.accessToken, MOBILE)).rejects.toThrow('Unauthorized');
    const refresher = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: f.repo, accessTokens: f.tokens, clock: () => NOW });
    await expect(refresher.refresh({ refreshToken: target.refreshToken, transportContext: MOBILE })).rejects.toThrow('Session unavailable');
    await expect(f.resolver.resolve(neighbor.accessToken, MOBILE)).resolves.toMatchObject({ identityId: ID });
    await expect(refresher.refresh({ refreshToken: neighbor.refreshToken, transportContext: MOBILE })).resolves.toMatchObject({ sessionId: neighbor.sessionId });
    await expect(f.resolver.resolve(other.accessToken, MOBILE)).resolves.toMatchObject({ identityId: OTHER });
    expect(f.repo.listForCurrentSession(principal.sessionId, { userId: ID }, NOW)).not.toBeNull();
  });

  it('allows self logout and returns exact frozen kind-only values', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const self = await f.issue(); const neighbor = await f.issue();
    const result = f.repo.revokeForCurrentSession(self.sessionId, self.sessionId, Object.freeze({ userId: ID }), NOW);
    expect(result).toEqual({ kind: 'revoked' }); expect(Object.keys(result)).toEqual(['kind']); expect(Object.isFrozen(result)).toBe(true);
    expect(f.repo.listForCurrentSession(self.sessionId, { userId: ID }, NOW)).toBeNull();
    expect(f.repo.listForCurrentSession(neighbor.sessionId, { userId: ID }, NOW)?.map((r) => r.id)).toEqual([neighbor.sessionId]);
  });

  it('gives the same missing result for absent and foreign targets while requiring live request and target', async () => {
    const f = fixture(); const request = await f.issue(); f.setOwner(OTHER); const foreign = await f.issue(); f.setOwner(ID);
    expect(f.repo.revokeForCurrentSession(request.sessionId, '123e4567-e89b-42d3-a456-426614174099', { userId: ID }, NOW)).toEqual({ kind: 'missing' });
    expect(f.repo.revokeForCurrentSession(request.sessionId, foreign.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'missing' });
    expect(f.repo.readSession(foreign.sessionId, { userId: OTHER }, NOW)).not.toBeNull();
    expect(f.repo.revokeForCurrentSession('123e4567-e89b-42d3-a456-426614174099', request.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'invalid' });
    f.setNow(NOW + 86_400_000);
    expect(f.repo.revokeForCurrentSession(request.sessionId, request.sessionId, { userId: ID }, NOW + 86_400_000)).toEqual({ kind: 'invalid' });
  });

  it('rechecks request authorization and rejects hostile inputs without invoking getters', async () => {
    const f = fixture(); const request = await f.issue(); const target = await f.issue();
    expect(f.repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    expect(f.repo.revokeForCurrentSession(request.sessionId, target.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'invalid' });
    expect(f.repo.readSession(target.sessionId, { userId: ID }, NOW)).toBeNull();
    const live = fixture(); const req = await live.issue(); const tar = await live.issue(); const getter = vi.fn(); const context = {};
    Object.defineProperty(context, 'userId', { enumerable: true, get: getter });
    for (const [a, b, c, t] of [[req.sessionId, tar.sessionId, context, NOW], [req.sessionId.toUpperCase(), tar.sessionId, { userId: ID }, NOW], [req.sessionId, tar.sessionId, { userId: ID, extra: true }, NOW], [req.sessionId, tar.sessionId, { userId: ID }, NOW + 1]] as const) {
      expect(live.repo.revokeForCurrentSession(a, b, c as never, t)).toEqual({ kind: 'invalid' });
    }
    expect(getter).not.toHaveBeenCalled(); expect(live.repo.readSession(tar.sessionId, { userId: ID }, NOW)).not.toBeNull();
  });

  it('fails closed at tombstone capacity without burning target, then reclaims only at trusted expiry', async () => {
    const f = fixture(1); const request = await f.issue(); const target = await f.issue();
    const shortCreated = NOW - 86_400_000 + 1000;
    const short: SessionRecord = { identityId: ID, sessionId: '123e4567-e89b-42d3-a456-426614174080', familyId: '123e4567-e89b-42d3-a456-426614174081', generation: 0,
      refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: shortCreated, expiresAt: NOW + 1000 };
    // A rotation on an explicitly short row creates the only tombstone.
    const seed: SessionRecord = { ...short, sessionId: '123e4567-e89b-42d3-a456-426614174082', familyId: '123e4567-e89b-42d3-a456-426614174083' };
    expect(f.repo.createForActiveIdentity(seed, { userId: ID })).toBe(true);
    expect(f.repo.rotateRefresh({ refreshTokenHash: seed.refreshTokenHash, successorRefreshTokenHash: 'b'.repeat(64), transportContext: MOBILE, observedAt: NOW }).kind).toBe('rotated');
    expect(f.repo.revokeForCurrentSession(request.sessionId, target.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'capacity' });
    expect(f.repo.readSession(target.sessionId, { userId: ID }, NOW)).not.toBeNull();
    f.setNow(NOW + 1001);
    expect(f.repo.revokeForCurrentSession(request.sessionId, target.sessionId, { userId: ID }, NOW + 1001)).toEqual({ kind: 'revoked' });
  });
});

const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const UUID_FOR = (n: number) => `123e4567-e89b-42d3-a456-426614${String(n).padStart(6, '0')}`;
function memory(maxConsumed = 10_000) {
  let now = NOW;
  const repo = new InMemoryV2SessionRepository([ID, OTHER], 10, () => now, maxConsumed);
  const row = (n: number, owner = ID, transport: typeof MOBILE | typeof WEB = MOBILE, createdAt = now): SessionRecord => ({ identityId: owner, sessionId: UUID_FOR(n), familyId: UUID_FOR(n + 100),
    generation: 0, refreshTokenHash: String(n).padStart(64, 'a'), transport: transport.transport,
    ...(transport.transport === 'web' ? { exactOrigin: transport.exactOrigin, browserChainId: transport.browserChainId } : {}), deviceName: null, createdAt, expiresAt: createdAt + 86_400_000 });
  const request = row(10); const target = row(20); expect(repo.createForActiveIdentity(request, { userId: ID })).toBe(true); expect(repo.createForActiveIdentity(target, { userId: ID })).toBe(true);
  const revoke = (observedAt = now) => repo.revokeForCurrentSession(request.sessionId, target.sessionId, { userId: ID }, observedAt);
  return { repo, request, target, row, revoke, setNow: (value: number) => { now = value; } };
}

describe('revocation strict atomic boundaries', () => {
  it.each(['accessor', 'symbol', 'hidden', 'extra', 'prototype', 'foreign-owner'])('rejects hostile %s owner context without mutation', (shape) => {
    const f = memory(); const getter = vi.fn(); const context: Record<string, unknown> = { userId: ID };
    if (shape === 'accessor') Object.defineProperty(context, 'userId', { get: getter, enumerable: true });
    if (shape === 'symbol') Object.defineProperty(context, Symbol('extra'), { value: true });
    if (shape === 'hidden') Object.defineProperty(context, 'userId', { value: ID, enumerable: false });
    if (shape === 'extra') context.householdId = UUID_FOR(99);
    if (shape === 'prototype') Object.setPrototypeOf(context, {});
    if (shape === 'foreign-owner') context.userId = OTHER;
    expect(f.repo.revokeForCurrentSession(f.request.sessionId, f.target.sessionId, context as never, NOW)).toEqual({ kind: 'invalid' });
    expect(getter).not.toHaveBeenCalled(); expect(f.repo.readSession(f.target.sessionId, { userId: ID }, NOW)).toEqual(f.target);
  });

  it.each([-1, NaN, Infinity, 1.5, NOW - 1, NOW + 86_400_000])('rejects invalid or untrusted observation %s before mutation', (time) => {
    const f = memory(); expect(f.revoke(time)).toEqual({ kind: 'invalid' }); expect(f.repo.readSession(f.target.sessionId, { userId: ID }, NOW)).toEqual(f.target);
  });

  it.each([-1, NaN, Infinity, 1.5, NOW - 1])('rejects invalid or rolled-back trusted clock %s', (time) => {
    const f = memory(); f.setNow(time); expect(f.revoke(NOW)).toEqual({ kind: 'invalid' });
    f.setNow(NOW); expect(f.repo.readSession(f.target.sessionId, { userId: ID }, NOW)).toEqual(f.target);
  });

  it('rechecks a requesting session revoked after resolver authorization and leaves the target alone', async () => {
    const f = fixture(); const request = await f.issue(); const target = await f.issue();
    const principal = await f.resolver.resolve(request.accessToken, MOBILE);
    expect(f.repo.revokeForCurrentSession(request.sessionId, request.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'revoked' });
    expect(f.repo.revokeForCurrentSession(principal.sessionId, target.sessionId, { userId: principal.identityId }, NOW)).toEqual({ kind: 'invalid' });
    await expect(f.resolver.resolve(target.accessToken, MOBILE)).resolves.toMatchObject({ identityId: ID });
  });

  it('treats a future-created or expired owned target as missing while request remains live', () => {
    const f = memory(); const older = f.row(30, ID, MOBILE, NOW - 86_400_000 + 500); expect(f.repo.createForActiveIdentity(older, { userId: ID })).toBe(true);
    f.setNow(NOW + 1000); const future = f.row(40); expect(f.repo.createForActiveIdentity(future, { userId: ID })).toBe(true);
    expect(f.repo.revokeForCurrentSession(f.request.sessionId, future.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'missing' });
    expect(f.repo.revokeForCurrentSession(f.request.sessionId, older.sessionId, { userId: ID }, NOW + 1000)).toEqual({ kind: 'missing' });
    expect(f.repo.readSession(future.sessionId, { userId: ID }, NOW + 1000)).toEqual(future);
    expect(f.revoke(NOW + 1000)).toEqual({ kind: 'revoked' });
  });

  it('retains the revoked web hash and checks original binding before replay family revocation', () => {
    const f = memory(); const web = f.row(30, ID, WEB); expect(f.repo.createForActiveIdentity(web, { userId: ID })).toBe(true);
    expect(f.repo.revokeForCurrentSession(f.request.sessionId, web.sessionId, { userId: ID }, NOW)).toEqual({ kind: 'revoked' });
    expect(f.repo.createForActiveIdentity({ ...web, sessionId: UUID_FOR(40), familyId: UUID_FOR(140) }, { userId: ID })).toBe(false);
    for (const transportContext of [MOBILE, { ...WEB, exactOrigin: 'https://other.example' }, { ...WEB, browserChainId: 'wrong' }]) {
      expect(f.repo.rotateRefresh({ refreshTokenHash: web.refreshTokenHash, successorRefreshTokenHash: 'f'.repeat(64), transportContext, observedAt: NOW })).toEqual({ kind: 'invalid' });
    }
    expect(f.repo.rotateRefresh({ refreshTokenHash: web.refreshTokenHash, successorRefreshTokenHash: 'f'.repeat(64), transportContext: WEB, observedAt: NOW })).toEqual({ kind: 'reused' });
    expect(f.repo.readSession(f.request.sessionId, { userId: ID }, NOW)).toEqual(f.request); expect(f.repo.readSession(f.target.sessionId, { userId: ID }, NOW)).toEqual(f.target);
  });

  it('rejects unrepresentable request or target expiry before deleting records', () => {
    const limit = 8_640_000_000_000_000; let now = limit;
    const repo = new InMemoryV2SessionRepository([ID], 10, () => now);
    const bad: SessionRecord = { identityId: ID, sessionId: UUID_FOR(10), familyId: UUID_FOR(110), generation: 0, refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: limit - 86_400_000 + 500, expiresAt: limit + 500 };
    expect(repo.createForActiveIdentity(bad, { userId: ID })).toBe(true);
    expect(repo.revokeForCurrentSession(bad.sessionId, bad.sessionId, { userId: ID }, now)).toEqual({ kind: 'invalid' });
    const good: SessionRecord = { ...bad, sessionId: UUID_FOR(20), familyId: UUID_FOR(120), refreshTokenHash: 'b'.repeat(64), createdAt: limit - 86_400_001, expiresAt: limit - 1 };
    now = limit - 2; expect(repo.createForActiveIdentity(good, { userId: ID })).toBe(true);
    expect(repo.revokeForCurrentSession(good.sessionId, bad.sessionId, { userId: ID }, now)).toEqual({ kind: 'missing' });
    expect(repo.readSession(good.sessionId, { userId: ID }, now)).toEqual(good);
  });

  it('missing and invalid outcomes remain frozen and disclose only kind', () => {
    const f = memory();
    for (const result of [f.repo.revokeForCurrentSession(f.request.sessionId, UUID_FOR(99), { userId: ID }, NOW), f.repo.revokeForCurrentSession('invalid', f.target.sessionId, { userId: ID }, NOW)]) {
      expect(Object.keys(result)).toEqual(['kind']); expect(Object.isFrozen(result)).toBe(true);
    }
  });
});


describe('failed revocation does not prune replay history', () => {
  it.each(['collision', 'full'])('preserves expired and live tombstones on %s preflight failure', (mode) => {
    const f = memory(mode === 'full' ? 1 : 2);
    type Tombstone = Readonly<Pick<SessionRecord, 'identityId' | 'sessionId' | 'familyId' | 'createdAt' | 'expiresAt' | 'transport'>>;
    // Deliberately corrupt the private reference state to test defensive branches that normal creation uniqueness prevents.
    // No production API exposes this test-only mutation.
    const consumed = Reflect.get(f.repo, 'consumed') as Map<string, Tombstone>;
    const live = Object.freeze({ identityId: ID, sessionId: f.target.sessionId, familyId: f.target.familyId, createdAt: NOW, expiresAt: NOW + 86_400_000, transport: 'mobile' as const });
    const expired = Object.freeze({ ...live, sessionId: UUID_FOR(90), familyId: UUID_FOR(190), createdAt: NOW - 86_400_001, expiresAt: NOW - 1 });
    consumed.set(mode === 'collision' ? f.target.refreshTokenHash : 'c'.repeat(64), live); consumed.set('e'.repeat(64), expired);
    const before = [...consumed.entries()];
    expect(f.revoke()).toEqual({ kind: 'capacity' }); expect([...consumed.entries()]).toEqual(before);
    expect(f.repo.readSession(f.target.sessionId, { userId: ID }, NOW)).toEqual(f.target);
    expect(f.repo.readSession(f.request.sessionId, { userId: ID }, NOW)).toEqual(f.request);
  });
});
