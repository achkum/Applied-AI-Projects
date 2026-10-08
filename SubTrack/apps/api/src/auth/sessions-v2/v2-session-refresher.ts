import { createHash, randomBytes } from 'node:crypto';
import { types } from 'node:util';
import type { RequestContext } from '../../database/request-transaction';
import type { RefreshRotationInput, RefreshRotationResult, RotatedFamilyExpectation, SessionRequestContext } from './v2-session-issuer';

const FAILURE = 'Session unavailable';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^v2r\.[A-Za-z0-9_-]{43}$/;
const TTL = 86_400_000;
const HASH_DOMAIN = 'subtrack:auth-refresh:v2:';
const isClock = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const fail = (): Error => new Error(FAILURE);

export interface V2RefreshRepository {
  rotateRefresh(input: RefreshRotationInput): RefreshRotationResult | Promise<RefreshRotationResult>;
  revokeRotatedFamily(expected: RotatedFamilyExpectation, context: Readonly<SessionRequestContext>): boolean | Promise<boolean>;
}
export interface V2SessionRefresherConfig {
  readonly environment: 'development'; readonly enabled: true; readonly repository: V2RefreshRepository;
  readonly accessTokens: Readonly<{ issue(identityId: string, sessionId: string): string }>;
  readonly clock: () => number; readonly randomBytes?: (size: number) => Uint8Array;
}
export interface V2SessionRefreshInput { readonly refreshToken: string; readonly transportContext: unknown }
export interface V2SessionRefreshResponse { readonly sessionId: string; readonly accessToken: string; readonly refreshToken: string }

type Data = Record<string, unknown>;
function plainData(input: unknown, keys: readonly string[]): Data {
  if (typeof input !== 'object' || input === null || Object.getPrototypeOf(input) !== Object.prototype) throw fail();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length || keys.some((key) => !actual.includes(key))) throw fail();
  const values: Data = Object.create(null) as Data;
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable) throw fail();
    values[key] = d.value;
  }
  return values;
}
function method(target: object, name: string): (...args: unknown[]) => unknown {
  let current: object | null = target;
  while (current !== null) {
    const d = Object.getOwnPropertyDescriptor(current, name);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function') throw fail();
      return d.value.bind(target) as (...args: unknown[]) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw fail();
}
function hash(token: string): string { return createHash('sha256').update(HASH_DOMAIN, 'utf8').update(token, 'utf8').digest('hex'); }
function token(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) throw fail();
  const copy = Buffer.from(bytes);
  const encoded = `v2r.${copy.toString('base64url')}`;
  if (!TOKEN.test(encoded)) throw fail();
  return encoded;
}
function canonicalToken(value: unknown): value is string {
  if (typeof value !== 'string' || !TOKEN.test(value)) return false;
  const raw = Buffer.from(value.slice(4), 'base64url');
  return raw.byteLength === 32 && raw.toString('base64url') === value.slice(4);
}
function transport(input: unknown): Readonly<Record<string, string>> {
  if (typeof input !== 'object' || input === null || Object.getPrototypeOf(input) !== Object.prototype) throw fail();
  const kind = Object.getOwnPropertyDescriptor(input, 'transport');
  if (!kind || !('value' in kind) || !kind.enumerable) throw fail();
  if (kind.value === 'mobile') {
    plainData(input, ['transport']);
    return Object.freeze({ transport: 'mobile' });
  }
  if (kind.value === 'web') {
    const v = plainData(input, ['transport', 'exactOrigin', 'browserChainId']);
    if (typeof v.exactOrigin !== 'string' || v.exactOrigin.length === 0 || v.exactOrigin.trim() !== v.exactOrigin || typeof v.browserChainId !== 'string' || v.browserChainId.length === 0) throw fail();
    try { const url = new URL(v.exactOrigin); if (url.protocol !== 'https:' || url.origin !== v.exactOrigin || url.hostname.includes('*')) throw fail(); } catch { throw fail(); }
    return Object.freeze({ transport: 'web', exactOrigin: v.exactOrigin, browserChainId: v.browserChainId });
  }
  throw fail();
}
function outcome(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) throw fail();
  const kind = Object.getOwnPropertyDescriptor(value, 'kind');
  if (!kind || !('value' in kind) || !kind.enumerable) throw fail();
  if (kind.value === 'invalid' || kind.value === 'reused') return plainData(value, ['kind']);
  const v = plainData(value, ['kind', 'identityId', 'sessionId', 'familyId', 'expiresAt']);
  if (v.kind !== 'rotated' || typeof v.identityId !== 'string' || !UUID.test(v.identityId) || typeof v.sessionId !== 'string' || !UUID.test(v.sessionId) || typeof v.familyId !== 'string' || !UUID.test(v.familyId) || v.sessionId === v.familyId || !isClock(v.expiresAt)) throw fail();
  return Object.freeze(v);
}
function nativePromise(value: unknown): value is Promise<unknown> {
  return types.isPromise(value) && Object.getPrototypeOf(value) === Promise.prototype && Reflect.ownKeys(value).length === 0;
}

export class DevelopmentV2SessionRefresher {
  private readonly rotate: (...args: unknown[]) => unknown;
  private readonly revoke: (...args: unknown[]) => unknown;
  private readonly issue: (...args: unknown[]) => unknown;
  private readonly clock: () => number;
  private readonly bytes: (size: number) => Uint8Array;

  constructor(input: V2SessionRefresherConfig) {
    try {
      const v = plainData(input, ['environment', 'enabled', 'repository', 'accessTokens', 'clock', ...(Object.hasOwn(input, 'randomBytes') ? ['randomBytes'] : [])]);
      if (v.environment !== 'development' || v.enabled !== true || typeof v.clock !== 'function' || !v.repository || typeof v.repository !== 'object' || Array.isArray(v.repository) || !v.accessTokens || typeof v.accessTokens !== 'object' || Array.isArray(v.accessTokens)) throw fail();
      this.rotate = method(v.repository, 'rotateRefresh');
      this.revoke = method(v.repository, 'revokeRotatedFamily');
      this.issue = method(v.accessTokens, 'issue');
      this.clock = v.clock as () => number;
      if (Object.hasOwn(v, 'randomBytes') && typeof v.randomBytes !== 'function') throw fail();
      this.bytes = (v.randomBytes as ((size: number) => Uint8Array) | undefined) ?? randomBytes;
      Object.freeze(this);
    } catch { throw fail(); }
  }

  async refresh(input: V2SessionRefreshInput): Promise<Readonly<V2SessionRefreshResponse>> {
    let cleanup: { readonly expected: RotatedFamilyExpectation; readonly context: Readonly<RequestContext> } | undefined;
    try {
      const v = plainData(input, ['refreshToken', 'transportContext']);
      if (!canonicalToken(v.refreshToken)) throw fail();
      const tc = transport(v.transportContext);
      const before = this.clock(); if (!isClock(before)) throw fail();
      const oldHash = hash(v.refreshToken);
      const nextToken = token(this.bytes(32));
      const nextHash = hash(nextToken);
      if (nextHash === oldHash) throw fail();
      const rotationInput: RefreshRotationInput = Object.freeze({ refreshTokenHash: oldHash, successorRefreshTokenHash: nextHash,
        transportContext: tc as RefreshRotationInput['transportContext'], observedAt: before });
      const raw = this.rotate(rotationInput);
      // Snapshot synchronous outcomes before Promise assimilation can inspect an arbitrary `then` property.
      let snapshot: Readonly<Record<string, unknown>>;
      if (nativePromise(raw)) {
        const settled = await raw;
        snapshot = outcome(settled);
      } else snapshot = outcome(raw);
      if (snapshot.kind !== 'rotated') throw fail();
      const { identityId, sessionId, familyId, expiresAt } = snapshot as { identityId: string; sessionId: string; familyId: string; expiresAt: number };
      if (expiresAt <= before || expiresAt > before + TTL) throw fail();
      const expected = Object.freeze({ identityId, sessionId, familyId, refreshTokenHash: nextHash });
      const context = Object.freeze({ userId: identityId });
      cleanup = { expected, context };
      const afterRotation = this.clock(); if (!isClock(afterRotation) || afterRotation < before || afterRotation >= expiresAt) throw fail();
      const accessToken = this.issue(identityId, sessionId);
      if (typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > 4096) throw fail();
      const afterSigning = this.clock(); if (!isClock(afterSigning) || afterSigning < afterRotation || afterSigning >= expiresAt) throw fail();
      const result = Object.freeze({ sessionId, accessToken, refreshToken: nextToken });
      cleanup = undefined;
      return result;
    } catch {
      if (cleanup) {
        try { const result = this.revoke(cleanup.expected, cleanup.context); if (nativePromise(result)) await result; } catch { /* best-effort exact-family cleanup */ }
      }
      throw fail();
    }
  }
}
