import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

declare const verifiedWebSessionAuthorityBrand: unique symbol;

/**
 * Compile-time marker for authority derived by a separately reviewed server adapter.
 * This core exports no constructor and does not authenticate this value at runtime.
 */
export type VerifiedWebSessionAuthority = Readonly<{
  identityId: string;
  sessionId: string;
  readonly [verifiedWebSessionAuthorityBrand]: true;
}>;

export type SessionCsrfRecord = Readonly<{
  bindingDigest: string;
  tokenDigest: string;
}>;

/** Synchronous store boundary; each operation must be atomic in its implementation. */
export interface SessionCsrfStore {
  get(bindingDigest: string): SessionCsrfRecord | undefined;
  /** Atomically replace the binding record or fail without changing existing state. */
  replace(record: SessionCsrfRecord, maxRecords: number): void;
  delete(bindingDigest: string): void;
}

export type SessionCsrfGuardConfig = Readonly<{ maxRecords?: number }>;

const GENERIC_ERROR = 'Session CSRF unavailable';
const DEFAULT_MAX_RECORDS = 10_000;
const MAX_RECORDS = 10_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DOMAIN = 'subtrack:v2:session-csrf:core:v1';

function fail(): never {
  throw new Error(GENERIC_ERROR);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAuthority(value: unknown): asserts value is VerifiedWebSessionAuthority {
  if (!isObjectRecord(value)) fail();
  const keys = Reflect.ownKeys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'identityId' || keys[1] !== 'sessionId' ||
    typeof value.identityId !== 'string' || typeof value.sessionId !== 'string' ||
    !validIdentifier(value.identityId) || !validIdentifier(value.sessionId)) fail();
}

function validIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= 256 && value.trim().length > 0;
}

function frame(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`;
}

function digest(kind: 'identity' | 'session' | 'binding' | 'token', value: string): string {
  return createHash('sha256').update(`${DOMAIN}:${kind}:`, 'utf8').update(value, 'utf8').digest('hex');
}

function bindingDigest(authority: VerifiedWebSessionAuthority): string {
  const identity = digest('identity', authority.identityId);
  const session = digest('session', authority.sessionId);
  return digest('binding', `${frame(identity)}${frame(session)}`);
}

function cloneRecord(record: SessionCsrfRecord): SessionCsrfRecord {
  return Object.freeze({ bindingDigest: record.bindingDigest, tokenDigest: record.tokenDigest });
}

/** Process-local reference store. It is not durable or suitable as a production store. */
export class InMemorySessionCsrfStore implements SessionCsrfStore {
  private readonly records = new Map<string, SessionCsrfRecord>();

  get(key: string): SessionCsrfRecord | undefined {
    if (typeof key !== 'string' || !DIGEST_PATTERN.test(key)) fail();
    const record = this.records.get(key);
    return record ? cloneRecord(record) : undefined;
  }

  replace(record: SessionCsrfRecord, maxRecords: number): void {
    if (!isObjectRecord(record) || typeof record.bindingDigest !== 'string' || !DIGEST_PATTERN.test(record.bindingDigest) ||
      typeof record.tokenDigest !== 'string' || !DIGEST_PATTERN.test(record.tokenDigest) ||
      !Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_RECORDS) fail();
    const copied = cloneRecord(record);
    if (!this.records.has(copied.bindingDigest) && this.records.size >= maxRecords) fail();
    this.records.set(copied.bindingDigest, copied);
  }

  delete(key: string): void {
    if (typeof key !== 'string' || !DIGEST_PATTERN.test(key)) fail();
    this.records.delete(key);
  }

  /** Diagnostic view for tests; contains only fixed-length digests. */
  snapshot(): readonly SessionCsrfRecord[] {
    return Object.freeze([...this.records.values()].map(cloneRecord));
  }
}

/** Internal session-bound CSRF primitive; it does not authenticate or validate session activity. */
export class SessionCsrfGuard {
  private readonly maxRecords: number;

  constructor(private readonly store: SessionCsrfStore = new InMemorySessionCsrfStore(), config: SessionCsrfGuardConfig = {}) {
    if (!isObjectRecord(config) || (config.maxRecords !== undefined &&
      (typeof config.maxRecords !== 'number' || !Number.isSafeInteger(config.maxRecords) ||
        config.maxRecords < 1 || config.maxRecords > MAX_RECORDS))) fail();
    this.maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  /** Mint a random 256-bit token and atomically replace the token for this binding. */
  mint(authority: VerifiedWebSessionAuthority): string {
    try {
      validateAuthority(authority);
      const key = bindingDigest(authority);
      const token = randomBytes(32).toString('base64url');
      this.store.replace(Object.freeze({ bindingDigest: key, tokenDigest: digest('token', token) }), this.maxRecords);
      return token;
    } catch {
      return fail();
    }
  }

  /** Verify against the current token without consuming it. */
  verify(authority: VerifiedWebSessionAuthority, token: string): void {
    try {
      validateAuthority(authority);
      if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) fail();
      const key = bindingDigest(authority);
      const record = this.store.get(key);
      if (!record || !isObjectRecord(record) || typeof record.bindingDigest !== 'string' ||
        typeof record.tokenDigest !== 'string' || !DIGEST_PATTERN.test(record.bindingDigest) ||
        !DIGEST_PATTERN.test(record.tokenDigest) || record.bindingDigest !== key) fail();
      const expected = Buffer.from(record.tokenDigest, 'hex');
      const supplied = Buffer.from(digest('token', token), 'hex');
      if (expected.length !== 32 || supplied.length !== 32 || !timingSafeEqual(expected, supplied)) fail();
    } catch {
      return fail();
    }
  }

  /** Explicit same-authority cleanup for a future session lifecycle adapter. */
  invalidate(authority: VerifiedWebSessionAuthority): void {
    try {
      validateAuthority(authority);
      this.store.delete(bindingDigest(authority));
    } catch {
      return fail();
    }
  }
}
