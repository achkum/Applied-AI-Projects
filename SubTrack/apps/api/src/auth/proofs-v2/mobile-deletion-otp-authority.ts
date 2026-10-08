import { types } from 'node:util';
import type { RequestContext } from '../../database/request-transaction';
import type { TrustedDeletionOtpAuthority } from './deletion-otp-proof-producer';
import type {
  V2AccessToken,
  V2AccessTokenClaims,
} from '../sessions-v2/v2-access-token';
import type { DevelopmentV2PrincipalResolver } from '../sessions-v2/v2-principal-resolver';
import type {
  InMemoryV2SessionRepository,
  SessionRecord,
} from '../sessions-v2/v2-session-issuer';

const FAILURE = 'Deletion authority unavailable';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ISSUER = 'urn:subtrack:auth:v2:development';
const AUDIENCE = 'urn:subtrack:api:v2:development';
const SESSION_TTL = 86_400_000;
const TOKEN_TTL_SECONDS = 900;

export interface RegisteredDeletionContactReader {
  readRegisteredContact(
    context: Readonly<RequestContext>,
    observedAt: number,
  ): Promise<Readonly<{
    identifierHash: string;
    channel: 'email' | 'sms';
  }> | null>;
}

export interface MobileDeletionOtpAuthorityConfig {
  readonly environment: 'development';
  readonly enabled: true;
  readonly authDeleteOtpDevOnly: true;
  readonly accessTokens: Pick<V2AccessToken, 'verify'>;
  readonly principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  readonly repository: Pick<InMemoryV2SessionRepository, 'readSession'>;
  readonly registeredContacts: RegisteredDeletionContactReader;
  readonly clock: () => number;
}

function snapshot(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error();
  const own = Reflect.ownKeys(input);
  if (
    own.length !== keys.length ||
    own.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw new Error();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new Error();
    result[key] = descriptor.value;
  }
  return result;
}

function method(target: unknown, key: string): (...args: never[]) => unknown {
  if (typeof target !== 'object' || target === null || Array.isArray(target))
    throw new Error();
  let current: object | null = target;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (!('value' in descriptor) || typeof descriptor.value !== 'function')
        throw new Error();
      return Function.prototype.bind.call(descriptor.value, target) as (
        ...args: never[]
      ) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error();
}

function nativePromise(value: unknown): value is Promise<unknown> {
  try {
    return (
      types.isPromise(value) &&
      Object.getPrototypeOf(value) === Promise.prototype &&
      Reflect.ownKeys(value).length === 0
    );
  } catch {
    return false;
  }
}

function validNow(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    Number.isFinite(new Date(value).getTime())
  );
}

function claimsCopy(value: unknown): Readonly<V2AccessTokenClaims> {
  const claims = snapshot(value, [
    'iss',
    'aud',
    'sub',
    'sid',
    'iat',
    'exp',
    'ver',
  ]);
  if (
    claims.iss !== ISSUER ||
    claims.aud !== AUDIENCE ||
    claims.ver !== 2 ||
    typeof claims.sub !== 'string' ||
    !UUID.test(claims.sub) ||
    typeof claims.sid !== 'string' ||
    !UUID.test(claims.sid) ||
    !Number.isSafeInteger(claims.iat) ||
    (claims.iat as number) < 0 ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp !== (claims.iat as number) + TOKEN_TTL_SECONDS
  )
    throw new Error();
  return Object.freeze({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: claims.sub,
    sid: claims.sid,
    iat: claims.iat as number,
    exp: claims.exp as number,
    ver: 2,
  });
}

function validClaimsAt(
  claims: Readonly<V2AccessTokenClaims>,
  now: number,
): boolean {
  const seconds = Math.floor(now / 1000);
  return claims.iat <= seconds && seconds < claims.exp;
}

function sameClaims(
  a: Readonly<V2AccessTokenClaims>,
  b: Readonly<V2AccessTokenClaims>,
): boolean {
  return (
    a.iss === b.iss &&
    a.aud === b.aud &&
    a.sub === b.sub &&
    a.sid === b.sid &&
    a.iat === b.iat &&
    a.exp === b.exp &&
    a.ver === b.ver
  );
}

function mobileRow(
  value: unknown,
  ownerId: string,
  sessionId: string,
  now: number,
): Readonly<SessionRecord> {
  const row = snapshot(value, [
    'identityId',
    'sessionId',
    'familyId',
    'generation',
    'refreshTokenHash',
    'transport',
    'deviceName',
    'createdAt',
    'expiresAt',
  ]);
  if (
    typeof row.identityId !== 'string' ||
    !UUID.test(row.identityId) ||
    row.identityId !== ownerId ||
    typeof row.sessionId !== 'string' ||
    !UUID.test(row.sessionId) ||
    row.sessionId !== sessionId ||
    typeof row.familyId !== 'string' ||
    !UUID.test(row.familyId) ||
    row.familyId === sessionId ||
    row.generation !== 0 ||
    typeof row.refreshTokenHash !== 'string' ||
    !HASH.test(row.refreshTokenHash) ||
    row.transport !== 'mobile' ||
    !(
      row.deviceName === null ||
      (typeof row.deviceName === 'string' && [...row.deviceName].length <= 100)
    ) ||
    !validNow(row.createdAt) ||
    !validNow(row.expiresAt) ||
    row.expiresAt !== (row.createdAt as number) + SESSION_TTL ||
    (row.createdAt as number) > now ||
    now >= (row.expiresAt as number)
  )
    throw new Error();
  return Object.freeze(row) as unknown as Readonly<SessionRecord>;
}

function contactCopy(
  value: unknown,
): Readonly<{ identifierHash: string; channel: 'email' | 'sms' }> | null {
  if (value === null) return null;
  const contact = snapshot(value, ['identifierHash', 'channel']);
  if (
    typeof contact.identifierHash !== 'string' ||
    !HASH.test(contact.identifierHash) ||
    (contact.channel !== 'email' && contact.channel !== 'sms')
  )
    throw new Error();
  return Object.freeze({
    identifierHash: contact.identifierHash,
    channel: contact.channel,
  });
}

/** Internal development-only adapter. Ownership is established at the final synchronous session read. */
export class DevelopmentMobileDeletionOtpAuthorityResolver {
  private readonly verify: V2AccessToken['verify'];
  private readonly resolvePrincipal: DevelopmentV2PrincipalResolver['resolve'];
  private readonly readSession: InMemoryV2SessionRepository['readSession'];
  private readonly readContact: RegisteredDeletionContactReader['readRegisteredContact'];
  private readonly clock: () => number;
  private lastNow = -1;

  constructor(input: MobileDeletionOtpAuthorityConfig) {
    try {
      const config = snapshot(input, [
        'environment',
        'enabled',
        'authDeleteOtpDevOnly',
        'accessTokens',
        'principal',
        'repository',
        'registeredContacts',
        'clock',
      ]);
      if (
        config.environment !== 'development' ||
        config.enabled !== true ||
        config.authDeleteOtpDevOnly !== true ||
        typeof config.clock !== 'function'
      )
        throw new Error();
      this.verify = method(
        config.accessTokens,
        'verify',
      ) as V2AccessToken['verify'];
      this.resolvePrincipal = method(
        config.principal,
        'resolve',
      ) as DevelopmentV2PrincipalResolver['resolve'];
      this.readSession = method(
        config.repository,
        'readSession',
      ) as InMemoryV2SessionRepository['readSession'];
      this.readContact = method(
        config.registeredContacts,
        'readRegisteredContact',
      ) as RegisteredDeletionContactReader['readRegisteredContact'];
      this.clock = config.clock as () => number;
    } catch {
      throw new Error(FAILURE);
    }
  }

  private now(): number {
    const value = this.clock();
    if (!validNow(value) || value < this.lastNow) throw new Error();
    this.lastNow = value;
    return value;
  }

  private verifyCurrent(
    token: string,
    expected: Readonly<V2AccessTokenClaims>,
    priorNow: number,
  ): Readonly<{ claims: Readonly<V2AccessTokenClaims>; now: number }> {
    const now = this.now();
    const claims = claimsCopy(this.verify(token));
    if (
      now < priorNow ||
      !sameClaims(claims, expected) ||
      !validClaimsAt(claims, now)
    )
      throw new Error();
    return Object.freeze({ claims, now });
  }

  private currentRow(
    claims: Readonly<V2AccessTokenClaims>,
    now: number,
  ): Readonly<SessionRecord> {
    const owner = Object.freeze({ userId: claims.sub });
    const row = this.readSession(claims.sid, owner, now);
    return mobileRow(row, claims.sub, claims.sid, now);
  }

  async resolve(accessToken: string): Promise<TrustedDeletionOtpAuthority> {
    try {
      if (
        typeof accessToken !== 'string' ||
        accessToken.length === 0 ||
        accessToken.length > 4096 ||
        !TOKEN.test(accessToken)
      )
        throw new Error();
      const before = this.now();
      const initialClaims = claimsCopy(this.verify(accessToken));
      if (!validClaimsAt(initialClaims, before)) throw new Error();

      const pendingPrincipal = this.resolvePrincipal(
        accessToken,
        Object.freeze({ transport: 'mobile' }),
      );
      if (!nativePromise(pendingPrincipal)) throw new Error();
      const principalValue: unknown = await pendingPrincipal;
      const principal = snapshot(principalValue, ['identityId', 'sessionId']);
      if (
        principal.identityId !== initialClaims.sub ||
        principal.sessionId !== initialClaims.sid
      )
        throw new Error();
      const afterPrincipal = this.verifyCurrent(
        accessToken,
        initialClaims,
        before,
      );
      this.currentRow(afterPrincipal.claims, afterPrincipal.now);

      const owner: Readonly<RequestContext> = Object.freeze({
        userId: afterPrincipal.claims.sub,
      });
      const pendingContact = this.readContact(owner, afterPrincipal.now);
      if (!nativePromise(pendingContact)) throw new Error();
      const contactValue: unknown = await pendingContact;
      const contact = contactCopy(contactValue);
      if (!contact) throw new Error();
      const finalState = this.verifyCurrent(
        accessToken,
        initialClaims,
        afterPrincipal.now,
      );
      const row = this.currentRow(finalState.claims, finalState.now);
      const authority = Object.freeze({
        identityId: finalState.claims.sub,
        sessionId: row.sessionId,
        identifierHash: contact.identifierHash,
        channel: contact.channel,
        transportContext: Object.freeze({ transport: 'mobile' as const }),
      });
      return authority as TrustedDeletionOtpAuthority;
    } catch {
      throw new Error(FAILURE);
    }
  }
}
