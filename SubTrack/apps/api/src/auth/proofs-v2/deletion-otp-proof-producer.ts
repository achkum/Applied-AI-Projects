import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { types } from 'node:util';
import type { ProofStore, ProofBinding } from './proof-store';

declare const trustedDeletionOtpAuthority: unique symbol;
export type TrustedDeletionOtpAuthority = Readonly<{
  readonly [trustedDeletionOtpAuthority]: true;
  readonly identityId: string;
  readonly sessionId: string;
  readonly identifierHash: string;
  readonly channel: 'email' | 'sms';
  readonly transportContext: Readonly<
    | { transport: 'mobile' }
    | {
        transport: 'web';
        exactOrigin: string;
        browserChainId: string;
      }
  >;
}>;

export interface DeletionOtpProofProducerConfig {
  readonly environment: 'development';
  readonly enabled: true;
  readonly authDeleteOtpDevOnly: true;
  readonly key: Uint8Array;
  readonly proofStore: Pick<ProofStore, 'issue'>;
  readonly clock: () => number;
  readonly maxChallenges?: number;
  readonly maxRateBuckets?: number;
}

type Scope = Readonly<{
  identityId: string;
  sessionId: string;
  identifierHash: string;
  channel: 'email' | 'sms';
  transport: 'mobile' | 'web';
  exactOrigin?: string;
  browserChainId?: string;
}>;
type Challenge = {
  scope: Scope;
  issuedAt: number;
  expiresAt: number;
  attempts: number;
  digest: Buffer;
};
type RateBucket = { starts: number[] };
type StartResult = Readonly<{
  challengeId: string;
  code: string;
  expiresAt: number;
}>;

const TTL = 300_000;
const WINDOW = 60_000;
const MAX_WRONG = 5;
const DOMAIN = 'subtrack:auth:deletion-otp:v2\0';
const FAILURE = 'Deletion verification unavailable';
const quotaErrors = new WeakSet<object>();
const quotaToken = Symbol('local deletion OTP quota');

/** Generic local quota signal; instances created by callers are not trusted. */
export class DeletionOtpRateLimitError extends Error {
  constructor(token?: symbol) {
    super('Deletion verification unavailable');
    this.name = 'DeletionOtpRateLimitError';
    if (token === quotaToken) quotaErrors.add(this);
  }
}

export function isDeletionOtpRateLimitError(
  value: unknown,
): value is DeletionOtpRateLimitError {
  return typeof value === 'object' && value !== null && quotaErrors.has(value);
}
const CONFIG_KEYS = new Set([
  'environment',
  'enabled',
  'authDeleteOtpDevOnly',
  'key',
  'proofStore',
  'clock',
  'maxChallenges',
  'maxRateBuckets',
]);
const AUTHORITY_KEYS = new Set([
  'identityId',
  'sessionId',
  'identifierHash',
  'channel',
  'transportContext',
]);

function plainSnapshot(
  input: unknown,
  allowed: Set<string>,
): Map<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error();
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) throw new Error();
  const values = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new Error();
    values.set(key, descriptor.value);
  }
  return values;
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  );
}
function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function canonicalSecret(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, 'base64url').byteLength === 32 &&
    Buffer.from(value, 'base64url').toString('base64url') === value
  );
}
function exactAuthority(input: unknown): Scope {
  const values = plainSnapshot(input, AUTHORITY_KEYS);
  const identityId = values.get('identityId');
  const sessionId = values.get('sessionId');
  const identifierHash = values.get('identifierHash');
  const channel = values.get('channel');
  const context = values.get('transportContext');
  if (
    !uuid(identityId) ||
    !uuid(sessionId) ||
    !hash(identifierHash) ||
    (channel !== 'email' && channel !== 'sms')
  )
    throw new Error();
  const transportValues = plainSnapshot(
    context,
    new Set(['transport', 'exactOrigin', 'browserChainId']),
  );
  const transport = transportValues.get('transport');
  if (transport === 'mobile') {
    if (transportValues.size !== 1) throw new Error();
    return Object.freeze({
      identityId,
      sessionId,
      identifierHash,
      channel,
      transport,
    });
  }
  const exactOrigin = transportValues.get('exactOrigin');
  const browserChainId = transportValues.get('browserChainId');
  if (
    transport !== 'web' ||
    transportValues.size !== 3 ||
    typeof exactOrigin !== 'string' ||
    typeof browserChainId !== 'string' ||
    !browserChainId
  )
    throw new Error();
  let url: URL;
  try {
    url = new URL(exactOrigin);
  } catch {
    throw new Error();
  }
  if (
    url.protocol !== 'https:' ||
    url.origin !== exactOrigin ||
    url.hostname.includes('*')
  )
    throw new Error();
  return Object.freeze({
    identityId,
    sessionId,
    identifierHash,
    channel,
    transport,
    exactOrigin,
    browserChainId,
  });
}
function sameScope(a: Scope, b: Scope): boolean {
  return (
    a.identityId === b.identityId &&
    a.sessionId === b.sessionId &&
    a.identifierHash === b.identifierHash &&
    a.channel === b.channel &&
    a.transport === b.transport &&
    a.exactOrigin === b.exactOrigin &&
    a.browserChainId === b.browserChainId
  );
}
function safeLimit(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 10_000
  )
    throw new Error();
  return value as number;
}

/** Internal development core. The authority brand is an assertion from a separately reviewed trusted adapter;
 * this class validates scope only and does not authenticate callers or authorize deletion. */
export class DevelopmentDeletionOtpProofProducer {
  private readonly key: Buffer;
  private readonly issue: (binding: ProofBinding) => Promise<string>;
  private readonly clock: () => number;
  private readonly maxChallenges: number;
  private readonly maxRateBuckets: number;
  private readonly challenges = new Map<string, Challenge>();
  private readonly buckets = new Map<string, RateBucket>();
  private readonly globalStarts: number[] = [];
  private lastNow = -1;

  constructor(config: DeletionOtpProofProducerConfig) {
    try {
      const values = plainSnapshot(config, CONFIG_KEYS);
      if (
        values.get('environment') !== 'development' ||
        values.get('enabled') !== true ||
        values.get('authDeleteOtpDevOnly') !== true
      )
        throw new Error();
      const key = values.get('key');
      const port = values.get('proofStore');
      const clock = values.get('clock');
      if (
        !(key instanceof Uint8Array) ||
        !port ||
        typeof port !== 'object' ||
        typeof clock !== 'function'
      )
        throw new Error();
      let prototype: object | null = port;
      let issueDescriptor: PropertyDescriptor | undefined;
      while (prototype && !issueDescriptor) {
        issueDescriptor = Object.getOwnPropertyDescriptor(prototype, 'issue');
        prototype = Object.getPrototypeOf(prototype) as object | null;
      }
      if (
        !issueDescriptor ||
        !('value' in issueDescriptor) ||
        typeof issueDescriptor.value !== 'function'
      )
        throw new Error();
      const keyCopy = new Uint8Array(key);
      if (keyCopy.byteLength < 32) throw new Error();
      this.key = Buffer.from(keyCopy);
      this.issue = issueDescriptor.value.bind(port) as (
        binding: ProofBinding,
      ) => Promise<string>;
      this.clock = clock as () => number;
      this.maxChallenges = safeLimit(values.get('maxChallenges'), 10_000);
      this.maxRateBuckets = safeLimit(values.get('maxRateBuckets'), 10_000);
    } catch {
      throw new Error(FAILURE);
    }
  }

  private now(): number {
    const now = this.clock();
    if (!Number.isSafeInteger(now) || now < 0 || now < this.lastNow)
      throw new Error();
    this.lastNow = now;
    return now;
  }
  private digest(id: string, code: string): Buffer {
    return createHmac('sha256', this.key)
      .update(DOMAIN, 'utf8')
      .update(id, 'utf8')
      .update('\0', 'utf8')
      .update(code, 'utf8')
      .digest();
  }
  private prune(now: number): void {
    for (const [id, challenge] of this.challenges)
      if (now >= challenge.expiresAt) this.challenges.delete(id);
    for (const [id, bucket] of this.buckets) {
      bucket.starts = bucket.starts.filter((start) => now - start < WINDOW);
      if (bucket.starts.length === 0) this.buckets.delete(id);
    }
    while (this.globalStarts.length && now - this.globalStarts[0]! >= WINDOW)
      this.globalStarts.shift();
  }

  start(authority: TrustedDeletionOtpAuthority): StartResult {
    let quotaRejected = false;
    try {
      const scope = exactAuthority(authority);
      const now = this.now();
      this.prune(now);
      const bucket = this.buckets.get(scope.identityId);
      if (
        (!bucket && this.buckets.size >= this.maxRateBuckets) ||
        this.challenges.size >= this.maxChallenges
      )
        throw new Error();
      if (
        (bucket?.starts.length ?? 0) >= 5 ||
        this.globalStarts.length >= 300
      ) {
        quotaRejected = true;
        throw new Error();
      }
      const challengeId = randomBytes(32).toString('base64url');
      if (this.challenges.has(challengeId)) throw new Error();
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const expiresAt = now + TTL;
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now)
        throw new Error();
      const record: Challenge = {
        scope,
        issuedAt: now,
        expiresAt,
        attempts: 0,
        digest: this.digest(challengeId, code),
      };
      this.challenges.set(challengeId, record);
      const selectedBucket = bucket ?? { starts: [] };
      if (!bucket) this.buckets.set(scope.identityId, selectedBucket);
      selectedBucket.starts.push(now);
      this.globalStarts.push(now);
      return Object.freeze({ challengeId, code, expiresAt });
    } catch {
      if (quotaRejected) throw new DeletionOtpRateLimitError(quotaToken);
      throw new Error(FAILURE);
    }
  }

  async verify(input: {
    readonly challengeId: string;
    readonly code: string;
    readonly authority: TrustedDeletionOtpAuthority;
  }): Promise<string> {
    try {
      const values = plainSnapshot(
        input,
        new Set(['challengeId', 'code', 'authority']),
      );
      const challengeId = values.get('challengeId');
      const code = values.get('code');
      if (
        values.size !== 3 ||
        !canonicalSecret(challengeId) ||
        typeof code !== 'string' ||
        !/^\d{6}$/.test(code)
      )
        throw new Error();
      const scope = exactAuthority(values.get('authority'));
      const now = this.now();
      this.prune(now);
      const challenge = this.challenges.get(challengeId);
      if (
        !challenge ||
        now < challenge.issuedAt ||
        now >= challenge.expiresAt ||
        !sameScope(challenge.scope, scope)
      )
        throw new Error();
      const candidate = this.digest(challengeId, code);
      if (
        candidate.length !== challenge.digest.length ||
        !timingSafeEqual(candidate, challenge.digest)
      ) {
        challenge.attempts += 1;
        if (challenge.attempts >= MAX_WRONG)
          this.challenges.delete(challengeId);
        throw new Error();
      }
      this.challenges.delete(challengeId);
      const binding: ProofBinding = Object.freeze({
        purpose: 'account-delete',
        challenge: challengeId,
        transport: scope.transport,
        identityId: scope.identityId,
        sessionId: scope.sessionId,
        identifierHash: scope.identifierHash,
        ...(scope.transport === 'web'
          ? {
              exactOrigin: scope.exactOrigin,
              browserChainId: scope.browserChainId,
            }
          : {}),
      });
      const beforeIssue = this.now();
      if (
        beforeIssue < challenge.issuedAt ||
        beforeIssue >= challenge.expiresAt
      )
        throw new Error();
      const issued = this.issue(binding);
      if (
        !types.isPromise(issued) ||
        Object.getPrototypeOf(issued) !== Promise.prototype ||
        Reflect.ownKeys(issued).length !== 0
      )
        throw new Error();
      const proof = await issued;
      const afterIssue = this.now();
      if (
        afterIssue < challenge.issuedAt ||
        afterIssue >= challenge.expiresAt ||
        typeof proof !== 'string' ||
        !proof.startsWith('v2.') ||
        !canonicalSecret(proof.slice(3))
      )
        throw new Error();
      return proof;
    } catch {
      throw new Error(FAILURE);
    }
  }
}
