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
import type { DevelopmentV2PrincipalResolver } from './v2-principal-resolver.js';
import type { V2AccessToken, V2AccessTokenClaims } from './v2-access-token.js';
import type {
  InMemoryV2SessionRepository,
  SessionRecord,
} from './v2-session-issuer.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACCESS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const FAIL = 'V2 mobile revocation unavailable';
const problem = (status: number) => ({
  type: 'about:blank',
  title:
    status === 400
      ? 'Bad Request'
      : status === 401
        ? 'Unauthorized'
        : status === 404
          ? 'Not Found'
          : 'Internal Server Error',
  status,
  code:
    status === 401
      ? 'AUTH_SESSION_UNAVAILABLE'
      : status === 404
        ? 'AUTH_SESSION_NOT_FOUND'
        : 'AUTH_REQUEST_UNAVAILABLE',
});

export type V2MobileRevocationHttpConfig = Readonly<{
  environment: 'development';
  enabled: true;
  accessTokens: Pick<V2AccessToken, 'verify'>;
  principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  repository: Pick<
    InMemoryV2SessionRepository,
    'readSession' | 'revokeForCurrentSession'
  >;
  clock?: () => number;
}>;

function fail(): never {
  throw new Error(FAIL);
}
function snapshot(
  input: unknown,
  expected: readonly string[],
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
    keys.length !== expected.length ||
    keys.some((k) => typeof k !== 'string' || !expected.includes(k))
  )
    return fail();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable) return fail();
    out[key] = d.value;
  }
  return out;
}
function method(target: unknown, key: string): (...args: never[]) => unknown {
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
    if (typeof h[i] === 'string' && h[i]!.toLowerCase() === name)
      out.push(h[i + 1] ?? '');
  return out;
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
function validNow(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v >= 0 &&
    Number.isFinite(new Date(v).getTime())
  );
}
function claimsCopy(input: unknown): Readonly<V2AccessTokenClaims> {
  const c = snapshot(input, ['iss', 'aud', 'sub', 'sid', 'iat', 'exp', 'ver']);
  if (
    c.iss !== 'urn:subtrack:auth:v2:development' ||
    c.aud !== 'urn:subtrack:api:v2:development' ||
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
    iss: c.iss,
    aud: c.aud,
    sub: c.sub,
    sid: c.sid,
    iat: c.iat as number,
    exp: c.exp as number,
    ver: 2,
  });
}
function mobileRow(
  input: unknown,
  owner: string,
  sid: string,
  now: number,
): Readonly<SessionRecord> {
  const r = snapshot(input, [
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
    typeof r.identityId !== 'string' ||
    !UUID.test(r.identityId) ||
    r.identityId !== owner ||
    typeof r.sessionId !== 'string' ||
    !UUID.test(r.sessionId) ||
    r.sessionId !== sid ||
    typeof r.familyId !== 'string' ||
    !UUID.test(r.familyId) ||
    r.familyId === sid ||
    r.generation !== 0 ||
    typeof r.refreshTokenHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r.refreshTokenHash) ||
    r.transport !== 'mobile' ||
    !(
      r.deviceName === null ||
      (typeof r.deviceName === 'string' && [...r.deviceName].length <= 100)
    ) ||
    !validNow(r.createdAt) ||
    !validNow(r.expiresAt) ||
    r.expiresAt !== (r.createdAt as number) + 86_400_000 ||
    (r.createdAt as number) > now ||
    now >= (r.expiresAt as number)
  )
    return fail();
  return Object.freeze(r) as unknown as Readonly<SessionRecord>;
}

export class V2MobileRevocationHttpService {
  private readonly verify: V2AccessToken['verify'];
  private readonly resolve: DevelopmentV2PrincipalResolver['resolve'];
  private readonly read: InMemoryV2SessionRepository['readSession'];
  private readonly revoke: InMemoryV2SessionRepository['revokeForCurrentSession'];
  private readonly clock: () => number;
  constructor(input: V2MobileRevocationHttpConfig) {
    const c = snapshot(input, [
      'environment',
      'enabled',
      'accessTokens',
      'principal',
      'repository',
      ...(Object.hasOwn(input, 'clock') ? ['clock'] : []),
    ]);
    if (
      c.environment !== 'development' ||
      c.enabled !== true ||
      (Object.hasOwn(c, 'clock') && typeof c.clock !== 'function')
    )
      fail();
    this.verify = method(c.accessTokens, 'verify') as V2AccessToken['verify'];
    this.resolve = method(
      c.principal,
      'resolve',
    ) as DevelopmentV2PrincipalResolver['resolve'];
    this.read = method(
      c.repository,
      'readSession',
    ) as InMemoryV2SessionRepository['readSession'];
    this.revoke = method(
      c.repository,
      'revokeForCurrentSession',
    ) as InMemoryV2SessionRepository['revokeForCurrentSession'];
    this.clock = (c.clock as (() => number) | undefined) ?? Date.now;
  }
  async handle(
    targetSessionId: string,
    body: unknown,
    request: Request,
    response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    const send = (status: number) => {
      if (!response.headersSent)
        response
          .status(status)
          .type('application/problem+json')
          .send(problem(status));
    };
    try {
      if (
        typeof targetSessionId !== 'string' ||
        !UUID.test(targetSessionId) ||
        body !== undefined ||
        typeof request.originalUrl !== 'string' ||
        request.originalUrl.includes('?')
      )
        return send(400);
      const h = request.rawHeaders;
      if (
        !Array.isArray(h) ||
        h.some(
          (_, i) =>
            i % 2 === 0 &&
            typeof h[i] === 'string' &&
            /(?:origin|nonce|csrf|xsrf|idempotency)/i.test(h[i]!),
        )
      )
        return send(400);
      const auth = raw(request, 'authorization'),
        cookies = raw(request, 'cookie'),
        lengths = raw(request, 'content-length');
      if (
        auth.length !== 1 ||
        cookies.length !== 0 ||
        raw(request, 'transfer-encoding').length !== 0 ||
        !(lengths.length === 0 || (lengths.length === 1 && lengths[0] === '0'))
      )
        return send(400);
      const value = auth[0]!;
      if (!value.startsWith('Bearer ')) return send(400);
      if (
        !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
          value,
        ) ||
        value.length > 4103 ||
        !ACCESS.test(value.slice(7))
      )
        return send(401);
      const token = value.slice(7);
      for (const segment of token.split('.')) {
        const b = Buffer.from(segment, 'base64url');
        if (!segment || b.toString('base64url') !== segment) return send(401);
      }
      if (!(request.socket instanceof TLSSocket) || request.secure !== true)
        return send(400);
      const before = this.clock();
      if (!validNow(before)) return send(500);
      let initial: Readonly<V2AccessTokenClaims>;
      try {
        initial = claimsCopy(this.verify(token));
      } catch {
        return send(401);
      }
      if (
        initial.iat > Math.floor(before / 1000) ||
        Math.floor(before / 1000) >= initial.exp
      )
        return send(401);
      let resolved: unknown;
      try {
        const pending = this.resolve(
          token,
          Object.freeze({ transport: 'mobile' }),
        );
        if (!nativePromise(pending)) return send(500);
        resolved = await pending;
      } catch {
        return send(401);
      }
      const principal = snapshot(resolved, ['identityId', 'sessionId']);
      if (
        typeof principal.identityId !== 'string' ||
        !UUID.test(principal.identityId) ||
        typeof principal.sessionId !== 'string' ||
        !UUID.test(principal.sessionId)
      )
        return send(401);
      const now = this.clock();
      if (!validNow(now) || now < before) return send(500);
      let fresh: Readonly<V2AccessTokenClaims>;
      try {
        fresh = claimsCopy(this.verify(token));
      } catch {
        return send(401);
      }
      const seconds = Math.floor(now / 1000);
      if (
        fresh.iat > seconds ||
        seconds >= fresh.exp ||
        fresh.sub !== principal.identityId ||
        fresh.sid !== principal.sessionId ||
        initial.sub !== fresh.sub ||
        initial.sid !== fresh.sid ||
        initial.iat !== fresh.iat ||
        initial.exp !== fresh.exp
      )
        return send(401);
      const owner = Object.freeze({ userId: principal.identityId });
      let row: unknown;
      try {
        row = this.read(principal.sessionId, owner, now);
      } catch {
        return send(500);
      }
      if (row === null) return send(401);
      try {
        mobileRow(row, principal.identityId, principal.sessionId, now);
      } catch {
        return send(401);
      }
      let outcome: unknown;
      try {
        outcome = this.revoke(principal.sessionId, targetSessionId, owner, now);
      } catch {
        return send(500);
      }
      const result = snapshot(outcome, ['kind']);
      if (result.kind === 'revoked') {
        if (!response.headersSent) response.status(204).end();
        return;
      }
      if (result.kind === 'missing') return send(404);
      if (result.kind === 'invalid') return send(401);
      return send(500);
    } catch {
      send(500);
    }
  }
}

@Controller('v2/me/sessions')
export class V2MobileRevocationHttpController {
  constructor(
    @Inject(V2MobileRevocationHttpService)
    private readonly service: V2MobileRevocationHttpService,
  ) {}
  @Delete(':targetSessionId')
  revoke(
    @Param('targetSessionId') targetSessionId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.service.handle(targetSessionId, body, request, response);
  }
}
