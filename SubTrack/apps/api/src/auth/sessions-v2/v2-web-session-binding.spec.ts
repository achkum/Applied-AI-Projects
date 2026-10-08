import { createHash, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { BrowserNonceGuard, InMemoryBrowserNonceStore } from '../browser-nonce/browser-nonce';
import { DevelopmentSimulatorLoginProofProducer } from '../proofs-v2/bankid-simulator-proof-producer';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository, type SessionRecord } from './v2-session-issuer';
import { DevelopmentV2SessionRefresher } from './v2-session-refresher';
import { V2AccessToken } from './v2-access-token';
import { hashBrowserBindingCookie, isBrowserBindingCookieHash } from './v2-web-session-binding';

const NOW = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const WEB = Object.freeze({ transport: 'web' as const, exactOrigin: 'https://app.example', browserChainId: 'chain-a' });
const COOKIE = Buffer.alloc(32, 7).toString('base64url');
const cookieHash = hashBrowserBindingCookie(COOKIE);
const refreshHash = (token: string): string => createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(token, 'utf8').digest('hex');
const originalVerify = BankIdSimulator.prototype.verify;
afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('internal web session cookie binding', () => {
  it('recovers the stored owner and chain after real proof issuance and refresh rotation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({ method: 'BANKID', name: 'Fictional Fixture', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW).toISOString() });
    const nonceStore = new InMemoryBrowserNonceStore();
    const nonce = new BrowserNonceGuard({ allowedOrigins: [WEB.exactOrigin], clock: () => NOW }, nonceStore);
    const evidence = { origin: WEB.exactOrigin, isHttps: true, explicitLoopbackDevelopment: false };
    const bootstrap = nonce.issue('session', evidence);
    const trusted = nonce.validateBound('session', evidence, bootstrap.nonce, bootstrap.cookieSecret);
    const sessionWeb = Object.freeze({ transport: 'web' as const, exactOrigin: trusted.origin, browserChainId: trusted.chainId });
    const cookieHash = hashBrowserBindingCookie(bootstrap.cookieSecret);
    const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
    const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true,
      simulatorHmacKey: new Uint8Array(32).fill(9), identityResolver: { resolveRegisteredIdentityId: () => ID }, proofStore, clock: () => NOW });
    const keys = generateKeyPairSync('ed25519');
    const accessTokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: keys.privateKey, publicKey: keys.publicKey, clock: () => NOW });
    const repo = new InMemoryV2SessionRepository([ID, OTHER], 100, () => NOW);
    let uuid = 10;
    const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, accessTokens,
      repository: repo, clock: () => NOW, randomUUID: () => `123e4567-e89b-42d3-a456-4266141740${String(uuid++).padStart(2, '0')}`,
      randomBytes: () => new Uint8Array(32).fill(uuid) });
    const proof = await producer.issue(sessionWeb);
    expect(nonce.consumeForSession(evidence, bootstrap.nonce, bootstrap.cookieSecret)).toEqual(trusted);
    expect(nonceStore.snapshot()).toEqual([]);
    const issued = await issuer.issueFromLoginProof({ loginProof: proof, transportContext: sessionWeb, browserBindingCookieHash: cookieHash });
    const row = repo.readSession(issued.sessionId, { userId: ID }, NOW);
    expect(row?.browserBindingCookieHash).toBe(cookieHash);
    expect(JSON.stringify(row)).not.toContain(bootstrap.cookieSecret);

    const ownedContext = repo.webContextForCurrentSession(issued.sessionId, { userId: ID }, cookieHash, sessionWeb.exactOrigin, NOW);
    expect(ownedContext).toEqual(sessionWeb);
    expect(Object.isFrozen(ownedContext)).toBe(true);
    expect(repo.webContextForCurrentSession(issued.sessionId, { userId: OTHER }, cookieHash, sessionWeb.exactOrigin, NOW)).toBeNull();
    expect(repo.webContextForCurrentSession(issued.sessionId, { userId: ID }, 'f'.repeat(64), sessionWeb.exactOrigin, NOW)).toBeNull();
    expect(repo.webContextForCurrentSession(issued.sessionId, { userId: ID }, cookieHash, 'https://evil.example', NOW)).toBeNull();

    const principal = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens, reader: repo, clock: () => NOW });
    await expect(principal.resolve(issued.accessToken, sessionWeb)).resolves.toEqual({ identityId: ID, sessionId: issued.sessionId });
    const refresher = new DevelopmentV2SessionRefresher({ environment: 'development', enabled: true, repository: repo, accessTokens,
      clock: () => NOW, randomBytes: () => new Uint8Array(32).fill(8) });
    const oldHash = refreshHash(issued.refreshToken);
    const beforeRotation = repo.webContextForRefresh(oldHash, cookieHash, sessionWeb.exactOrigin, NOW);
    expect(beforeRotation?.identityId).toBe(ID);
    expect(beforeRotation?.sessionId).toBe(issued.sessionId);
    expect(Object.isFrozen(beforeRotation?.transportContext)).toBe(true);

    const rotated = await refresher.refresh({ refreshToken: issued.refreshToken, transportContext: sessionWeb });
    expect(repo.readSession(issued.sessionId, { userId: ID }, NOW)?.browserBindingCookieHash).toBe(cookieHash);
    const consumedContext = repo.webContextForRefresh(oldHash, cookieHash, sessionWeb.exactOrigin, NOW);
    expect(consumedContext).toEqual(beforeRotation);
    expect(repo.webContextForRefresh(oldHash, 'e'.repeat(64), sessionWeb.exactOrigin, NOW)).toBeNull();
    expect(repo.webContextForRefresh(oldHash, cookieHash, 'https://evil.example', NOW)).toBeNull();
    expect(repo.webContextForRefresh(oldHash, cookieHash, sessionWeb.exactOrigin, NOW + 1)).toBeNull();
    expect(repo.webContextForRefresh(refreshHash(rotated.refreshToken), cookieHash, sessionWeb.exactOrigin, NOW)?.sessionId).toBe(issued.sessionId);

    // The consumed credential is a CSRF-scope lookup only. Reuse still flows through the real atomic refresher.
    await expect(refresher.refresh({ refreshToken: issued.refreshToken, transportContext: sessionWeb })).rejects.toThrow('Session unavailable');
    // Retained consumed history remains usable only to scope repeated reuse handling; active-session reads are revoked.
    expect(repo.webContextForRefresh(oldHash, cookieHash, sessionWeb.exactOrigin, NOW)?.sessionId).toBe(issued.sessionId);
    expect(repo.readSession(issued.sessionId, { userId: ID }, NOW)).toBeNull();
    expect(repo.webContextForCurrentSession(issued.sessionId, { userId: ID }, cookieHash, sessionWeb.exactOrigin, NOW)).toBeNull();
    await expect(principal.resolve(rotated.accessToken, sessionWeb)).rejects.toThrow('Unauthorized');
  });

  it('requires canonical 32-byte base64url cookies and rejects server-only hash misuse', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    expect(hashBrowserBindingCookie(COOKIE)).toMatch(/^[a-f0-9]{64}$/);
    for (const bad of ['', 'x'.repeat(43), `${COOKIE.slice(0, -1)}B`]) expect(() => hashBrowserBindingCookie(bad)).toThrow();
    const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
    const repo = new InMemoryV2SessionRepository([ID], 10, () => NOW);
    const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore,
      accessTokens: { issue: () => 'unused' }, repository: repo, clock: () => NOW });
    await expect(issuer.issueFromLoginProof({ loginProof: `v2.${'a'.repeat(43)}`, transportContext: { transport: 'mobile' }, browserBindingCookieHash: cookieHash } as never)).rejects.toThrow('Session unavailable');
    expect(repo.webContextForRefresh('a'.repeat(64), cookieHash, WEB.exactOrigin, NOW)).toBeNull();
  });
});


const SID = '123e4567-e89b-42d3-a456-426614174010';
const FAMILY = '123e4567-e89b-42d3-a456-426614174011';
const H = 'a'.repeat(64);
function rowFixture(changes: Partial<SessionRecord> = {}, initial = NOW) {
  let now = initial;
  const repo = new InMemoryV2SessionRepository([ID, OTHER], 100, () => now);
  const row: SessionRecord = { identityId: ID, sessionId: SID, familyId: FAMILY, generation: 0, refreshTokenHash: H,
    transport: 'web', exactOrigin: WEB.exactOrigin, browserChainId: WEB.browserChainId, browserBindingCookieHash: cookieHash,
    deviceName: null, createdAt: initial, expiresAt: initial + 86_400_000, ...changes };
  expect(repo.createForActiveIdentity(row, { userId: row.identityId })).toBe(true);
  return { repo, row, step: (value: number) => { now = value; } };
}

describe('cookie binding lookup boundaries', () => {
  it.each(['', 'a'.repeat(42), 'a'.repeat(44), 'x'.repeat(43), COOKIE + '=', COOKIE + ' ', null, {}, 1])('rejects noncanonical cookie input %j', (value) => {
    expect(() => hashBrowserBindingCookie(value as never)).toThrow('Invalid browser binding cookie');
  });
  it('uses the specified domain and canonical decoded cookie bytes without retaining raw material', () => {
    expect(hashBrowserBindingCookie(COOKIE)).toBe(createHash('sha256').update('subtrack:auth-session:v2:browser-binding:', 'utf8').update(Buffer.from(COOKIE, 'base64url')).digest('hex'));
    expect(isBrowserBindingCookieHash(cookieHash)).toBe(true);
    for (const value of [cookieHash.toUpperCase(), 'a'.repeat(63), null, undefined, {}]) expect(isBrowserBindingCookieHash(value)).toBe(false);
  });
  it('returns independent frozen minimal objects without changing stored state', () => {
    const f = rowFixture();
    const current = f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, WEB.exactOrigin, NOW);
    const refresh = f.repo.webContextForRefresh(H, cookieHash, WEB.exactOrigin, NOW);
    expect(current).toEqual(WEB);
    expect(refresh).toEqual({ identityId: ID, sessionId: SID, transportContext: WEB });
    expect(Object.isFrozen(current)).toBe(true); expect(Object.isFrozen(refresh)).toBe(true); expect(Object.isFrozen(refresh?.transportContext)).toBe(true);
    expect(Reflect.set(current!, 'browserChainId', 'mutated')).toBe(false);
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, WEB.exactOrigin, NOW)).not.toBe(current);
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER, 8_640_000_000_000_001, NOW - 1, NOW + 1])('rejects observed clock %s without pruning', (time) => {
    const f = rowFixture();
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, WEB.exactOrigin, time)).toBeNull();
    expect(f.repo.webContextForRefresh(H, cookieHash, WEB.exactOrigin, time)).toBeNull();
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER, 8_640_000_000_000_001, NOW - 1])('rejects unsafe or backward trusted clock %s without mutation', (time) => {
    const f = rowFixture(); f.step(time);
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, WEB.exactOrigin, NOW)).toBeNull();
    expect(f.repo.webContextForRefresh(H, cookieHash, WEB.exactOrigin, NOW)).toBeNull();
    f.step(NOW); expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it('rejects exact expiry without deleting rows or allowing consumed history past original expiry', () => {
    const f = rowFixture();
    expect(f.repo.rotateRefresh({ refreshTokenHash: H, successorRefreshTokenHash: 'b'.repeat(64), transportContext: WEB, observedAt: NOW }).kind).toBe('rotated');
    f.step(f.row.expiresAt);
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, WEB.exactOrigin, f.row.expiresAt)).toBeNull();
    expect(f.repo.webContextForRefresh(H, cookieHash, WEB.exactOrigin, f.row.expiresAt)).toBeNull();
    expect(f.repo.webContextForRefresh('b'.repeat(64), cookieHash, WEB.exactOrigin, f.row.expiresAt)).toBeNull();
    f.step(NOW); expect(f.repo.webContextForRefresh(H, cookieHash, WEB.exactOrigin, NOW)?.sessionId).toBe(SID);
    expect(f.repo.readSession(SID, { userId: ID }, NOW)?.refreshTokenHash).toBe('b'.repeat(64));
  });
  it('rejects stored expiry outside the representable Date range without pruning', () => {
    const at = 8_640_000_000_000_000 - 1_000, f = rowFixture({}, at);
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, WEB.exactOrigin, at)).toBeNull();
    expect(f.repo.webContextForRefresh(H, cookieHash, WEB.exactOrigin, at)).toBeNull();
    expect(f.repo.readSession(SID, { userId: ID }, at)).toEqual(f.row);
  });
  it.each([undefined, null, '', 'a'.repeat(63), cookieHash.toUpperCase(), 'f'.repeat(64), {}, 1])('rejects wrong or malformed cookie hash %j without mutation', (hash) => {
    const f = rowFixture();
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, hash as never, WEB.exactOrigin, NOW)).toBeNull();
    expect(f.repo.webContextForRefresh(H, hash as never, WEB.exactOrigin, NOW)).toBeNull();
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it.each(['https://evil.example', 'https://app.example/', 'https://APP.example', 'https://app.example:443', 'http://app.example', null])('rejects mismatched Origin %j without mutation', (origin) => {
    const f = rowFixture();
    expect(f.repo.webContextForCurrentSession(SID, { userId: ID }, cookieHash, origin as never, NOW)).toBeNull();
    expect(f.repo.webContextForRefresh(H, cookieHash, origin as never, NOW)).toBeNull();
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it.each(['unknown', OTHER, null])('does not reveal current-session context for missing sid %j', (sid) => {
    const f = rowFixture(); expect(f.repo.webContextForCurrentSession(sid as never, { userId: ID }, cookieHash, WEB.exactOrigin, NOW)).toBeNull();
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it.each(['b'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), null, {}])('does not reveal refresh scope for unknown or malformed hash %j', (hash) => {
    const f = rowFixture(); expect(f.repo.webContextForRefresh(hash as never, cookieHash, WEB.exactOrigin, NOW)).toBeNull();
    expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it('rejects foreign/malformed ownership including getters without reading them', () => {
    const f = rowFixture(), getter = vi.fn();
    const accessor = {}; Object.defineProperty(accessor, 'userId', { enumerable: true, get: getter });
    const hidden = {}; Object.defineProperty(hidden, 'userId', { value: ID });
    const inherited = Object.create({ userId: ID }) as object;
    for (const ctx of [{ userId: OTHER }, { userId: ID, identityId: ID }, { userId: ID, [Symbol('extra')]: ID }, accessor, hidden, inherited, null]) {
      expect(f.repo.webContextForCurrentSession(SID, ctx as never, cookieHash, WEB.exactOrigin, NOW)).toBeNull();
    }
    expect(getter).not.toHaveBeenCalled(); expect(f.repo.readSession(SID, { userId: ID }, NOW)).toEqual(f.row);
  });
  it('keeps legacy web and mobile references working while denying new cookie lookup', () => {
    for (const transport of ['web', 'mobile'] as const) {
      const repo = new InMemoryV2SessionRepository([ID], 100, () => NOW);
      const row: SessionRecord = { identityId: ID,sessionId: SID,familyId: FAMILY,generation:0,refreshTokenHash:H,transport,deviceName:null,createdAt:NOW,expiresAt:NOW+86_400_000,
        ...(transport === 'web' ? { exactOrigin:WEB.exactOrigin,browserChainId:WEB.browserChainId } : {}) };
      expect(repo.createForActiveIdentity(row,{ userId:ID })).toBe(true); expect(repo.readSession(SID,{ userId:ID },NOW)).toEqual(row);
      expect(repo.webContextForCurrentSession(SID,{ userId:ID },cookieHash,WEB.exactOrigin,NOW)).toBeNull(); expect(repo.webContextForRefresh(H,cookieHash,WEB.exactOrigin,NOW)).toBeNull();
      expect(repo.rotateRefresh({ refreshTokenHash:H,successorRefreshTokenHash:'b'.repeat(64),transportContext:transport==='web'?WEB:{transport:'mobile'},observedAt:NOW }).kind).toBe('rotated');
      expect(repo.webContextForRefresh(H,cookieHash,WEB.exactOrigin,NOW)).toBeNull();
    }
  });
  it('retains revoked credential scope without authorizing a principal, and deletes only the owner binding history', () => {
    const f = rowFixture();
    const own = { ...f.row,sessionId:'123e4567-e89b-42d3-a456-426614174020',familyId:'123e4567-e89b-42d3-a456-426614174021',refreshTokenHash:'b'.repeat(64) };
    const foreign = { ...f.row,identityId:OTHER,sessionId:'123e4567-e89b-42d3-a456-426614174030',familyId:'123e4567-e89b-42d3-a456-426614174031',refreshTokenHash:'c'.repeat(64),browserBindingCookieHash:'d'.repeat(64) };
    expect(f.repo.createForActiveIdentity(own,{ userId:ID })).toBe(true);expect(f.repo.createForActiveIdentity(foreign,{ userId:OTHER })).toBe(true);
    expect(f.repo.revokeForCurrentSession(own.sessionId,SID,{ userId:ID },NOW).kind).toBe('revoked');
    expect(f.repo.webContextForCurrentSession(SID,{ userId:ID },cookieHash,WEB.exactOrigin,NOW)).toBeNull();
    expect(f.repo.webContextForRefresh(H,cookieHash,WEB.exactOrigin,NOW)?.sessionId).toBe(SID);
    expect(f.repo.webContextForCurrentSession(own.sessionId,{ userId:ID },cookieHash,WEB.exactOrigin,NOW)).toEqual(WEB);
    expect(f.repo.markIdentityDeleted(ID,{ userId:ID })).toBe(true);
    expect(f.repo.webContextForRefresh(H,cookieHash,WEB.exactOrigin,NOW)).toBeNull();expect(f.repo.webContextForRefresh('b'.repeat(64),cookieHash,WEB.exactOrigin,NOW)).toBeNull();
    expect(f.repo.webContextForCurrentSession(foreign.sessionId,{ userId:OTHER },'d'.repeat(64),WEB.exactOrigin,NOW)).toEqual(WEB);
    expect(f.repo.readSession(foreign.sessionId,{ userId:OTHER },NOW)).toEqual(foreign);
  });
  it.each([undefined,null,'','a'.repeat(63),'A'.repeat(64),{},1])('rejects invalid server hash %j before consuming a real web proof', async (hash) => {
    const proofStore = new ProofStore(new InMemoryProofRepository(),()=>NOW), f = rowFixture();
    const proof = await proofStore.issue({purpose:'login',challenge:'server-challenge',identityId:ID,...WEB});
    const consume = vi.spyOn(proofStore,'consumeLogin');
    const issuer = new DevelopmentV2SessionIssuer({environment:'development',enabled:true,proofStore,repository:f.repo,accessTokens:{issue:()=> 'unused'},clock:()=>NOW});
    await expect(issuer.issueFromLoginProof({loginProof:proof,transportContext:WEB,browserBindingCookieHash:hash as never})).rejects.toThrow('Session unavailable');expect(consume).not.toHaveBeenCalled();
    expect(await proofStore.consumeLogin(proof,WEB)).toEqual({valid:true,identityId:ID});
  });
  it('forbids mobile binding metadata before consuming its proof or accepting its record', async () => {
    const proofStore = new ProofStore(new InMemoryProofRepository(),()=>NOW), f = rowFixture();
    const proof = await proofStore.issue({purpose:'login',challenge:'server-challenge',identityId:ID,transport:'mobile'});
    const issuer = new DevelopmentV2SessionIssuer({environment:'development',enabled:true,proofStore,repository:f.repo,accessTokens:{issue:()=> 'unused'},clock:()=>NOW});
    await expect(issuer.issueFromLoginProof({loginProof:proof,transportContext:{transport:'mobile'},browserBindingCookieHash:cookieHash})).rejects.toThrow('Session unavailable');
    expect(await proofStore.consumeLogin(proof,{transport:'mobile'})).toEqual({valid:true,identityId:ID});
    const bad = { ...f.row,transport:'mobile' as const }; delete bad.exactOrigin;delete bad.browserChainId;
    expect(f.repo.createForActiveIdentity(bad,{ userId:ID })).toBe(false);
  });
});


describe('principal record metadata boundary', () => {
  it.each([undefined,null,'','a'.repeat(63),'A'.repeat(64),{},1])('denies present malformed stored binding %j with valid credentials', async (hash) => {
    const f = rowFixture(), keys = generateKeyPairSync('ed25519');
    const tokens = new V2AccessToken({environment:'development',enabled:true,privateKey:keys.privateKey,publicKey:keys.publicKey,clock:()=>NOW});
    const token = tokens.issue(ID,SID);
    const resolver = new DevelopmentV2PrincipalResolver({environment:'development',enabled:true,accessTokens:tokens,reader:{readSession:()=>({...f.row,browserBindingCookieHash:hash as never})},clock:()=>NOW});
    await expect(resolver.resolve(token,WEB)).rejects.toThrow('Unauthorized');
  });
  it('rejects a binding accessor without invoking it and rejects binding metadata on mobile', async () => {
    const f = rowFixture(), keys = generateKeyPairSync('ed25519'), getter = vi.fn();
    const tokens = new V2AccessToken({environment:'development',enabled:true,privateKey:keys.privateKey,publicKey:keys.publicKey,clock:()=>NOW});
    const token = tokens.issue(ID,SID), accessor = {...f.row}; Object.defineProperty(accessor,'browserBindingCookieHash',{enumerable:true,get:getter});
    const resolver = new DevelopmentV2PrincipalResolver({environment:'development',enabled:true,accessTokens:tokens,reader:{readSession:()=>accessor},clock:()=>NOW});
    await expect(resolver.resolve(token,WEB)).rejects.toThrow('Unauthorized');expect(getter).not.toHaveBeenCalled();
    const mobile = { ...f.row, transport:'mobile' as const };delete mobile.exactOrigin;delete mobile.browserChainId;
    const mobileResolver = new DevelopmentV2PrincipalResolver({environment:'development',enabled:true,accessTokens:tokens,reader:{readSession:()=>mobile},clock:()=>NOW});
    await expect(mobileResolver.resolve(token,{transport:'mobile'})).rejects.toThrow('Unauthorized');
  });
});
