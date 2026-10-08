import { types } from 'node:util';
import { Body, Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TLSSocket } from 'node:tls';
import type { DevelopmentV2PrincipalResolver } from './v2-principal-resolver.js';
import type { V2AccessToken, V2AccessTokenClaims } from './v2-access-token.js';
import type { InMemoryV2SessionRepository } from './v2-session-issuer.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACCESS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TTL = 900;
const FAIL = 'V2 mobile listing unavailable';
const unauthorized = {
  type: 'about:blank',
  title: 'Unauthorized',
  status: 401,
  code: 'AUTH_SESSION_UNAVAILABLE',
};
const badRequest = {
  type: 'about:blank',
  title: 'Bad Request',
  status: 400,
  code: 'AUTH_REQUEST_UNAVAILABLE',
};
const unavailable = {
  type: 'about:blank',
  title: 'Internal Server Error',
  status: 500,
  code: 'AUTH_REQUEST_UNAVAILABLE',
};

export type V2MobileListingHttpConfig = Readonly<{
  environment: 'development';
  enabled: true;
  accessTokens: Pick<V2AccessToken, 'verify'>;
  principal: Pick<DevelopmentV2PrincipalResolver, 'resolve'>;
  repository: Pick<InMemoryV2SessionRepository, 'listForCurrentSession'>;
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
  const result: string[] = [];
  const h = request.rawHeaders;
  if (!Array.isArray(h) || h.length % 2 !== 0) return fail();
  for (let i = 0; i < h.length; i += 2)
    if (h[i]?.toLowerCase() === name) result.push(h[i + 1] ?? '');
  return result;
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
function nowValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    Number.isFinite(new Date(value).getTime())
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
    c.exp !== (c.iat as number) + TTL
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
function summaries(
  input: unknown,
  sessionId: string,
  now: number,
): readonly unknown[] {
  if (!Array.isArray(input) || input.length > 10_000) return fail();
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== input.length + 1 ||
    keys.some(
      (k) =>
        k !== 'length' &&
        (typeof k !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(k) ||
          Number(k) >= input.length),
    )
  )
    return fail();
  const rows: {
    id: string;
    createdAt: string;
    current: boolean;
    deviceName: string | null;
  }[] = [];
  const ids = new Set<string>();
  let currentCount = 0;
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !('value' in d) || !d.enumerable) return fail();
    const row = snapshot(d.value, ['id', 'createdAt', 'current', 'deviceName']);
    if (
      typeof row.id !== 'string' ||
      !UUID.test(row.id) ||
      ids.has(row.id) ||
      typeof row.createdAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.createdAt) ||
      typeof row.current !== 'boolean' ||
      !(
        row.deviceName === null ||
        (typeof row.deviceName === 'string' &&
          [...row.deviceName].length <= 100)
      )
    )
      return fail();
    const timestamp = Date.parse(row.createdAt);
    if (
      !Number.isFinite(timestamp) ||
      timestamp < 0 ||
      new Date(timestamp).toISOString() !== row.createdAt ||
      timestamp > now
    )
      return fail();
    ids.add(row.id);
    if (row.current) {
      currentCount++;
      if (row.id !== sessionId) return fail();
    }
    rows.push({
      id: row.id,
      createdAt: row.createdAt,
      current: row.current,
      deviceName: row.deviceName as string | null,
    });
  }
  if (currentCount !== 1 || !ids.has(sessionId)) return fail();
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!,
      b = rows[i]!;
    if (
      Date.parse(a.createdAt) < Date.parse(b.createdAt) ||
      (a.createdAt === b.createdAt && a.id > b.id)
    )
      return fail();
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

export class V2MobileListingHttpService {
  private readonly verify: V2AccessToken['verify'];
  private readonly resolve: DevelopmentV2PrincipalResolver['resolve'];
  private readonly list: InMemoryV2SessionRepository['listForCurrentSession'];
  private readonly clock: () => number;
  constructor(input: V2MobileListingHttpConfig) {
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
    this.list = method(
      c.repository,
      'listForCurrentSession',
    ) as InMemoryV2SessionRepository['listForCurrentSession'];
    this.clock = (c.clock as (() => number) | undefined) ?? Date.now;
  }
  async handle(
    body: unknown,
    request: Request,
    response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    const send = (status: number, value: unknown) => {
      if (!response.headersSent)
        response
          .status(status)
          .type(
            status === 200 ? 'application/json' : 'application/problem+json',
          )
          .send(value);
    };
    try {
      if (
        body !== undefined ||
        typeof request.originalUrl !== 'string' ||
        request.originalUrl.includes('?')
      )
        return send(400, badRequest);
      const forbiddenAlias = request.rawHeaders.some(
        (header, i) =>
          i % 2 === 0 && /(?:origin|nonce|csrf|xsrf)/i.test(header),
      );
      const auth = raw(request, 'authorization');
      if (
        auth.length !== 1 ||
        raw(request, 'cookie').length ||
        forbiddenAlias ||
        raw(request, 'content-type').length ||
        raw(request, 'transfer-encoding').length
      )
        return send(400, badRequest);
      const lengths = raw(request, 'content-length');
      if (!(
        lengths.length === 0 ||
        (lengths.length === 1 && lengths[0] === '0')
      ))
        return send(400, badRequest);
      const value = auth[0]!;
      if (!value.startsWith('Bearer ')) return send(400, badRequest);
      if (
        !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
          value,
        ) ||
        value.length > 4103 ||
        !ACCESS.test(value.slice(7))
      )
        return send(401, unauthorized);
      const token = value.slice(7);
      for (const segment of token.split('.')) {
        const bytes = Buffer.from(segment, 'base64url');
        if (!segment || bytes.toString('base64url') !== segment)
          return send(401, unauthorized);
      }
      if (!(request.socket instanceof TLSSocket) || request.secure !== true)
        return send(400, badRequest);
      let before: number;
      try {
        before = this.clock();
      } catch {
        return send(500, unavailable);
      }
      if (!nowValue(before)) return send(500, unavailable);
      let preliminary: Readonly<V2AccessTokenClaims>;
      try {
        preliminary = claimsCopy(this.verify(token));
      } catch {
        return send(401, unauthorized);
      }
      if (
        preliminary.iat > Math.floor(before / 1000) ||
        Math.floor(before / 1000) >= preliminary.exp
      )
        return send(401, unauthorized);
      let resolved: unknown;
      try {
        const pending = this.resolve(
          token,
          Object.freeze({ transport: 'mobile' }),
        );
        if (!nativePromise(pending)) return send(500, unavailable);
        resolved = await pending;
      } catch {
        return send(401, unauthorized);
      }
      const principal = snapshot(resolved, ['identityId', 'sessionId']);
      if (
        typeof principal.identityId !== 'string' ||
        !UUID.test(principal.identityId) ||
        typeof principal.sessionId !== 'string' ||
        !UUID.test(principal.sessionId)
      )
        return send(401, unauthorized);
      let fresh: number;
      try {
        fresh = this.clock();
      } catch {
        return send(500, unavailable);
      }
      if (!nowValue(fresh) || fresh < before) return send(500, unavailable);
      let claims: Readonly<V2AccessTokenClaims>;
      try {
        claims = claimsCopy(this.verify(token));
      } catch {
        return send(401, unauthorized);
      }
      const seconds = Math.floor(fresh / 1000);
      if (
        claims.iat > seconds ||
        seconds >= claims.exp ||
        claims.sub !== principal.identityId ||
        claims.sid !== principal.sessionId ||
        preliminary.sub !== claims.sub ||
        preliminary.sid !== claims.sid ||
        preliminary.iat !== claims.iat ||
        preliminary.exp !== claims.exp
      )
        return send(401, unauthorized);
      let listed: unknown;
      try {
        listed = this.list(
          principal.sessionId,
          Object.freeze({ userId: principal.identityId }),
          fresh,
        );
      } catch {
        return send(500, unavailable);
      }
      if (listed === null) return send(401, unauthorized);
      const output = summaries(listed, principal.sessionId, fresh);
      send(200, output);
    } catch {
      send(500, unavailable);
    }
  }
}

@Controller('v2/me/sessions')
export class V2MobileListingHttpController {
  constructor(
    @Inject(V2MobileListingHttpService)
    private readonly service: V2MobileListingHttpService,
  ) {}
  @Get()
  list(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.service.handle(body, request, response);
  }
}
