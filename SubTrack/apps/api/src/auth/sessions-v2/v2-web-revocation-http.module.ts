import {
  DynamicModule,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ErrorRequestHandler } from 'express';
import {
  V2WebRevocationHttpController,
  V2WebRevocationHttpService,
  type V2WebRevocationHttpConfig,
} from './v2-web-revocation-http.js';

const CONFIG = Symbol('V2_WEB_REVOCATION_HTTP_CONFIG');
const REQUIRED = [
  'environment',
  'enabled',
  'allowedOrigins',
  'bindingCookieName',
  'accessTokens',
  'principal',
  'repository',
  'csrf',
];
function snapshot(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error('V2 web revocation unavailable');
  const keys = Reflect.ownKeys(input);
  if (
    keys.some(
      (k) => typeof k !== 'string' || (!REQUIRED.includes(k) && k !== 'clock'),
    ) ||
    REQUIRED.some((k) => !keys.includes(k))
  )
    throw new Error('V2 web revocation unavailable');
  const out = Object.create(null) as Record<string, unknown>;
  for (const k of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(input, k);
    if (!d || !('value' in d) || !d.enumerable)
      throw new Error('V2 web revocation unavailable');
    out[k] = d.value;
  }
  return out;
}
function values(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('V2 web revocation unavailable');
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
    throw new Error('V2 web revocation unavailable');
  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !('value' in d) || !d.enumerable || typeof d.value !== 'string')
      throw new Error('V2 web revocation unavailable');
    out.push(d.value);
  }
  return out;
}
function port(input: unknown, names: readonly string[]): object {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('V2 web revocation unavailable');
  const result = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    let p: object | null = input;
    let found = false;
    while (p) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d) {
        if (!('value' in d) || typeof d.value !== 'function')
          throw new Error('V2 web revocation unavailable');
        result[name] = Function.prototype.bind.call(d.value, input);
        found = true;
        break;
      }
      p = Object.getPrototypeOf(p) as object | null;
    }
    if (!found) throw new Error('V2 web revocation unavailable');
  }
  return Object.freeze(result);
}
function namespace(request: { originalUrl?: string }): boolean {
  if (typeof request.originalUrl !== 'string') return false;
  return (
    request.originalUrl.split('?', 1)[0]?.startsWith('/v2/me/sessions/') ===
    true
  );
}

@Module({})
export class V2WebRevocationHttpModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}
  static register(input: V2WebRevocationHttpConfig): DynamicModule {
    const raw = snapshot(input);
    if (
      raw.environment !== 'development' ||
      raw.enabled !== true ||
      typeof raw.bindingCookieName !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(raw.bindingCookieName) ||
      ['st_v2_access', 'st_v2_refresh'].includes(
        raw.bindingCookieName as string,
      ) ||
      (Object.hasOwn(raw, 'clock') && typeof raw.clock !== 'function')
    )
      throw new Error('V2 web revocation unavailable');
    const origins = values(raw.allowedOrigins).map((origin) => {
      if (origin.trim() !== origin)
        throw new Error('V2 web revocation unavailable');
      let u: URL;
      try {
        u = new URL(origin);
      } catch {
        throw new Error('V2 web revocation unavailable');
      }
      if (
        u.protocol !== 'https:' ||
        u.origin !== origin ||
        u.username ||
        u.password ||
        u.hostname.includes('*') ||
        u.pathname !== '/' ||
        u.search ||
        u.hash
      )
        throw new Error('V2 web revocation unavailable');
      return origin;
    });
    if (!origins.length || new Set(origins).size !== origins.length)
      throw new Error('V2 web revocation unavailable');
    const config = Object.freeze({
      environment: 'development',
      enabled: true,
      allowedOrigins: Object.freeze(origins),
      bindingCookieName: raw.bindingCookieName,
      accessTokens: port(raw.accessTokens, ['verify']),
      principal: port(raw.principal, ['resolve']),
      repository: port(raw.repository, [
        'readSession',
        'webContextForCurrentSession',
        'revokeForCurrentSession',
      ]),
      csrf: port(raw.csrf, ['verify', 'invalidate']),
      ...(raw.clock ? { clock: raw.clock } : {}),
    });
    return {
      module: V2WebRevocationHttpModule,
      controllers: [V2WebRevocationHttpController],
      providers: [
        { provide: CONFIG, useValue: config },
        {
          provide: V2WebRevocationHttpService,
          useFactory: (value: V2WebRevocationHttpConfig) =>
            new V2WebRevocationHttpService(value),
          inject: [CONFIG],
        },
      ],
      exports: [V2WebRevocationHttpService],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        (
          _request: unknown,
          response: { setHeader: (name: string, value: string) => void },
          next: () => void,
        ) => {
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Pragma', 'no-cache');
          next();
        },
      )
      .forRoutes({ path: 'v2/me/sessions/:id', method: RequestMethod.ALL });
    const handler: ErrorRequestHandler = (error, request, response, next) => {
      if (!namespace(request)) {
        next(error);
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
      if (response.headersSent) {
        next(error);
        return;
      }
      response.status(400).type('application/problem+json').send({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        code: 'AUTH_REQUEST_UNAVAILABLE',
      });
    };
    this.adapterHost.httpAdapter.use('/v2/me/sessions', handler);
  }
}
