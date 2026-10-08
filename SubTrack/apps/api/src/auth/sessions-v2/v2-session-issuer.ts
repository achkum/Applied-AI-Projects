import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RequestContext } from '../../database/request-transaction';
import type { LoginProofContext, ProofStore } from '../proofs-v2/proof-store';

const FAILURE = 'Session unavailable';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROOF = /^v2\.[A-Za-z0-9_-]{43}$/;
const REFRESH = /^v2r\.[A-Za-z0-9_-]{43}$/;
const TTL = 24 * 60 * 60 * 1000;
const MAX = 10_000;
const HASH_DOMAIN = 'subtrack:auth-refresh:v2:';

export type SessionTransport = 'web' | 'mobile';
export interface SessionRecord {
  readonly identityId: string; readonly sessionId: string; readonly familyId: string; readonly generation: 0;
  readonly refreshTokenHash: string; readonly transport: SessionTransport; readonly exactOrigin?: string;
  readonly browserChainId?: string; readonly deviceName: string | null; readonly createdAt: number; readonly expiresAt: number;
}
export type SessionRequestContext = Readonly<RequestContext>;
export interface SessionRepository {
  createForActiveIdentity(record: SessionRecord, context: Readonly<SessionRequestContext>): boolean | Promise<boolean>;
  rollbackCreatedSession(record: SessionRecord, context: Readonly<SessionRequestContext>): boolean | Promise<boolean>;
  readSession(sessionId: string, context: Readonly<SessionRequestContext>, now: number): Readonly<SessionRecord> | null;
}
export interface SessionIssuerInput { readonly loginProof: string; readonly transportContext: LoginProofContext; readonly deviceName?: string }
export interface SessionIssuerConfig {
  readonly environment: 'development'; readonly enabled: true; readonly proofStore: Pick<ProofStore, 'consumeLogin'>;
  readonly accessTokens: { issue(identityId: string, sessionId: string): string };
  readonly repository: SessionRepository; readonly clock: () => number;
  readonly randomUUID?: () => string; readonly randomBytes?: (size: number) => Uint8Array;
}
export interface SessionResponse { readonly sessionId: string; readonly accessToken: string; readonly refreshToken: string }

function snapshot(value: unknown, expected: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(FAILURE);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || (!expected.includes(key) && !optional.includes(key))) || expected.some((key) => !keys.includes(key))) throw new Error(FAILURE);
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) throw new Error(FAILURE);
    result[key] = d.value;
  }
  return result;
}
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function validClock(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= Number.MAX_SAFE_INTEGER - TTL; }
function webOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.hostname.includes('*'); } catch { return false; }
}
function copyRecord(input: unknown): Readonly<SessionRecord> {
  const keys = ['identityId','sessionId','familyId','generation','refreshTokenHash','transport','deviceName','createdAt','expiresAt'];
  const v = snapshot(input, keys, ['exactOrigin','browserChainId']);
  if (!isUuid(v.identityId) || !isUuid(v.sessionId) || !isUuid(v.familyId) || v.sessionId === v.familyId || v.generation !== 0 ||
    typeof v.refreshTokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.refreshTokenHash) || !validClock(v.createdAt) || !Number.isSafeInteger(v.expiresAt) || v.expiresAt !== (v.createdAt as number) + TTL ||
    !(v.transport === 'web' || v.transport === 'mobile') || !(v.deviceName === null || (typeof v.deviceName === 'string' && [...v.deviceName].length <= 100))) throw new Error(FAILURE);
  if (v.transport === 'web') { if (!webOrigin(v.exactOrigin) || typeof v.browserChainId !== 'string' || !v.browserChainId || v.deviceName !== null) throw new Error(FAILURE); }
  else if (Object.hasOwn(v, 'exactOrigin') || Object.hasOwn(v, 'browserChainId')) throw new Error(FAILURE);
  return Object.freeze({ ...v }) as unknown as Readonly<SessionRecord>;
}
function contextCopy(value: unknown): Readonly<SessionRequestContext> {
  const v = snapshot(value, ['userId']);
  if (!isUuid(v.userId)) throw new Error(FAILURE);
  return Object.freeze({ userId: v.userId as string });
}
function snapshotTransport(value: unknown): Record<string, unknown> {
  const copy = snapshot(value, ['transport'], ['exactOrigin', 'browserChainId']);
  if (copy.transport === 'mobile' && Object.keys(copy).length === 1) return copy;
  if (copy.transport === 'web' && Object.keys(copy).length === 3 && webOrigin(copy.exactOrigin) && typeof copy.browserChainId === 'string' && copy.browserChainId.length > 0) return copy;
  throw new Error(FAILURE);
}

/** Development/test reference only; not wired into HTTP or a runtime module. */
export class InMemoryV2SessionRepository implements SessionRepository {
  private readonly active: Set<string>;
  private readonly records = new Map<string, Readonly<SessionRecord>>();
  private readonly maxSessions: number;
  private readonly clock: () => number;
  constructor(activeIdentityIds: readonly string[], maxSessions = MAX, clock: () => number = Date.now) {
    if (!Array.isArray(activeIdentityIds) || Object.getPrototypeOf(activeIdentityIds) !== Array.prototype || activeIdentityIds.length > MAX || typeof clock !== 'function' || !Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > MAX) throw new Error(FAILURE);
    this.active = new Set(); this.maxSessions = maxSessions; this.clock = clock;
    if (Reflect.ownKeys(activeIdentityIds).length !== activeIdentityIds.length + 1) throw new Error(FAILURE);
    for (let index = 0; index < activeIdentityIds.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(activeIdentityIds, String(index));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable || !isUuid(descriptor.value) || this.active.has(descriptor.value)) throw new Error(FAILURE);
      this.active.add(descriptor.value);
    }
  }
  private prune(now: number): void { for (const [id, r] of this.records) if (now >= r.expiresAt) this.records.delete(id); }
  createForActiveIdentity(input: SessionRecord, contextInput: Readonly<SessionRequestContext>): boolean {
    try {
      const r = copyRecord(input); const c = contextCopy(contextInput); const now = this.clock();
      if (!validClock(now) || c.userId !== r.identityId || !this.active.has(r.identityId) || r.createdAt > now || now >= r.expiresAt) return false;
      this.prune(now);
      if (this.records.size >= this.maxSessions) return false;
      for (const old of this.records.values()) if (old.sessionId === r.sessionId || old.familyId === r.familyId || old.refreshTokenHash === r.refreshTokenHash) return false;
      this.records.set(r.sessionId, r); return true;
    } catch { return false; }
  }
  rollbackCreatedSession(expected: SessionRecord, contextInput: Readonly<SessionRequestContext>): boolean {
    try {
      const r = copyRecord(expected); const c = contextCopy(contextInput); const existing = this.records.get(r.sessionId);
      if (!existing || c.userId !== r.identityId || existing.identityId !== r.identityId || existing.familyId !== r.familyId || existing.refreshTokenHash !== r.refreshTokenHash) return false;
      this.records.delete(r.sessionId); return true;
    } catch { return false; }
  }
  readSession(sessionId: string, contextInput: Readonly<SessionRequestContext>, now: number): Readonly<SessionRecord> | null {
    try { const c = contextCopy(contextInput); if (!isUuid(sessionId) || !Number.isSafeInteger(now) || now < 0) return null;
      const current = this.clock(); if (!validClock(current) || now > current) return null;
      this.prune(current); const r = this.records.get(sessionId); return r && r.identityId === c.userId && this.active.has(c.userId) && now >= r.createdAt && current >= r.createdAt && current < r.expiresAt ? Object.freeze({ ...r }) : null;
    } catch { return null; }
  }
  markIdentityDeleted(identityId: string, contextInput: Readonly<SessionRequestContext>): boolean {
    try { const c = contextCopy(contextInput); if (!isUuid(identityId) || c.userId !== identityId || !this.active.delete(identityId)) return false;
      for (const [id, r] of this.records) if (r.identityId === identityId) this.records.delete(id); return true;
    } catch { return false; }
  }
}

export class DevelopmentV2SessionIssuer {
  private readonly proofStore: Pick<ProofStore, 'consumeLogin'>; private readonly accessTokens: SessionIssuerConfig['accessTokens'];
  private readonly repository: SessionRepository; private readonly clock: () => number;
  private readonly uuid: () => string; private readonly bytes: (size: number) => Uint8Array;
  constructor(input: SessionIssuerConfig) {
    try {
      const v = snapshot(input, ['environment','enabled','proofStore','accessTokens','repository','clock'], ['randomUUID','randomBytes']);
      const proofStore = v.proofStore as Pick<ProofStore, 'consumeLogin'> | undefined;
      const accessTokens = v.accessTokens as SessionIssuerConfig['accessTokens'] | undefined;
      const repository = v.repository as SessionRepository | undefined;
      if (v.environment !== 'development' || v.enabled !== true || !proofStore || typeof proofStore.consumeLogin !== 'function' ||
        !accessTokens || typeof accessTokens.issue !== 'function' || !repository ||
        typeof repository.createForActiveIdentity !== 'function' || typeof repository.rollbackCreatedSession !== 'function' || typeof repository.readSession !== 'function' || typeof v.clock !== 'function' ||
        (Object.hasOwn(v, 'randomUUID') && typeof v.randomUUID !== 'function') || (Object.hasOwn(v, 'randomBytes') && typeof v.randomBytes !== 'function')) throw new Error(FAILURE);
      this.proofStore = Object.freeze({ consumeLogin: proofStore.consumeLogin.bind(proofStore) });
      this.accessTokens = Object.freeze({ issue: accessTokens.issue.bind(accessTokens) });
      this.repository = Object.freeze({ createForActiveIdentity: repository.createForActiveIdentity.bind(repository), rollbackCreatedSession: repository.rollbackCreatedSession.bind(repository), readSession: repository.readSession.bind(repository) });
      this.clock = v.clock as () => number;
      this.uuid = (v.randomUUID as (() => string) | undefined) ?? randomUUID; this.bytes = (v.randomBytes as ((n: number) => Uint8Array) | undefined) ?? randomBytes;
    } catch { throw new Error(FAILURE); }
  }
  async issueFromLoginProof(input: SessionIssuerInput): Promise<Readonly<SessionResponse>> {
    let record: Readonly<SessionRecord> | undefined; let context: Readonly<SessionRequestContext> | undefined; let insertionAttempted = false;
    try {
      const v = snapshot(input, ['loginProof','transportContext'], ['deviceName']);
      if (typeof v.loginProof !== 'string' || !PROOF.test(v.loginProof)) throw new Error(FAILURE);
      const tc = snapshotTransport(v.transportContext);
      if (tc.transport === 'web') { if (!webOrigin(tc.exactOrigin) || typeof tc.browserChainId !== 'string' || !tc.browserChainId || Object.hasOwn(v, 'deviceName')) throw new Error(FAILURE); }
      else if (tc.transport === 'mobile') { if (Object.hasOwn(v, 'deviceName') && (typeof v.deviceName !== 'string' || [...v.deviceName].length > 100)) throw new Error(FAILURE); }
      else throw new Error(FAILURE);
      if (Object.hasOwn(v, 'deviceName') && tc.transport !== 'mobile') throw new Error(FAILURE);
      const proofContext = Object.freeze({ ...tc }) as unknown as LoginProofContext;
      const before = this.clock(); if (!validClock(before)) throw new Error(FAILURE);
      const consumed = snapshot(await this.proofStore.consumeLogin(v.loginProof, proofContext), ['valid', 'identityId']);
      if (!consumed || consumed.valid !== true || typeof consumed.identityId !== 'string' || !UUID.test(consumed.identityId)) throw new Error(FAILURE);
      const now = this.clock(); if (!validClock(now)) throw new Error(FAILURE);
      context = Object.freeze({ userId: consumed.identityId });
      const sessionId = this.uuid(); const familyId = this.uuid();
      if (!isUuid(sessionId) || !isUuid(familyId) || sessionId === familyId) throw new Error(FAILURE);
      const bytes = this.bytes(32); if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) throw new Error(FAILURE);
      const refreshToken = `v2r.${Buffer.from(bytes).toString('base64url')}`; if (!REFRESH.test(refreshToken)) throw new Error(FAILURE);
      const refreshTokenHash = createHash('sha256').update(HASH_DOMAIN, 'utf8').update(refreshToken, 'utf8').digest('hex');
      const data: SessionRecord = Object.freeze({ identityId: consumed.identityId, sessionId, familyId, generation: 0, refreshTokenHash,
        transport: tc.transport as SessionTransport, ...(tc.transport === 'web' ? { exactOrigin: tc.exactOrigin as string, browserChainId: tc.browserChainId as string } : {}),
        deviceName: tc.transport === 'mobile' ? (v.deviceName as string | undefined ?? null) : null, createdAt: now, expiresAt: now + TTL });
      record = copyRecord(data); insertionAttempted = true;
      const stored = await this.repository.createForActiveIdentity(record, context);
      if (stored !== true) throw new Error(FAILURE);
      const accessToken = this.accessTokens.issue(consumed.identityId, sessionId);
      if (typeof accessToken !== 'string' || accessToken.length < 1 || accessToken.length > 4096) throw new Error(FAILURE);
      return Object.freeze({ sessionId, accessToken, refreshToken });
    } catch {
      if (record && context && insertionAttempted) { try { await this.repository.rollbackCreatedSession(record, context); } catch { /* generic failure */ } }
      throw new Error(FAILURE);
    }
  }
}
