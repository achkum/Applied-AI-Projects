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
  V2WebRefreshHttpController,
  V2WebRefreshHttpService,
  v2WebRefreshNoStore,
  type V2WebRefreshHttpConfig,
} from './v2-web-refresh-http.js';

const CONFIG = Symbol('V2_WEB_REFRESH_HTTP_CONFIG');
const COOKIE = /^[A-Za-z0-9_-]{1,64}$/;
const REQUIRED = [
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
];
function snapshot(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error('V2 web refresh unavailable');
  const keys = Reflect.ownKeys(input);
  if (
    keys.some(
      (k) => typeof k !== 'string' || (!REQUIRED.includes(k) && k !== 'clock'),
    ) ||
    REQUIRED.some((k) => !keys.includes(k))
  )
    throw new Error('V2 web refresh unavailable');
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable)
      throw new Error('V2 web refresh unavailable');
    out[key] = d.value;
  }
  return out;
}
function strings(input: unknown): string[] {
  if (
    !Array.isArray(input) ||
    Reflect.ownKeys(input).length !== input.length + 1
  )
    throw new Error('V2 web refresh unavailable');
  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !('value' in d) || !d.enumerable || typeof d.value !== 'string')
      throw new Error('V2 web refresh unavailable');
    out.push(d.value);
  }
  return out;
}
function callable(
  target: unknown,
  name: string,
): (...args: never[]) => unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    throw new Error('V2 web refresh unavailable');
  let current: object | null = target;
  while (current) {
    const d = Object.getOwnPropertyDescriptor(current, name);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function')
        throw new Error('V2 web refresh unavailable');
      return Function.prototype.bind.call(d.value, target) as (
        ...args: never[]
      ) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error('V2 web refresh unavailable');
}
function port(target: unknown, names: readonly string[]): object {
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names) result[name] = callable(target, name);
  return Object.freeze(result);
}
function namespace(request: { originalUrl?: string }): boolean {
  if (typeof request.originalUrl !== 'string') return false;
  const path = request.originalUrl.split('?', 1)[0] ?? '';
  return path === '/v2/auth/refresh' || path.startsWith('/v2/auth/refresh/');
}

@Module({})
export class V2WebRefreshHttpModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}
  static register(input: V2WebRefreshHttpConfig): DynamicModule {
    const raw = snapshot(input);
    if (
      raw.environment !== 'development' ||
      raw.enabled !== true ||
      !Array.isArray(raw.allowedOrigins) ||
      raw.allowedOrigins.length === 0 ||
      typeof raw.bindingCookieName !== 'string' ||
      !COOKIE.test(raw.bindingCookieName) ||
      ['st_v2_access', 'st_v2_refresh'].includes(raw.bindingCookieName) ||
      !(raw.authorityHmacKey instanceof Uint8Array) ||
      raw.authorityHmacKey.byteLength !== 32 ||
      (Object.hasOwn(raw, 'clock') && typeof raw.clock !== 'function')
    )
      throw new Error('V2 web refresh unavailable');
    const origins = strings(raw.allowedOrigins).map((origin) => {
      let u: URL;
      try {
        u = new URL(origin);
      } catch {
        throw new Error('V2 web refresh unavailable');
      }
      if (
        origin.trim() !== origin ||
        u.protocol !== 'https:' ||
        u.origin !== origin ||
        u.username ||
        u.password ||
        u.hostname.includes('*') ||
        u.pathname !== '/' ||
        u.search ||
        u.hash
      )
        throw new Error('V2 web refresh unavailable');
      return origin;
    });
    if (new Set(origins).size !== origins.length)
      throw new Error('V2 web refresh unavailable');
    const config = Object.freeze({
      environment: 'development',
      enabled: true,
      allowedOrigins: Object.freeze(origins),
      bindingCookieName: raw.bindingCookieName,
      authorityHmacKey: Buffer.from(raw.authorityHmacKey as Uint8Array),
      refresher: port(raw.refresher, ['refresh']),
      principal: port(raw.principal, ['resolve']),
      repository: port(raw.repository, [
        'webContextForRefresh',
        'readSession',
        'revokeRotatedFamily',
      ]),
      csrf: port(raw.csrf, ['verify', 'mint', 'invalidate']),
      idempotency: port(raw.idempotency, ['reserve', 'settle']),
      ...(raw.clock ? { clock: raw.clock } : {}),
    });
    return {
      module: V2WebRefreshHttpModule,
      controllers: [V2WebRefreshHttpController],
      providers: [
        { provide: CONFIG, useValue: config },
        {
          provide: V2WebRefreshHttpService,
          useFactory: (value: V2WebRefreshHttpConfig) =>
            new V2WebRefreshHttpService(value),
          inject: [CONFIG],
        },
      ],
      exports: [V2WebRefreshHttpService],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(v2WebRefreshNoStore)
      .forRoutes({ path: 'v2/auth/refresh', method: RequestMethod.ALL });
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
      response
        .status(400)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'AUTH_REQUEST_UNAVAILABLE',
        });
    };
    this.adapterHost.httpAdapter.use('/v2/auth/refresh', handler);
  }
}
