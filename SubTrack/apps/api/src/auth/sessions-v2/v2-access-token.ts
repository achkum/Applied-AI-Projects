import {
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  KeyObject,
} from 'node:crypto';

const ISSUER = 'urn:subtrack:auth:v2:development';
const AUDIENCE = 'urn:subtrack:api:v2:development';
const TOKEN_TYPE = 'subtrack-v2-access+jwt';
const TTL_SECONDS = 900;
const MAX_TOKEN_LENGTH = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FAILURE = 'Invalid access token';

export interface V2AccessTokenClaims {
  readonly iss: typeof ISSUER;
  readonly aud: typeof AUDIENCE;
  readonly sub: string;
  readonly sid: string;
  readonly iat: number;
  readonly exp: number;
  readonly ver: 2;
}

export interface V2AccessTokenConfig {
  readonly environment: 'development';
  readonly enabled: true;
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly clock: () => number;
}

function readOwnDataConfig(config: V2AccessTokenConfig): V2AccessTokenConfig {
  if (typeof config !== 'object' || config === null || Object.getPrototypeOf(config) !== Object.prototype) throw new Error(FAILURE);
  const keys = Reflect.ownKeys(config);
  const expected = ['environment', 'enabled', 'privateKey', 'publicKey', 'clock'];
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) throw new Error(FAILURE);
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(config, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) throw new Error(FAILURE);
    values[key] = descriptor.value;
  }
  return Object.freeze({
    environment: values.environment,
    enabled: values.enabled,
    privateKey: values.privateKey,
    publicKey: values.publicKey,
    clock: values.clock,
  }) as V2AccessTokenConfig;
}

function nowSeconds(clock: () => number): number {
  const milliseconds = clock();
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error(FAILURE);
  const seconds = Math.floor(milliseconds / 1000);
  if (!Number.isSafeInteger(seconds)) throw new Error(FAILURE);
  return seconds;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeCanonical(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new Error(FAILURE);
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) throw new Error(FAILURE);
  return bytes;
}

function parseCanonicalObject(bytes: Buffer): Record<string, unknown> {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw new Error(FAILURE);
  }
  if (!Buffer.from(JSON.stringify(parsed), 'utf8').equals(bytes)) throw new Error(FAILURE);
  return parsed as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export class V2AccessToken {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly clock: () => number;

  constructor(config: V2AccessTokenConfig) {
    try {
      const snapshot = readOwnDataConfig(config);
      if (snapshot.environment !== 'development' || snapshot.enabled !== true || typeof snapshot.clock !== 'function') throw new Error(FAILURE);
      if (!(snapshot.privateKey instanceof KeyObject) || !(snapshot.publicKey instanceof KeyObject) ||
          snapshot.privateKey.type !== 'private' || snapshot.privateKey.asymmetricKeyType !== 'ed25519' ||
          snapshot.publicKey.type !== 'public' || snapshot.publicKey.asymmetricKeyType !== 'ed25519') throw new Error(FAILURE);
      const derived = createPublicKey(snapshot.privateKey).export({ type: 'spki', format: 'der' });
      const supplied = snapshot.publicKey.export({ type: 'spki', format: 'der' });
      if (!derived.equals(supplied)) throw new Error(FAILURE);
      this.privateKey = snapshot.privateKey;
      this.publicKey = snapshot.publicKey;
      this.clock = snapshot.clock;
    } catch {
      throw new Error(FAILURE);
    }
  }

  issue(identityId: string, sessionId: string): string {
    try {
      if (!isUuid(identityId) || !isUuid(sessionId)) throw new Error(FAILURE);
      const iat = nowSeconds(this.clock);
      const exp = iat + TTL_SECONDS;
      if (!Number.isSafeInteger(exp)) throw new Error(FAILURE);
      const header = encode(JSON.stringify({ alg: 'EdDSA', typ: TOKEN_TYPE }));
      const payload = encode(JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: identityId, sid: sessionId, iat, exp, ver: 2 }));
      const signingInput = `${header}.${payload}`;
      const signature = cryptoSign(null, Buffer.from(signingInput, 'ascii'), this.privateKey).toString('base64url');
      const token = `${signingInput}.${signature}`;
      if (token.length > MAX_TOKEN_LENGTH) throw new Error(FAILURE);
      return token;
    } catch {
      throw new Error(FAILURE);
    }
  }

  verify(token: string): Readonly<V2AccessTokenClaims> {
    try {
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH || [...token].some((character) => character.charCodeAt(0) > 0x7f)) throw new Error(FAILURE);
      const segments = token.split('.');
      if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) throw new Error(FAILURE);
      const headerBytes = decodeCanonical(segments[0]!);
      const payloadBytes = decodeCanonical(segments[1]!);
      const signature = decodeCanonical(segments[2]!);
      if (signature.length !== 64) throw new Error(FAILURE);
      const header = parseCanonicalObject(headerBytes);
      if (!exactKeys(header, ['alg', 'typ']) || header.alg !== 'EdDSA' || header.typ !== TOKEN_TYPE) throw new Error(FAILURE);
      if (!cryptoVerify(null, Buffer.from(`${segments[0]}.${segments[1]}`, 'ascii'), this.publicKey, signature)) throw new Error(FAILURE);
      const payload = parseCanonicalObject(payloadBytes);
      if (!exactKeys(payload, ['iss', 'aud', 'sub', 'sid', 'iat', 'exp', 'ver']) ||
          payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.ver !== 2 ||
          !isUuid(payload.sub) || !isUuid(payload.sid) ||
          !Number.isSafeInteger(payload.iat) || (payload.iat as number) < 0 ||
          !Number.isSafeInteger(payload.exp) || (payload.exp as number) < 0 ||
          payload.exp !== (payload.iat as number) + TTL_SECONDS) throw new Error(FAILURE);
      const current = nowSeconds(this.clock);
      if ((payload.iat as number) > current || current >= (payload.exp as number)) throw new Error(FAILURE);
      return Object.freeze({ iss: ISSUER, aud: AUDIENCE, sub: payload.sub, sid: payload.sid, iat: payload.iat as number, exp: payload.exp as number, ver: 2 });
    } catch {
      throw new Error(FAILURE);
    }
  }
}
