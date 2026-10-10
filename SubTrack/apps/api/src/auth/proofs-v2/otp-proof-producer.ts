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
  /** Required only by mobile enrollment; one atomic attempt transition. */
  verifyMobileEnrollment?(input: { readonly challengeId: string; readonly codeDigest: Buffer; readonly now: number }): MobileAttemptOutcome | Promise<MobileAttemptOutcome>;
}
export interface ProvisionedOtp { readonly challengeId: string; readonly code: string; readonly expiresAt: number }
export interface MobileEnrollmentIssuance {
  readonly challengeId: string; readonly purpose: 'enroll_identifier'; readonly transport: 'mobile';
  readonly identifierHash: string; readonly channel: OtpChannel; readonly issuedAt: number; readonly expiresAt: number;
}
export type MobileAttemptOutcome =
  | Readonly<{ kind: 'incorrect'; remainingAttempts: number }>
  | Readonly<{ kind: 'terminal' }>
  | Readonly<{ kind: 'consumed'; record: OtpChallengeRecord }>;
export type MobileVerificationOutcome =
  | Readonly<{ kind: 'incorrect'; remainingAttempts: number }>
  | Readonly<{ kind: 'terminal' }>
  | Readonly<{ kind: 'consumed'; proof: string }>;

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
  verifyMobileEnrollment(input: { challengeId: string; codeDigest: Buffer; now: number }): MobileAttemptOutcome {
    this.prune(input.now);
    const record = this.records.get(input.challengeId);
    if (!record || record.purpose !== 'enroll_identifier' || record.transportContext.transport !== 'mobile' ||
      !Number.isSafeInteger(input.now) || input.now < record.issuedAt || input.now >= record.expiresAt || record.attempts >= MAX_ATTEMPTS) return { kind: 'terminal' };
    if (input.codeDigest.length !== record.codeDigest.length || !timingSafeEqual(record.codeDigest, input.codeDigest)) {
      const attempts = record.attempts + 1;
      if (attempts === MAX_ATTEMPTS) { this.records.delete(input.challengeId); return { kind: 'terminal' }; }
      this.records.set(input.challengeId, copyRecord({ ...record, attempts }));
      return { kind: 'incorrect', remainingAttempts: MAX_ATTEMPTS - attempts };
    }
    this.records.delete(input.challengeId);
    return { kind: 'consumed', record: copyRecord(record) };
  }
}

/** Internal trusted-server boundary; caller must supply a mandatory server secret. */
export class OtpProofProducer {
  private readonly key: Buffer;
  private mobileLastNow = -1;
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
  private safeNow(issuedAt: number, expiresAt: number): number {
    const now = this.clock();
    if (!Number.isSafeInteger(now) || now < 0 || now < this.mobileLastNow || now < issuedAt || now >= expiresAt) throw new Error();
    this.mobileLastNow = now;
    return now;
  }
  async provisionMobileEnrollment(input: { readonly identifierHash: string; readonly channel: OtpChannel }): Promise<Readonly<{ issuance: MobileEnrollmentIssuance; code: string }>> {
    try {
      if (!input || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'identifierHash') || !Object.hasOwn(input, 'channel') ||
        !validHash(input.identifierHash) || !['sms', 'email'].includes(input.channel)) throw new Error();
      const issuedAt = this.safeNow(0, Number.MAX_SAFE_INTEGER);
      const expiresAt = issuedAt + CHALLENGE_TTL_MS;
      if (!Number.isSafeInteger(issuedAt) || issuedAt < 0 || !Number.isSafeInteger(expiresAt)) throw new Error();
      const challengeId = randomBytes(32).toString('base64url');
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const record = copyRecord({ challengeId, purpose: 'enroll_identifier', identifierHash: input.identifierHash,
        channel: input.channel, transportContext: { transport: 'mobile' }, issuedAt, expiresAt, attempts: 0,
        codeDigest: this.digest(challengeId, code) });
      await this.repository.insert(record);
      this.safeNow(issuedAt, expiresAt);
      const issuance: MobileEnrollmentIssuance = Object.freeze({ challengeId: record.challengeId, purpose: 'enroll_identifier',
        transport: 'mobile', identifierHash: record.identifierHash, channel: record.channel, issuedAt: record.issuedAt, expiresAt: record.expiresAt });
      return Object.freeze({ issuance, code });
    } catch { throw new Error('OTP unavailable'); }
  }
  async verifyMobileEnrollment(input: { readonly issuance: MobileEnrollmentIssuance; readonly code: string }): Promise<MobileVerificationOutcome> {
    try {
      const received = input?.issuance;
      const expected = received && Object.freeze({ challengeId: received.challengeId, purpose: received.purpose,
        transport: received.transport, identifierHash: received.identifierHash, channel: received.channel,
        issuedAt: received.issuedAt, expiresAt: received.expiresAt });
      if (!input || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'issuance') || !Object.hasOwn(input, 'code') ||
        !received || Object.keys(received).length !== 7 ||
        !['challengeId', 'purpose', 'transport', 'identifierHash', 'channel', 'issuedAt', 'expiresAt'].every(k => Object.hasOwn(received, k)) ||
        !expected ||
        typeof expected.challengeId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(expected.challengeId) ||
        expected.purpose !== 'enroll_identifier' || expected.transport !== 'mobile' || !validHash(expected.identifierHash) ||
        !['sms', 'email'].includes(expected.channel) || !Number.isSafeInteger(expected.issuedAt) || expected.issuedAt < 0 ||
        !Number.isSafeInteger(expected.expiresAt) || expected.expiresAt !== expected.issuedAt + CHALLENGE_TTL_MS ||
        typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) || !this.repository.verifyMobileEnrollment) throw new Error();
      const now = this.safeNow(expected.issuedAt, expected.expiresAt);
      const outcome = await this.repository.verifyMobileEnrollment({ challengeId: expected.challengeId, codeDigest: this.digest(expected.challengeId, input.code), now });
      this.safeNow(now, expected.expiresAt);
      if (outcome?.kind === 'incorrect' && Number.isInteger(outcome.remainingAttempts) &&
        outcome.remainingAttempts >= 1 && outcome.remainingAttempts <= 4) return Object.freeze({ kind: 'incorrect', remainingAttempts: outcome.remainingAttempts });
      if (outcome?.kind === 'terminal') return Object.freeze({ kind: 'terminal' });
      if (outcome?.kind !== 'consumed') throw new Error();
      const record = outcome.record;
      if (!record || Object.keys(record).length !== 9 || !['challengeId', 'purpose', 'identifierHash', 'channel', 'transportContext', 'issuedAt', 'expiresAt', 'attempts', 'codeDigest'].every(k => Object.hasOwn(record, k)) ||
        record.challengeId !== expected.challengeId || record.purpose !== expected.purpose || record.identifierHash !== expected.identifierHash ||
        record.channel !== expected.channel || record.issuedAt !== expected.issuedAt || record.expiresAt !== expected.expiresAt ||
        !record.transportContext || Object.keys(record.transportContext).length !== 1 || record.transportContext.transport !== expected.transport ||
        !Number.isInteger(record.attempts) || record.attempts < 0 || record.attempts >= MAX_ATTEMPTS || !Buffer.isBuffer(record.codeDigest) ||
        record.codeDigest.length !== 32 || !timingSafeEqual(record.codeDigest, this.digest(expected.challengeId, input.code))) throw new Error();
      const proof = await this.proofStore.issue({ purpose: 'enrollment', challenge: record.challengeId, transport: 'mobile', identifierHash: record.identifierHash });
      this.safeNow(now, expected.expiresAt);
      return Object.freeze({ kind: 'consumed', proof });
    } catch { throw new Error(FAILURE); }
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
