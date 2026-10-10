import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { TLSSocket } from 'node:tls';
import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { normalizeIdentifier } from '@subtrack/contracts/identifiers';
import {
  type AnonymousEnrollmentReservationInput,
  type AnonymousRequestDigest,
  type IdempotencyReservationRepository,
} from '../idempotency/idempotency-guard.js';
import { OtpRateLimiter } from './otp-http.js';
import type { MobileEnrollmentChallengeStore, MobileEnrollmentClaim } from '../proofs-v2/mobile-enrollment-challenge-store.js';
import type { MobileEnrollmentIssuance, OtpProofProducer, MobileVerificationOutcome } from '../proofs-v2/otp-proof-producer.js';

const FAILURE = 'Authentication request unavailable';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^\d{6}$/;
const KEY = /^[\x21-\x7e]{16,255}$/;
const HASH = /^[a-f0-9]{64}$/;
const TTL = 300_000;
const ALLOWED_HEADERS = new Set(['host', 'connection', 'accept', 'accept-encoding', 'user-agent', 'content-type', 'content-length', 'idempotency-key']);
const fail = (): never => { throw new Error(FAILURE); };

export interface MobileEnrollmentOtpHttpConfig {
  readonly environment: string;
  readonly enabled?: boolean;
  readonly anonymousBindingKey: Uint8Array;
  readonly otpKey: Uint8Array;
  readonly rateKey: Uint8Array;
  readonly idempotencyKey: Uint8Array;
  readonly originKeys: readonly Uint8Array[];
  readonly credentialKeys: readonly Uint8Array[];
  readonly clock: () => number;
  readonly ports?: Readonly<{
    idempotency: IdempotencyReservationRepository;
    challenges: MobileEnrollmentChallengeStore;
    producer: Pick<OtpProofProducer, 'provisionMobileEnrollment' | 'verifyMobileEnrollment'>;
    rates: Pick<OtpRateLimiter, 'allowStart' | 'allowVerify'>;
  }>;
}

export function copySeparatedBindingKey(input: MobileEnrollmentOtpHttpConfig): Buffer {
  const key = input.anonymousBindingKey;
  if (!(key instanceof Uint8Array) || key.byteLength < 32 ||
    !(input.otpKey instanceof Uint8Array) || !(input.rateKey instanceof Uint8Array) ||
    !(input.idempotencyKey instanceof Uint8Array) || !Array.isArray(input.originKeys) ||
    !Array.isArray(input.credentialKeys)) fail();
  const compared = [input.otpKey, input.rateKey, input.idempotencyKey, ...input.originKeys, ...input.credentialKeys];
  const copy = Buffer.from(key);
  for (const candidate of compared) {
    if (!(candidate instanceof Uint8Array) || candidate.byteLength < 32) fail();
    const other = Buffer.from(candidate);
    if (copy.length === other.length && timingSafeEqual(copy, other)) fail();
  }
  return copy;
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
// The standalone Nest application must be created with rawBody: true. Parsed @Body
// alone has already lost duplicate JSON members, so missing bytes fail closed.
function strictWireBody(request: RawBodyRequest<Request>, parsed: unknown, keys: readonly string[]): Record<string, unknown> {
  const raw = request.rawBody;
  if (!Buffer.isBuffer(raw) || raw.length === 0 || raw.length > 4096 ||
    request.headers['content-length'] !== String(raw.length)) throw new HttpFailure(400);
  const source = raw.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(raw)) throw new HttpFailure(400);
  // eslint-disable-next-line no-control-regex -- Reject raw JSON control bytes before parsing duplicate members.
  const pair = /\s*("(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\\x00-\x1f])*")\s*:\s*("(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\\x00-\x1f])*")\s*/y;
  const names = new Set<string>();
  let cursor = /^\s*\{/.exec(source)?.[0].length;
  if (cursor === undefined) throw new HttpFailure(400);
  const value: Record<string, unknown> = {};
  while (cursor < source.length) {
    pair.lastIndex = cursor;
    const match = pair.exec(source);
    if (!match) throw new HttpFailure(400);
    const name = JSON.parse(match[1]!) as string;
    if (names.has(name) || !keys.includes(name)) throw new HttpFailure(400);
    names.add(name); value[name] = JSON.parse(match[2]!) as string;
    cursor = pair.lastIndex;
    if (source[cursor] === ',') { cursor++; continue; }
    if (source[cursor] === '}' && /^\s*$/.test(source.slice(cursor + 1))) break;
    throw new HttpFailure(400);
  }
  if (names.size !== keys.length || !exact(parsed, keys) ||
    keys.some(key => parsed[key] !== value[key])) throw new HttpFailure(400);
  return value;
}
function digest(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function frame(values: readonly string[]): string { return values.map(value => `${Buffer.byteLength(value, 'utf8')}:${value}`).join(''); }
function canonicalSecret(value: unknown): value is string {
  return typeof value === 'string' && SECRET.test(value) && Buffer.from(value, 'base64url').length === 32 &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}
function problem(status: number): object {
  const title = status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 409 ? 'Conflict' :
    status === 429 ? 'Too Many Requests' : 'Internal Server Error';
  return { type: 'about:blank', title, status, code: 'AUTH_RESTART_REQUIRED' };
}
class HttpFailure { constructor(readonly status: number) {} }

function requestKey(request: Request, path: string): string {
  if (request.originalUrl !== path || !(request.socket instanceof TLSSocket) || request.socket.encrypted !== true ||
    request.secure !== true || !Array.isArray(request.rawHeaders) || request.rawHeaders.length % 2 !== 0) throw new HttpFailure(400);
  const seen = new Map<string, string>();
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i], value = request.rawHeaders[i + 1];
    if (typeof name !== 'string' || typeof value !== 'string' || !/^[A-Za-z0-9-]+$/.test(name) ||
      !ALLOWED_HEADERS.has(name.toLowerCase()) || seen.has(name.toLowerCase()) ||
      // eslint-disable-next-line no-control-regex -- Reject control bytes in every received header value.
      /[\x00-\x1f\x7f]/.test(value)) throw new HttpFailure(400);
    seen.set(name.toLowerCase(), value);
  }
  const length = seen.get('content-length');
  const key = seen.get('idempotency-key');
  if (!key || !KEY.test(key) || !length || !/^[1-9][0-9]*$/.test(length) || Number(length) > 4096 ||
    !/^application\/json(?:; charset=utf-8)?$/i.test(seen.get('content-type') ?? '')) throw new HttpFailure(400);
  return key;
}
function directIp(request: Request): string {
  const address = request.socket.remoteAddress ?? '';
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (!isIP(ip)) throw new HttpFailure(429);
  return ip;
}
function issuance(value: unknown, identifierHash: string, channel: 'sms' | 'email', now: number): value is MobileEnrollmentIssuance {
  if (!exact(value, ['challengeId', 'purpose', 'transport', 'identifierHash', 'channel', 'issuedAt', 'expiresAt'])) return false;
  return canonicalSecret(value.challengeId) && value.purpose === 'enroll_identifier' && value.transport === 'mobile' &&
    value.identifierHash === identifierHash && value.channel === channel && Number.isSafeInteger(value.issuedAt) &&
    Number.isSafeInteger(value.expiresAt) && (value.issuedAt as number) <= now && now < (value.expiresAt as number) &&
    value.expiresAt === (value.issuedAt as number) + TTL;
}
function validMetadata(value: unknown, challengeId: string, now: number): value is MobileEnrollmentIssuance {
  if (!exact(value, ['challengeId', 'purpose', 'transport', 'identifierHash', 'channel', 'issuedAt', 'expiresAt'])) return false;
  return value.challengeId === challengeId && value.purpose === 'enroll_identifier' && value.transport === 'mobile' &&
    typeof value.identifierHash === 'string' && HASH.test(value.identifierHash) &&
    (value.channel === 'sms' || value.channel === 'email') && Number.isSafeInteger(value.issuedAt) &&
    Number.isSafeInteger(value.expiresAt) && (value.issuedAt as number) <= now && now < (value.expiresAt as number) &&
    value.expiresAt === (value.issuedAt as number) + TTL;
}

export class DevelopmentMobileEnrollmentOtpHttpService {
  private readonly bindingKey: Buffer;
  private readonly ports: NonNullable<MobileEnrollmentOtpHttpConfig['ports']>;
  private lastNow = -1;
  constructor(config: MobileEnrollmentOtpHttpConfig, ports: NonNullable<MobileEnrollmentOtpHttpConfig['ports']>) {
    if (config.environment !== 'development' || config.enabled !== true || typeof config.clock !== 'function') fail();
    this.bindingKey = copySeparatedBindingKey(config);
    this.ports = ports;
    this.clock = config.clock;
  }
  private readonly clock: () => number;
  private now(): number {
    const value = this.clock();
    if (!Number.isSafeInteger(value) || value < 0 || value < this.lastNow || !Number.isFinite(new Date(value).getTime())) fail();
    this.lastNow = value;
    return value;
  }
  private input(operation: 'startV2Otp' | 'verifyV2Otp', key: string, body: object, fields: readonly string[]): AnonymousEnrollmentReservationInput {
    const authority = Object.freeze({ kind: 'anonymous-enrollment-otp' as const,
      digest: createHmac('sha256', this.bindingKey).update(frame([
        'subtrack:anonymous-enrollment-otp:v1', operation, 'mobile', 'enroll_identifier', ...fields,
      ]), 'utf8').digest('hex') }) as AnonymousRequestDigest;
    return Object.freeze({ operation, transport: 'mobile', purpose: 'enroll_identifier', authority,
      canonicalRequestDigest: digest(JSON.stringify(body)), idempotencyKey: key });
  }
  private send(response: Response, status: number, value: object = problem(status)): void {
    if (!response.headersSent) response.status(status).type(status === 202 || status === 200 ? 'application/json' : 'application/problem+json').send(value);
  }
  private settleFailed(input: AnonymousEnrollmentReservationInput, owner: string, completedAttempted: boolean): void {
    if (!completedAttempted) try { this.ports.idempotency.settle(input, owner, 'failed'); } catch { /* The reservation remains burned until expiry. */ }
  }
  async start(body: unknown, request: Request, response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Pragma', 'no-cache');
    let input: AnonymousEnrollmentReservationInput | undefined;
    let owner: string | undefined, slot: string | undefined, completedAttempted = false;
    try {
      const key = requestKey(request, '/v2/auth/otp/start');
      body = strictWireBody(request, body, ['channel', 'identifier', 'purpose', 'transport']);
      if (!exact(body, ['channel', 'identifier', 'purpose', 'transport']) ||
        (body.channel !== 'sms' && body.channel !== 'email') || body.purpose !== 'enroll_identifier' ||
        body.transport !== 'mobile' || typeof body.identifier !== 'string') throw new HttpFailure(400);
      const channel = body.channel;
      const normalized = normalizeIdentifier(channel === 'sms' ? 'phone' : 'email', body.identifier);
      if (!normalized.valid) throw new HttpFailure(400);
      const ip = directIp(request), now = this.now();
      if (!this.ports.rates.allowStart(ip, normalized.identifier, now)) throw new HttpFailure(429);
      const identifierHash = digest(normalized.identifier);
      input = this.input('startV2Otp', key, { channel, identifier: body.identifier, purpose: 'enroll_identifier', transport: 'mobile' }, [channel, identifierHash]);
      let reservation;
      try { reservation = this.ports.idempotency.reserve(input); }
      catch (error) { throw new HttpFailure(error instanceof Error && error.message === 'AUTH_RESTART_REQUIRED' ? 409 : 500); }
      const reservedAt = this.now();
      if (!canonicalSecret(reservation?.ownerHandle) || !Number.isSafeInteger(reservation.expiresAt) ||
        reservation.expiresAt <= reservedAt || reservation.expiresAt - reservedAt > 86_400_000) fail();
      owner = reservation.ownerHandle;
      slot = this.ports.challenges.reserve();
      if (!canonicalSecret(slot)) fail();
      const result = await this.ports.producer.provisionMobileEnrollment({ identifierHash, channel });
      const after = this.now();
      if (!exact(result, ['issuance', 'code']) || !issuance(result.issuance, identifierHash, channel, after) ||
        typeof result.code !== 'string' || !CODE.test(result.code) || after >= reservation.expiresAt) fail();
      completedAttempted = true;
      this.ports.idempotency.settle(input, owner, 'completed');
      if (this.now() >= result.issuance.expiresAt) fail();
      this.ports.challenges.publish(slot, result.issuance, result.code);
      this.send(response, 202, { challengeId: result.issuance.challengeId, status: 'accepted', nextBrowserNonce: null });
    } catch (error) {
      if (input && owner) this.settleFailed(input, owner, completedAttempted);
      if (slot) try { this.ports.challenges.abandon(slot); } catch { /* Pending slot expires. */ }
      try { this.send(response, error instanceof HttpFailure ? error.status : 500); } catch { /* Uncertain response. */ }
    }
  }
  async verify(body: unknown, request: Request, response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Pragma', 'no-cache');
    let input: AnonymousEnrollmentReservationInput | undefined;
    let owner: string | undefined, claim: MobileEnrollmentClaim | undefined, completedAttempted = false;
    try {
      const key = requestKey(request, '/v2/auth/otp/verify');
      body = strictWireBody(request, body, ['challengeId', 'code', 'transport']);
      if (!exact(body, ['challengeId', 'code', 'transport']) || !canonicalSecret(body.challengeId) ||
        typeof body.code !== 'string' || !CODE.test(body.code) || body.transport !== 'mobile') throw new HttpFailure(400);
      const ip = directIp(request), now = this.now();
      if (!this.ports.rates.allowVerify(ip, now)) throw new HttpFailure(429);
      const metadata = this.ports.challenges.lookup(body.challengeId);
      if (!validMetadata(metadata, body.challengeId, now)) throw new HttpFailure(409);
      input = this.input('verifyV2Otp', key, { challengeId: body.challengeId, code: body.code, transport: 'mobile' },
        [body.challengeId, metadata.identifierHash, metadata.channel]);
      let reservation;
      try { reservation = this.ports.idempotency.reserve(input); }
      catch (error) { throw new HttpFailure(error instanceof Error && error.message === 'AUTH_RESTART_REQUIRED' ? 409 : 500); }
      const reservedAt = this.now();
      if (!canonicalSecret(reservation?.ownerHandle) || !Number.isSafeInteger(reservation.expiresAt) ||
        reservation.expiresAt <= reservedAt || reservation.expiresAt - reservedAt > 86_400_000) fail();
      owner = reservation.ownerHandle;
      const got = this.ports.challenges.claim(body.challengeId);
      if (!got || !canonicalSecret(got.claimId) || got.metadata !== metadata) throw new HttpFailure(409);
      claim = got;
      const outcome: MobileVerificationOutcome = await this.ports.producer.verifyMobileEnrollment({ issuance: metadata, code: body.code });
      const after = this.now();
      if (after >= metadata.expiresAt || after >= reservation.expiresAt) fail();
      if (outcome.kind !== 'consumed' && outcome.kind !== 'terminal' && outcome.kind !== 'incorrect') fail();
      if (outcome.kind === 'incorrect' && (!Number.isInteger(outcome.remainingAttempts) ||
        outcome.remainingAttempts < 1 || outcome.remainingAttempts > 4)) fail();
      if (outcome.kind === 'consumed' && (typeof outcome.proof !== 'string' || !/^v2\.[A-Za-z0-9_-]{43}$/.test(outcome.proof))) fail();
      completedAttempted = true;
      this.ports.idempotency.settle(input, owner, 'completed');
      if (outcome.kind === 'incorrect') {
        this.ports.challenges.restoreIncorrect(claim, outcome.remainingAttempts);
        claim = undefined;
        throw new HttpFailure(401);
      }
      this.ports.challenges.retire(claim);
      claim = undefined;
      if (outcome.kind === 'terminal') throw new HttpFailure(401);
      if (this.now() >= metadata.expiresAt) fail();
      this.send(response, 200, { purpose: 'enroll_identifier', proof: outcome.proof, nextBrowserNonce: null });
    } catch (error) {
      if (claim) try { this.ports.challenges.retire(claim); } catch { /* Claim stays unusable until expiry. */ }
      if (input && owner) this.settleFailed(input, owner, completedAttempted);
      try { this.send(response, error instanceof HttpFailure ? error.status : 500); } catch { /* Uncertain response. */ }
    }
  }
}

@Controller('v2/auth/otp')
export class MobileEnrollmentOtpHttpController {
  constructor(@Inject(DevelopmentMobileEnrollmentOtpHttpService) private readonly service: DevelopmentMobileEnrollmentOtpHttpService) {}
  @Post('start') start(@Body() body: unknown, @Req() request: Request, @Res() response: Response): Promise<void> {
    return this.service.start(body, request, response);
  }
  @Post('verify') verify(@Body() body: unknown, @Req() request: Request, @Res() response: Response): Promise<void> {
    return this.service.verify(body, request, response);
  }
}
