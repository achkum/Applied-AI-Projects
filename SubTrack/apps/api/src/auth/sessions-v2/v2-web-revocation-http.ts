import { types } from 'node:util';
import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TLSSocket } from 'node:tls';
import { extractV2BrowserEvidence } from '../http/v2-browser-context.js';
import { OriginThrottle } from '../browser-nonce/browser-nonce-http.js';
import { hashBrowserBindingCookie } from './v2-web-session-binding.js';
import type {
  SessionCsrfGuard,
  VerifiedWebSessionAuthority,
} from '../session-csrf/session-csrf.js';
import type { DevelopmentV2PrincipalResolver } from './v2-principal-resolver.js';
import type { V2AccessToken } from './v2-access-token.js';
import type {
  SessionRecord,
  SessionRepository,
  InMemoryV2SessionRepository,
} from './v2-session-issuer.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACCESS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TTL = 86_400_000;
const problem = (status: number) => ({
  type: 'about:blank',
  title:
    status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : status === 404
          ? 'Not Found'
          : status === 429
            ? 'Too Many Requests'
            : status === 400
              ? 'Bad Request'
              : 'Internal Server Error',
  status,
  code:
    status === 401
      ? 'AUTH_SESSION_UNAVAILABLE'
      : status === 404
        ? 'AUTH_SESSION_NOT_FOUND'
        : status === 429
          ? 'AUTH_RESTART_REQUIRED'
          : 'AUTH_REQUEST_UNAVAILABLE',
});

export type V2WebRevocationHttpConfig = Readonly<{
  environment: 'development';
  enabled: true;
  allowedOrigins: readonly string[];
  bindingCookieName: string;
  accessTokens: Pick<V2AccessToken, 'verify'>;
  principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  repository: Required<
    Pick<
      InMemoryV2SessionRepository,
      'readSession' | 'webContextForCurrentSession' | 'revokeForCurrentSession'
    >
  >;
  csrf: Pick<SessionCsrfGuard, 'verify' | 'invalidate'>;
  clock?: () => number;
}>;

function fail(): never {
  throw new Error('V2 web revocation unavailable');
}
function snapshot(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    return fail();
  const keys = Reflect.ownKeys(input);
  if (
    keys.some(
      (k) =>
        typeof k !== 'string' ||
        (!required.includes(k) && !optional.includes(k)),
    ) ||
    required.some((k) => !keys.includes(k))
  )
    return fail();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable) return fail();
    out[key] = d.value;
  }
  return out;
}
function method(target: unknown, name: string): (...args: never[]) => unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    return fail();
  let p: object | null = target;
  while (p) {
    const d = Object.getOwnPropertyDescriptor(p, name);
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
  const out: string[] = [];
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i]?.toLowerCase() === name)
      out.push(request.rawHeaders[i + 1] ?? '');
  return out;
}
function cookies(
  request: Request,
  wanted: readonly string[],
): Readonly<Record<string, string>> {
  const headers = raw(request, 'cookie');
  if (headers.length !== 1) return fail();
  const found: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const part0 of headers[0]!.split(';')) {
    const part = part0.replace(/^[\t ]+/, ''),
      ix = part.indexOf('='),
      name = ix < 0 ? part : part.slice(0, ix);
    if (
      !name ||
      name !== name.trim() ||
      ix < 1 ||
      /[\t ,]/.test(name) ||
      Object.hasOwn(found, name)
    )
      return fail();
    const value = part.slice(ix + 1);
    if (!/^[\x21-\x7e]*$/.test(value) || /[;,"'\\]/.test(value)) return fail();
    found[name] = value;
  }
  if (Object.hasOwn(found, 'st_v2_refresh')) return fail();
  for (const name of wanted) if (!found[name]) return fail();
  if (
    !TOKEN.test(found[wanted[1]!]!) ||
    found[wanted[0]!]!.length > 4096 ||
    !ACCESS.test(found[wanted[0]!]!)
  )
    return fail();
  for (const segment of found[wanted[0]!]!.split('.')) {
    try {
      const decoded = Buffer.from(segment, 'base64url');
      if (!segment || decoded.toString('base64url') !== segment) return fail();
    } catch {
      return fail();
    }
  }
  return Object.freeze(found);
}
function validNow(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isSafeInteger(n) &&
    n >= 0 &&
    n <= Number.MAX_SAFE_INTEGER - TTL &&
    Number.isFinite(new Date(n).getTime())
  );
}
function copyRow(input: unknown): Readonly<SessionRecord> {
  const v = snapshot(
    input,
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
    v.transport !== 'web' ||
    v.deviceName !== null ||
    !validNow(v.createdAt) ||
    !validNow(v.expiresAt) ||
    v.expiresAt !== (v.createdAt as number) + TTL ||
    typeof v.exactOrigin !== 'string' ||
    typeof v.browserChainId !== 'string' ||
    !v.browserChainId ||
    typeof v.browserBindingCookieHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.browserBindingCookieHash)
  )
    return fail();
  return Object.freeze({ ...v }) as unknown as Readonly<SessionRecord>;
}
function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}
function nativePromise(v: unknown): v is Promise<unknown> {
  try {
    return (
      types.isPromise(v) &&
      Object.getPrototypeOf(v) === Promise.prototype &&
      Reflect.ownKeys(v).length === 0
    );
  } catch {
    return false;
  }
}

export class V2WebRevocationHttpService {
  private readonly origins: readonly string[];
  private readonly cookieName: string;
  private readonly clock: () => number;
  private readonly throttle: OriginThrottle;
  private readonly verify: V2AccessToken['verify'];
  private readonly resolve: DevelopmentV2PrincipalResolver['resolve'];
  private readonly read: SessionRepository['readSession'];
  private readonly webContext: NonNullable<
    SessionRepository['webContextForCurrentSession']
  >;
  private readonly revoke: NonNullable<
    InMemoryV2SessionRepository['revokeForCurrentSession']
  >;
  private readonly csrf: Pick<SessionCsrfGuard, 'verify' | 'invalidate'>;
  constructor(input: V2WebRevocationHttpConfig) {
    const c = snapshot(
      input,
      [
        'environment',
        'enabled',
        'allowedOrigins',
        'bindingCookieName',
        'accessTokens',
        'principal',
        'repository',
        'csrf',
      ],
      ['clock'],
    );
    if (
      c.environment !== 'development' ||
      c.enabled !== true ||
      !Array.isArray(c.allowedOrigins) ||
      !c.allowedOrigins.length ||
      typeof c.bindingCookieName !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(c.bindingCookieName) ||
      ['st_v2_access', 'st_v2_refresh'].includes(c.bindingCookieName) ||
      (Object.hasOwn(c, 'clock') && typeof c.clock !== 'function')
    )
      fail();
    const originInput = c.allowedOrigins as unknown[];
    const originKeys = Reflect.ownKeys(originInput);
    if (
      originKeys.length !== originInput.length + 1 ||
      originKeys.some(
        (k) =>
          k !== 'length' &&
          (typeof k !== 'string' ||
            !/^(0|[1-9][0-9]*)$/.test(k) ||
            Number(k) >= originInput.length),
      )
    )
      fail();
    const origins: string[] = [];
    for (let i = 0; i < c.allowedOrigins.length; i++) {
      const d = Object.getOwnPropertyDescriptor(c.allowedOrigins, String(i));
      if (!d || !('value' in d) || typeof d.value !== 'string') fail();
      const s = d.value;
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        fail();
      }
      if (
        u.protocol !== 'https:' ||
        u.origin !== s ||
        u.username ||
        u.password ||
        u.hostname.includes('*') ||
        u.pathname !== '/' ||
        u.search ||
        u.hash
      )
        fail();
      origins.push(s);
    }
    if (new Set(origins).size !== origins.length) fail();
    this.origins = Object.freeze(origins);
    this.cookieName = c.bindingCookieName as string;
    this.clock = (c.clock as (() => number) | undefined) ?? Date.now;
    this.verify = method(c.accessTokens, 'verify') as V2AccessToken['verify'];
    this.resolve = method(
      c.principal,
      'resolve',
    ) as DevelopmentV2PrincipalResolver['resolve'];
    this.read = method(
      c.repository,
      'readSession',
    ) as SessionRepository['readSession'];
    this.webContext = method(
      c.repository,
      'webContextForCurrentSession',
    ) as NonNullable<SessionRepository['webContextForCurrentSession']>;
    this.revoke = method(
      c.repository,
      'revokeForCurrentSession',
    ) as NonNullable<InMemoryV2SessionRepository['revokeForCurrentSession']>;
    this.csrf = Object.freeze({
      verify: method(c.csrf, 'verify'),
      invalidate: method(c.csrf, 'invalidate'),
    }) as unknown as Pick<SessionCsrfGuard, 'verify' | 'invalidate'>;
    this.throttle = new OriginThrottle(this.origins, this.clock);
  }
  async handle(
    targetSessionId: string,
    body: unknown,
    csrfHeader: unknown,
    request: Request,
    response: Response,
  ): Promise<void> {
    noStore(response);
    const send = (status: number) => {
      if (!response.headersSent)
        response
          .status(status)
          .type('application/problem+json')
          .send(problem(status));
    };
    let stage: 'request' | 'authority' = 'request';
    try {
      if (
        body !== undefined ||
        request.originalUrl.includes('?') ||
        !UUID.test(targetSessionId) ||
        typeof csrfHeader !== 'string' ||
        !TOKEN.test(csrfHeader) ||
        Buffer.from(csrfHeader, 'base64url').toString('base64url') !==
          csrfHeader
      ) {
        send(400);
        return;
      }
      const lengths = raw(request, 'content-length'),
        transfer = raw(request, 'transfer-encoding');
      if (
        transfer.length ||
        !(
          lengths.length === 0 ||
          (lengths.length === 1 && lengths[0] === '0')
        ) ||
        raw(request, 'authorization').length ||
        raw(request, 'x-browser-nonce').length ||
        raw(request, 'x-csrf-token').length ||
        raw(request, 'csrf-token').length ||
        raw(request, 'x-xsrf-token').length ||
        raw(request, 'x-session-csrf').length !== 1 ||
        raw(request, 'x-session-csrf')[0] !== csrfHeader
      ) {
        send(400);
        return;
      }
      const requestCookies = cookies(request, [
        'st_v2_access',
        this.cookieName,
      ]);
      const access = requestCookies.st_v2_access!;
      const binding = requestCookies[this.cookieName]!;
      const evidence = extractV2BrowserEvidence(request, {
        allowedOrigins: this.origins,
        bindingCookieName: this.cookieName,
        allowLoopbackHttpDevelopment: false,
      });
      if (
        !evidence.isHttps ||
        !(request.socket instanceof TLSSocket) ||
        !evidence.origin ||
        !evidence.bindingCookie ||
        evidence.bindingCookie !== binding
      ) {
        send(400);
        return;
      }
      if (!this.throttle.take(evidence.origin)) {
        send(429);
        return;
      }
      stage = 'authority';
      let rawClaims: unknown;
      try {
        rawClaims = this.verify(access);
      } catch {
        send(401);
        return;
      }
      const claims = snapshot(rawClaims, [
        'iss',
        'aud',
        'sub',
        'sid',
        'iat',
        'exp',
        'ver',
      ]);
      if (
        claims.iss !== 'urn:subtrack:auth:v2:development' ||
        claims.aud !== 'urn:subtrack:api:v2:development' ||
        claims.ver !== 2 ||
        typeof claims.sub !== 'string' ||
        !UUID.test(claims.sub) ||
        typeof claims.sid !== 'string' ||
        !UUID.test(claims.sid) ||
        !Number.isSafeInteger(claims.iat) ||
        (claims.iat as number) < 0 ||
        !Number.isSafeInteger(claims.exp) ||
        claims.exp !== (claims.iat as number) + 900
      ) {
        send(401);
        return;
      }
      const before = this.clock();
      if (!validNow(before)) return send(500);
      const seconds = Math.floor(before / 1000);
      if (
        (claims.iat as number) > seconds ||
        seconds >= (claims.exp as number)
      ) {
        send(401);
        return;
      }
      const bindingHash = hashBrowserBindingCookie(binding);
      const owner = Object.freeze({ userId: claims.sub });
      const initialValue = this.read(claims.sid, owner, before);
      if (initialValue === null) {
        send(401);
        return;
      }
      const initial = copyRow(initialValue);
      const trustedWeb = this.webContext(
        claims.sid,
        owner,
        bindingHash,
        evidence.origin,
        before,
      );
      if (trustedWeb === null) {
        send(401);
        return;
      }
      const w = snapshot(trustedWeb, [
        'transport',
        'exactOrigin',
        'browserChainId',
      ]);
      if (
        initial.createdAt > before ||
        before >= initial.expiresAt ||
        initial.identityId !== claims.sub ||
        initial.sessionId !== claims.sid ||
        initial.browserBindingCookieHash !== bindingHash ||
        initial.exactOrigin !== evidence.origin ||
        w.transport !== 'web' ||
        w.exactOrigin !== evidence.origin ||
        typeof w.browserChainId !== 'string' ||
        w.browserChainId !== initial.browserChainId
      ) {
        send(401);
        return;
      }
      const trustedContext = Object.freeze({
        transport: 'web' as const,
        exactOrigin: evidence.origin,
        browserChainId: w.browserChainId,
      });
      const rawPrincipal = this.resolve(access, trustedContext);
      if (!nativePromise(rawPrincipal)) return send(500);
      let principalValue: unknown;
      try {
        principalValue = await rawPrincipal;
      } catch {
        send(401);
        return;
      }
      const principal = snapshot(principalValue, ['identityId', 'sessionId']);
      if (
        principal.identityId !== claims.sub ||
        principal.sessionId !== claims.sid
      ) {
        send(401);
        return;
      }
      const now = this.clock();
      if (
        !validNow(now) ||
        now < before ||
        now >= initial.expiresAt ||
        Math.floor(now / 1000) >= (claims.exp as number)
      ) {
        send(401);
        return;
      }
      const currentOwner = Object.freeze({
        userId: principal.identityId as string,
      });
      const currentValue = this.read(claims.sid, currentOwner, now);
      if (currentValue === null) {
        send(401);
        return;
      }
      const current = copyRow(currentValue);
      const currentWebValue = this.webContext(
        claims.sid,
        currentOwner,
        bindingHash,
        evidence.origin,
        now,
      );
      if (currentWebValue === null) {
        send(401);
        return;
      }
      const currentWeb = snapshot(currentWebValue, [
        'transport',
        'exactOrigin',
        'browserChainId',
      ]);
      if (
        current.createdAt > now ||
        now >= current.expiresAt ||
        current.identityId !== principal.identityId ||
        current.sessionId !== principal.sessionId ||
        current.familyId !== initial.familyId ||
        current.refreshTokenHash !== initial.refreshTokenHash ||
        current.createdAt !== initial.createdAt ||
        current.expiresAt !== initial.expiresAt ||
        current.browserBindingCookieHash !== bindingHash ||
        current.exactOrigin !== evidence.origin ||
        current.browserChainId !== w.browserChainId ||
        currentWeb.transport !== 'web' ||
        currentWeb.exactOrigin !== evidence.origin ||
        currentWeb.browserChainId !== w.browserChainId
      ) {
        send(401);
        return;
      }
      const authority = Object.freeze({
        identityId: principal.identityId,
        sessionId: principal.sessionId,
      }) as VerifiedWebSessionAuthority;
      let csrfResult: unknown;
      try {
        csrfResult = this.csrf.verify(authority, csrfHeader);
      } catch {
        send(403);
        return;
      }
      if (csrfResult !== undefined) return send(500);
      const result = snapshot(
        this.revoke(
          principal.sessionId as string,
          targetSessionId,
          Object.freeze({ userId: principal.identityId as string }),
          now,
        ),
        ['kind'],
      );
      if (result.kind === 'missing') {
        send(404);
        return;
      }
      if (result.kind === 'invalid') {
        send(401);
        return;
      }
      if (result.kind === 'capacity') {
        send(500);
        return;
      }
      if (result.kind !== 'revoked') return send(500);
      if (targetSessionId === principal.sessionId) {
        try {
          if (this.csrf.invalidate(authority) !== undefined) return send(500);
        } catch {
          return send(500);
        }
      }
      if (!response.headersSent) response.status(204).end();
    } catch {
      send(stage === 'request' ? 400 : 500);
    }
  }
}

@Controller('v2/me/sessions')
export class V2WebRevocationHttpController {
  constructor(
    @Inject(V2WebRevocationHttpService)
    private readonly service: V2WebRevocationHttpService,
  ) {}
  @Delete(':id') revoke(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const values: string[] = [];
    for (let i = 0; i < request.rawHeaders.length; i += 2)
      if (request.rawHeaders[i]?.toLowerCase() === 'x-session-csrf')
        values.push(request.rawHeaders[i + 1] ?? '');
    return this.service.handle(
      id,
      body,
      values.length === 1 ? values[0] : undefined,
      request,
      response,
    );
  }
}
