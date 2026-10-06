import { createHash, randomBytes } from 'node:crypto';

export type BrowserPurpose = 'enroll_identifier' | 'otp_step_up' | 'session';
export type BrowserEvidence = Readonly<{
  origin: string | null;
  isHttps: boolean;
  explicitLoopbackDevelopment: boolean;
}>;
export type TrustedBrowserContext = Readonly<{
  chainId: string;
  origin: string;
  purpose: BrowserPurpose;
}>;
export type Bootstrap = Readonly<{ nonce: string; cookieSecret: string; expiresAt: number }>;
export type Rotation = Readonly<{ nonce: string; context: TrustedBrowserContext }>;
export const BROWSER_NONCE_TTL_MS = 5 * 60 * 1000;
const failure = () => new Error('Browser nonce unavailable');
const PURPOSES = new Set<BrowserPurpose>(['enroll_identifier', 'otp_step_up', 'session']);
const MAX_RECORDS = 10_000;
const domain = (kind: 'nonce' | 'cookie', value: string) => createHash('sha256')
  .update(`subtrack:browser-nonce:v2:${kind}:`, 'utf8').update(value, 'utf8').digest('hex');
const secret = () => randomBytes(32).toString('base64url');

function canonicalOrigin(value: unknown, allowLocalHttp: boolean): string | null {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value === 'null' || value.includes('*')) return null;
  try {
    const u = new URL(value);
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.origin !== value || u.username || u.password || u.pathname !== '/' || u.search || u.hash) return null;
    if (u.protocol === 'https:') return value;
    return u.protocol === 'http:' && loopback && allowLocalHttp ? value : null;
  } catch { return null; }
}

export interface BrowserNonceConfig {
  readonly allowedOrigins: readonly string[];
  readonly allowLoopbackHttpDevelopment?: boolean;
  readonly clock?: () => number;
}
export interface BrowserNonceStore {
  bootstrap(record: NonceRecord, previousCookieHash: string | null, now: number): void;
  rotate(nonceHash: string, cookieHash: string, origin: string, purpose: BrowserPurpose, now: number, next: NonceRecord): string | null;
}
export type NonceRecord = Readonly<{ nonceHash: string; cookieHash: string; chainId: string; origin: string; purpose: BrowserPurpose; issuedAt: number; expiresAt: number }>;

/** Process-local reference store. Each state transition is synchronous and atomic within this process. */
export class InMemoryBrowserNonceStore implements BrowserNonceStore {
  private readonly records = new Map<string, NonceRecord>();
  private prune(now: number): void {
    for (const [key, value] of this.records) if (now >= value.expiresAt) this.records.delete(key);
  }
  bootstrap(record: NonceRecord, previousCookieHash: string | null, now: number): void {
    this.prune(now);
    if (previousCookieHash) for (const [key, r] of this.records) if (r.cookieHash === previousCookieHash) this.records.delete(key);
    if (this.records.size >= MAX_RECORDS) throw failure();
    this.records.set(record.nonceHash, Object.freeze({ ...record }));
  }
  rotate(nonceHash: string, cookieHash: string, origin: string, purpose: BrowserPurpose, now: number, next: NonceRecord): string | null {
    this.prune(now);
    const r = this.records.get(nonceHash);
    if (!r || r.cookieHash !== cookieHash || r.origin !== origin || r.purpose !== purpose ||
      !Number.isSafeInteger(now) || now < r.issuedAt || now >= r.expiresAt ||
      r.expiresAt !== r.issuedAt + BROWSER_NONCE_TTL_MS || this.records.size > MAX_RECORDS) return null;
    this.records.delete(nonceHash);
    this.records.set(next.nonceHash, Object.freeze({ ...next, chainId: r.chainId }));
    return r.chainId;
  }
  /** Safe diagnostic view for focused tests; contains hashes only. */
  snapshot(): readonly NonceRecord[] { return Object.freeze([...this.records.values()].map(r => Object.freeze({ ...r }))); }
}

export class BrowserNonceGuard {
  private readonly origins: ReadonlySet<string>;
  private readonly clock: () => number;
  private readonly allowLocal: boolean;
  constructor(config: BrowserNonceConfig, private readonly store: BrowserNonceStore = new InMemoryBrowserNonceStore()) {
    if (!config || typeof config !== 'object') throw failure();
    this.allowLocal = config.allowLoopbackHttpDevelopment === true;
    if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) throw failure();
    const origins = config.allowedOrigins.map(origin => canonicalOrigin(origin, this.allowLocal));
    if (origins.some(origin => origin === null)) throw failure();
    this.origins = new Set(origins as string[]);
    this.clock = config.clock ?? Date.now;
  }
  private validate(e: BrowserEvidence, purpose: BrowserPurpose): { origin: string; now: number } {
    const origin = canonicalOrigin(e?.origin, this.allowLocal);
    const now = this.clock();
    if (!PURPOSES.has(purpose) || !origin || !this.origins.has(origin) || !Number.isSafeInteger(now) || now < 0 ||
      (origin.startsWith('http:') ? !(this.allowLocal && e.explicitLoopbackDevelopment === true && e.isHttps === false) : e.isHttps !== true)) throw failure();
    return { origin, now };
  }
  private record(origin: string, purpose: BrowserPurpose, chainId: string, now: number): { record: NonceRecord; nonce: string } {
    const nonce = secret();
    const record = Object.freeze({ nonceHash: domain('nonce', nonce), cookieHash: '', chainId, origin, purpose, issuedAt: now, expiresAt: now + BROWSER_NONCE_TTL_MS });
    return { record, nonce };
  }
  issue(purpose: BrowserPurpose, evidence: BrowserEvidence, previousCookieSecret?: string): Bootstrap {
    try {
      const { origin, now } = this.validate(evidence, purpose);
      if (!Number.isSafeInteger(now + BROWSER_NONCE_TTL_MS)) throw failure();
      if (previousCookieSecret !== undefined && (typeof previousCookieSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(previousCookieSecret))) throw failure();
      const cookieSecret = secret(), chainId = secret();
      const generated = this.record(origin, purpose, chainId, now);
      const record = Object.freeze({ ...generated.record, cookieHash: domain('cookie', cookieSecret) });
      this.store.bootstrap(record, previousCookieSecret ? domain('cookie', previousCookieSecret) : null, now);
      return Object.freeze({ nonce: generated.nonce, cookieSecret, expiresAt: record.expiresAt });
    } catch { throw failure(); }
  }
  consumeAndRotate(purpose: BrowserPurpose, evidence: BrowserEvidence, nonce: string, cookieSecret: string): Rotation {
    try {
      const { origin, now } = this.validate(evidence, purpose);
      if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || typeof cookieSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(cookieSecret) || !Number.isSafeInteger(now + BROWSER_NONCE_TTL_MS)) throw failure();
      const nextNonce = secret();
      const next = Object.freeze({ nonceHash: domain('nonce', nextNonce), cookieHash: domain('cookie', cookieSecret), chainId: '', origin, purpose, issuedAt: now, expiresAt: now + BROWSER_NONCE_TTL_MS });
      const chainId = this.store.rotate(domain('nonce', nonce), domain('cookie', cookieSecret), origin, purpose, now, next);
      if (!chainId) throw failure();
      return Object.freeze({ nonce: nextNonce, context: Object.freeze({ chainId, origin, purpose }) });
    } catch { throw failure(); }
  }
}
