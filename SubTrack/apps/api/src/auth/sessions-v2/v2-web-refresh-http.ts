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
import { OriginThrottle } from '../browser-nonce/browser-nonce-http.js';
import { hashBrowserBindingCookie } from './v2-web-session-binding.js';
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
import type { DevelopmentV2SessionRefresher } from './v2-session-refresher.js';
import type {
  RotatedFamilyExpectation,
  SessionRecord,
  SessionRepository,
  SessionRequestContext,
  WebRefreshCredentialContext,
} from './v2-session-issuer.js';

const FAILURE = 'V2 web refresh unavailable';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const IDEM = /^[\x21-\x7e]{16,255}$/;
const HASH = /^[a-f0-9]{64}$/;
const TTL = 86_400_000;

type Config = Readonly<{
  environment: 'development';
  enabled: true;
  allowedOrigins: readonly string[];
  bindingCookieName: string;
  authorityHmacKey: Uint8Array;
  refresher: Pick<DevelopmentV2SessionRefresher, 'refresh'>;
  principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  repository: Required<
    Pick<SessionRepository, 'webContextForRefresh' | 'readSession'>
  > & {
    revokeRotatedFamily(
      expected: RotatedFamilyExpectation,
      context: Readonly<SessionRequestContext>,
    ): boolean | Promise<boolean>;
  };
  csrf: Pick<SessionCsrfGuard, 'verify' | 'mint' | 'invalidate'>;
  idempotency: IdempotencyReservationRepository;
  clock?: () => number;
}>;
export type V2WebRefreshHttpConfig = Config;
type Snapshot = Record<string, unknown>;
function fail(): never {
  throw new Error(FAILURE);
}
function copy(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Snapshot {
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
      (k) =>
        typeof k !== 'string' ||
        (!required.includes(k) && !optional.includes(k)),
    ) ||
    required.some((k) => !keys.includes(k))
  )
    return fail();
  const out = Object.create(null) as Snapshot;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) return fail();
    out[key] = d.value;
  }
  return out;
}
function method(
  target: unknown,
  name: string,
): (...args: unknown[]) => unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    return fail();
  let current: object | null = target;
  while (current) {
    const d = Object.getOwnPropertyDescriptor(current, name);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function') return fail();
      return Function.prototype.bind.call(d.value, target) as (
        ...args: unknown[]
      ) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return fail();
}
function frame(s: string): string {
  return `${Buffer.byteLength(s, 'utf8')}:${s}`;
}
function raw(request: Request, name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i]?.toLowerCase() === name)
      out.push(request.rawHeaders[i + 1] ?? '');
  return out;
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
function clockValid(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isSafeInteger(n) &&
    n >= 0 &&
    n <= Number.MAX_SAFE_INTEGER - TTL &&
    Number.isFinite(new Date(n).getTime())
  );
}
function originValid(s: unknown): s is string {
  if (typeof s !== 'string' || !s || s.trim() !== s) return false;
  try {
    const u = new URL(s);
    return (
      u.protocol === 'https:' &&
      u.origin === s &&
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
function secret(s: unknown, prefix = ''): s is string {
  if (typeof s !== 'string' || !s.startsWith(prefix)) return false;
  const b64 = s.slice(prefix.length);
  if (!TOKEN.test(b64)) return false;
  const bytes = Buffer.from(b64, 'base64url');
  return bytes.byteLength === 32 && bytes.toString('base64url') === b64;
}
function canonicalAccess(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 4096 || !ACCESS.test(s)) return false;
  return (
    s.split('.').every((part) => {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) return false;
      const b = Buffer.from(part, 'base64url');
      return b.toString('base64url') === part;
    }) && Buffer.from(s.split('.')[2]!, 'base64url').byteLength === 64
  );
}
function record(value: unknown): Readonly<SessionRecord> {
  const v = copy(
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
    !HASH.test(v.refreshTokenHash) ||
    v.transport !== 'web' ||
    v.deviceName !== null ||
    !clockValid(v.createdAt) ||
    !Number.isSafeInteger(v.expiresAt) ||
    !Number.isFinite(new Date(v.expiresAt as number).getTime()) ||
    v.expiresAt !== (v.createdAt as number) + TTL ||
    !originValid(v.exactOrigin) ||
    typeof v.browserChainId !== 'string' ||
    !v.browserChainId ||
    typeof v.browserBindingCookieHash !== 'string' ||
    !HASH.test(v.browserBindingCookieHash)
  )
    return fail();
  return Object.freeze({ ...v }) as unknown as Readonly<SessionRecord>;
}
function cookieValue(request: Request, name: string): string | null {
  let found: string | null = null;
  let count = 0;
  for (const header of raw(request, 'cookie'))
    for (const part0 of header.split(';')) {
      const part = part0.replace(/^[\t ]+/, '');
      const equal = part.indexOf('=');
      const key = equal < 0 ? part : part.slice(0, equal);
      if (key !== name && key.trim() !== name) continue;
      count++;
      if (equal < 0 || key !== name) return fail();
      const value = part.slice(equal + 1);
      if (!/^[\x21-\x7e]+$/.test(value) || /[;,"'\\]/.test(value))
        return fail();
      found = value;
    }
  if (count > 1) return fail();
  return found;
}
function snapshotScope(value: unknown): Readonly<WebRefreshCredentialContext> {
  const v = copy(value, ['identityId', 'sessionId', 'transportContext']);
  if (
    typeof v.identityId !== 'string' ||
    !UUID.test(v.identityId) ||
    typeof v.sessionId !== 'string' ||
    !UUID.test(v.sessionId)
  )
    return fail();
  const t = copy(v.transportContext, [
    'transport',
    'exactOrigin',
    'browserChainId',
  ]);
  if (
    t.transport !== 'web' ||
    !originValid(t.exactOrigin) ||
    typeof t.browserChainId !== 'string' ||
    !t.browserChainId
  )
    return fail();
  return Object.freeze({
    identityId: v.identityId,
    sessionId: v.sessionId,
    transportContext: Object.freeze({
      transport: 'web',
      exactOrigin: t.exactOrigin as string,
      browserChainId: t.browserChainId,
    }),
  });
}
function title(status: number): string {
  return status === 400
    ? 'Bad Request'
    : status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : status === 409
          ? 'Conflict'
          : status === 429
            ? 'Too Many Requests'
            : 'Internal Server Error';
}
function problem(response: Response, status: number, code: string): void {
  if (!response.headersSent)
    response
      .status(status)
      .type('application/problem+json')
      .send({ type: 'about:blank', title: title(status), status, code });
}

export class V2WebRefreshHttpService {
  private readonly origins: readonly string[];
  private readonly bindingName: string;
  private readonly key: Buffer;
  private readonly clock: () => number;
  private readonly throttle: OriginThrottle;
  private readonly refresh: (...args: unknown[]) => unknown;
  private readonly resolve: (...args: unknown[]) => unknown;
  private readonly webScope: (...args: unknown[]) => unknown;
  private readonly read: (...args: unknown[]) => unknown;
  private readonly revoke: (...args: unknown[]) => unknown;
  private readonly verify: (...args: unknown[]) => unknown;
  private readonly mint: (...args: unknown[]) => unknown;
  private readonly invalidate: (...args: unknown[]) => unknown;
  private readonly reserve: (...args: unknown[]) => unknown;
  private readonly settle: (...args: unknown[]) => unknown;
  constructor(input: V2WebRefreshHttpConfig) {
    const c = copy(
      input,
      [
        'environment',
        'enabled',
        'allowedOrigins',
        'bindingCookieName',
        'authorityHmacKey',
        'refresher',
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
    const a = c.allowedOrigins as unknown[];
    if (Reflect.ownKeys(a).length !== a.length + 1) fail();
    const origins: string[] = [];
    for (let i = 0; i < a.length; i++) {
      const d = Object.getOwnPropertyDescriptor(a, String(i));
      if (!d || !('value' in d) || !d.enumerable || !originValid(d.value))
        fail();
      origins.push(d.value);
    }
    if (!origins.length || new Set(origins).size !== origins.length) fail();
    this.origins = Object.freeze(origins);
    this.bindingName = c.bindingCookieName as string;
    this.key = Buffer.from(c.authorityHmacKey as Uint8Array);
    this.clock = (c.clock as (() => number) | undefined) ?? Date.now;
    this.throttle = new OriginThrottle(this.origins, this.clock);
    this.refresh = method(c.refresher, 'refresh');
    this.resolve = method(c.principal, 'resolve');
    this.webScope = method(c.repository, 'webContextForRefresh');
    this.read = method(c.repository, 'readSession');
    this.revoke = method(c.repository, 'revokeRotatedFamily');
    this.verify = method(c.csrf, 'verify');
    this.mint = method(c.csrf, 'mint');
    this.invalidate = method(c.csrf, 'invalidate');
    this.reserve = method(c.idempotency, 'reserve');
    this.settle = method(c.idempotency, 'settle');
  }
  async handle(
    body: unknown,
    idemHeader: string | undefined,
    csrfHeader: string | undefined,
    request: Request,
    response: Response,
  ): Promise<void> {
    noStore(response);
    let reservation: IdempotencyReservationInput | undefined;
    let owner: string | undefined;
    let csrfAuthority: VerifiedWebSessionAuthority | undefined;
    let cleanup:
      | Readonly<{
          identityId: string;
          sessionId: string;
          familyId: string;
          refreshTokenHash: string;
        }>
      | undefined;
    let committed = false;
    let stage:
      'request' | 'scope' | 'csrf' | 'reserve' | 'refresh' | 'postcommit' =
      'request';
    try {
      if (
        request.originalUrl.includes('?') ||
        body !== undefined ||
        raw(request, 'transfer-encoding').length > 0 ||
        raw(request, 'authorization').length ||
        raw(request, 'x-browser-nonce').length ||
        raw(request, 'x-csrf-token').length ||
        raw(request, 'csrf-token').length ||
        raw(request, 'x-session-csrf').length !== 1 ||
        raw(request, 'idempotency-key').length !== 1 ||
        raw(request, 'idempotency-key')[0] !== idemHeader ||
        raw(request, 'x-session-csrf')[0] !== csrfHeader ||
        !idemHeader ||
        !IDEM.test(idemHeader) ||
        !secret(csrfHeader)
      ) {
        problem(response, 400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      const lengths = raw(request, 'content-length');
      if (lengths.length > 1 || (lengths.length === 1 && lengths[0] !== '0')) {
        problem(response, 400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      let evidence: V2BrowserEvidence;
      try {
        evidence = extractV2BrowserEvidence(request, {
          allowedOrigins: this.origins,
          bindingCookieName: this.bindingName,
          allowLoopbackHttpDevelopment: false,
        });
      } catch {
        problem(response, 400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      if (
        !evidence.isHttps ||
        !evidence.origin ||
        !this.origins.includes(evidence.origin) ||
        !evidence.bindingCookie ||
        !secret(evidence.bindingCookie)
      ) {
        problem(response, 400, 'AUTH_REQUEST_UNAVAILABLE');
        return;
      }
      const refreshToken = cookieValue(request, 'st_v2_refresh');
      if (!refreshToken || !secret(refreshToken, 'v2r.')) {
        problem(response, 401, 'AUTH_SESSION_UNAVAILABLE');
        return;
      }
      // An access cookie may naturally accompany the refresh request; it never contributes authority.
      const refreshHash = createHash('sha256')
        .update('subtrack:auth-refresh:v2:', 'utf8')
        .update(refreshToken, 'utf8')
        .digest('hex');
      const bindingHash = hashBrowserBindingCookie(evidence.bindingCookie);
      const observedAt = this.readClock();
      if (!this.throttle.take(evidence.origin)) {
        problem(response, 429, 'AUTH_RESTART_REQUIRED');
        return;
      }
      stage = 'scope';
      const scope = snapshotScope(
        this.webScope(refreshHash, bindingHash, evidence.origin, observedAt),
      );
      if (scope.transportContext.exactOrigin !== evidence.origin) {
        problem(response, 401, 'AUTH_SESSION_UNAVAILABLE');
        return;
      }
      const auth = Object.freeze({
        identityId: scope.identityId,
        sessionId: scope.sessionId,
      }) as VerifiedWebSessionAuthority;
      stage = 'csrf';
      try {
        if (this.verify(auth, csrfHeader) !== undefined) fail();
      } catch {
        problem(response, 403, 'AUTH_CSRF_UNAVAILABLE');
        return;
      }
      const authorityDigest = createHmac('sha256', this.key)
        .update('subtrack:v2:web-refresh:authority:v1:', 'utf8')
        .update(
          frame(scope.transportContext.browserChainId) +
            frame(evidence.origin) +
            frame(scope.identityId) +
            frame(scope.sessionId),
          'utf8',
        )
        .digest('hex');
      const requestDigest = createHash('sha256')
        .update('subtrack:v2:web-refresh:request:v1:', 'utf8')
        .update(
          frame('refreshV2Session') + frame('web') + frame(refreshHash),
          'utf8',
        )
        .digest('hex');
      const trustedAuthority = Object.freeze({
        kind: 'browser-chain',
        digest: authorityDigest,
      }) as TrustedAuthorityDigest<'browser-chain'>;
      reservation = Object.freeze({
        operation: 'refreshV2Session',
        transport: 'web',
        authority: trustedAuthority,
        canonicalRequestDigest: requestDigest,
        idempotencyKey: idemHeader,
      });
      stage = 'reserve';
      let rawOwner: unknown;
      try {
        rawOwner = this.reserve(reservation);
      } catch {
        problem(response, 409, 'AUTH_RESTART_REQUIRED');
        return;
      }
      const reserved = copy(rawOwner, ['ownerHandle', 'expiresAt']);
      if (
        !secret(reserved.ownerHandle) ||
        !clockValid(reserved.expiresAt) ||
        reserved.expiresAt <= observedAt ||
        reserved.expiresAt > observedAt + TTL
      )
        fail();
      owner = reserved.ownerHandle as string;
      stage = 'refresh';
      let rawResult: unknown;
      try {
        rawResult = this.refresh({
          refreshToken,
          transportContext: scope.transportContext,
        });
      } catch {
        try {
          this.settle(reservation, owner, 'failed');
        } catch {
          /* reservation stays burned */
        }
        problem(response, 401, 'AUTH_SESSION_UNAVAILABLE');
        return;
      }
      stage = 'postcommit';
      if (!nativePromise(rawResult)) fail();
      let fulfilled: unknown;
      try {
        fulfilled = await rawResult;
      } catch {
        try {
          this.settle(reservation, owner, 'failed');
        } catch {
          /* reservation stays burned */
        }
        problem(response, 401, 'AUTH_SESSION_UNAVAILABLE');
        return;
      }
      const result = copy(fulfilled, [
        'sessionId',
        'accessToken',
        'refreshToken',
      ]);
      if (
        typeof result.sessionId !== 'string' ||
        !UUID.test(result.sessionId) ||
        !canonicalAccess(result.accessToken) ||
        !secret(result.refreshToken, 'v2r.')
      )
        fail();
      const nextHash = createHash('sha256')
        .update('subtrack:auth-refresh:v2:', 'utf8')
        .update(result.refreshToken as string, 'utf8')
        .digest('hex');
      stage = 'postcommit';
      const principalPromise = this.resolve(
        result.accessToken,
        scope.transportContext,
      );
      if (!nativePromise(principalPromise)) fail();
      const principal = copy(await principalPromise, [
        'identityId',
        'sessionId',
      ]);
      if (
        principal.identityId !== scope.identityId ||
        principal.sessionId !== scope.sessionId ||
        result.sessionId !== scope.sessionId
      )
        fail();
      const now = this.readClock();
      if (now < observedAt) fail();
      const context = Object.freeze({ userId: scope.identityId });
      const row = record(this.read(scope.sessionId, context, now));
      if (
        row.identityId !== scope.identityId ||
        row.sessionId !== scope.sessionId ||
        row.refreshTokenHash !== nextHash ||
        row.transport !== 'web' ||
        row.exactOrigin !== evidence.origin ||
        row.browserChainId !== scope.transportContext.browserChainId ||
        row.browserBindingCookieHash !== bindingHash ||
        row.createdAt > now ||
        now >= row.expiresAt
      )
        fail();
      cleanup = Object.freeze({
        identityId: row.identityId,
        sessionId: row.sessionId,
        familyId: row.familyId,
        refreshTokenHash: nextHash,
      });
      const newAuthority = Object.freeze({
        identityId: principal.identityId as string,
        sessionId: principal.sessionId as string,
      }) as VerifiedWebSessionAuthority;
      csrfAuthority = newAuthority;
      const csrfToken = this.mint(newAuthority);
      if (!secret(csrfToken)) fail();
      const finalNow = this.readClock();
      if (finalNow < now || finalNow >= row.expiresAt) fail();
      const finalRow = record(this.read(row.sessionId, context, finalNow));
      if (
        finalRow.identityId !== row.identityId ||
        finalRow.sessionId !== row.sessionId ||
        finalRow.familyId !== row.familyId ||
        finalRow.refreshTokenHash !== nextHash ||
        finalRow.transport !== 'web' ||
        finalRow.exactOrigin !== row.exactOrigin ||
        finalRow.browserChainId !== row.browserChainId ||
        finalRow.browserBindingCookieHash !== bindingHash ||
        finalRow.createdAt !== row.createdAt ||
        finalRow.expiresAt !== row.expiresAt ||
        finalNow >= finalRow.expiresAt
      )
        fail();
      const cookies = Object.freeze([
        `st_v2_access=${result.accessToken}; Path=/v2; Secure; HttpOnly; SameSite=Lax`,
        `st_v2_refresh=${result.refreshToken}; Path=/v2/auth; Secure; HttpOnly; SameSite=Lax`,
      ]);
      const payload = Object.freeze({
        transport: 'web',
        sessionId: result.sessionId,
        csrfToken,
      });
      const settled = this.settle(reservation, owner, 'completed');
      if (settled !== undefined) fail();
      committed = true;
      response.setHeader('Set-Cookie', cookies as unknown as string[]);
      response.status(200).type('application/json').send(payload);
      cleanup = undefined;
      csrfAuthority = undefined;
    } catch {
      if (response.headersSent) return;
      if (cleanup) {
        try {
          const didRevoke = this.revoke(cleanup, {
            userId: cleanup.identityId,
          });
          if (didRevoke === true && csrfAuthority)
            this.invalidate(csrfAuthority);
          else if (nativePromise(didRevoke)) {
            const confirmed = await didRevoke;
            if (confirmed === true && csrfAuthority)
              this.invalidate(csrfAuthority);
          }
        } catch {
          /* preserve advanced or unknown state */
        }
      }
      if (reservation && owner && !committed) {
        try {
          const settled = this.settle(reservation, owner, 'failed');
          if (settled !== undefined) {
            /* retain burned reservation */
          }
        } catch {
          /* retain burned reservation */
        }
      }
      try {
        response.removeHeader('Set-Cookie');
      } catch {
        /* best effort */
      }
      const status =
        stage === 'request'
          ? 400
          : stage === 'scope'
            ? 401
            : stage === 'csrf'
              ? 403
              : stage === 'reserve'
                ? 409
                : stage === 'refresh'
                  ? 401
                  : 500;
      problem(
        response,
        status,
        status === 409
          ? 'AUTH_RESTART_REQUIRED'
          : status === 400
            ? 'AUTH_REQUEST_UNAVAILABLE'
            : status === 403
              ? 'AUTH_CSRF_UNAVAILABLE'
              : status === 401
                ? 'AUTH_SESSION_UNAVAILABLE'
                : 'AUTH_SESSION_UNAVAILABLE',
      );
    }
  }
  private readClock(): number {
    const now = this.clock();
    if (!clockValid(now)) return fail();
    return now;
  }
}

@Controller('v2/auth/refresh')
export class V2WebRefreshHttpController {
  constructor(
    @Inject(V2WebRefreshHttpService)
    private readonly service: V2WebRefreshHttpService,
  ) {}
  @Post() async refresh(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-session-csrf') csrf: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.service.handle(body, key, csrf, request, response);
  }
}

export function v2WebRefreshNoStore(
  request: Request,
  response: Response,
  next: (error?: unknown) => void,
): void {
  const path = request.originalUrl.split('?', 1)[0] ?? '';
  if (path === '/v2/auth/refresh' || path.startsWith('/v2/auth/refresh/'))
    noStore(response);
  next();
}
