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
  V2WebSessionHttpController,
  V2WebSessionHttpService,
  v2WebSessionNoStore,
  type V2WebSessionHttpConfig,
} from './v2-web-session-http.js';

const CONFIG = Symbol('V2_WEB_SESSION_HTTP_CONFIG');
const COOKIE = /^[A-Za-z0-9_-]{1,64}$/;
const REQUIRED = [
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
];
function snapshot(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error('V2 web session bridge unavailable');
  const keys = Reflect.ownKeys(input);
  if (
    keys.some(
      (key) =>
        typeof key !== 'string' || (!REQUIRED.includes(key) && key !== 'clock'),
    ) ||
    REQUIRED.some((key) => !keys.includes(key))
  )
    throw new Error('V2 web session bridge unavailable');
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable)
      throw new Error('V2 web session bridge unavailable');
    result[key] = d.value;
  }
  return result;
}
function stringArray(input: unknown): string[] {
  if (!Array.isArray(input))
    throw new Error('V2 web session bridge unavailable');
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
    throw new Error('V2 web session bridge unavailable');
  const values: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !('value' in d) || !d.enumerable || typeof d.value !== 'string')
      throw new Error('V2 web session bridge unavailable');
    values.push(d.value);
  }
  return values;
}
function callable(target: unknown, key: string): (...args: never[]) => unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    throw new Error('V2 web session bridge unavailable');
  let current: object | null = target;
  while (current) {
    const d = Object.getOwnPropertyDescriptor(current, key);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function')
        throw new Error('V2 web session bridge unavailable');
      return Function.prototype.bind.call(d.value, target) as (
        ...args: never[]
      ) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error('V2 web session bridge unavailable');
}
function portCopy(value: unknown, names: readonly string[]): object {
  const copy: Record<string, unknown> = Object.create(null);
  for (const name of names) copy[name] = callable(value, name);
  return Object.freeze(copy);
}
function isNamespace(request: { originalUrl?: string }): boolean {
  if (typeof request.originalUrl !== 'string') return false;
  const path = request.originalUrl.split('?', 1)[0] ?? '';
  return path === '/v2/auth/session' || path.startsWith('/v2/auth/session/');
}

@Module({})
export class V2WebSessionHttpModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}
  static register(input: V2WebSessionHttpConfig): DynamicModule {
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
      throw new Error('V2 web session bridge unavailable');
    const origins = stringArray(raw.allowedOrigins).map((origin) => {
      if (typeof origin !== 'string' || origin.trim() !== origin)
        throw new Error('V2 web session bridge unavailable');
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error('V2 web session bridge unavailable');
      }
      if (
        url.protocol !== 'https:' ||
        url.origin !== origin ||
        url.username ||
        url.password ||
        url.hostname.includes('*') ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error('V2 web session bridge unavailable');
      return origin;
    });
    if (new Set(origins).size !== origins.length)
      throw new Error('V2 web session bridge unavailable');
    const config = Object.freeze({
      environment: 'development',
      enabled: true,
      allowedOrigins: Object.freeze(origins),
      bindingCookieName: raw.bindingCookieName,
      authorityHmacKey: Buffer.from(raw.authorityHmacKey as Uint8Array),
      nonce: portCopy(raw.nonce, ['validateBound', 'consumeForSession']),
      issuer: portCopy(raw.issuer, ['issueFromLoginProof']),
      principal: portCopy(raw.principal, ['resolve']),
      repository: portCopy(raw.repository, [
        'readSession',
        'webContextForCurrentSession',
        'rollbackCreatedSession',
      ]),
      csrf: portCopy(raw.csrf, ['mint', 'invalidate']),
      idempotency: portCopy(raw.idempotency, ['reserve', 'settle']),
      ...(raw.clock ? { clock: raw.clock } : {}),
    });
    return {
      module: V2WebSessionHttpModule,
      controllers: [V2WebSessionHttpController],
      providers: [
        { provide: CONFIG, useValue: config },
        {
          provide: V2WebSessionHttpService,
          useFactory: (value: V2WebSessionHttpConfig) =>
            new V2WebSessionHttpService(value),
          inject: [CONFIG],
        },
      ],
      exports: [V2WebSessionHttpService],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(v2WebSessionNoStore)
      .forRoutes({ path: 'v2/auth/session', method: RequestMethod.ALL });
    const adapter = this.adapterHost.httpAdapter;
    const parserErrorHandler: ErrorRequestHandler = (
      _error,
      request,
      response,
      next,
    ) => {
      if (!isNamespace(request)) {
        next(_error);
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
      if (response.headersSent) {
        next(_error);
        return;
      }
      response.status(400).type('application/problem+json').send({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        code: 'AUTH_REQUEST_UNAVAILABLE',
      });
    };
    adapter.use('/v2/auth/session', parserErrorHandler);
  }
}
