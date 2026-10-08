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
import { selectV2CredentialTransport } from '../transport/credential-selector.js';
import { V2WebRevocationHttpService } from './v2-web-revocation-http.js';
import { V2MobileRevocationHttpService } from './v2-mobile-revocation-http.js';
import type { V2WebRevocationHttpConfig } from './v2-web-revocation-http.js';

const FAIL = 'V2 session revocation unavailable';
const required = [
  'environment',
  'enabled',
  'allowedOrigins',
  'bindingCookieName',
  'accessTokens',
  'principal',
  'repository',
  'csrf',
] as const;
export type V2SessionRevocationHttpConfig = V2WebRevocationHttpConfig;
type Config = V2SessionRevocationHttpConfig;

function fail(): never {
  throw new Error(FAIL);
}
function snapshot(input: unknown): Record<string, unknown> {
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
      (key) =>
        typeof key !== 'string' ||
        (!required.includes(key as (typeof required)[number]) &&
          key !== 'clock'),
    ) ||
    required.some((key) => !keys.includes(key))
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
function port(input: unknown, names: readonly string[]): object {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return fail();
  const out = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    let p: object | null = input;
    let found = false;
    while (p) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d) {
        if (!('value' in d) || typeof d.value !== 'function') return fail();
        out[name] = Function.prototype.bind.call(d.value, input);
        found = true;
        break;
      }
      p = Object.getPrototypeOf(p) as object | null;
    }
    if (!found) return fail();
  }
  return Object.freeze(out);
}
function origins(input: unknown): readonly string[] {
  if (!Array.isArray(input)) return fail();
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== input.length + 1 ||
    keys.some(
      (key) =>
        key !== 'length' &&
        (typeof key !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= input.length),
    )
  )
    return fail();
  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !('value' in d) || !d.enumerable || typeof d.value !== 'string')
      return fail();
    const s = d.value;
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return fail();
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
      return fail();
    out.push(s);
  }
  if (!out.length || new Set(out).size !== out.length) return fail();
  return Object.freeze(out);
}
export function captureV2SessionRevocationHttpConfig(input: Config): Config {
  const c = snapshot(input);
  if (
    c.environment !== 'development' ||
    c.enabled !== true ||
    typeof c.bindingCookieName !== 'string' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(c.bindingCookieName) ||
    ['st_v2_access', 'st_v2_refresh'].includes(c.bindingCookieName) ||
    (Object.hasOwn(c, 'clock') && typeof c.clock !== 'function')
  )
    return fail();
  return Object.freeze({
    environment: 'development',
    enabled: true,
    allowedOrigins: origins(c.allowedOrigins),
    bindingCookieName: c.bindingCookieName,
    accessTokens: port(c.accessTokens, ['verify']),
    principal: port(c.principal, ['resolve']),
    repository: port(c.repository, [
      'readSession',
      'webContextForCurrentSession',
      'revokeForCurrentSession',
    ]),
    csrf: port(c.csrf, ['verify', 'invalidate']),
    ...(Object.hasOwn(c, 'clock') ? { clock: c.clock } : {}),
  }) as unknown as Config;
}

/** One exclusive dispatcher; all credential authority remains in the accepted branch services. */
export class V2SessionRevocationHttpService {
  private readonly web: (
    targetSessionId: string,
    body: unknown,
    csrf: string | undefined,
    request: Request,
    response: Response,
  ) => Promise<void>;
  private readonly mobile: (
    targetSessionId: string,
    body: unknown,
    csrf: string | undefined,
    request: Request,
    response: Response,
  ) => Promise<void>;
  constructor(input: Config) {
    const config = captureV2SessionRevocationHttpConfig(input);
    const web = new V2WebRevocationHttpService(config);
    const mobile = new V2MobileRevocationHttpService({
      environment: 'development',
      enabled: true,
      accessTokens: config.accessTokens,
      principal: config.principal,
      repository: config.repository,
      ...(config.clock ? { clock: config.clock } : {}),
    });
    this.web = (target, body, csrf, request, response) =>
      web.handle(target, body, csrf, request, response);
    this.mobile = (target, body, _csrf, request, response) =>
      mobile.handle(target, body, request, response);
  }
  async handle(
    targetSessionId: string,
    body: unknown,
    request: Request,
    response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    try {
      if (
        !Array.isArray(request.rawHeaders) ||
        request.rawHeaders.length % 2 !== 0 ||
        request.rawHeaders.some((value) => typeof value !== 'string')
      )
        return this.bad(response);
      const seenCookieNames = new Set<string>();
      const cookies: string[] = [],
        refresh: string[] = [],
        authorization: string[] = [],
        allCookies: string[] = [];
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]?.toLowerCase(),
          value = request.rawHeaders[i + 1] ?? '';
        if (name === 'authorization') authorization.push(value);
        if (name === 'cookie') {
          allCookies.push(value);
          for (const part0 of value.split(';')) {
            const part = part0.replace(/^[\t ]+/, ''),
              ix = part.indexOf('='),
              key = ix < 0 ? part : part.slice(0, ix),
              v = ix < 0 ? '' : part.slice(ix + 1);
            if (
              !key ||
              key !== key.trim() ||
              ix < 1 ||
              /[\t ,]/.test(key) ||
              !/^[\x21-\x7e]*$/.test(v) ||
              /[;,"'\\]/.test(v)
            )
              return this.bad(response);
            if (seenCookieNames.has(key)) return this.bad(response);
            seenCookieNames.add(key);
            if (key === 'st_v2_access') cookies.push(v);
            if (key === 'st_v2_refresh') refresh.push(v);
          }
        }
      }
      const transport = selectV2CredentialTransport('revokeV2Session', {
        accessCookies: cookies,
        refreshCookies: refresh,
        authorizationHeaders: authorization,
      });
      if (
        (transport === 'mobile-access-bearer' && allCookies.length !== 0) ||
        (transport === 'web-cookie' && allCookies.length !== 1)
      )
        return this.bad(response);
      try {
        if (transport === 'web-cookie')
          await this.web(
            targetSessionId,
            body,
            this.singleHeader(request, 'x-session-csrf'),
            request,
            response,
          );
        else
          await this.mobile(
            targetSessionId,
            body,
            undefined,
            request,
            response,
          );
      } catch {
        this.problem(response, 500, 'Internal Server Error');
      }
    } catch {
      this.bad(response);
    }
  }
  private singleHeader(request: Request, wanted: string): string | undefined {
    const values: string[] = [];
    for (let i = 0; i < request.rawHeaders.length; i += 2)
      if (request.rawHeaders[i]?.toLowerCase() === wanted)
        values.push(request.rawHeaders[i + 1] ?? '');
    return values.length === 1 ? values[0] : undefined;
  }
  private bad(response: Response): void {
    this.problem(response, 400, 'Bad Request');
  }
  private problem(response: Response, status: number, title: string): void {
    if (!response.headersSent)
      response
        .status(status)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title,
          status,
          code: 'AUTH_REQUEST_UNAVAILABLE',
        });
  }
}

@Controller('v2/me/sessions')
export class V2SessionRevocationHttpController {
  constructor(
    @Inject(V2SessionRevocationHttpService)
    private readonly service: V2SessionRevocationHttpService,
  ) {}
  @Delete(':id') revoke(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.service.handle(id, body, request, response);
  }
}
