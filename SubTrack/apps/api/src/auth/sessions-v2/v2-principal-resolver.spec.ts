import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionRecord } from './v2-session-issuer';
import { V2AccessToken } from './v2-access-token';
import { DevelopmentV2PrincipalResolver, type V2PrincipalResolverConfig, type V2SessionReader } from './v2-principal-resolver';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID2 = '123e4567-e89b-42d3-a456-426614174001';
const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const FAILURE = 'Unauthorized';
const originalVerify = BankIdSimulator.prototype.verify;

afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });
function fixture() {
  const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
  const pair = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => NOW });
  const repo = new InMemoryV2SessionRepository([ID, ID2], 10_000, () => NOW);
  const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true, simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => ID }, proofStore, clock: () => NOW });
  let serial = 20;
  const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens: tokens, repository: repo,
    clock: () => NOW, randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(serial++).padStart(2, '0')}`,
    randomBytes: () => new Uint8Array(32).fill(serial) });
  const read = vi.fn((sid: string, context: Readonly<{ userId: string }>, now: number) => repo.readSession(sid, context, now));
  const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader: { readSession: read }, clock: () => NOW });
  return { proofStore, tokens, repo, producer, issuer, resolver, read };
}

describe('DevelopmentV2PrincipalResolver', () => {
  it.each([['web', WEB], ['mobile', MOBILE]] as const)('resolves simulator proof to frozen minimal principal for %s', async (_label, context) => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const proof = await f.producer.issue(context);
    const issued = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: context, ...(context.transport === 'mobile' ? { deviceName: 'Phone 📱' } : {}) });
    const principal = await f.resolver.resolve(issued.accessToken, context);
    expect(principal).toEqual({ identityId: ID, sessionId: issued.sessionId }); expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.keys(principal)).toEqual(['identityId', 'sessionId']); expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.read.mock.calls[0]?.[0]).toBe(issued.sessionId); expect(f.read.mock.calls[0]?.[1]).toEqual({ userId: ID }); expect(Object.isFrozen(f.read.mock.calls[0]?.[1])).toBe(true);
  });

  it('rejects a valid token after owner deletion and rejects web scope mismatches', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fixture(); const proof = await f.producer.issue(WEB); const issued = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: WEB });
    await expect(f.resolver.resolve(issued.accessToken, { ...WEB, browserChainId: 'other' })).rejects.toThrow(FAILURE);
    expect(f.repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    await expect(f.resolver.resolve(issued.accessToken, WEB)).rejects.toThrow(FAILURE);
  });

  it('rejects invalid token and strict context before any owner read', async () => {
    const f = fixture(); const read = vi.spyOn(f.repo, 'readSession');
    await expect(f.resolver.resolve('v1-looking-token', MOBILE)).rejects.toThrow(FAILURE);
    const getter = vi.fn(() => 'mobile'); const bad = {};
    Object.defineProperty(bad, 'transport', { enumerable: true, get: getter });
    await expect(f.resolver.resolve('opaque', bad as never)).rejects.toThrow(FAILURE);
    await expect(f.resolver.resolve('opaque', { transport: 'mobile', exactOrigin: undefined } as never)).rejects.toThrow(FAILURE);
    expect(getter).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });

  it('rejects hostile claim and session snapshots without invoking getters', async () => {
    const claimsGetter = vi.fn(); const claimSource = { verify: () => { const c = { iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development', sub: ID, sid: '123e4567-e89b-42d3-a456-426614174020', iat: NOW / 1000, exp: NOW / 1000 + 900, ver: 2 }; Object.defineProperty(c, 'secret', { get: claimsGetter }); return c; } };
    const reader: V2SessionReader = { readSession: () => null };
    const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: claimSource as never, reader, clock: () => NOW });
    await expect(resolver.resolve('opaque', MOBILE)).rejects.toThrow(FAILURE); expect(claimsGetter).not.toHaveBeenCalled();
  });

  it.each(['token-expiry', 'session-expiry', 'rollback'] as const)('rechecks fresh clock after deferred read: %s', async (mode) => {
    let now = NOW;
    const id = '123e4567-e89b-42d3-a456-426614174020'; const sid = '123e4567-e89b-42d3-a456-426614174021';
    const pair = generateKeyPairSync('ed25519'); const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => NOW });
    const token = tokens.issue(id, sid);
    const record: SessionRecord = Object.freeze({ identityId: id, sessionId: sid, familyId: '123e4567-e89b-42d3-a456-426614174022', generation: 0,
      refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: mode === 'session-expiry' ? NOW - 86_400_000 + 500 : NOW, expiresAt: mode === 'session-expiry' ? NOW + 500 : NOW + 86_400_000 });
    let settle!: (value: Readonly<SessionRecord>) => void;
    const pending = new Promise<Readonly<SessionRecord>>((resolve) => { settle = resolve; });
    const reader: V2SessionReader = { readSession: () => pending };
    const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader, clock: () => now });
    const result = resolver.resolve(token, MOBILE);
    now = mode === 'token-expiry' ? NOW + 900_000 : mode === 'session-expiry' ? NOW + 500 : NOW - 1;
    settle(record); await expect(result).rejects.toThrow(FAILURE);
  });

  it('rejects corrupt returned records and source mutation cannot alter principal', async () => {
    const f = fixture(); vi.useFakeTimers(); vi.setSystemTime(NOW);
    const proof = await f.producer.issue(MOBILE); const issued = await f.issuer.issueFromLoginProof({ loginProof: proof, transportContext: MOBILE });
    const getter = vi.fn(); const wrapped: V2SessionReader = { readSession: (sid, ctx, now) => {
      const value = f.repo.readSession(sid, ctx, now); if (!value) return null;
      const copy = { ...value }; Object.defineProperty(copy, 'extra', { get: getter }); return copy as SessionRecord;
    } };
    const badResolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: f.tokens, reader: wrapped, clock: () => NOW });
    await expect(badResolver.resolve(issued.accessToken, MOBILE)).rejects.toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
  });

  it('rejects symbol/hidden transport keys, wrong namespace claims, and corrupt records', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174030'; const sid = '123e4567-e89b-42d3-a456-426614174031';
    const claims = { iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development', sub: id, sid, iat: NOW / 1000, exp: NOW / 1000 + 900, ver: 2 };
    const reads = vi.fn(() => null);
    const wrongNamespace = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: { verify: () => ({ ...claims, aud: 'urn:wrong' }) } as never, reader: { readSession: reads }, clock: () => NOW });
    await expect(wrongNamespace.resolve('token', MOBILE)).rejects.toThrow(FAILURE); expect(reads).not.toHaveBeenCalled();
    const pair = generateKeyPairSync('ed25519'); const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: pair.privateKey, publicKey: pair.publicKey, clock: () => NOW });
    const token = tokens.issue(id, sid);
    const corrupted: SessionRecord = { identityId: id, sessionId: sid, familyId: '123e4567-e89b-42d3-a456-426614174032', generation: 1 as 0, refreshTokenHash: 'bad', transport: 'mobile', deviceName: null, createdAt: NOW, expiresAt: NOW + 86_400_000 };
    const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader: { readSession: () => corrupted }, clock: () => NOW });
    await expect(resolver.resolve(token, MOBILE)).rejects.toThrow(FAILURE);
    const symbolContext = { transport: 'mobile', [Symbol('extra')]: true };
    await expect(resolver.resolve(token, symbolContext as never)).rejects.toThrow(FAILURE);
    const hiddenContext = { transport: 'mobile' };
    Object.defineProperty(hiddenContext, 'hidden', { value: true });
    await expect(resolver.resolve(token, hiddenContext as never)).rejects.toThrow(FAILURE);
  });

  it('captures callable receivers once and rejects malformed resolver configuration', async () => {
    const f = fixture(); const accessTokens = { verify(token: string) { expect(this).toBe(accessTokens); return f.tokens.verify(token); } };
    const reader = { readSession(id: string, ctx: Readonly<{ userId: string }>, now: number) { expect(this).toBe(reader); return f.repo.readSession(id, ctx, now); } };
    const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens, reader, clock: () => NOW });
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const issued = await f.issuer.issueFromLoginProof({ loginProof: await f.producer.issue(MOBILE), transportContext: MOBILE });
    await expect(resolver.resolve(issued.accessToken, MOBILE)).resolves.toEqual({ identityId: ID, sessionId: issued.sessionId });
    expect(Object.isFrozen(resolver)).toBe(true);
    const getter = vi.fn(); const invalid = { environment: 'development', enabled: true, accessTokens, reader, clock: () => NOW };
    Object.defineProperty(invalid, 'extra', { get: getter });
    expect(() => new DevelopmentV2PrincipalResolver(invalid as V2PrincipalResolverConfig)).toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
  });
});

const SID = '123e4567-e89b-42d3-a456-426614174030';
const FAMILY = '123e4567-e89b-42d3-a456-426614174031';
const validRecord = (): SessionRecord => ({ identityId: ID, sessionId: SID, familyId: FAMILY, generation: 0, refreshTokenHash: 'a'.repeat(64), transport: 'mobile', deviceName: null, createdAt: NOW, expiresAt: NOW + 86_400_000 });
const validClaims = { iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development', sub: ID, sid: SID, iat: NOW / 1000, exp: NOW / 1000 + 900, ver: 2 } as const;
function resolverFor(reader: V2SessionReader, clock: () => number = () => NOW, claims: unknown = validClaims) {
  return new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: { verify: () => claims } as never, reader, clock });
}
describe('isolated record and clock failures', () => {
  it.each([
    { identityId: ID2 }, { sessionId: ID2 }, { familyId: SID }, { generation: 1 }, { refreshTokenHash: 'bad' },
    { createdAt: NOW + 1, expiresAt: NOW + 86_400_001 }, { expiresAt: NOW + 1 }, { createdAt: -1 },
    { exactOrigin: undefined }, { transport: 'web', exactOrigin: WEB.exactOrigin, browserChainId: WEB.browserChainId },
  ])('rejects a single corrupt/mismatched field %j', async (changes) => {
    const record = { ...validRecord(), ...changes } as SessionRecord; const reader = { readSession: vi.fn(() => record) };
    await expect(resolverFor(reader).resolve('trusted-test-token', MOBILE)).rejects.toThrow(FAILURE); expect(reader.readSession).toHaveBeenCalledTimes(1);
  });
  it('rejects a session created after supplied read time even if fresh clock catches up', async () => {
    let now = NOW; const record = { ...validRecord(), createdAt: NOW + 1, expiresAt: NOW + 86_400_001 };
    const reader = { readSession: () => { now += 2; return record; } };
    await expect(resolverFor(reader, () => now).resolve('trusted-test-token', MOBILE)).rejects.toThrow(FAILURE);
  });
  it('returns an independent frozen copy after an accepted mutable snapshot', async () => {
    const value = validRecord(); const principal = await resolverFor({ readSession: () => value }).resolve('trusted-test-token', MOBILE);
    (value as { identityId: string }).identityId = ID2;
    expect(principal).toEqual({ identityId: ID, sessionId: SID }); expect(Object.isFrozen(principal)).toBe(true);
  });
  it.each([-1, NaN, Infinity, 1.5])('rejects invalid pre-read clock %s with zero reads', async (time) => {
    const reader = { readSession: vi.fn(() => validRecord()) }; await expect(resolverFor(reader, () => time).resolve('trusted-test-token', MOBILE)).rejects.toThrow(FAILURE); expect(reader.readSession).not.toHaveBeenCalled();
  });
  it('normalizes read exceptions, null records and invalid post-read clocks', async () => {
    for (const reader of [{ readSession: () => null }, { readSession: () => { throw new Error('secret detail'); } }]) await expect(resolverFor(reader).resolve('trusted-test-token', MOBILE)).rejects.toMatchObject({ message: FAILURE });
    let calls = 0; await expect(resolverFor({ readSession: () => validRecord() }, () => calls++ === 0 ? NOW : NaN).resolve('trusted-test-token', MOBILE)).rejects.toThrow(FAILURE);
  });
  it.each([{ iss: 'v1' }, { aud: 'v1' }, { ver: 1 }, { sub: 'invalid' }, { sid: 'invalid' }, { exp: validClaims.exp + 1 }])('rejects invalid verifier claim %j before owner read', async (changes) => {
    const reader = { readSession: vi.fn(() => validRecord()) }; await expect(resolverFor(reader, () => NOW, { ...validClaims, ...changes }).resolve('trusted-test-token', MOBILE)).rejects.toThrow(FAILURE); expect(reader.readSession).not.toHaveBeenCalled();
  });
  it('rejects actual signed v1-shaped credentials even under deliberately shared ephemeral key', async () => {
    const { sign } = await import('node:crypto'); const keys = generateKeyPairSync('ed25519');
    const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: keys.privateKey, publicKey: keys.publicKey, clock: () => NOW });
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: ID, sid: SID, iat: NOW / 1000, exp: NOW / 1000 + 900 })).toString('base64url');
    const input = header + '.' + payload; const token = input + '.' + sign(null, Buffer.from(input), keys.privateKey).toString('base64url');
    const reader = { readSession: vi.fn(() => validRecord()) };
    const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: tokens, reader, clock: () => NOW });
    await expect(resolver.resolve(token, MOBILE)).rejects.toThrow(FAILURE); expect(reader.readSession).not.toHaveBeenCalled();
  });
});
