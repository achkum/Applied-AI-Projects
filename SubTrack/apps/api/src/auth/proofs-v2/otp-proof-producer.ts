import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ProofStore, type ProofBinding, type ProofTransport } from './proof-store';

export type OtpPurpose = 'enroll_identifier' | 'otp_step_up';
export type OtpChannel = 'sms' | 'email';
export interface VerifiedTransportContext {
  readonly transport: ProofTransport;
  readonly exactOrigin?: string;
  readonly browserChainId?: string;
}
export interface OtpProvisioning {
  readonly purpose: OtpPurpose;
  /** Pre-normalized identifier SHA-256, never a raw identifier. */
  readonly identifierHash: string;
  readonly channel: OtpChannel;
  readonly transportContext: VerifiedTransportContext;
}
export interface OtpChallengeRecord {
  readonly challengeId: string;
  readonly purpose: OtpPurpose;
  readonly identifierHash: string;
  readonly channel: OtpChannel;
  readonly transportContext: VerifiedTransportContext;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly attempts: number;
  readonly codeDigest: Buffer;
}
export interface OtpChallengeRepository {
  insert(record: OtpChallengeRecord): void | Promise<void>;
  /** Compares context and code, advances attempts, and consumes success atomically. */
  verifyAndConsume(input: {
    readonly challengeId: string;
    readonly codeDigest: Buffer;
    readonly transportContext: VerifiedTransportContext;
    readonly now: number;
  }): OtpChallengeRecord | null | Promise<OtpChallengeRecord | null>;
}
export interface ProvisionedOtp { readonly challengeId: string; readonly code: string; readonly expiresAt: number }

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DIGEST_DOMAIN = 'subtrack:restricted-otp:v2\0';
const FAILURE = 'Verification unavailable';

function contextCopy(value: VerifiedTransportContext): VerifiedTransportContext {
  if (!value || (value.transport !== 'web' && value.transport !== 'mobile')) throw new Error();
  if (value.transport === 'web') {
    if (typeof value.exactOrigin !== 'string' || !value.exactOrigin || typeof value.browserChainId !== 'string' || !value.browserChainId) throw new Error();
    let origin: URL;
    try { origin = new URL(value.exactOrigin); } catch { throw new Error(); }
    if (origin.origin !== value.exactOrigin || origin.hostname.includes('*') ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new Error();
    return Object.freeze({ transport: 'web', exactOrigin: value.exactOrigin, browserChainId: value.browserChainId });
  }
  if (value.exactOrigin !== undefined || value.browserChainId !== undefined) throw new Error();
  return Object.freeze({ transport: 'mobile' });
}
function sameContext(a: VerifiedTransportContext, b: VerifiedTransportContext): boolean {
  return a.transport === b.transport && a.exactOrigin === b.exactOrigin && a.browserChainId === b.browserChainId;
}
function copyRecord(record: OtpChallengeRecord): OtpChallengeRecord {
  return Object.freeze({ ...record, transportContext: contextCopy(record.transportContext), codeDigest: Buffer.from(record.codeDigest) });
}
function validHash(hash: unknown): hash is string { return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash); }

/** In-memory development/test reference. No awaits occur inside its state transition. */
export class InMemoryOtpChallengeRepository implements OtpChallengeRepository {
  private readonly records = new Map<string, OtpChallengeRecord>();
  constructor(private readonly maxRecords = 10_000) { if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 10_000) throw new Error('capacity'); }
  private prune(now: number): void { for (const [id, record] of this.records) if (now >= record.expiresAt) this.records.delete(id); }
  insert(record: OtpChallengeRecord): void {
    this.prune(record.issuedAt);
    if (this.records.has(record.challengeId)) throw new Error('duplicate');
    if (this.records.size >= this.maxRecords) throw new Error('capacity');
    this.records.set(record.challengeId, copyRecord(record));
  }
  verifyAndConsume(input: { challengeId: string; codeDigest: Buffer; transportContext: VerifiedTransportContext; now: number }): OtpChallengeRecord | null {
    this.prune(input.now);
    const record = this.records.get(input.challengeId);
    if (!record || !Number.isFinite(input.now) || input.now < record.issuedAt || input.now >= record.expiresAt ||
      record.attempts >= MAX_ATTEMPTS || !sameContext(record.transportContext, input.transportContext)) return null;
    if (input.codeDigest.length !== record.codeDigest.length || !timingSafeEqual(record.codeDigest, input.codeDigest)) {
      const failed = copyRecord({ ...record, attempts: record.attempts + 1 });
      this.records.set(record.challengeId, failed);
      return null;
    }
    this.records.delete(record.challengeId);
    return copyRecord(record);
  }
}

/** Internal trusted-server boundary; caller must supply a mandatory server secret. */
export class OtpProofProducer {
  private readonly key: Buffer;
  constructor(
    key: Uint8Array,
    private readonly repository: OtpChallengeRepository,
    private readonly proofStore: ProofStore,
    private readonly clock: () => number = Date.now,
  ) {
    try { this.key = Buffer.from(key); } catch { throw new Error('OTP unavailable'); }
    if (this.key.length < 32) throw new Error('OTP unavailable');
  }
  private digest(challengeId: string, code: string): Buffer {
    return createHmac('sha256', this.key).update(DIGEST_DOMAIN, 'utf8').update(challengeId, 'utf8').update('\0', 'utf8').update(code, 'utf8').digest();
  }
  async provision(input: OtpProvisioning): Promise<ProvisionedOtp> {
    try {
      if (!input || Object.keys(input).some(field => !['purpose', 'identifierHash', 'channel', 'transportContext'].includes(field)) ||
        !['enroll_identifier', 'otp_step_up'].includes(input.purpose) || !validHash(input.identifierHash) || !['sms', 'email'].includes(input.channel)) throw new Error();
      const transportContext = contextCopy(input.transportContext);
      const now = this.clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new Error();
      const challengeId = randomBytes(32).toString('base64url');
      const code = randomInt(0, 1_000_000);
      const codeText = code.toString().padStart(6, '0');
      const expiresAt = now + CHALLENGE_TTL_MS;
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) throw new Error();
      const record = copyRecord({ challengeId, purpose: input.purpose, identifierHash: input.identifierHash,
        channel: input.channel, transportContext, issuedAt: now, expiresAt, attempts: 0, codeDigest: this.digest(challengeId, codeText) });
      await this.repository.insert(record);
      return Object.freeze({ challengeId, code: codeText, expiresAt });
    } catch { throw new Error('OTP unavailable'); }
  }
  async verify(input: { readonly challengeId: string; readonly code: string; readonly transportContext: VerifiedTransportContext }): Promise<string> {
    try {
      if (!input || Object.keys(input).some(field => !['challengeId', 'code', 'transportContext'].includes(field)) ||
        typeof input.challengeId !== 'string' || !/^[A-Za-z0-9_-]{40,}$/.test(input.challengeId) ||
        typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new Error();
      const transportContext = contextCopy(input.transportContext);
      const now = this.clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new Error();
      const consumed = await this.repository.verifyAndConsume({ challengeId: input.challengeId,
        codeDigest: this.digest(input.challengeId, input.code), transportContext, now });
      if (!consumed || Object.keys(consumed).some(field => !['challengeId', 'purpose', 'identifierHash', 'channel', 'transportContext', 'issuedAt', 'expiresAt', 'attempts', 'codeDigest'].includes(field)) ||
        consumed.challengeId !== input.challengeId || !validHash(consumed.identifierHash) ||
        !['enroll_identifier', 'otp_step_up'].includes(consumed.purpose) ||
        !['sms', 'email'].includes(consumed.channel) || !Number.isFinite(consumed.issuedAt) || now < consumed.issuedAt ||
        !Number.isFinite(consumed.expiresAt) || consumed.expiresAt <= now ||
        !Number.isInteger(consumed.attempts) || consumed.attempts < 0 || consumed.attempts >= MAX_ATTEMPTS ||
        consumed.expiresAt !== consumed.issuedAt + CHALLENGE_TTL_MS || !sameContext(contextCopy(consumed.transportContext), transportContext)) throw new Error();
      const binding: ProofBinding = Object.freeze({
        purpose: consumed.purpose === 'enroll_identifier' ? 'enrollment' : 'stepup',
        challenge: consumed.challengeId,
        transport: consumed.transportContext.transport,
        identifierHash: consumed.identifierHash,
        ...(consumed.transportContext.transport === 'web' ? {
          exactOrigin: consumed.transportContext.exactOrigin,
          browserChainId: consumed.transportContext.browserChainId,
        } : {}),
      });
      return await this.proofStore.issue(binding);
    } catch { throw new Error(FAILURE); }
  }
}
