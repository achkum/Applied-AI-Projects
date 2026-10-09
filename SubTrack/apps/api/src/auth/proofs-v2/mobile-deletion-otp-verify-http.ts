import { createHash, createHmac } from 'node:crypto';
import { types } from 'node:util';
import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TLSSocket } from 'node:tls';
import type {
  V2AccessToken,
  V2AccessTokenClaims,
} from '../sessions-v2/v2-access-token.js';
import type { DevelopmentV2PrincipalResolver } from '../sessions-v2/v2-principal-resolver.js';
import type { InMemoryV2SessionRepository } from '../sessions-v2/v2-session-issuer.js';
import {
  DevelopmentMobileDeletionOtpAuthorityResolver,
  type RegisteredDeletionContactReader,
} from './mobile-deletion-otp-authority.js';
import type { TrustedDeletionOtpAuthority } from './deletion-otp-proof-producer.js';
import { selectV2CredentialTransport } from '../transport/credential-selector.js';
import type {
  InMemoryIdempotencyGuard,
  IdempotencyReservationInput,
  TrustedAuthorityDigest,
} from '../idempotency/idempotency-guard.js';

const FAIL = 'Authentication request unavailable';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^\d{6}$/;
const ISS = 'urn:subtrack:auth:v2:development';
const AUD = 'urn:subtrack:api:v2:development';
const operation = 'verifyV2DeleteOtpReauth' as const;
const fail = (): never => {
  throw new Error(FAIL);
};

export interface MobileDeletionOtpVerifyConfig {
  readonly environment: 'development';
  readonly enabled: true;
  readonly authDeleteOtpDevOnly: true;
  readonly accessTokens: Pick<V2AccessToken, 'verify'>;
  readonly principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  readonly repository: Pick<InMemoryV2SessionRepository, 'readSession'>;
  readonly registeredContacts: RegisteredDeletionContactReader;
  readonly otpProofs: {
    readonly verify: (
      input: Readonly<{
        challengeId: string;
        code: string;
        authority: TrustedDeletionOtpAuthority;
      }>,
    ) => Promise<string>;
  };
  readonly idempotency: Pick<InMemoryIdempotencyGuard, 'reserve' | 'settle'>;
  readonly authorityDigestKey: Uint8Array;
  readonly clock: () => number;
}
export type MobileDeletionOtpVerifyHttpConfig = MobileDeletionOtpVerifyConfig;

type Config = MobileDeletionOtpVerifyConfig;
function snapshot(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    return fail();
  const own = Reflect.ownKeys(input);
  if (
    own.length !== keys.length ||
    own.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    return fail();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !d.enumerable || !('value' in d)) return fail();
    out[key] = d.value;
  }
  return out;
}
function bindPort(target: unknown, key: string): (...args: never[]) => unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    return fail();
  let p: object | null = target;
  while (p) {
    const d = Object.getOwnPropertyDescriptor(p, key);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function') return fail();
      return Function.prototype.bind.call(d.value, target) as (
        ...args: never[]
      ) => unknown;
    }
    p = Object.getPrototypeOf(p) as object | null;
  }
  return fail();
}
function raw(request: Request, name: string): string[] {
  const h = request.rawHeaders;
  if (!Array.isArray(h) || h.length % 2 !== 0) return fail();
  const out: string[] = [];
  for (let i = 0; i < h.length; i += 2)
    if (typeof h[i] !== 'string' || typeof h[i + 1] !== 'string') return fail();
    else if (h[i]!.toLowerCase() === name) out.push(h[i + 1]!);
  return out;
}
function promise(value: unknown): value is Promise<unknown> {
  try {
    return (
      types.isPromise(value) &&
      Object.getPrototypeOf(value) === Promise.prototype &&
      Reflect.ownKeys(value).length === 0
    );
  } catch {
    return false;
  }
}
function claimsCopy(v: unknown): Readonly<V2AccessTokenClaims> {
  const c = snapshot(v, ['iss', 'aud', 'sub', 'sid', 'iat', 'exp', 'ver']);
  if (
    c.iss !== ISS ||
    c.aud !== AUD ||
    c.ver !== 2 ||
    typeof c.sub !== 'string' ||
    !UUID.test(c.sub) ||
    typeof c.sid !== 'string' ||
    !UUID.test(c.sid) ||
    !Number.isSafeInteger(c.iat) ||
    (c.iat as number) < 0 ||
    !Number.isSafeInteger(c.exp) ||
    c.exp !== (c.iat as number) + 900
  )
    return fail();
  return Object.freeze({
    iss: ISS,
    aud: AUD,
    sub: c.sub,
    sid: c.sid,
    iat: c.iat as number,
    exp: c.exp as number,
    ver: 2,
  });
}
function nowValue(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v >= 0 &&
    Number.isFinite(new Date(v).getTime())
  );
}
function canonical(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SECRET.test(value) &&
    Buffer.from(value, 'base64url').byteLength === 32 &&
    Buffer.from(value, 'base64url').toString('base64url') === value
  );
}
function framed(values: readonly string[]): string {
  return values.map((v) => `${Buffer.byteLength(v, 'utf8')}:${v}`).join('');
}
function problem(status: number) {
  return {
    type: 'about:blank',
    title:
      status === 400
        ? 'Bad Request'
        : status === 401
          ? 'Unauthorized'
          : status === 403
            ? 'Forbidden'
            : status === 409
              ? 'Conflict'
              : status === 429
                ? 'Too Many Requests'
                : 'Internal Server Error',
    status,
    code: status === 409 ? 'AUTH_RESTART_REQUIRED' : 'AUTH_REQUEST_UNAVAILABLE',
  };
}
class HttpFailure {
  constructor(readonly status: number) {}
}

export class DevelopmentMobileDeletionOtpVerifyHttpService {
  private readonly verify: V2AccessToken['verify'];
  private readonly readSession: InMemoryV2SessionRepository['readSession'];
  private readonly verifyOtp: Config['otpProofs']['verify'];
  private readonly reserve: Config['idempotency']['reserve'];
  private readonly settle: Config['idempotency']['settle'];
  private readonly key: Buffer;
  private readonly clock: () => number;
  private readonly authorityResolver: DevelopmentMobileDeletionOtpAuthorityResolver;
  private readonly identityVerifications = new Map<string, number[]>();
  private readonly globalVerifications: number[] = [];
  private lastNow = -1;
  constructor(input: MobileDeletionOtpVerifyHttpConfig) {
    const c = snapshot(input, [
      'environment',
      'enabled',
      'authDeleteOtpDevOnly',
      'accessTokens',
      'principal',
      'repository',
      'registeredContacts',
      'otpProofs',
      'idempotency',
      'authorityDigestKey',
      'clock',
    ]);
    if (
      c.environment !== 'development' ||
      c.enabled !== true ||
      c.authDeleteOtpDevOnly !== true ||
      typeof c.clock !== 'function' ||
      !(c.authorityDigestKey instanceof Uint8Array)
    )
      fail();
    const config = c as unknown as Config;
    this.verify = bindPort(
      config.accessTokens,
      'verify',
    ) as V2AccessToken['verify'];
    this.readSession = bindPort(
      config.repository,
      'readSession',
    ) as InMemoryV2SessionRepository['readSession'];
    this.verifyOtp = bindPort(
      config.otpProofs,
      'verify',
    ) as Config['otpProofs']['verify'];
    this.reserve = bindPort(
      config.idempotency,
      'reserve',
    ) as Config['idempotency']['reserve'];
    this.settle = bindPort(
      config.idempotency,
      'settle',
    ) as Config['idempotency']['settle'];
    const copiedKey = new Uint8Array(config.authorityDigestKey);
    if (copiedKey.byteLength < 32) fail();
    this.key = Buffer.from(copiedKey);
    this.clock = config.clock;
    this.authorityResolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      accessTokens: config.accessTokens,
      principal: config.principal,
      repository: config.repository,
      registeredContacts: config.registeredContacts,
      clock: config.clock,
    });
  }
  private now(): number {
    const n = this.clock();
    if (!nowValue(n) || n < this.lastNow) fail();
    this.lastNow = n;
    return n;
  }
  private recheck(
    token: string,
    expected: Readonly<V2AccessTokenClaims>,
    principal: Readonly<{ identityId: string; sessionId: string }>,
  ): number {
    const n = this.now();
    let c: Readonly<V2AccessTokenClaims>;
    try {
      c = claimsCopy(this.verify(token));
    } catch {
      throw new HttpFailure(401);
    }
    const sec = Math.floor(n / 1000);
    if (
      n < 0 ||
      c.sub !== principal.identityId ||
      c.sid !== principal.sessionId ||
      c.iss !== expected.iss ||
      c.aud !== expected.aud ||
      c.iat !== expected.iat ||
      c.exp !== expected.exp ||
      c.ver !== expected.ver ||
      c.iat > sec ||
      sec >= c.exp
    )
      throw new HttpFailure(401);
    const row = this.readSession(c.sid, Object.freeze({ userId: c.sub }), n);
    if (row === null) throw new HttpFailure(401);
    const r = snapshot(row, [
      'identityId',
      'sessionId',
      'familyId',
      'generation',
      'refreshTokenHash',
      'transport',
      'deviceName',
      'createdAt',
      'expiresAt',
    ]);
    if (
      r.identityId !== c.sub ||
      r.sessionId !== c.sid ||
      typeof r.familyId !== 'string' ||
      !UUID.test(r.familyId) ||
      r.familyId === c.sid ||
      r.generation !== 0 ||
      typeof r.refreshTokenHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(r.refreshTokenHash) ||
      r.transport !== 'mobile' ||
      !(
        r.deviceName === null ||
        (typeof r.deviceName === 'string' && [...r.deviceName].length <= 100)
      ) ||
      !nowValue(r.createdAt) ||
      !nowValue(r.expiresAt) ||
      r.expiresAt !== r.createdAt + 86_400_000 ||
      r.createdAt > n ||
      n >= r.expiresAt
    )
      throw new HttpFailure(401);
    return n;
  }
  private throttle(identity: string, now: number): void {
    for (const [id, starts] of this.identityVerifications) {
      const fresh = starts.filter((at) => now - at < 60_000);
      if (fresh.length) this.identityVerifications.set(id, fresh);
      else this.identityVerifications.delete(id);
    }
    while (
      this.globalVerifications.length &&
      now - this.globalVerifications[0]! >= 60_000
    )
      this.globalVerifications.shift();
    let starts = this.identityVerifications.get(identity);
    if (!starts && this.identityVerifications.size >= 10_000)
      throw new HttpFailure(500);
    if ((starts?.length ?? 0) >= 5 || this.globalVerifications.length >= 300)
      throw new HttpFailure(429);
    if (!starts) {
      starts = [];
      this.identityVerifications.set(identity, starts);
    }
    starts.push(now);
    this.globalVerifications.push(now);
  }
  async handle(
    body: unknown,
    request: Request,
    response: Response,
  ): Promise<void> {
    const send = (status: number, value: unknown = problem(status)) => {
      if (!response.headersSent)
        response
          .status(status)
          .type(
            status === 200 ? 'application/json' : 'application/problem+json',
          )
          .send(value);
    };
    let reservation: IdempotencyReservationInput | undefined;
    let owner: { ownerHandle: string; expiresAt: number } | undefined;
    let settleToken: string | undefined;
    let settleClaims: Readonly<V2AccessTokenClaims> | undefined;
    let settlePrincipal:
      Readonly<{ identityId: string; sessionId: string }> | undefined;
    try {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
      if (
        typeof request.originalUrl !== 'string' ||
        request.originalUrl !== '/v2/me/reauth/otp/verify'
      )
        throw new HttpFailure(400);
      let parsed: Record<string, unknown>;
      try {
        parsed = snapshot(body, ['challengeId', 'code']);
      } catch {
        throw new HttpFailure(400);
      }
      if (
        !canonical(parsed.challengeId) ||
        typeof parsed.code !== 'string' ||
        !CODE.test(parsed.code)
      )
        throw new HttpFailure(400);
      const names = request.rawHeaders;
      if (
        !Array.isArray(names) ||
        names.length % 2 !== 0 ||
        names.some(
          (h, i) =>
            typeof h !== 'string' ||
            [...h].some(
              (character) =>
                character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
            ) ||
            (i % 2 === 0 &&
              h.toLowerCase() !== 'user-agent' &&
              /(?:origin|nonce|csrf|xsrf|identity|user|identifier|email|phone|contact|mobile|principal|account|household|member|personnummer|auth-method|method|auth-mode|environment|transport|challenge|channel|code|otp|session|api-key|access-token|refresh-token)/i.test(
                h,
              )),
        )
      )
        throw new HttpFailure(400);
      const auth = raw(request, 'authorization'),
        cookies = raw(request, 'cookie'),
        lengths = raw(request, 'content-length');
      if (
        raw(request, 'transfer-encoding').length ||
        cookies.length ||
        auth.length !== 1 ||
        lengths.length !== 1 ||
        !/^[1-9][0-9]*$/.test(lengths[0]!) ||
        Number(lengths[0]) > 4096 ||
        raw(request, 'content-type').length !== 1 ||
        !/^application\/json(?:; charset=utf-8)?$/i.test(
          raw(request, 'content-type')[0]!,
        )
      )
        throw new HttpFailure(400);
      let transport: ReturnType<typeof selectV2CredentialTransport>;
      try {
        transport = selectV2CredentialTransport('verifyV2DeleteOtpReauth', {
          accessCookies: [],
          refreshCookies: [],
          authorizationHeaders: auth,
        });
      } catch {
        throw new HttpFailure(400);
      }
      if (transport !== 'mobile-access-bearer') throw new HttpFailure(400);
      const value = auth[0]!;
      if (!value.startsWith('Bearer ')) throw new HttpFailure(400);
      const token = value.slice(7);
      if (!TOKEN.test(token) || value.length > 4103) throw new HttpFailure(401);
      for (const segment of token.split('.')) {
        const bytes = Buffer.from(segment, 'base64url');
        if (!segment || bytes.toString('base64url') !== segment)
          throw new HttpFailure(401);
      }
      if (!(request.socket instanceof TLSSocket) || request.secure !== true)
        throw new HttpFailure(400);
      const idempotencyKeys = raw(request, 'idempotency-key');
      if (
        idempotencyKeys.length !== 1 ||
        !/^[\x21-\x7e]{16,255}$/.test(idempotencyKeys[0]!)
      )
        throw new HttpFailure(400);
      const initialNow = this.now();
      let verified: unknown;
      try {
        verified = this.verify(token);
      } catch {
        throw new HttpFailure(401);
      }
      let initial: Readonly<V2AccessTokenClaims>;
      try {
        initial = claimsCopy(verified);
      } catch {
        throw new HttpFailure(401);
      }
      const sec = Math.floor(initialNow / 1000);
      if (initial.iat > sec || sec >= initial.exp) throw new HttpFailure(401);
      let pending: unknown;
      try {
        pending = this.authorityResolver.resolve(token);
      } catch {
        throw new HttpFailure(401);
      }
      if (!promise(pending)) throw new HttpFailure(500);
      let authority: TrustedDeletionOtpAuthority;
      try {
        authority = (await pending) as TrustedDeletionOtpAuthority;
      } catch {
        throw new HttpFailure(401);
      }
      const a = snapshot(authority, [
        'identityId',
        'sessionId',
        'identifierHash',
        'channel',
        'transportContext',
      ]);
      const transportContext = snapshot(a.transportContext, ['transport']);
      if (
        a.identityId !== initial.sub ||
        a.sessionId !== initial.sid ||
        typeof a.identifierHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(a.identifierHash) ||
        (a.channel !== 'sms' && a.channel !== 'email') ||
        transportContext.transport !== 'mobile'
      )
        throw new HttpFailure(401);
      const p = Object.freeze({
        identityId: initial.sub,
        sessionId: initial.sid,
      });
      settleToken = token;
      settleClaims = initial;
      settlePrincipal = p;
      const current = this.recheck(token, initial, {
        identityId: p.identityId,
        sessionId: p.sessionId,
      });
      this.throttle(p.identityId, current);

      const authorityDigest = createHmac('sha256', this.key)
        .update('subtrack:v2:deletion-otp-authority:v1\0', 'utf8')
        .update(
          framed([
            p.identityId,
            p.sessionId,
            a.identifierHash,
            a.channel as string,
          ]),
          'utf8',
        )
        .digest('hex');
      const canonicalRequestDigest = createHash('sha256')
        .update(
          JSON.stringify({
            challengeId: parsed.challengeId,
            code: parsed.code,
          }),
          'utf8',
        )
        .digest('hex');
      const authorityAssertion = Object.freeze({
        kind: 'verified-principal' as const,
        digest: authorityDigest,
      }) as TrustedAuthorityDigest<'verified-principal'>;
      reservation = Object.freeze({
        operation,
        transport: 'mobile',
        authority: authorityAssertion,
        canonicalRequestDigest,
        idempotencyKey: idempotencyKeys[0]!,
      });
      this.recheck(token, initial, {
        identityId: p.identityId,
        sessionId: p.sessionId,
      });
      let got: unknown;
      try {
        got = this.reserve(reservation);
      } catch (error) {
        if (error instanceof Error && error.message === 'AUTH_RESTART_REQUIRED')
          throw new HttpFailure(409);
        throw new HttpFailure(500);
      }
      const reservedAt = this.recheck(token, initial, p);
      const g = snapshot(got, ['ownerHandle', 'expiresAt']);
      if (
        !canonical(g.ownerHandle) ||
        !nowValue(g.expiresAt) ||
        g.expiresAt <= reservedAt ||
        g.expiresAt > reservedAt + 86_400_000
      )
        throw new HttpFailure(500);
      owner = { ownerHandle: g.ownerHandle, expiresAt: g.expiresAt };
      this.recheck(token, initial, p);
      let pendingProof: unknown;
      try {
        pendingProof = this.verifyOtp(
          Object.freeze({
            challengeId: parsed.challengeId as string,
            code: parsed.code as string,
            authority,
          }),
        );
      } catch {
        throw new HttpFailure(403);
      }
      if (!promise(pendingProof)) throw new HttpFailure(500);
      let proof: unknown;
      try {
        proof = await pendingProof;
      } catch {
        throw new HttpFailure(403);
      }
      const settledAt = this.recheck(token, initial, p);
      if (
        typeof proof !== 'string' ||
        !proof.startsWith('v2.') ||
        !canonical(proof.slice(3))
      )
        throw new HttpFailure(500);
      if (settledAt >= owner.expiresAt) throw new HttpFailure(500);
      const settleResult = this.settle(
        reservation,
        owner.ownerHandle,
        'completed',
      );
      if (settleResult !== undefined) throw new HttpFailure(500);
      owner = undefined;
      this.recheck(token, initial, p);
      send(200, { reauthProof: proof });
    } catch (error) {
      if (
        reservation &&
        owner &&
        settleToken &&
        settleClaims &&
        settlePrincipal
      ) {
        try {
          this.recheck(settleToken, settleClaims, settlePrincipal);
          this.settle(reservation, owner.ownerHandle, 'failed');
        } catch {
          /* preserve the primary generic outcome */
        }
      }
      try {
        send(error instanceof HttpFailure ? error.status : 500);
      } catch {
        /* the response is uncertain; do not expose a trusted-port error or try again */
      }
    }
  }
}

@Controller('v2/me/reauth/otp')
export class MobileDeletionOtpVerifyHttpController {
  constructor(
    @Inject(DevelopmentMobileDeletionOtpVerifyHttpService)
    private readonly service: DevelopmentMobileDeletionOtpVerifyHttpService,
  ) {}
  @Post('verify') verify(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.service.handle(body, request, response);
  }
}
