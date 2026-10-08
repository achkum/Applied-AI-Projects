import { createHash, createHmac } from 'node:crypto';
import { types } from 'node:util';
import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  extractV2BrowserEvidence,
  type V2BrowserEvidence,
} from '../http/v2-browser-context.js';
import { hashBrowserBindingCookie } from './v2-web-session-binding.js';
import { OriginThrottle } from '../browser-nonce/browser-nonce-http.js';
import type { BrowserNonceGuard } from '../browser-nonce/browser-nonce.js';
import type {
  IdempotencyReservationInput,
  IdempotencyReservationRepository,
  TrustedAuthorityDigest,
} from '../idempotency/idempotency-guard.js';
import type {
  SessionCsrfGuard,
  VerifiedWebSessionAuthority,
} from '../session-csrf/session-csrf.js';
import type { DevelopmentV2PrincipalResolver } from './v2-principal-resolver.js';
import type {
  DevelopmentV2SessionIssuer,
  SessionRecord,
  SessionRepository,
} from './v2-session-issuer.js';

const unavailable = (status: number, code: string) =>
  Object.freeze({
    type: 'about:blank',
    title:
      status === 409
        ? 'Conflict'
        : status === 401
          ? 'Unauthorized'
          : status === 429
            ? 'Too Many Requests'
            : status === 400
              ? 'Bad Request'
              : 'Internal Server Error',
    status,
    code,
  });
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_CHARS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const IDEM = /^[\x21-\x7e]{16,255}$/;
type WebContext = Readonly<{
  transport: 'web';
  exactOrigin: string;
  browserChainId: string;
}>;
type SafeResponse = Readonly<{
  transport: 'web';
  sessionId: string;
  csrfToken: string;
}>;
type TrustedConfig = Readonly<{
  environment: 'development';
  enabled: true;
  allowedOrigins: readonly string[];
  bindingCookieName: string;
  authorityHmacKey: Uint8Array;
  nonce: Pick<BrowserNonceGuard, 'validateBound' | 'consumeForSession'>;
  issuer: Pick<DevelopmentV2SessionIssuer, 'issueFromLoginProof'>;
  principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  repository: Pick<
    SessionRepository,
    'readSession' | 'rollbackCreatedSession'
  > &
    Required<Pick<SessionRepository, 'webContextForCurrentSession'>>;
  csrf: Pick<SessionCsrfGuard, 'mint' | 'invalidate'>;
  idempotency: IdempotencyReservationRepository;
  clock?: () => number;
}>;
export type V2WebSessionHttpConfig = TrustedConfig;
function fail(): never {
  throw new Error('V2 web session unavailable');
}
function copyObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return fail();
  const keys = Reflect.ownKeys(value);
  if (
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        (!required.includes(key) && !optional.includes(key)),
    ) ||
    required.some((key) => !keys.includes(key))
  )
    return fail();
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) return fail();
    copy[key] = d.value;
  }
  return copy;
}
function method(target: unknown, key: string): (...args: never[]) => unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    return fail();
  let current: object | null = target;
  while (current) {
    const d = Object.getOwnPropertyDescriptor(current, key);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function') return fail();
      return Function.prototype.bind.call(d.value, target) as (
        ...args: never[]
      ) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return fail();
}
function frame(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`;
}
function rawValues(request: Request, name: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i]?.toLowerCase() === name)
      result.push(request.rawHeaders[i + 1] ?? '');
  return result;
}
function noStore(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}
function nativePromise(value: unknown): value is Promise<unknown> {
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
function validClock(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER - 86_400_000 &&
    Number.isFinite(new Date(value).getTime())
  );
}
function canonicalOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      u.origin === value &&
      !u.username &&
      !u.password &&
      u.pathname === '/' &&
      !u.search &&
      !u.hash &&
      !u.hostname.includes('*')
    );
  } catch {
    return false;
  }
}
function canonicalSecret(value: unknown, prefix = ''): value is string {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return false;
  const encoded = value.slice(prefix.length);
  if (!TOKEN.test(encoded)) return false;
  try {
    const bytes = Buffer.from(encoded, 'base64url');
    return bytes.length === 32 && bytes.toString('base64url') === encoded;
  } catch {
    return false;
  }
}
function snapshotRecord(value: unknown): Readonly<SessionRecord> {
  const v = copyObject(
    value,
    [
      'identityId',
      'sessionId',
      'familyId',
      'generation',
      'refreshTokenHash',
      'transport',
      'deviceName',
      'createdAt',
      'expiresAt',
    ],
    ['exactOrigin', 'browserChainId', 'browserBindingCookieHash'],
  );
  if (
    typeof v.identityId !== 'string' ||
    !UUID.test(v.identityId) ||
    typeof v.sessionId !== 'string' ||
    !UUID.test(v.sessionId) ||
    typeof v.familyId !== 'string' ||
    !UUID.test(v.familyId) ||
    v.sessionId === v.familyId ||
    v.generation !== 0 ||
    typeof v.refreshTokenHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.refreshTokenHash) ||
    (v.transport !== 'web' && v.transport !== 'mobile') ||
    v.deviceName !== null ||
    !Number.isSafeInteger(v.createdAt) ||
    !Number.isSafeInteger(v.expiresAt) ||
    (v.expiresAt as number) !== (v.createdAt as number) + 86_400_000
  )
    return fail();
  if (
    v.transport !== 'web' ||
    typeof v.exactOrigin !== 'string' ||
    typeof v.browserChainId !== 'string' ||
    typeof v.browserBindingCookieHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.browserBindingCookieHash) ||
    !Number.isSafeInteger(v.createdAt) ||
    (v.createdAt as number) < 0 ||
    !Number.isSafeInteger(v.expiresAt) ||
    (v.expiresAt as number) !== (v.createdAt as number) + 86_400_000
  )
    return fail();
  return Object.freeze({ ...v }) as unknown as Readonly<SessionRecord>;
}
export class V2WebSessionHttpService {
  private readonly origins: readonly string[];
  private readonly bindingCookieName: string;
  private readonly key: Buffer;
  private readonly clock: () => number;
  private readonly throttle: OriginThrottle;
  private readonly nonce: TrustedConfig['nonce'];
  private readonly issuer: TrustedConfig['issuer'];
  private readonly principal: TrustedConfig['principal'];
  private readonly repository: TrustedConfig['repository'];
  private readonly csrf: TrustedConfig['csrf'];
  private readonly idempotency: IdempotencyReservationRepository;
  constructor(configInput: V2WebSessionHttpConfig) {
    const c = copyObject(
      configInput,
      [
        'environment',
        'enabled',
        'allowedOrigins',
        'bindingCookieName',
        'authorityHmacKey',
        'nonce',
        'issuer',
        'principal',
        'repository',
        'csrf',
        'idempotency',
      ],
      ['clock'],
    );
    if (
      c.environment !== 'development' ||
      c.enabled !== true ||
      !Array.isArray(c.allowedOrigins) ||
      typeof c.bindingCookieName !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(c.bindingCookieName) ||
      ['st_v2_access', 'st_v2_refresh'].includes(c.bindingCookieName) ||
      !(c.authorityHmacKey instanceof Uint8Array) ||
      c.authorityHmacKey.byteLength !== 32 ||
      (Object.hasOwn(c, 'clock') && typeof c.clock !== 'function')
    )
      fail();
    const originInput = c.allowedOrigins as unknown[];
    const originKeys = Reflect.ownKeys(originInput);
    if (
      originKeys.length !== originInput.length + 1 ||
      originKeys.some(
        (key) =>
          key !== 'length' &&
          (typeof key !== 'string' ||
            !/^(0|[1-9][0-9]*)$/.test(key) ||
            Number(key) >= originInput.length),
      )
    )
      fail();
    const inputOrigins = Array.from(
      { length: originInput.length },
      (_, index) => {
        const d = Object.getOwnPropertyDescriptor(originInput, String(index));
        if (
          !d ||
          !('value' in d) ||
          !d.enumerable ||
          typeof d.value !== 'string' ||
          !canonicalOrigin(d.value)
        )
          return fail();
        return d.value;
      },
    );
    if (
      !inputOrigins.length ||
      new Set(inputOrigins).size !== inputOrigins.length
    )
      fail();
    this.origins = Object.freeze(inputOrigins);
    this.bindingCookieName = c.bindingCookieName as string;
    this.key = Buffer.from(c.authorityHmacKey);
    this.clock =
      typeof c.clock === 'function' ? (c.clock as () => number) : Date.now;
    this.nonce = Object.freeze({
      validateBound: method(c.nonce, 'validateBound'),
      consumeForSession: method(c.nonce, 'consumeForSession'),
    }) as unknown as TrustedConfig['nonce'];
    this.issuer = Object.freeze({
      issueFromLoginProof: method(c.issuer, 'issueFromLoginProof'),
    }) as unknown as TrustedConfig['issuer'];
    this.principal = Object.freeze({
      resolve: method(c.principal, 'resolve'),
    }) as unknown as TrustedConfig['principal'];
    this.repository = Object.freeze({
      readSession: method(c.repository, 'readSession'),
      webContextForCurrentSession: method(
        c.repository,
        'webContextForCurrentSession',
      ),
      rollbackCreatedSession: method(c.repository, 'rollbackCreatedSession'),
    }) as unknown as TrustedConfig['repository'];
    this.csrf = Object.freeze({
      mint: method(c.csrf, 'mint'),
      invalidate: method(c.csrf, 'invalidate'),
    }) as unknown as TrustedConfig['csrf'];
    this.idempotency = Object.freeze({
      reserve: method(c.idempotency, 'reserve'),
      settle: method(c.idempotency, 'settle'),
    }) as unknown as IdempotencyReservationRepository;
    this.throttle = new OriginThrottle(this.origins, this.clock);
  }
  async handle(
    body: unknown,
    idemHeader: string | undefined,
    nonceHeader: string | undefined,
    request: Request,
    response: Response,
  ): Promise<void> {
    noStore(response);
    let reservation: IdempotencyReservationInput | undefined;
    let ownerHandle: string | undefined;
    let record: Readonly<SessionRecord> | undefined;
    let authority: VerifiedWebSessionAuthority | undefined;
    let headersPublished = false;
    let stage: 'request' | 'nonce' | 'postcommit' = 'request';
    const failResponse = (status: number, code: string) => {
      if (!response.headersSent)
        response
          .status(status)
          .type('application/problem+json')
          .send(unavailable(status, code));
    };
    try {
      const csrfHeaders = ['x-csrf-token', 'csrf-token', 'x-session-csrf'];
      if (
        request.originalUrl.includes('?') ||
        rawValues(request, 'authorization').length ||
        csrfHeaders.some((h) => rawValues(request, h).length)
      ) {
        failResponse(400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      const idems = rawValues(request, 'idempotency-key'),
        nonces = rawValues(request, 'x-browser-nonce');
      if (
        idems.length !== 1 ||
        idems[0] !== idemHeader ||
        !idemHeader ||
        !IDEM.test(idemHeader) ||
        nonces.length !== 1 ||
        nonces[0] !== nonceHeader ||
        !canonicalSecret(nonceHeader)
      ) {
        failResponse(400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = copyObject(body, ['transport', 'loginProof']);
      } catch {
        failResponse(400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      if (
        parsed.transport !== 'web' ||
        !canonicalSecret(parsed.loginProof, 'v2.')
      ) {
        failResponse(400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      let evidence: V2BrowserEvidence;
      try {
        evidence = extractV2BrowserEvidence(request, {
          allowedOrigins: this.origins,
          bindingCookieName: this.bindingCookieName,
          allowLoopbackHttpDevelopment: false,
        });
      } catch {
        failResponse(400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      if (
        !evidence.isHttps ||
        !evidence.origin ||
        !this.origins.includes(evidence.origin) ||
        !evidence.bindingCookie ||
        !canonicalSecret(evidence.bindingCookie)
      ) {
        failResponse(400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      if (!this.throttle.take(evidence.origin)) {
        failResponse(429, 'AUTH_RESTART_REQUIRED');
        return;
      }
      const bindingHash = hashBrowserBindingCookie(evidence.bindingCookie);
      stage = 'nonce';
      const preflight = copyObject(
        this.nonce.validateBound(
          'session',
          evidence,
          nonceHeader,
          evidence.bindingCookie,
        ),
        ['chainId', 'origin', 'purpose'],
      );
      if (
        typeof preflight.chainId !== 'string' ||
        !preflight.chainId ||
        preflight.origin !== evidence.origin ||
        preflight.purpose !== 'session'
      ) {
        failResponse(409, 'AUTH_RESTART_REQUIRED');
        return;
      }
      const context: WebContext = Object.freeze({
        transport: 'web',
        exactOrigin: preflight.origin as string,
        browserChainId: preflight.chainId,
      });
      const authorityDigest = createHmac('sha256', this.key)
        .update('subtrack:v2:web-session:authority:v1:', 'utf8')
        .update(
          frame(context.browserChainId) + frame(context.exactOrigin),
          'utf8',
        )
        .digest('hex');
      const requestDigest = createHash('sha256')
        .update('subtrack:v2:web-session:request:v1:', 'utf8')
        .update(frame('web') + frame(parsed.loginProof as string), 'utf8')
        .digest('hex');
      const trustedAuthority = Object.freeze({
        kind: 'browser-chain',
        digest: authorityDigest,
      }) as TrustedAuthorityDigest<'browser-chain'>;
      reservation = Object.freeze({
        operation: 'createV2Session',
        transport: 'web',
        authority: trustedAuthority,
        canonicalRequestDigest: requestDigest,
        idempotencyKey: idemHeader,
      });
      const owner = copyObject(this.idempotency.reserve(reservation), [
        'ownerHandle',
        'expiresAt',
      ]);
      if (!canonicalSecret(owner.ownerHandle) || !validClock(owner.expiresAt))
        fail();
      ownerHandle = owner.ownerHandle as string;
      const consumedContext = copyObject(
        this.nonce.consumeForSession(
          evidence,
          nonceHeader,
          evidence.bindingCookie,
        ),
        ['chainId', 'origin', 'purpose'],
      );
      stage = 'postcommit';
      if (
        consumedContext.chainId !== context.browserChainId ||
        consumedContext.origin !== context.exactOrigin ||
        consumedContext.purpose !== 'session'
      )
        throw new Error('preflight');
      const beforeIssue = this.readClock();
      let rawIssued: unknown;
      try {
        rawIssued = this.issuer.issueFromLoginProof({
          loginProof: parsed.loginProof,
          transportContext: context,
          browserBindingCookieHash: bindingHash,
        });
      } catch {
        try {
          this.idempotency.settle(reservation, ownerHandle, 'failed');
        } catch {
          /* remain burned */
        }
        failResponse(401, 'AUTH_SESSION_UNAVAILABLE');
        return;
      }
      if (!nativePromise(rawIssued)) throw new Error('issuer promise');
      let issuedValue: unknown;
      try {
        issuedValue = await rawIssued;
      } catch {
        try {
          this.idempotency.settle(reservation, ownerHandle, 'failed');
        } catch {
          /* remain burned */
        }
        failResponse(401, 'AUTH_SESSION_UNAVAILABLE');
        return;
      }
      const issued = copyObject(issuedValue, [
        'sessionId',
        'accessToken',
        'refreshToken',
      ]);
      if (
        typeof issued.sessionId !== 'string' ||
        !UUID.test(issued.sessionId) ||
        typeof issued.accessToken !== 'string' ||
        issued.accessToken.length > 4096 ||
        !ACCESS_CHARS.test(issued.accessToken) ||
        typeof issued.refreshToken !== 'string' ||
        !canonicalSecret(issued.refreshToken, 'v2r.')
      )
        throw new Error('issued');
      const accessParts = (issued.accessToken as string).split('.');
      if (
        accessParts.length !== 3 ||
        !accessParts.every((x) => canonicalB64(x)) ||
        Buffer.from(accessParts[2]!, 'base64url').length !== 64
      )
        throw new Error('token');
      const rawPrincipal = this.principal.resolve(
        issued.accessToken as string,
        context,
      );
      if (!nativePromise(rawPrincipal)) throw new Error('principal promise');
      const principal = copyObject(await rawPrincipal, [
        'identityId',
        'sessionId',
      ]);
      if (
        typeof principal.identityId !== 'string' ||
        !UUID.test(principal.identityId) ||
        principal.sessionId !== issued.sessionId
      )
        throw new Error('principal');
      const now = this.readClock();
      if (now < beforeIssue) throw new Error('clock rewind');
      const ownerContext = Object.freeze({
        userId: principal.identityId as string,
      });
      const stored = snapshotRecord(
        this.repository.readSession(
          issued.sessionId as string,
          ownerContext,
          now,
        ),
      );
      const refreshHash = createHash('sha256')
        .update('subtrack:auth-refresh:v2:', 'utf8')
        .update(issued.refreshToken as string, 'utf8')
        .digest('hex');
      if (
        stored.identityId !== principal.identityId ||
        stored.sessionId !== issued.sessionId ||
        stored.refreshTokenHash !== refreshHash ||
        stored.transport !== 'web' ||
        stored.exactOrigin !== context.exactOrigin ||
        stored.browserChainId !== context.browserChainId ||
        stored.browserBindingCookieHash !== bindingHash ||
        stored.createdAt > now ||
        now >= stored.expiresAt
      )
        throw new Error('row');
      const webContext = copyObject(
        this.repository.webContextForCurrentSession(
          issued.sessionId as string,
          ownerContext,
          bindingHash,
          context.exactOrigin,
          now,
        ),
        ['transport', 'exactOrigin', 'browserChainId'],
      );
      if (
        webContext.transport !== 'web' ||
        webContext.exactOrigin !== context.exactOrigin ||
        webContext.browserChainId !== context.browserChainId
      )
        throw new Error('context');
      record = stored;
      authority = Object.freeze({
        identityId: principal.identityId as string,
        sessionId: issued.sessionId as string,
      }) as VerifiedWebSessionAuthority;
      const csrfToken = this.csrf.mint(authority);
      if (!canonicalSecret(csrfToken)) throw new Error('csrf');
      const payload: SafeResponse = Object.freeze({
        transport: 'web',
        sessionId: issued.sessionId as string,
        csrfToken,
      });
      const accessCookie = `st_v2_access=${issued.accessToken}; Path=/v2; Secure; HttpOnly; SameSite=Lax`;
      const refreshCookie = `st_v2_refresh=${issued.refreshToken}; Path=/v2/auth; Secure; HttpOnly; SameSite=Lax`;
      const cookies = Object.freeze([accessCookie, refreshCookie]);
      const finalNow = this.readClock();
      if (finalNow < now || finalNow >= stored.expiresAt)
        throw new Error('stale');
      const finalRow = snapshotRecord(
        this.repository.readSession(stored.sessionId, ownerContext, finalNow),
      );
      if (
        finalRow.identityId !== stored.identityId ||
        finalRow.sessionId !== stored.sessionId ||
        finalRow.familyId !== stored.familyId ||
        finalRow.refreshTokenHash !== stored.refreshTokenHash ||
        finalRow.transport !== 'web' ||
        finalRow.exactOrigin !== context.exactOrigin ||
        finalRow.browserChainId !== context.browserChainId ||
        finalRow.browserBindingCookieHash !== bindingHash ||
        finalRow.createdAt !== stored.createdAt ||
        finalRow.expiresAt !== stored.expiresAt ||
        finalNow >= finalRow.expiresAt
      )
        throw new Error('stale');
      this.idempotency.settle(reservation, ownerHandle, 'completed');
      response.setHeader('Set-Cookie', cookies as unknown as string[]);
      headersPublished = true;
      response.status(201).type('application/json').send(payload);
    } catch {
      if (response.headersSent) return;
      if (headersPublished) {
        try {
          response.removeHeader('Set-Cookie');
        } catch {
          /* best effort */
        }
      }
      if (authority) {
        try {
          this.csrf.invalidate(authority);
        } catch {
          /* exact authority only */
        }
      }
      if (record) {
        try {
          const rollback = this.repository.rollbackCreatedSession(record, {
            userId: record.identityId,
          });
          if (nativePromise(rollback)) await rollback;
        } catch {
          /* exact row only */
        }
      }
      if (reservation && ownerHandle) {
        try {
          this.idempotency.settle(reservation, ownerHandle, 'failed');
        } catch {
          /* reservation remains burned */
        }
      }
      try {
        response.removeHeader('Set-Cookie');
      } catch {
        /* best effort */
      }
      failResponse(
        stage === 'request' ? 400 : stage === 'nonce' ? 409 : 500,
        stage === 'nonce'
          ? 'AUTH_RESTART_REQUIRED'
          : stage === 'request'
            ? 'AUTH_REQUEST_UNAVAILABLE'
            : 'AUTH_SESSION_UNAVAILABLE',
      );
    }
  }
  private readClock(): number {
    const now = this.clock();
    if (!validClock(now)) fail();
    return now;
  }
}
function canonicalB64(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const b = Buffer.from(value, 'base64url');
    return b.toString('base64url') === value;
  } catch {
    return false;
  }
}
@Controller('v2/auth/session')
export class V2WebSessionHttpController {
  constructor(
    @Inject(V2WebSessionHttpService)
    private readonly service: V2WebSessionHttpService,
  ) {}
  @Post()
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-browser-nonce') nonce: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.service.handle(body, key, nonce, request, response);
  }
}
export function v2WebSessionNoStore(
  request: Request,
  response: Response,
  next: (error?: unknown) => void,
): void {
  const path = request.originalUrl.split('?', 1)[0] ?? '';
  if (path === '/v2/auth/session' || path.startsWith('/v2/auth/session/'))
    noStore(response);
  next();
}
