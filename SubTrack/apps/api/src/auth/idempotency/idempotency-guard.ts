import { createHash, createHmac, randomBytes } from 'node:crypto';

export const V2_IDEMPOTENT_OPERATIONS = Object.freeze([
  'startV2Otp',
  'verifyV2Otp',
  'createV2Session',
  'refreshV2Session',
  'startV2DeleteOtpReauth',
  'verifyV2DeleteOtpReauth',
  'createV2BrowserNonce',
] as const);

export type V2IdempotentOperation = (typeof V2_IDEMPOTENT_OPERATIONS)[number];
export type IdempotencyTransport = 'web' | 'mobile';
export type AuthorityKind = 'browser-chain' | 'verified-principal';

declare const trustedAuthorityDigestBrand: unique symbol;

/**
 * Internal adapter input. Only a separately reviewed trusted adapter may assert
 * this type after deriving the digest from a verified browser chain or principal.
 * This core does not authenticate, resolve, or mint authority.
 */
export type TrustedAuthorityDigest = Readonly<{
  kind: AuthorityKind;
  digest: string;
  readonly [trustedAuthorityDigestBrand]: true;
}>;

export type IdempotencyReservationInput = Readonly<{
  operation: V2IdempotentOperation;
  transport: IdempotencyTransport;
  authority: TrustedAuthorityDigest;
  /** Strict lowercase or uppercase 64-character hex SHA-256 prepared by a trusted adapter. */
  canonicalRequestDigest: string;
  /** The caller's opaque Idempotency-Key; this value is never retained. */
  idempotencyKey: string;
}>;

export type IdempotencyOwner = Readonly<{
  /** Random, opaque, one-time owner handle. The repository stores only its hash. */
  ownerHandle: string;
  expiresAt: number;
}>;

export type IdempotencyOutcome = 'completed' | 'failed';

/** Future durable implementations must preserve atomic transitions and never replay results. */
export interface IdempotencyReservationRepository {
  reserve(input: IdempotencyReservationInput): IdempotencyOwner;
  settle(input: IdempotencyReservationInput, ownerHandle: string, outcome: IdempotencyOutcome): void;
}

export interface IdempotencyGuardConfig {
  /** Mandatory server configuration. It is copied and must contain at least 256 bits. */
  readonly key: Uint8Array;
  /** Explicit server retention configuration, from 1 ms through 24 hours. */
  readonly ttlMs: number;
  readonly maxRecords?: number;
  readonly clock?: () => number;
}

type StoredReservation = Readonly<{
  bindingDigest: string;
  ownerHandleHash: string;
  expiresAt: number;
  state: 'pending' | IdempotencyOutcome;
}>;

const GENERIC_ERROR = 'AUTH_RESTART_REQUIRED';
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_RECORDS = 10_000;
const MAX_RECORDS = 10_000;
const HEX_256 = /^[0-9a-fA-F]{64}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{16,255}$/;
const OPERATIONS: ReadonlySet<string> = new Set(V2_IDEMPOTENT_OPERATIONS);
const TRANSPORTS: ReadonlySet<string> = new Set(['web', 'mobile']);
const AUTHORITY_KINDS: ReadonlySet<string> = new Set(['browser-chain', 'verified-principal']);
const domain = 'subtrack:v2:idempotency:core:v1';

function fail(): never { throw new Error(GENERIC_ERROR); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateInput(input: IdempotencyReservationInput): void {
  if (!isRecord(input) || typeof input.operation !== 'string' || !OPERATIONS.has(input.operation) ||
    typeof input.transport !== 'string' || !TRANSPORTS.has(input.transport) ||
    typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
    typeof input.canonicalRequestDigest !== 'string' || !HEX_256.test(input.canonicalRequestDigest) || !isRecord(input.authority) ||
    typeof input.authority.kind !== 'string' || !AUTHORITY_KINDS.has(input.authority.kind) ||
    typeof input.authority.digest !== 'string' || !HEX_256.test(input.authority.digest)) fail();
}

function frame(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`;
}

/** Synchronous in-memory reference implementation; all transitions are atomic within this process. */
export class InMemoryIdempotencyGuard implements IdempotencyReservationRepository {
  private readonly key: Buffer;
  private readonly ttlMs: number;
  private readonly maxRecords: number;
  private readonly clock: () => number;
  private readonly records = new Map<string, StoredReservation>();

  constructor(config: IdempotencyGuardConfig) {
    if (!isRecord(config) || !(config.key instanceof Uint8Array) || config.key.byteLength < 32 ||
      !Number.isSafeInteger(config.ttlMs) || config.ttlMs <= 0 || config.ttlMs > MAX_TTL_MS ||
      (config.maxRecords !== undefined && (!Number.isSafeInteger(config.maxRecords) || config.maxRecords <= 0 || config.maxRecords > MAX_RECORDS)) ||
      (config.clock !== undefined && typeof config.clock !== 'function')) fail();
    this.key = Buffer.from(config.key);
    this.ttlMs = config.ttlMs;
    this.maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.clock = config.clock ?? Date.now;
  }

  /** Reserve once or fail generically for malformed input, duplicates, or capacity exhaustion. */
  reserve(input: IdempotencyReservationInput): IdempotencyOwner {
    validateInput(input);
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + this.ttlMs)) fail();
    this.prune(now);

    const keyHash = this.keyedDigest('key', input.idempotencyKey);
    if (this.records.has(keyHash) || this.records.size >= this.maxRecords) fail();

    const bindingDigest = this.bindingDigest(input);
    const ownerHandle = randomBytes(32).toString('base64url');
    const expiresAt = now + this.ttlMs;
    const record = Object.freeze({
      bindingDigest,
      ownerHandleHash: this.unkeyedDigest('owner', ownerHandle),
      expiresAt,
      state: 'pending' as const,
    });
    this.records.set(keyHash, record);
    return Object.freeze({ ownerHandle, expiresAt });
  }

  /** Settle only the matching pending reservation, using its original binding and owner handle. */
  settle(input: IdempotencyReservationInput, ownerHandle: string, outcome: IdempotencyOutcome): void {
    validateInput(input);
    if (typeof ownerHandle !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ownerHandle) ||
      (outcome !== 'completed' && outcome !== 'failed')) fail();
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) fail();
    this.prune(now);

    const keyHash = this.keyedDigest('key', input.idempotencyKey);
    const record = this.records.get(keyHash);
    if (!record || record.state !== 'pending' || now >= record.expiresAt ||
      record.bindingDigest !== this.bindingDigest(input) ||
      record.ownerHandleHash !== this.unkeyedDigest('owner', ownerHandle)) fail();
    this.records.set(keyHash, Object.freeze({ ...record, state: outcome }));
  }

  private now(): number {
    try { return this.clock(); } catch { return Number.NaN; }
  }

  private prune(now: number): void {
    for (const [keyHash, record] of this.records) {
      if (now >= record.expiresAt) this.records.delete(keyHash);
    }
  }

  private keyedDigest(kind: 'key' | 'binding', value: string): string {
    return createHmac('sha256', this.key).update(`${domain}:${kind}:`, 'utf8').update(value, 'utf8').digest('hex');
  }

  private unkeyedDigest(kind: 'owner', value: string): string {
    return createHash('sha256').update(`${domain}:${kind}:`, 'utf8').update(value, 'utf8').digest('hex');
  }

  private bindingDigest(input: IdempotencyReservationInput): string {
    const authority = input.authority;
    const fields = [input.operation, input.transport, authority.kind, authority.digest.toLowerCase(), input.canonicalRequestDigest.toLowerCase()];
    const framed = fields.map(frame).join('');
    return this.keyedDigest('binding', framed);
  }

  /** Hash-only, frozen diagnostic view for focused tests; never contains keys or owner handles. */
  snapshot(): readonly StoredReservation[] {
    return Object.freeze([...this.records.values()].map(record => Object.freeze({ ...record })));
  }
}
