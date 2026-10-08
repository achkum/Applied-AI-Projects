import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionRecord } from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const originalVerify = BankIdSimulator.prototype.verify;
afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture() {
  let now = NOW;
  const proofStore = new ProofStore(new InMemoryProofRepository(), () => now);
  const pair = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => now });
  const repo = new InMemoryV2SessionRepository([ID, OTHER], 10_000, () => now);
  const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true, simulatorHmacKey: new Uint8Array(32).fill(9), identityResolver: { resolveRegisteredIdentityId: () => ID }, proofStore, clock: () => now });
  let serial = 10;
  const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens: tokens, repository: repo, clock: () => now,
    randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(serial++).padStart(2, '0')}`, randomBytes: () => new Uint8Array(32).fill(serial) });
  const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader: repo, clock: () => now });
  return { repo, producer, issuer, resolver, setNow: (value: number) => { now = value; } };
}

describe('internal current-session listing', () => {
  it('lists only the owner’s live sessions as frozen, minimal, deterministic copies after issuer and resolver authorization', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture();
    const issue = async (transport: typeof MOBILE | typeof WEB, deviceName?: string) => {
      const proof = await f.producer.issue(transport);
      const issued = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: transport, ...(deviceName === undefined ? {} : { deviceName }) });
      return { issued, principal: await f.resolver.resolve(issued.accessToken, transport) };
    };
    const first = await issue(MOBILE, 'Phone');
    const second = await issue(WEB);
    const request = await issue(MOBILE, 'Tablet');
    const other = Object.freeze({ identityId: OTHER, sessionId: '123e4567-e89b-42d3-a456-426614174099', familyId: '123e4567-e89b-42d3-a456-426614174098', generation: 0 as const,
      refreshTokenHash: 'f'.repeat(64), transport: 'mobile' as const, deviceName: 'Foreign', createdAt: NOW, expiresAt: NOW + 86_400_000 });
    expect(f.repo.createForActiveIdentity(other, { userId: OTHER })).toBe(true);
    const rows = f.repo.listForCurrentSession(request.issued.sessionId, { userId: ID }, NOW);
    expect(await f.resolver.resolve(first.issued.accessToken, MOBILE)).toEqual(first.principal);
    expect(rows?.map((row) => row.id)).toEqual([first.issued.sessionId, second.issued.sessionId, request.issued.sessionId]);
    expect(rows?.map((row) => row.current)).toEqual([false, false, true]);
    expect(rows?.every((row) => Object.keys(row).join(',') === 'id,createdAt,current,deviceName')).toBe(true);
    expect(rows?.[2]).toEqual({ id: request.issued.sessionId, createdAt: new Date(NOW).toISOString(), current: true, deviceName: 'Tablet' });
    expect(Object.isFrozen(rows)).toBe(true); expect(rows?.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(first.issued.refreshToken);
  });

  it('keeps summaries stable through rotation and invalidates the request after reuse or deletion', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const proof = await f.producer.issue(MOBILE); const request = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: MOBILE });
    const before = f.repo.listForCurrentSession(request.sessionId, { userId: ID }, NOW);
    const hash = (token: string) => createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(token, 'utf8').digest('hex');
    expect(f.repo.rotateRefresh({ refreshTokenHash: hash(request.refreshToken), successorRefreshTokenHash: 'a'.repeat(64), transportContext: MOBILE, observedAt: NOW }).kind).toBe('rotated');
    expect(f.repo.listForCurrentSession(request.sessionId, { userId: ID }, NOW)).toEqual(before);
    expect(f.repo.rotateRefresh({ refreshTokenHash: hash(request.refreshToken), successorRefreshTokenHash: 'b'.repeat(64), transportContext: MOBILE, observedAt: NOW }).kind).toBe('reused');
    expect(f.repo.listForCurrentSession(request.sessionId, { userId: ID }, NOW)).toBeNull();
    const deleted = fixture(); const dp = await deleted.producer.issue(MOBILE); const ds = await deleted.issuer.issueFromLoginProof({ loginProof: dp, transportContext: MOBILE });
    expect(deleted.repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    expect(deleted.repo.listForCurrentSession(ds.sessionId, { userId: ID }, NOW)).toBeNull();
    const second = fixture(); const p = await second.producer.issue(MOBILE); const s = await second.issuer.issueFromLoginProof({ loginProof: p, transportContext: MOBILE });
    second.setNow(NOW + 86_400_000);
    expect(second.repo.listForCurrentSession(s.sessionId, { userId: ID }, NOW + 86_400_000)).toBeNull();
  });

  it('rejects malformed contexts and observations without invoking getters or pruning before validation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const proof = await f.producer.issue(MOBILE); const request = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: MOBILE });
    const getter = vi.fn(() => ID); const hostile = {};
    Object.defineProperty(hostile, 'userId', { enumerable: true, get: getter });
    expect(f.repo.listForCurrentSession(request.sessionId, hostile as never, NOW)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(f.repo.listForCurrentSession(request.sessionId, { userId: OTHER }, NOW)).toBeNull();
    expect(f.repo.listForCurrentSession(request.sessionId, { userId: ID, extra: true } as never, NOW)).toBeNull();
    expect(f.repo.listForCurrentSession(request.sessionId, { userId: ID }, NOW + 1)).toBeNull();
    expect(f.repo.readSession(request.sessionId, { userId: ID }, NOW)).not.toBeNull();
  });
});

const UUID_FOR = (n: number) => `123e4567-e89b-42d3-a456-426614${String(n).padStart(6, '0')}`;
function scopedMemory() {
  let now = NOW;
  const repo = new InMemoryV2SessionRepository([ID, OTHER], 10, () => now);
  const row = (n: number, createdAt = now, owner = ID): SessionRecord => ({ identityId: owner, sessionId: UUID_FOR(n), familyId: UUID_FOR(n + 100),
    generation: 0, refreshTokenHash: String(n).padStart(64, 'a'), transport: 'mobile', deviceName: 'Phone', createdAt, expiresAt: createdAt + 86_400_000 });
  const current = row(10); expect(repo.createForActiveIdentity(current, { userId: ID })).toBe(true);
  return { repo, current, row, setNow: (value: number) => { now = value; } };
}

describe('session listing time and scope boundaries', () => {
  it('sorts descending by creation time then lexical ID and returns independent copies', () => {
    const f = scopedMemory(); const old = f.row(20, NOW - 10); const tie = f.row(5);
    expect(f.repo.createForActiveIdentity(old, { userId: ID })).toBe(true); expect(f.repo.createForActiveIdentity(tie, { userId: ID })).toBe(true);
    const first = f.repo.listForCurrentSession(f.current.sessionId, Object.freeze({ userId: ID }), NOW);
    const second = f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, NOW);
    expect(first?.map((r) => r.id)).toEqual([tie.sessionId, f.current.sessionId, old.sessionId]);
    expect(first?.filter((r) => r.current)).toEqual([{ id: f.current.sessionId, createdAt: new Date(NOW).toISOString(), current: true, deviceName: 'Phone' }]);
    expect(second).toEqual(first); expect(second).not.toBe(first); expect(second?.[0]).not.toBe(first?.[0]);
    expect(() => { (first as unknown[]).push({}); }).toThrow(); expect(() => { if (first?.[0]) Object.assign(first[0], { deviceName: 'mutated' }); }).toThrow();
  });

  it('omits future-created owner rows after trusted clock rollback', () => {
    const f = scopedMemory(); f.setNow(NOW + 1000); const future = f.row(20, NOW + 1000);
    expect(f.repo.createForActiveIdentity(future, { userId: ID })).toBe(true);
    f.setNow(NOW); expect(f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, NOW)?.map((r) => r.id)).toEqual([f.current.sessionId]);
    f.setNow(NOW + 1000); expect(f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, NOW + 1000)?.map((r) => r.id)).toEqual([future.sessionId, f.current.sessionId]);
  });

  it('excludes sessions expired at trusted time even when the observation is earlier', () => {
    const f = scopedMemory(); const older = f.row(20, NOW - 86_400_000 + 500);
    expect(f.repo.createForActiveIdentity(older, { userId: ID })).toBe(true);
    f.setNow(NOW + 500); expect(f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, NOW)?.map((r) => r.id)).toEqual([f.current.sessionId]);
    expect(f.repo.readSession(older.sessionId, { userId: ID }, NOW + 500)).toBeNull();
  });

  it.each(['extra', 'symbol', 'hidden', 'accessor', 'prototype', 'malformed-owner'])('rejects hostile %s contexts without getter invocation', (shape) => {
    const f = scopedMemory(); const getter = vi.fn(); const context: Record<string, unknown> = { userId: ID };
    if (shape === 'extra') context.householdId = UUID_FOR(20);
    if (shape === 'symbol') Object.defineProperty(context, Symbol('extra'), { value: true });
    if (shape === 'hidden') Object.defineProperty(context, 'userId', { value: ID, enumerable: false });
    if (shape === 'accessor') Object.defineProperty(context, 'userId', { get: getter, enumerable: true });
    if (shape === 'prototype') Object.setPrototypeOf(context, {});
    if (shape === 'malformed-owner') context.userId = ID.toUpperCase();
    expect(f.repo.listForCurrentSession(f.current.sessionId, context as never, NOW)).toBeNull(); expect(getter).not.toHaveBeenCalled();
    expect(f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, NOW)).toHaveLength(1);
  });

  it.each([-1, NaN, Infinity, 1.5, NOW - 1, NOW + 86_400_000])('rejects invalid observed time %s without pruning live rows', (time) => {
    const f = scopedMemory(); expect(f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, time)).toBeNull();
    expect(f.repo.readSession(f.current.sessionId, { userId: ID }, NOW)).toEqual(f.current);
  });

  it.each([-1, NaN, Infinity, 1.5, NOW - 1])('rejects invalid or rolled-back trusted clock %s', (time) => {
    const f = scopedMemory(); f.setNow(time); expect(f.repo.listForCurrentSession(f.current.sessionId, { userId: ID }, NOW)).toBeNull();
    f.setNow(NOW); expect(f.repo.readSession(f.current.sessionId, { userId: ID }, NOW)).toEqual(f.current);
  });

  it('rejects unrepresentable trusted dates before pruning even when record creation is representable', () => {
    let now = 8_640_000_000_000_000;
    const repo = new InMemoryV2SessionRepository([ID], 10, () => now);
    const row: SessionRecord = { identityId: ID, sessionId: UUID_FOR(10), familyId: UUID_FOR(110), generation: 0, refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: now, expiresAt: now + 86_400_000 };
    expect(repo.createForActiveIdentity(row, { userId: ID })).toBe(true);
    now += 1; expect(repo.listForCurrentSession(row.sessionId, { userId: ID }, row.createdAt)).toBeNull();
    now -= 1; expect(repo.readSession(row.sessionId, { userId: ID }, now)).toEqual(row);
  });

  it('a resolved session revoked before listing cannot authorize it, while a neighboring session can', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); const f = fixture();
    const issue = async () => f.issuer.issueFromLoginProof({ loginProof: await f.producer.issue(MOBILE), transportContext: MOBILE });
    const request = await issue(); const neighbor = await issue();
    const principal = await f.resolver.resolve(request.accessToken, MOBILE);
    const hash = createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(request.refreshToken, 'utf8').digest('hex');
    expect(f.repo.rotateRefresh({ refreshTokenHash: hash, successorRefreshTokenHash: 'a'.repeat(64), transportContext: MOBILE, observedAt: NOW }).kind).toBe('rotated');
    expect(f.repo.rotateRefresh({ refreshTokenHash: hash, successorRefreshTokenHash: 'b'.repeat(64), transportContext: MOBILE, observedAt: NOW }).kind).toBe('reused');
    expect(f.repo.listForCurrentSession(principal.sessionId, Object.freeze({ userId: principal.identityId }), NOW)).toBeNull();
    expect(f.repo.listForCurrentSession(neighbor.sessionId, { userId: ID }, NOW)?.map((r) => r.id)).toEqual([neighbor.sessionId]);
  });

  it('missing and foreign request sessions fail without revealing other owners', () => {
    const f = scopedMemory(); const other = f.row(20, NOW, OTHER); expect(f.repo.createForActiveIdentity(other, { userId: OTHER })).toBe(true);
    expect(f.repo.listForCurrentSession(other.sessionId, { userId: ID }, NOW)).toBeNull(); expect(f.repo.listForCurrentSession(UUID_FOR(99), { userId: ID }, NOW)).toBeNull();
    expect(f.repo.listForCurrentSession('invalid', { userId: ID }, NOW)).toBeNull();
    expect(f.repo.listForCurrentSession(other.sessionId, { userId: OTHER }, NOW)?.map((r) => r.id)).toEqual([other.sessionId]);
  });
});


describe('owner row Date preflight', () => {
  it('rejects an unrepresentable owner expiry before pruning any stored rows', () => {
    const limit = 8_640_000_000_000_000; let now = limit;
    const repo = new InMemoryV2SessionRepository([ID], 10, () => now);
    const boundary: SessionRecord = { identityId: ID, sessionId: UUID_FOR(10), familyId: UUID_FOR(110), generation: 0, refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: limit, expiresAt: limit + 86_400_000 };
    expect(repo.createForActiveIdentity(boundary, { userId: ID })).toBe(true);
    now = limit - 86_400_001;
    const older: SessionRecord = { ...boundary, sessionId: UUID_FOR(20), familyId: UUID_FOR(120), refreshTokenHash: 'b'.repeat(64), createdAt: now, expiresAt: now + 86_400_000 };
    expect(repo.createForActiveIdentity(older, { userId: ID })).toBe(true);
    now = limit;
    expect(repo.listForCurrentSession(boundary.sessionId, { userId: ID }, now)).toBeNull();
    // Rewind only the reference clock to observe whether the failed preflight pruned the expired row.
    now = older.createdAt; expect(repo.readSession(older.sessionId, { userId: ID }, now)).toEqual(older);
  });

  it('does not validate or expose another owner’s out-of-range timestamps', () => {
    const f = scopedMemory(); const far = 8_640_000_000_000_000;
    f.setNow(far); const foreign = f.row(20, far, OTHER); expect(f.repo.createForActiveIdentity(foreign, { userId: OTHER })).toBe(true);
    f.setNow(NOW); // original current row was pruned by creation at far, so establish a fresh owned reference row
    const own = f.row(30); expect(f.repo.createForActiveIdentity(own, { userId: ID })).toBe(true);
    expect(f.repo.listForCurrentSession(own.sessionId, { userId: ID }, NOW)?.map((r) => r.id)).toEqual([own.sessionId]);
  });
});
