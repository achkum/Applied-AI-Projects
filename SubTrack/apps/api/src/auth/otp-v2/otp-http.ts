import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Body, Controller, Headers, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { normalizeIdentifier } from '@subtrack/contracts/identifiers';
import { BrowserNonceGuard, type BrowserPurpose } from '../browser-nonce/browser-nonce.js';
import { InMemoryIdempotencyGuard, type IdempotencyReservationRepository, type TrustedAuthorityDigest } from '../idempotency/idempotency-guard.js';
import { InMemoryOtpChallengeRepository, OtpProofProducer, type OtpChallengeRepository, type OtpPurpose } from '../proofs-v2/otp-proof-producer.js';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store.js';
import type { V2BrowserEvidence } from '../http/v2-browser-context.js';

const LIMIT = 10_000;
type CodeRecord = Readonly<{ code: string; purpose: OtpPurpose; origin: string; chainId: string; expiresAt: number }>;
export class DevelopmentOtpCodeSink {
  private readonly records = new Map<string, CodeRecord>();
  constructor(private readonly maxRecords = LIMIT) { if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > LIMIT) throw new Error('OTP sink unavailable'); }
  private prune(now: number): void { for (const [id, row] of this.records) if (now >= row.expiresAt) this.records.delete(id); }
  canAccept(now: number): boolean { this.prune(now); return this.records.size < this.maxRecords; }
  publish(id: string, row: CodeRecord, now: number): void { this.prune(now); if (this.records.size >= this.maxRecords) throw new Error(); this.records.set(id, Object.freeze({ ...row })); }
  peek(id: string, now: number): CodeRecord | null { this.prune(now); return this.records.get(id) ?? null; }
  remove(id: string): void { this.records.delete(id); }
}

type Bucket = { events: number[]; expiresAt: number };
export class OtpRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly key: Uint8Array, private readonly clock = Date.now) { if (key.byteLength < 32) throw new Error('OTP rate limit unavailable'); }
  private digest(kind: string, value: string): string { return createHmac('sha256', this.key).update(`subtrack:otp-rate:v1:${kind}:`).update(value).digest('hex'); }
  private take(id: string, limit: number, window: number, now: number): boolean {
    for (const [key, row] of this.buckets) if (now >= row.expiresAt) this.buckets.delete(key);
    let bucket = this.buckets.get(id);
    if (!bucket) { if (this.buckets.size >= LIMIT) return false; bucket = { events: [], expiresAt: now + window }; this.buckets.set(id, bucket); }
    if (now < (bucket.events.at(-1) ?? now)) return false;
    while (bucket.events.length && now - bucket.events[0]! >= window) bucket.events.shift();
    if (bucket.events.length >= limit) return false;
    bucket.events.push(now); bucket.expiresAt = now + window; return true;
  }
  allowStart(ip: string, identifier: string, now = this.clock()): boolean {
    if (!Number.isSafeInteger(now) || now < 0) return false;
    return this.take(`all:${this.digest('ip-all', ip)}`, 60, 60_000, now) && this.take(`start:${this.digest('ip-start', ip)}`, 10, 60_000, now) && this.take(`identifier:${this.digest('identifier', identifier)}`, 5, 900_000, now);
  }
  allowVerify(ip: string, now = this.clock()): boolean { return Number.isSafeInteger(now) && now >= 0 && this.take(`all:${this.digest('ip-all', ip)}`, 60, 60_000, now); }
}

type Config = Readonly<{ origins: readonly string[]; cookieName: string; cookiePath: string; allowLoopbackHttp: boolean; idempotencyKey: Uint8Array; originKey: Uint8Array; otpKey: Uint8Array; rateKey: Uint8Array }>;
type Dependencies = Readonly<{ nonce: BrowserNonceGuard; idempotency?: IdempotencyReservationRepository; repository?: OtpChallengeRepository; sink?: DevelopmentOtpCodeSink; clock?: () => number }>;
const bad = Object.freeze({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'AUTH_RESTART_REQUIRED' });
const limited = Object.freeze({ type: 'about:blank', title: 'Too Many Requests', status: 429, code: 'AUTH_RESTART_REQUIRED' });
function problem(status: number): object { return Object.freeze({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : status === 500 ? 'Internal Server Error' : 'Conflict', status, code: 'AUTH_RESTART_REQUIRED' }); }
function hash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)); }
function purpose(value: unknown): value is OtpPurpose { return value === 'enroll_identifier' || value === 'otp_step_up'; }
function rawHeader(req: Request, key: string, value: string | undefined): boolean { const found: string[] = []; for (let i=0;i<req.rawHeaders.length;i+=2) if (req.rawHeaders[i]?.toLowerCase()===key) found.push(req.rawHeaders[i+1] ?? ''); return found.length===1 && found[0]===value; }

export class OtpHttpService {
  private readonly idem: IdempotencyReservationRepository;
  private readonly repo: OtpChallengeRepository;
  private readonly sink: DevelopmentOtpCodeSink;
  private readonly producer: OtpProofProducer;
  private readonly rates: OtpRateLimiter;
  private readonly now: () => number;
  constructor(private readonly config: Config, private readonly deps: Dependencies) {
    this.now = deps.clock ?? Date.now; this.idem = deps.idempotency ?? new InMemoryIdempotencyGuard({ key: config.idempotencyKey, ttlMs: 86_400_000 });
    this.repo = deps.repository ?? new InMemoryOtpChallengeRepository(); this.sink = deps.sink ?? new DevelopmentOtpCodeSink();
    this.producer = new OtpProofProducer(config.otpKey, this.repo, new ProofStore(new InMemoryProofRepository(), this.now), this.now);
    this.rates = new OtpRateLimiter(config.rateKey, this.now);
  }
  private fail(res: Response, status: number, payload: object = problem(status)): void { res.status(status).type('application/problem+json').send(payload); }
  private begin(op: 'startV2Otp'|'verifyV2Otp', body: object, key: string|undefined, purposeValue: BrowserPurpose, evidence: V2BrowserEvidence, nonce: string|undefined, cookie: string|null, expected?: { origin: string; chainId: string }) {
    if (!key || !/^[\x21-\x7e]{16,255}$/.test(key) || !nonce || evidence.bindingCookie !== cookie) throw new Error();
    const trusted = this.deps.nonce.validateBound(purposeValue, evidence, nonce, cookie ?? '');
    if (expected && (trusted.origin !== expected.origin || trusted.chainId !== expected.chainId)) throw new Error();
    const authority = Object.freeze({ kind: 'browser-chain', digest: createHmac('sha256', this.config.originKey).update('subtrack:v2:otp-chain:v1:').update(trusted.chainId).digest('hex') }) as TrustedAuthorityDigest<'browser-chain'>;
    const canonicalBody = op === 'startV2Otp'
      ? JSON.stringify({ channel: (body as { channel: unknown }).channel, identifier: (body as { identifier: unknown }).identifier, purpose: (body as { purpose: unknown }).purpose, transport: (body as { transport: unknown }).transport })
      : JSON.stringify({ challengeId: (body as { challengeId: unknown }).challengeId, code: (body as { code: unknown }).code, transport: (body as { transport: unknown }).transport });
    const input = { operation: op, transport: 'web' as const, authority, canonicalRequestDigest: hash(canonicalBody), idempotencyKey: key };
    const owner = this.idem.reserve(input);
    let rotated;
    try { rotated = this.deps.nonce.consumeAndRotate(purposeValue, evidence, nonce, cookie ?? ''); }
    catch (error) { try { this.idem.settle(input, owner.ownerHandle, 'failed'); } catch { /* Reservation remains burned if settlement is unavailable. */ } throw error; }
    return { input, owner, rotated, trusted };
  }
  start(body: unknown, req: Request, key: string|undefined, nonce: string|undefined, evidence: V2BrowserEvidence|undefined, res: Response): void {
    if (!exact(body, ['channel','identifier','purpose','transport']) || body.transport !== 'web' || !purpose(body.purpose) || !['sms','email'].includes(String(body.channel)) || typeof body.identifier !== 'string' || !evidence || !rawHeader(req,'idempotency-key',key) || !rawHeader(req,'x-browser-nonce',nonce)) { this.fail(res,400,bad); return; }
    const address = req.socket.remoteAddress ?? ''; const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
    if (!isIP(ip)) { this.fail(res,429,limited); return; }
    const channel = body.channel === 'sms' ? 'phone' : 'email'; const normalized = normalizeIdentifier(channel, body.identifier);
    if (!normalized.valid) { this.fail(res,400,bad); return; }
    const input = body as { channel: 'sms'|'email'; purpose: OtpPurpose };
    const now = this.now(); if (!this.rates.allowStart(ip, normalized.identifier, now) || !this.sink.canAccept(now)) { this.fail(res,429,limited); return; }
    let tx: ReturnType<OtpHttpService['begin']>;
    try { tx = this.begin('startV2Otp',body,key,input.purpose,evidence,nonce,evidence.bindingCookie); } catch { this.fail(res,409); return; }
    void this.producer.provision({ purpose: input.purpose, identifierHash: hash(normalized.identifier), channel: input.channel, transportContext: { transport:'web', exactOrigin:tx.trusted.origin, browserChainId:tx.trusted.chainId } }).then(otp => {
      try { this.idem.settle(tx.input,tx.owner.ownerHandle,'completed'); this.sink.publish(otp.challengeId,{ code:otp.code,purpose:input.purpose,origin:tx.trusted.origin,chainId:tx.trusted.chainId,expiresAt:otp.expiresAt },this.now());
        res.status(202).json({ challengeId:otp.challengeId,status:'accepted',nextBrowserNonce:tx.rotated.nonce });
      } catch { try { this.idem.settle(tx.input,tx.owner.ownerHandle,'failed'); } catch { /* Reservation remains burned if settlement is unavailable. */ } this.fail(res,500); }
    }).catch(() => { try { this.idem.settle(tx.input,tx.owner.ownerHandle,'failed'); } catch { /* Reservation remains burned if settlement is unavailable. */ } this.fail(res,500); });
  }
  verify(body: unknown, req: Request, key: string|undefined, nonce: string|undefined, evidence: V2BrowserEvidence|undefined, res: Response): void {
    if (!exact(body,['challengeId','code','transport']) || body.transport !== 'web' || typeof body.challengeId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.challengeId) || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code) || !evidence || !rawHeader(req,'idempotency-key',key) || !rawHeader(req,'x-browser-nonce',nonce)) { this.fail(res,400,bad); return; }
    const now=this.now(), row=this.sink.peek(body.challengeId,now); const address=req.socket.remoteAddress ?? ''; const ip=address.startsWith('::ffff:')?address.slice(7):address;
    if (!isIP(ip)) { this.fail(res,429,limited); return; }
    if (!this.rates.allowVerify(ip,now)) { this.fail(res,429,limited); return; }
    if (!row) { this.fail(res,409); return; }
    let tx: ReturnType<OtpHttpService['begin']>;
    const input=body as {challengeId:string;code:string};
    try { tx=this.begin('verifyV2Otp',body,key,row.purpose,evidence,nonce,evidence.bindingCookie,{ origin: row.origin, chainId: row.chainId }); } catch { this.fail(res,409); return; }
    void this.producer.verify({ challengeId:input.challengeId,code:input.code,transportContext:{transport:'web',exactOrigin:row.origin,browserChainId:row.chainId} }).then(proof => {
      try { this.idem.settle(tx.input,tx.owner.ownerHandle,'completed'); this.sink.remove(input.challengeId); res.status(200).json({ purpose:row.purpose,proof,nextBrowserNonce:tx.rotated.nonce }); }
      catch { this.sink.remove(input.challengeId); try { this.idem.settle(tx.input,tx.owner.ownerHandle,'failed'); } catch { /* Reservation remains burned if settlement is unavailable. */ } this.fail(res,500); }
    }).catch(() => { try { this.idem.settle(tx.input,tx.owner.ownerHandle,'failed'); } catch { /* Reservation remains burned if settlement is unavailable. */ } this.fail(res,401); });
  }
}

@Controller('v2/auth/otp')
export class OtpHttpController {
  constructor(@Inject(OtpHttpService) private readonly service: OtpHttpService) {}
  @Post('start') start(@Body() body: unknown,@Req() req: Request & {v2BrowserEvidence?:V2BrowserEvidence},@Headers('idempotency-key') key: string|undefined,@Headers('x-browser-nonce') nonce: string|undefined,@Res() res: Response): void { this.service.start(body,req,key,nonce,req.v2BrowserEvidence,res); }
  @Post('verify') verify(@Body() body: unknown,@Req() req: Request & {v2BrowserEvidence?:V2BrowserEvidence},@Headers('idempotency-key') key: string|undefined,@Headers('x-browser-nonce') nonce: string|undefined,@Res() res: Response): void { this.service.verify(body,req,key,nonce,req.v2BrowserEvidence,res); }
}
