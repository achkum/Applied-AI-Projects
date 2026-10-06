import { createHash, createHmac } from 'node:crypto';
import { Body, Controller, Headers, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BrowserNonceGuard, type BrowserPurpose } from './browser-nonce.js';
import { InMemoryIdempotencyGuard, type TrustedAuthorityDigest, type IdempotencyReservationRepository } from '../idempotency/idempotency-guard.js';
import type { V2BrowserEvidence } from '../http/v2-browser-context.js';

const purposes = new Set<BrowserPurpose>(['enroll_identifier', 'otp_step_up', 'session']);
const restart = Object.freeze({ type: 'about:blank', title: 'Conflict', status: 409, code: 'AUTH_RESTART_REQUIRED' });
type ProblemPayload = Readonly<{ type: string; title: string; status: number; code: string }>;
type Config = Readonly<{ origins: readonly string[]; cookieName: string; cookiePath: string; allowLoopbackHttp: boolean; idempotencyKey: Uint8Array; originKey: Uint8Array }>;

export class OriginThrottle {
  private readonly origins = new Map<string, { start: number; count: number }>();
  private start: number;
  private global = 0;
  constructor(origins: readonly string[], private readonly now = Date.now) { this.start = now(); for (const origin of origins) this.origins.set(origin, { start: this.start, count: 0 }); }
  take(origin: string): boolean {
    const now = this.now(), bucket = this.origins.get(origin);
    if (!bucket || !Number.isSafeInteger(now) || now < 0) return false;
    if (now - bucket.start >= 60_000 || now < bucket.start) { bucket.start = now; bucket.count = 0; }
    if (now - this.start >= 60_000 || now < this.start) { this.start = now; this.global = 0; }
    if (bucket.count >= 60 || this.global >= 300) return false;
    bucket.count++; this.global++; return true;
  }
}

function digestPurpose(purpose: string): string {
  const encoded = Buffer.from(purpose, 'utf8');
  const framed = `${encoded.byteLength}:${purpose}`;
  return createHash('sha256').update(`subtrack:v2:browser-nonce:request:v1:${framed}`, 'utf8').digest('hex');
}

export class BrowserNonceHttpService {
  private readonly nonce: Pick<BrowserNonceGuard, 'issue'>;
  private readonly idempotency: IdempotencyReservationRepository;
  private readonly throttle: OriginThrottle;
  constructor(private readonly config: Config, dependencies: Readonly<{ nonce?: Pick<BrowserNonceGuard, 'issue'>; idempotency?: IdempotencyReservationRepository; clock?: () => number }> = {}) {
    this.nonce = dependencies.nonce ?? new BrowserNonceGuard({ allowedOrigins: config.origins, allowLoopbackHttpDevelopment: config.allowLoopbackHttp });
    this.idempotency = dependencies.idempotency ?? new InMemoryIdempotencyGuard({ key: config.idempotencyKey, ttlMs: 24 * 60 * 60 * 1000 });
    this.throttle = new OriginThrottle(config.origins, dependencies.clock);
  }
  issue(body: unknown, key: string | undefined, evidence: V2BrowserEvidence, response: Response): void {
    const fail = (status: number, payload: ProblemPayload = restart) => { response.status(status).type('application/problem+json').send(payload); };
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { purpose?: unknown }).purpose !== 'string' || !purposes.has((body as { purpose: BrowserPurpose }).purpose)) {
      fail(400, { type: 'about:blank', title: 'Bad Request', status: 400, code: 'BROWSER_REQUEST_UNAVAILABLE' }); return;
    }
    const purpose = (body as { purpose: BrowserPurpose }).purpose;
    if (evidence.bindingCookie !== null && !/^[A-Za-z0-9_-]{43}$/.test(evidence.bindingCookie)) {
      fail(400, { type: 'about:blank', title: 'Bad Request', status: 400, code: 'BROWSER_REQUEST_UNAVAILABLE' }); return;
    }
    if (!this.throttle.take(evidence.origin)) { fail(429, { type: 'about:blank', title: 'Too Many Requests', status: 429, code: 'AUTH_RESTART_REQUIRED' }); return; }
    const originDigest = createHmac('sha256', this.config.originKey)
      .update('subtrack:v2:browser-bootstrap-origin:v1:', 'utf8').update(evidence.origin, 'utf8').digest('hex');
    const authority = Object.freeze({ kind: 'browser-bootstrap-origin', digest: originDigest }) as TrustedAuthorityDigest<'browser-bootstrap-origin'>;
    const input = { operation: 'createV2BrowserNonce' as const, transport: 'web' as const, authority,
      canonicalRequestDigest: digestPurpose(purpose), idempotencyKey: key ?? '' };
    let owner;
    try { owner = this.idempotency.reserve(input); } catch { fail(409); return; }
    try {
      const issued = this.nonce.issue(purpose, evidence, evidence.bindingCookie ?? undefined);
      this.idempotency.settle(input, owner.ownerHandle, 'completed');
      response.setHeader('Set-Cookie', `${this.config.cookieName}=${issued.cookieSecret}; Path=${this.config.cookiePath}; Secure; HttpOnly; SameSite=Lax`);
      response.status(200).json({ nonce: issued.nonce });
    } catch {
      try { this.idempotency.settle(input, owner.ownerHandle, 'failed'); } catch { /* fail closed */ }
      fail(500, { type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'BROWSER_REQUEST_UNAVAILABLE' });
    }
  }
}

@Controller('v2/auth/browser-nonce')
export class BrowserNonceHttpController {
  constructor(@Inject(BrowserNonceHttpService) private readonly service: BrowserNonceHttpService) {}
  @Post()
  create(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() request: Request & { v2BrowserEvidence?: V2BrowserEvidence }, @Res() response: Response): void {
    const rawKeys: string[] = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index]?.toLowerCase() === 'idempotency-key') rawKeys.push(request.rawHeaders[index + 1] ?? '');
    }
    if (rawKeys.length !== 1 || rawKeys[0] !== key) {
      response.status(400).type('application/problem+json').send({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'BROWSER_REQUEST_UNAVAILABLE' }); return;
    }
    if (!request.v2BrowserEvidence) { response.status(400).type('application/problem+json').send({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'BROWSER_REQUEST_UNAVAILABLE' }); return; }
    this.service.issue(body, key, request.v2BrowserEvidence, response);
  }
}
