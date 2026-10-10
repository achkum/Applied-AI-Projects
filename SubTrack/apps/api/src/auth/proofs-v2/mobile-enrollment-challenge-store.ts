import { randomBytes } from 'node:crypto';
import type { MobileEnrollmentIssuance } from './otp-proof-producer';

type Pending = { readonly kind: 'pending'; readonly reservedAt: number };
type Published = { kind: 'active' | 'claimed'; readonly metadata: MobileEnrollmentIssuance;
  readonly code: string; remainingAttempts: number; claimId?: string };
export type MobileEnrollmentClaim = Readonly<{ claimId: string; metadata: MobileEnrollmentIssuance }>;
const TTL = 300_000;
const FAILURE = 'Challenge unavailable';

/** Process-local port. The test code is kept with metadata and never returned by lookup or claim. */
export class MobileEnrollmentChallengeStore {
  private readonly pending = new Map<string, Pending>();
  private readonly published = new Map<string, Published>();
  private lastNow = -1;
  constructor(private readonly clock: () => number = Date.now, private readonly capacity = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10_000) throw new Error(FAILURE);
  }
  private now(): number {
    const value = this.clock();
    if (!Number.isSafeInteger(value) || value < 0 || value < this.lastNow) throw new Error(FAILURE);
    this.lastNow = value;
    return value;
  }
  private prune(now: number): void {
    for (const [token, row] of this.pending) if (now >= row.reservedAt + TTL) this.pending.delete(token);
    for (const [id, row] of this.published) if (now >= row.metadata.expiresAt) this.published.delete(id);
  }
  reserve(): string {
    const now = this.now(); this.prune(now);
    if (this.pending.size + this.published.size >= this.capacity || !Number.isSafeInteger(now + TTL)) throw new Error(FAILURE);
    const token = randomBytes(32).toString('base64url');
    this.pending.set(token, { kind: 'pending', reservedAt: now });
    return token;
  }
  abandon(token: string): void { this.pending.delete(token); }
  publish(token: string, issuance: MobileEnrollmentIssuance, code: string): MobileEnrollmentIssuance {
    const now = this.now(); this.prune(now);
    const slot = this.pending.get(token);
    if (!slot || !issuance || Object.keys(issuance).length !== 7 ||
      !['challengeId', 'purpose', 'transport', 'identifierHash', 'channel', 'issuedAt', 'expiresAt'].every(k => Object.hasOwn(issuance, k)) ||
      typeof issuance.challengeId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(issuance.challengeId) ||
      issuance.purpose !== 'enroll_identifier' || issuance.transport !== 'mobile' ||
      typeof issuance.identifierHash !== 'string' || !/^[a-f0-9]{64}$/.test(issuance.identifierHash) ||
      (issuance.channel !== 'sms' && issuance.channel !== 'email') || !Number.isSafeInteger(issuance.issuedAt) ||
      issuance.issuedAt < slot.reservedAt || !Number.isSafeInteger(issuance.expiresAt) ||
      issuance.expiresAt !== issuance.issuedAt + TTL || now < issuance.issuedAt || now >= issuance.expiresAt ||
      typeof code !== 'string' || !/^\d{6}$/.test(code) || this.published.has(issuance.challengeId)) throw new Error(FAILURE);
    const metadata = Object.freeze({ challengeId: issuance.challengeId, purpose: issuance.purpose, transport: issuance.transport,
      identifierHash: issuance.identifierHash, channel: issuance.channel, issuedAt: issuance.issuedAt, expiresAt: issuance.expiresAt });
    const row: Published = { kind: 'active', metadata, code, remainingAttempts: 5 };
    this.published.set(metadata.challengeId, row);
    this.pending.delete(token);
    return metadata;
  }
  lookup(challengeId: string): MobileEnrollmentIssuance | null {
    const now = this.now(); this.prune(now);
    const row = this.published.get(challengeId);
    return row?.kind === 'active' ? row.metadata : null;
  }
  claim(challengeId: string): MobileEnrollmentClaim | null {
    const now = this.now(); this.prune(now);
    const row = this.published.get(challengeId);
    if (!row || row.kind !== 'active') return null;
    row.kind = 'claimed'; row.claimId = randomBytes(32).toString('base64url');
    return Object.freeze({ claimId: row.claimId, metadata: row.metadata });
  }
  restoreIncorrect(claim: MobileEnrollmentClaim, remainingAttempts: number): void {
    const now = this.now(); this.prune(now);
    const row = this.published.get(claim.metadata.challengeId);
    if (!row || row.kind !== 'claimed' || row.claimId !== claim.claimId ||
      !Number.isInteger(remainingAttempts) || remainingAttempts < 1 || remainingAttempts > 4 ||
      remainingAttempts >= row.remainingAttempts || now < row.metadata.issuedAt || now >= row.metadata.expiresAt) throw new Error(FAILURE);
    row.remainingAttempts = remainingAttempts; delete row.claimId; row.kind = 'active';
  }
  retire(claim: MobileEnrollmentClaim): void {
    const row = this.published.get(claim.metadata.challengeId);
    if (!row || row.kind !== 'claimed' || row.claimId !== claim.claimId) throw new Error(FAILURE);
    this.published.delete(claim.metadata.challengeId);
  }
  /** Test-only process boundary; never expose through an HTTP handler. */
  peekCodeForTest(challengeId: string): string | null {
    const now = this.now(); this.prune(now);
    const row = this.published.get(challengeId);
    return row?.kind === 'active' ? row.code : null;
  }
}
