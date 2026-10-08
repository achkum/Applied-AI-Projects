import { UnauthorizedException } from '@nestjs/common';
import type { RequestContext } from '../../database/request-transaction';
import type { V2AccessToken, V2AccessTokenClaims } from './v2-access-token';
import type { SessionRecord } from './v2-session-issuer';

const UNAUTHORIZED = 'Unauthorized';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const TOKEN_TTL = 900;
const SESSION_TTL = 86_400_000;
const ISSUER = 'urn:subtrack:auth:v2:development';
const AUDIENCE = 'urn:subtrack:api:v2:development';

type TransportContext = Readonly<{ transport: 'mobile' } | { transport: 'web'; exactOrigin: string; browserChainId: string }>;
export interface V2SessionReader {
  readSession(sessionId: string, context: Readonly<RequestContext>, nowMs: number): Readonly<SessionRecord> | null | Promise<Readonly<SessionRecord> | null>;
}
export interface V2PrincipalResolverConfig {
  readonly environment: 'development'; readonly enabled: true;
  readonly accessTokens: Pick<V2AccessToken, 'verify'>; readonly reader: V2SessionReader; readonly clock: () => number;
}
export interface V2Principal { readonly identityId: string; readonly sessionId: string }

function exactSnapshot(input: unknown, expected: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error();
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== 'string' || (!expected.includes(key) && !optional.includes(key))) || expected.some((key) => !keys.includes(key))) throw new Error();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error();
    result[key] = descriptor.value;
  }
  return result;
}
function validUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function validNow(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function canonicalOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.hostname.includes('*'); } catch { return false; }
}
function copyTransport(input: unknown): TransportContext {
  const v = exactSnapshot(input, ['transport'], ['exactOrigin', 'browserChainId']);
  if (v.transport === 'mobile' && Object.keys(v).length === 1) return Object.freeze({ transport: 'mobile' });
  if (v.transport === 'web' && Object.keys(v).length === 3 && canonicalOrigin(v.exactOrigin) && typeof v.browserChainId === 'string' && v.browserChainId.length > 0) {
    return Object.freeze({ transport: 'web', exactOrigin: v.exactOrigin, browserChainId: v.browserChainId });
  }
  throw new Error();
}
function copyClaims(input: unknown): Readonly<V2AccessTokenClaims> {
  const v = exactSnapshot(input, ['iss', 'aud', 'sub', 'sid', 'iat', 'exp', 'ver']);
  if (v.iss !== ISSUER || v.aud !== AUDIENCE || v.ver !== 2 || !validUuid(v.sub) || !validUuid(v.sid) ||
      !Number.isSafeInteger(v.iat) || (v.iat as number) < 0 || !Number.isSafeInteger(v.exp) || (v.exp as number) < 0 || v.exp !== (v.iat as number) + TOKEN_TTL) throw new Error();
  return Object.freeze({ iss: ISSUER, aud: AUDIENCE, sub: v.sub, sid: v.sid, iat: v.iat as number, exp: v.exp as number, ver: 2 });
}
function validTokenAt(claims: Readonly<V2AccessTokenClaims>, now: number): boolean {
  const seconds = Math.floor(now / 1000);
  return claims.iat <= seconds && seconds < claims.exp;
}
function findDataMethod(target: object, key: string): PropertyDescriptor | undefined {
  let current: object | null = target;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return 'value' in descriptor ? descriptor : undefined;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}
function copyRecord(input: unknown): Readonly<SessionRecord> {
  const v = exactSnapshot(input, ['identityId', 'sessionId', 'familyId', 'generation', 'refreshTokenHash', 'transport', 'deviceName', 'createdAt', 'expiresAt'], ['exactOrigin', 'browserChainId']);
  if (!validUuid(v.identityId) || !validUuid(v.sessionId) || !validUuid(v.familyId) || v.sessionId === v.familyId || v.generation !== 0 ||
      typeof v.refreshTokenHash !== 'string' || !HASH.test(v.refreshTokenHash) || !validNow(v.createdAt) || !validNow(v.expiresAt) ||
      v.expiresAt !== (v.createdAt as number) + SESSION_TTL || !(v.transport === 'mobile' || v.transport === 'web') ||
      !(v.deviceName === null || (typeof v.deviceName === 'string' && [...v.deviceName].length <= 100))) throw new Error();
  if (v.transport === 'mobile') {
    if (Object.hasOwn(v, 'exactOrigin') || Object.hasOwn(v, 'browserChainId')) throw new Error();
  } else if (!canonicalOrigin(v.exactOrigin) || typeof v.browserChainId !== 'string' || v.browserChainId.length === 0 || v.deviceName !== null) throw new Error();
  return Object.freeze({ ...v }) as unknown as Readonly<SessionRecord>;
}

/** Development/test-only resolver. Authorization reflects the reader's current-owner read linearization point. */
export class DevelopmentV2PrincipalResolver {
  private readonly verify: V2AccessToken['verify'];
  private readonly read: V2SessionReader['readSession'];
  private readonly clock: () => number;

  constructor(input: V2PrincipalResolverConfig) {
    try {
      const v = exactSnapshot(input, ['environment', 'enabled', 'accessTokens', 'reader', 'clock']);
      if (v.environment !== 'development' || v.enabled !== true || typeof v.clock !== 'function') throw new Error();
      const tokenObject = v.accessTokens;
      const readerObject = v.reader;
      if (typeof tokenObject !== 'object' || tokenObject === null || Array.isArray(tokenObject) ||
          typeof readerObject !== 'object' || readerObject === null || Array.isArray(readerObject)) throw new Error();
      const verifyDescriptor = findDataMethod(tokenObject, 'verify');
      const readDescriptor = findDataMethod(readerObject, 'readSession');
      if (!verifyDescriptor || typeof verifyDescriptor.value !== 'function' || !readDescriptor || typeof readDescriptor.value !== 'function') throw new Error();
      this.verify = Object.freeze({ verify: verifyDescriptor.value.bind(tokenObject) }).verify;
      this.read = Object.freeze({ readSession: readDescriptor.value.bind(readerObject) }).readSession;
      this.clock = v.clock as () => number;
      Object.freeze(this);
    } catch { throw new UnauthorizedException(UNAUTHORIZED); }
  }

  async resolve(token: string, transportInput: TransportContext): Promise<Readonly<V2Principal>> {
    try {
      if (typeof token !== 'string' || token.length === 0 || token.length > 4096) throw new Error();
      const transport = copyTransport(transportInput);
      const before = this.clock();
      if (!validNow(before)) throw new Error();
      const claims = copyClaims(this.verify(token));
      if (!validTokenAt(claims, before)) throw new Error();
      const owner = Object.freeze({ userId: claims.sub });
      const inputRecord = await this.read(claims.sid, owner, before);
      const record = copyRecord(inputRecord);
      const fresh = this.clock();
      if (!validNow(fresh) || fresh < before || !validTokenAt(claims, fresh) || record.createdAt > before || record.createdAt > fresh || fresh >= record.expiresAt ||
          record.identityId !== claims.sub || record.sessionId !== claims.sid || record.transport !== transport.transport) throw new Error();
      if (transport.transport === 'web' && (record.exactOrigin !== transport.exactOrigin || record.browserChainId !== transport.browserChainId)) throw new Error();
      return Object.freeze({ identityId: claims.sub, sessionId: claims.sid });
    } catch { throw new UnauthorizedException(UNAUTHORIZED); }
  }
}
