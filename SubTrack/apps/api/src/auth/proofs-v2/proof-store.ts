import { createHash, randomBytes } from 'node:crypto';

export type ProofPurpose = 'enrollment' | 'stepup' | 'login' | 'account-delete';
export type ProofTransport = 'web' | 'mobile';

interface ProofBindingBase {
  readonly purpose: ProofPurpose;
  readonly challenge: string;
  readonly transport: ProofTransport;
  readonly identityId?: string;
  readonly identifierHash?: string;
  readonly sessionId?: string;
  readonly exactOrigin?: string;
  readonly browserChainId?: string;
}

export type ProofBinding = Readonly<ProofBindingBase>;

/** Caller context used only to match a previously issued login proof. */
export type LoginProofContext = Readonly<{
  readonly transport: ProofTransport;
  readonly exactOrigin?: string;
  readonly browserChainId?: string;
}>;

export type LoginConsumeResult = Readonly<{ valid: true; identityId: string }> | typeof INVALID;

export interface StoredProof {
  readonly hash: string;
  readonly purpose: ProofPurpose;
  readonly action: string;
  readonly challenge: string;
  readonly transport: ProofTransport;
  readonly identityId?: string;
  readonly identifierHash?: string;
  readonly sessionId?: string;
  readonly exactOrigin?: string;
  readonly browserChainId?: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/** Implementations must atomically compare the complete stored binding and expiry, then consume. */
export interface ProofRepository {
  insert(record: StoredProof): void | Promise<void>;
  /** Durable implementations require a transaction/conditional delete covering compare + consume. */
  compareAndConsume(
    hash: string,
    expected: ProofBinding,
    now: number,
  ): boolean | Promise<boolean>;
  /** Must atomically match a login/authenticate proof, delete it, then return its stored identity. */
  compareAndConsumeLogin?(
    hash: string,
    expected: LoginProofContext,
    now: number,
  ): string | null | Promise<string | null>;
}

export const PROOF_TTL_MS = 5 * 60 * 1000;
const PREFIX = 'v2.';
const SECRET_BYTES = 32;
const HASH_DOMAIN = 'subtrack:auth-proof:v2:';
const INVALID = Object.freeze({ valid: false as const });
const ACTIONS: Readonly<Record<ProofPurpose, string>> = Object.freeze({
  enrollment: 'enroll-credential',
  stepup: 'step-up',
  login: 'authenticate',
  'account-delete': 'delete-account',
});
const COMMON_KEYS = new Set([
  'purpose', 'challenge', 'transport', 'identityId', 'identifierHash',
  'sessionId', 'exactOrigin', 'browserChainId',
]);

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isExactOrigin(value: unknown): value is string {
  if (!isNonEmpty(value) || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    if (url.hostname.includes('*') || url.origin !== value || (url.protocol !== 'https:' && url.protocol !== 'http:')) return false;
    if (url.protocol === 'https:') return true;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

function validateBinding(input: unknown): ProofBinding {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error();
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!COMMON_KEYS.has(key)) throw new Error();
  if (!(value.purpose === 'enrollment' || value.purpose === 'stepup' || value.purpose === 'login' || value.purpose === 'account-delete')) throw new Error();
  if (!isNonEmpty(value.challenge)) throw new Error();
  if (!(value.transport === 'web' || value.transport === 'mobile')) throw new Error();
  if (value.identityId !== undefined && !isNonEmpty(value.identityId)) throw new Error();
  if (value.identifierHash !== undefined && (typeof value.identifierHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.identifierHash))) throw new Error();
  if (value.sessionId !== undefined && !isNonEmpty(value.sessionId)) throw new Error();
  if (value.exactOrigin !== undefined && !isExactOrigin(value.exactOrigin)) throw new Error();
  if (value.browserChainId !== undefined && !isNonEmpty(value.browserChainId)) throw new Error();
  if ((value.purpose === 'login' || value.purpose === 'account-delete') && !isNonEmpty(value.identityId)) throw new Error();
  if (value.purpose === 'account-delete' && !isNonEmpty(value.sessionId)) throw new Error();
  if ((value.purpose === 'enrollment' || value.purpose === 'stepup') && !isNonEmpty(value.identifierHash)) throw new Error();
  if (value.transport === 'web') {
    if (!isNonEmpty(value.exactOrigin) || !isNonEmpty(value.browserChainId)) throw new Error();
  } else if (value.exactOrigin !== undefined || value.browserChainId !== undefined) throw new Error();
  return Object.freeze({ ...value }) as ProofBinding;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function snapshotLoginContext(input: unknown): LoginProofContext {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error();
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) throw new Error();
  const keys = Reflect.ownKeys(input);
  const allowed = new Set(['transport', 'exactOrigin', 'browserChainId']);
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error();
    values[key] = descriptor.value;
  }
  if (!(values.transport === 'web' || values.transport === 'mobile')) throw new Error();
  if (values.transport === 'web') {
    if (!isExactHttpsOrigin(values.exactOrigin) || !isNonEmpty(values.browserChainId)) throw new Error();
    return Object.freeze(values) as LoginProofContext;
  }
  if (keys.length !== 1 || values.exactOrigin !== undefined || values.browserChainId !== undefined) throw new Error();
  return Object.freeze(values) as LoginProofContext;
}

function isExactHttpsOrigin(value: unknown): value is string {
  if (!isNonEmpty(value) || value !== value.trim()) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.hostname.includes('*'); } catch { return false; }
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(HASH_DOMAIN, 'utf8').update(secret, 'utf8').digest('hex');
}

function sameBinding(record: StoredProof, binding: ProofBinding): boolean {
  return record.purpose === binding.purpose && record.action === ACTIONS[binding.purpose] &&
    record.challenge === binding.challenge && record.transport === binding.transport &&
    record.identityId === binding.identityId && record.identifierHash === binding.identifierHash &&
    record.sessionId === binding.sessionId && record.exactOrigin === binding.exactOrigin &&
    record.browserChainId === binding.browserChainId;
}

/** Internal server boundary. Inputs must already have been verified by a trusted producer. */
export class ProofStore {
  constructor(
    private readonly repository: ProofRepository,
    private readonly clock: () => number = Date.now,
  ) {}

  async issue(input: ProofBinding): Promise<string> {
    let binding: ProofBinding;
    try { binding = validateBinding(input); } catch { throw new Error('Proof unavailable'); }
    const now = this.clock();
    if (!Number.isFinite(now)) throw new Error('Proof unavailable');
    const secret = `${PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
    const record: StoredProof = Object.freeze({
      hash: hashSecret(secret),
      ...binding,
      action: ACTIONS[binding.purpose],
      issuedAt: now,
      expiresAt: now + PROOF_TTL_MS,
    });
    try { await this.repository.insert(record); } catch { throw new Error('Proof unavailable'); }
    return secret;
  }

  async consumeLogin(secret: string, context: LoginProofContext): Promise<LoginConsumeResult> {
    try {
      const expected = snapshotLoginContext(context);
      const now = this.clock();
      if (!Number.isSafeInteger(now) || now < 0 || !isNonEmpty(secret) || !/^v2\.[A-Za-z0-9_-]{43}$/.test(secret)) return INVALID;
      const consume = this.repository.compareAndConsumeLogin;
      if (typeof consume !== 'function') return INVALID;
      const identityId = await consume.call(this.repository, hashSecret(secret), expected, now);
      return isUuid(identityId) ? Object.freeze({ valid: true, identityId }) : INVALID;
    } catch { return INVALID; }
  }

  async consume(secret: string, input: ProofBinding): Promise<Readonly<{ valid: boolean }>> {
    try {
      const binding = validateBinding(input);
      const now = this.clock();
      if (!Number.isFinite(now) || !isNonEmpty(secret) || !secret.startsWith(PREFIX)) return INVALID;
      const valid = await this.repository.compareAndConsume(hashSecret(secret), binding, now);
      return valid ? Object.freeze({ valid: true }) : INVALID;
    } catch {
      return INVALID;
    }
  }
}

/** Test/dev reference only. The compare and delete below intentionally contain no await. */
export class InMemoryProofRepository implements ProofRepository {
  private readonly records = new Map<string, StoredProof>();
  constructor(private readonly maxRecords = 10_000) { if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 10_000) throw new Error('capacity'); }
  private prune(now: number): void { for (const [hash, record] of this.records) if (now >= record.expiresAt) this.records.delete(hash); }

  insert(record: StoredProof): void {
    this.prune(record.issuedAt);
    if (this.records.size >= this.maxRecords) throw new Error('capacity');
    this.records.set(record.hash, Object.freeze({ ...record }));
  }

  compareAndConsumeLogin(hash: string, expected: LoginProofContext, now: number): string | null {
    if (!Number.isSafeInteger(now) || now < 0) return null;
    let context: LoginProofContext;
    try { context = snapshotLoginContext(expected); } catch { return null; }
    this.prune(now);
    const record = this.records.get(hash);
    if (!record || record.hash !== hash || now < record.issuedAt || now >= record.expiresAt ||
      !Number.isSafeInteger(record.issuedAt) || record.issuedAt < 0 || !Number.isSafeInteger(record.expiresAt) ||
      record.expiresAt !== record.issuedAt + PROOF_TTL_MS || record.purpose !== 'login' ||
      record.action !== ACTIONS.login || !isNonEmpty(record.challenge) || record.transport !== context.transport ||
      record.exactOrigin !== context.exactOrigin || record.browserChainId !== context.browserChainId || !isUuid(record.identityId)) return null;
    this.records.delete(hash);
    return record.identityId;
  }

  compareAndConsume(hash: string, expected: ProofBinding, now: number): boolean {
    this.prune(now);
    const record = this.records.get(hash);
    if (!record || !Number.isFinite(now) || now < record.issuedAt || now >= record.expiresAt ||
      record.expiresAt !== record.issuedAt + PROOF_TTL_MS || !sameBinding(record, expected)) return false;
    this.records.delete(hash);
    return true;
  }
}
