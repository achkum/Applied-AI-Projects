import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionRecord, type RotatedFamilyExpectation, type SessionRequestContext } from './v2-session-issuer';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import { V2AccessToken } from './v2-access-token';
import { DevelopmentV2SessionRefresher, type V2SessionRefresherConfig } from './v2-session-refresher';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID2 = '123e4567-e89b-42d3-a456-426614174001';
const SID = '123e4567-e89b-42d3-a456-426614174020';
const FAMILY = '123e4567-e89b-42d3-a456-426614174021';
const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const FAILURE = 'Session unavailable';
const refreshToken = (n: number): string => `v2r.${Buffer.alloc(32, n).toString('base64url')}`;
const hash = (token: string): string => createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(token, 'utf8').digest('hex');
const originalVerify = BankIdSimulator.prototype.verify;
afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture(context: typeof MOBILE | typeof WEB = MOBILE, issuerOverride?: object, accessOverride?: object, clock: () => number = () => NOW, random?: (n: number) => Uint8Array) {
  const repo = new InMemoryV2SessionRepository([ID, ID2], 100, () => NOW);
  const record: SessionRecord = Object.freeze({ identityId: ID, sessionId: SID, familyId: FAMILY, generation: 0,
    refreshTokenHash: hash(refreshToken(1)), transport: context.transport, ...(context.transport === 'web' ? { exactOrigin: context.exactOrigin, browserChainId: context.browserChainId } : {}),
    deviceName: null, createdAt: NOW, expiresAt: NOW + 86_400_000 });
  if (!repo.createForActiveIdentity(record, { userId: ID })) throw new Error('fixture unavailable');
  const keys = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: keys.privateKey, publicKey: keys.publicKey, clock: () => NOW });
  const accessTokens = accessOverride ?? tokens;
  const repository = issuerOverride ?? repo;
  const refresher = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: repository as V2SessionRefresherConfig['repository'], accessTokens: accessTokens as V2SessionRefresherConfig['accessTokens'], clock, randomBytes: random ?? (() => new Uint8Array(32).fill(2)) });
  return { repo, tokens, refresher, record };
}

describe('DevelopmentV2SessionRefresher', () => {
  it.each([['mobile', MOBILE], ['web', WEB]] as const)('rotates the stored principal and binds transport for %s', async (_label, context) => {
    const f = fixture(context);
    const result = await f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: context });
    expect(result).toEqual({ sessionId: SID, accessToken: f.tokens.issue(ID, SID), refreshToken: refreshToken(2) });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.keys(result)).toEqual(['sessionId', 'accessToken', 'refreshToken']);
    expect(f.repo.readSession(SID, { userId: ID }, NOW)?.refreshTokenHash).toBe(hash(result.refreshToken));
  });

  it('rejects wrong scope and malformed canonical pad bits before mutation', async () => {
    const f = fixture(WEB);
    await expect(f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: { ...WEB, browserChainId: 'wrong' } })).rejects.toThrow(FAILURE);
    const canonical = refreshToken(1); const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const last = canonical.at(-1) as string; const bad = `${canonical.slice(0, -1)}${alphabet[(alphabet.indexOf(last) | 1)]}`;
    await expect(f.refresher.refresh({ refreshToken: bad, transportContext: WEB })).rejects.toThrow(FAILURE);
    expect(f.repo.readSession(SID, { userId: ID }, NOW)?.refreshTokenHash).toBe(hash(canonical));
  });

  it('rejects accessor input, captures method receivers, and does not invoke getters', async () => {
    const f = fixture(); const getter = vi.fn(); const hostile = { transportContext: MOBILE } as Record<string, unknown>;
    Object.defineProperty(hostile, 'refreshToken', { enumerable: true, get: getter });
    await expect(f.refresher.refresh(hostile as never)).rejects.toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
    const repository = { rotateRefresh(input: Parameters<typeof f.repo.rotateRefresh>[0]) { expect(this).toBe(repository); return f.repo.rotateRefresh(input); }, revokeRotatedFamily(input: Parameters<typeof f.repo.revokeRotatedFamily>[0], ctx: Parameters<typeof f.repo.revokeRotatedFamily>[1]) { expect(this).toBe(repository); return f.repo.revokeRotatedFamily(input, ctx); } };
    const accessTokens = { issue(identityId: string, sessionId: string) { expect(this).toBe(accessTokens); return f.tokens.issue(identityId, sessionId); } };
    const bound = fixture(MOBILE, repository, accessTokens);
    await expect(bound.refresher.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).resolves.toMatchObject({ sessionId: SID });
    const config = { environment: 'development', enabled: true, repository: f.repo, accessTokens: f.tokens, clock: () => NOW };
    Object.defineProperty(config, 'extra', { get: getter });
    expect(() => new DevelopmentV2SessionRefresher(config as never)).toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
  });

  it('cleans exactly the known rotated family after issuer failure and never restores the old hash', async () => {
    const f = fixture(MOBILE, undefined, { issue: () => { throw new Error('sensitive issuer detail'); } });
    await expect(f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE);
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toBeNull();
    expect(f.repo.createForActiveIdentity({ ...f.record, sessionId: '123e4567-e89b-42d3-a456-426614174022', familyId: '123e4567-e89b-42d3-a456-426614174023' }, { userId: ID })).toBe(false);
    const neighbor: SessionRecord = { ...f.record, identityId: ID2, sessionId: '123e4567-e89b-42d3-a456-426614174024', familyId: '123e4567-e89b-42d3-a456-426614174025', refreshTokenHash: 'f'.repeat(64) };
    expect(f.repo.createForActiveIdentity(neighbor, { userId: ID2 })).toBe(true);
    expect(f.repo.readSession(neighbor.sessionId, { userId: ID2 }, NOW)).toEqual(neighbor);
  });

  it('does not expose credentials for an unknown or malformed adapter outcome', async () => {
    const rotateRefresh = vi.fn(() => ({ kind: 'uncertain', then: vi.fn() }));
    const repository = { rotateRefresh, revokeRotatedFamily: vi.fn(() => true) };
    const f = fixture(MOBILE, repository);
    await expect(f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE);
    expect(rotateRefresh).toHaveBeenCalledTimes(1); expect(repository.revokeRotatedFamily).not.toHaveBeenCalled();
  });

  it('cleans after deferred expiry or clock rollback and ignores cleanup failures', async () => {
    const base = fixture(); let settle!: (value: unknown) => void;
    const rotateRefresh = vi.fn(() => new Promise((resolve) => { settle = resolve; })); const revokeRotatedFamily = vi.fn(() => { throw new Error('private'); });
    let clockCalls = 0;
    const f = fixture(MOBILE, { rotateRefresh, revokeRotatedFamily }, undefined, () => clockCalls++ === 0 ? NOW : NOW + 86_400_000);
    const pending = f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE });
    settle({ kind: 'rotated', identityId: ID, sessionId: SID, familyId: FAMILY, expiresAt: NOW + 86_400_000 });
    await expect(pending).rejects.toThrow(FAILURE); expect(revokeRotatedFamily).toHaveBeenCalledTimes(1);
    expect(base.repo.readSession(SID, { userId: ID }, NOW)?.refreshTokenHash).toBe(hash(refreshToken(1)));
  });
});

function fullPipeline(context: typeof MOBILE | Readonly<{ transport: 'web'; exactOrigin: string; browserChainId: string }> = MOBILE) {
  const f = fixture(context as typeof MOBILE | typeof WEB);
  const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
  let identity = ID; let serial = 40;
  const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true, simulatorHmacKey: new Uint8Array(32).fill(9),
    identityResolver: { resolveRegisteredIdentityId: () => identity }, proofStore, clock: () => NOW });
  const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens: f.tokens, repository: f.repo, clock: () => NOW,
    randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(serial++).padStart(2, '0')}`, randomBytes: () => new Uint8Array(32).fill(serial) });
  const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: f.tokens, reader: f.repo, clock: () => NOW });
  const issue = async () => issuer.issueFromLoginProof({ loginProof: await producer.issue(context), transportContext: context });
  return { ...f, issuer, resolver, issue, setIdentity: (value: string) => { identity = value; } };
}

describe('refresh service shared-state integration', () => {
  it.each([MOBILE, WEB, { ...WEB, exactOrigin: 'https://[::1]' }])('issues and invalidates credentials through the real shared pipeline', async (context) => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fullPipeline(context); const original = await f.issue(); const neighbor = await f.issue();
    f.setIdentity(ID2); const otherOwner = await f.issue();
    const before = f.repo.readSession(original.sessionId, { userId: ID }, NOW);
    const rotate = vi.spyOn(f.repo, 'rotateRefresh');
    const service = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: f.repo, accessTokens: f.tokens, clock: () => NOW, randomBytes: () => new Uint8Array(32).fill(99) });
    const result = await service.refresh({ refreshToken: original.refreshToken, transportContext: context });
    expect(result.sessionId).toBe(original.sessionId); expect(Object.keys(result)).toEqual(['sessionId', 'accessToken', 'refreshToken']); expect(Object.isFrozen(result)).toBe(true);
    expect(rotate).toHaveBeenCalledTimes(1); const mutation = rotate.mock.calls[0]?.[0];
    expect(mutation?.refreshTokenHash).toBe(hash(original.refreshToken)); expect(mutation?.successorRefreshTokenHash).toBe(hash(result.refreshToken));
    expect(Object.isFrozen(mutation)).toBe(true); expect(Object.isFrozen(mutation?.transportContext)).toBe(true);
    expect(f.repo.readSession(result.sessionId, { userId: ID }, NOW)).toEqual({ ...before, refreshTokenHash: hash(result.refreshToken) });
    await expect(f.resolver.resolve(original.accessToken, context)).resolves.toMatchObject({ identityId: ID });
    await expect(f.resolver.resolve(result.accessToken, context)).resolves.toMatchObject({ identityId: ID });
    await expect(service.refresh({ refreshToken: original.refreshToken, transportContext: context })).rejects.toThrow(FAILURE);
    await expect(f.resolver.resolve(original.accessToken, context)).rejects.toThrow('Unauthorized');
    await expect(f.resolver.resolve(result.accessToken, context)).rejects.toThrow('Unauthorized');
    await expect(f.resolver.resolve(neighbor.accessToken, context)).resolves.toMatchObject({ identityId: ID });
    await expect(f.resolver.resolve(otherOwner.accessToken, context)).resolves.toMatchObject({ identityId: ID2 });
  });

  it.each(['https://APP.example', 'https://app.example:443', 'https://app.example/', 'http://app.example', ' https://app.example'])('rejects noncanonical origin before rotation: %s', async (exactOrigin) => {
    const f = fixture(WEB); const rotate = vi.spyOn(f.repo, 'rotateRefresh');
    const service = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: f.repo, accessTokens: f.tokens, clock: () => NOW });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: { ...WEB, exactOrigin } })).rejects.toThrow(FAILURE);
    expect(rotate).not.toHaveBeenCalled();
  });

  it('wrong binding does not burn a valid token and owner deletion denies refresh', async () => {
    const f = fixture(WEB);
    await expect(f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: { ...WEB, exactOrigin: 'https://other.example' } })).rejects.toThrow(FAILURE);
    await expect(f.refresher.refresh({ refreshToken: refreshToken(1), transportContext: WEB })).resolves.toMatchObject({ sessionId: SID });
    expect(f.repo.markIdentityDeleted(ID, { userId: ID })).toBe(true);
    await expect(f.refresher.refresh({ refreshToken: refreshToken(2), transportContext: WEB })).rejects.toThrow(FAILURE);
  });

  it('two concurrent service uses produce one response but reuse invalidates its access session', async () => {
    const f = fixture(); const resolver = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens: f.tokens, reader: f.repo, clock: () => NOW });
    let serial = 5;
    const service = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: f.repo, accessTokens: f.tokens, clock: () => NOW, randomBytes: () => new Uint8Array(32).fill(serial++) });
    const results = await Promise.allSettled([service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE }), service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const winner = results.find((r) => r.status === 'fulfilled'); if (winner?.status !== 'fulfilled') throw new Error('missing winner');
    await expect(resolver.resolve(winner.value.accessToken, MOBILE)).rejects.toThrow('Unauthorized');
  });
});

function ports() {
  const rotate = vi.fn(() => ({ kind: 'rotated' as const, identityId: ID, sessionId: SID, familyId: FAMILY, expiresAt: NOW + 86_400_000 }));
  const revoke = vi.fn<(expected: RotatedFamilyExpectation, context: Readonly<SessionRequestContext>) => boolean>(() => true); const issue = vi.fn(() => 'access'); const bytes = vi.fn(() => new Uint8Array(32).fill(2));
  const config: V2SessionRefresherConfig = { environment: 'development', enabled: true, repository: { rotateRefresh: rotate, revokeRotatedFamily: revoke }, accessTokens: { issue }, clock: () => NOW, randomBytes: bytes };
  return { rotate, revoke, issue, bytes, config };
}

describe('refresh service strict failures', () => {
  it.each(['', 'v1.fake', refreshToken(1) + '=', refreshToken(1).slice(0, -1), 1, null])('rejects malformed secrets before collaborators', async (secret) => {
    const p = ports(); const service = new DevelopmentV2SessionRefresher(p.config);
    await expect(service.refresh({ refreshToken: secret, transportContext: MOBILE } as never)).rejects.toThrow(FAILURE);
    expect(p.rotate).not.toHaveBeenCalled(); expect(p.bytes).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
  });

  it.each(['accessor', 'hidden', 'symbol', 'extra', 'prototype', 'context-getter'])('rejects hostile %s input without invoking getters', async (shape) => {
    const p = ports(); const service = new DevelopmentV2SessionRefresher(p.config); const getter = vi.fn(() => refreshToken(1));
    const input = { refreshToken: refreshToken(1), transportContext: MOBILE };
    if (shape === 'accessor') Object.defineProperty(input, 'refreshToken', { get: getter, enumerable: true });
    if (shape === 'hidden') Object.defineProperty(input, 'refreshToken', { value: refreshToken(1), enumerable: false });
    if (shape === 'symbol') Object.defineProperty(input, Symbol('extra'), { value: true });
    if (shape === 'extra') Object.defineProperty(input, 'identityId', { value: ID2, enumerable: true });
    if (shape === 'prototype') Object.setPrototypeOf(input, {});
    if (shape === 'context-getter') { const context = {}; Object.defineProperty(context, 'transport', { get: getter, enumerable: true }); input.transportContext = context as never; }
    await expect(service.refresh(input)).rejects.toThrow(FAILURE); expect(getter).not.toHaveBeenCalled(); expect(p.rotate).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity, 1.5])('rejects initial invalid clock %s before randomness or rotation', async (time) => {
    const p = ports(); const service = new DevelopmentV2SessionRefresher({ ...p.config, clock: () => time });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE);
    expect(p.bytes).not.toHaveBeenCalled(); expect(p.rotate).not.toHaveBeenCalled();
  });

  it.each(['short', 'plain-array', 'collision', 'throw'])('rejects invalid server randomness %s without burning the credential', async (mode) => {
    const p = ports(); const bytes = () => {
      if (mode === 'throw') throw new Error('private');
      if (mode === 'plain-array') return Array(32).fill(2) as unknown as Uint8Array;
      return new Uint8Array(mode === 'short' ? 31 : 32).fill(mode === 'collision' ? 1 : 2);
    };
    const service = new DevelopmentV2SessionRefresher({ ...p.config, randomBytes: bytes });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE); expect(p.rotate).not.toHaveBeenCalled();
  });

  it.each(['identity', 'session', 'family', 'same-family', 'expired', 'too-long', 'unknown', 'extra', 'getter', 'then-getter', 'promise-getter'])('rejects malformed %s rotation outcomes without issuing or unsafe cleanup', async (mode) => {
    const p = ports(); const getter = vi.fn(); const value: Record<string, unknown> = p.rotate();
    if (mode === 'identity') value.identityId = ID.toUpperCase();
    if (mode === 'session') value.sessionId = 'invalid';
    if (mode === 'family') value.familyId = null;
    if (mode === 'same-family') value.familyId = SID;
    if (mode === 'expired') value.expiresAt = NOW;
    if (mode === 'too-long') value.expiresAt = NOW + 86_400_001;
    if (mode === 'unknown') value.kind = 'unknown';
    if (mode === 'extra') value.secret = true;
    if (mode === 'getter') Object.defineProperty(value, 'identityId', { get: getter, enumerable: true });
    if (mode === 'then-getter') Object.defineProperty(value, 'then', { get: getter });
    let raw: unknown = value;
    if (mode === 'promise-getter') { const promise = Promise.resolve(value); Object.defineProperty(promise, 'constructor', { get: getter }); raw = promise; }
    let rotationCalls = 0;
    // A raw function avoids Vitest's Promise settlement bookkeeping invoking hostile constructor getters.
    const repository = { rotateRefresh: () => { rotationCalls += 1; return raw as never; }, revokeRotatedFamily: p.revoke };
    const service = new DevelopmentV2SessionRefresher({ ...p.config, repository });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE);
    expect(rotationCalls).toBe(1); expect(p.issue).not.toHaveBeenCalled(); expect(p.revoke).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled();
  });

  it.each(['expiry', 'rollback', 'invalid'])('rechecks native deferred outcome time and attempts exact cleanup: %s', async (mode) => {
    const p = ports(); let now = NOW; let settle!: (value: ReturnType<typeof p.rotate>) => void;
    const pending = new Promise<ReturnType<typeof p.rotate>>((resolve) => { settle = resolve; });
    const service = new DevelopmentV2SessionRefresher({ ...p.config, repository: { rotateRefresh: () => pending, revokeRotatedFamily: p.revoke }, clock: () => now });
    const result = service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE });
    now = mode === 'expiry' ? NOW + 86_400_000 : mode === 'rollback' ? NOW - 1 : NaN;
    settle(p.rotate()); await expect(result).rejects.toThrow(FAILURE);
    expect(p.issue).not.toHaveBeenCalled(); expect(p.revoke).toHaveBeenCalledExactlyOnceWith({ identityId: ID, sessionId: SID, familyId: FAMILY, refreshTokenHash: hash(refreshToken(2)) }, { userId: ID });
    expect(Object.isFrozen(p.revoke.mock.calls[0]?.[0])).toBe(true); expect(Object.isFrozen(p.revoke.mock.calls[0]?.[1])).toBe(true);
  });

  it.each(['throw', 'empty', 'oversized', 'expiry', 'rollback'])('cleans known family after signing failure: %s', async (mode) => {
    const p = ports(); let now = NOW;
    const issue = () => { if (mode === 'throw') throw new Error('private'); if (mode === 'expiry') now += 86_400_000; if (mode === 'rollback') now -= 1; return mode === 'empty' ? '' : mode === 'oversized' ? 'a'.repeat(4097) : 'access'; };
    const service = new DevelopmentV2SessionRefresher({ ...p.config, clock: () => now, accessTokens: { issue } });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE); expect(p.revoke).toHaveBeenCalledTimes(1);
  });

  it.each(['false', 'throw', 'thenable'])('never emits credentials if cleanup %s fails', async (mode) => {
    const p = ports(); const getter = vi.fn();
    const revoke = () => { if (mode === 'throw') throw new Error('private'); if (mode === 'thenable') { const value = {}; Object.defineProperty(value, 'then', { get: getter }); return value as never; } return false; };
    const service = new DevelopmentV2SessionRefresher({ ...p.config, repository: { rotateRefresh: p.rotate, revokeRotatedFamily: revoke }, accessTokens: { issue: () => { throw new Error('private'); } } });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
  });

  it('captures methods once and rejects dependency getters without invocation', async () => {
    const p = ports(); const mutableTokens: { issue: () => string } = { issue: p.issue }; const service = new DevelopmentV2SessionRefresher({ ...p.config, accessTokens: mutableTokens });
    p.config.repository.rotateRefresh = () => { throw new Error('replacement'); };
    mutableTokens.issue = () => { throw new Error('replacement'); };
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).resolves.toMatchObject({ sessionId: SID });
    const getter = vi.fn(); const repository = { revokeRotatedFamily: () => true }; Object.defineProperty(repository, 'rotateRefresh', { get: getter });
    expect(() => new DevelopmentV2SessionRefresher({ ...p.config, repository: repository as never })).toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
  });
});


describe('refresh constructor and committed fault boundaries', () => {
  it.each(['disabled', 'production', 'extra', 'symbol', 'hidden', 'getter', 'array-port', 'bad-random'])('rejects invalid %s configuration before invoking a getter', (shape) => {
    const p = ports(); const getter = vi.fn(); const input = { ...p.config } as Record<string, unknown>;
    if (shape === 'disabled') input.enabled = false;
    if (shape === 'production') input.environment = 'production';
    if (shape === 'extra') input.identityId = ID2;
    if (shape === 'symbol') Object.defineProperty(input, Symbol('extra'), { value: true });
    if (shape === 'hidden') Object.defineProperty(input, 'enabled', { value: true, enumerable: false });
    if (shape === 'getter') Object.defineProperty(input, 'clock', { get: getter, enumerable: true });
    if (shape === 'array-port') input.repository = Object.assign([], p.config.repository);
    if (shape === 'bad-random') input.randomBytes = undefined;
    expect(() => new DevelopmentV2SessionRefresher(input as never)).toThrow(FAILURE); expect(getter).not.toHaveBeenCalled();
  });

  it('postcommit issuer failure removes only the failed family and leaves preexisting neighbors usable', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const f = fullPipeline(); const original = await f.issue(); const neighbor = await f.issue();
    const revoke = vi.spyOn(f.repo, 'revokeRotatedFamily');
    const service = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: f.repo, accessTokens: { issue: () => { throw new Error('private'); } }, clock: () => NOW, randomBytes: () => new Uint8Array(32).fill(99) });
    await expect(service.refresh({ refreshToken: original.refreshToken, transportContext: MOBILE })).rejects.toThrow(FAILURE);
    expect(revoke).toHaveBeenCalledTimes(1);
    await expect(f.resolver.resolve(original.accessToken, MOBILE)).rejects.toThrow('Unauthorized');
    await expect(f.resolver.resolve(neighbor.accessToken, MOBILE)).resolves.toMatchObject({ identityId: ID });
    expect(f.repo.rotateRefresh({ refreshTokenHash: hash(original.refreshToken), successorRefreshTokenHash: 'd'.repeat(64), transportContext: MOBILE, observedAt: NOW })).toEqual({ kind: 'reused' });
  });

  it('uncertain postcommit adapter fault emits nothing and leaves only a bounded unknown orphan', async () => {
    let now = NOW;
    const repo = new InMemoryV2SessionRepository([ID], 10, () => now);
    const baseline = fixture(); expect(repo.createForActiveIdentity(baseline.record, { userId: ID })).toBe(true);
    const issue = vi.fn(() => 'access'); const revoke = vi.fn(() => true);
    const service = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: {
      rotateRefresh: (input) => { repo.rotateRefresh(input); throw new Error('private'); }, revokeRotatedFamily: revoke,
    }, accessTokens: { issue }, clock: () => now, randomBytes: () => new Uint8Array(32).fill(2) });
    await expect(service.refresh({ refreshToken: refreshToken(1), transportContext: MOBILE })).rejects.toThrow(FAILURE);
    expect(issue).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
    expect(repo.readSession(SID, { userId: ID }, now)?.refreshTokenHash).toBe(hash(refreshToken(2)));
    now += 86_400_000; expect(repo.readSession(SID, { userId: ID }, now)).toBeNull();
  });
});
