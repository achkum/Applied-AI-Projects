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
  V2MobileListingHttpController,
  V2MobileListingHttpService,
  type V2MobileListingHttpConfig,
} from './v2-mobile-listing-http.js';

const CONFIG = Symbol('V2_MOBILE_LISTING_HTTP_CONFIG');
const FAIL = 'V2 mobile listing unavailable';
const REQUIRED = [
  'environment',
  'enabled',
  'accessTokens',
  'principal',
  'repository',
];
function snapshot(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error(FAIL);
  const keys = Reflect.ownKeys(input);
  if (
    keys.some(
      (k) => typeof k !== 'string' || (!REQUIRED.includes(k) && k !== 'clock'),
    ) ||
    REQUIRED.some((k) => !keys.includes(k))
  )
    throw new Error(FAIL);
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d) || !d.enumerable) throw new Error(FAIL);
    out[key] = d.value;
  }
  return out;
}
function port(target: unknown, key: string): object {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    throw new Error(FAIL);
  let p: object | null = target;
  while (p) {
    const d = Object.getOwnPropertyDescriptor(p, key);
    if (d) {
      if (!('value' in d) || typeof d.value !== 'function')
        throw new Error(FAIL);
      return Object.freeze({
        [key]: Function.prototype.bind.call(d.value, target),
      });
    }
    p = Object.getPrototypeOf(p) as object | null;
  }
  throw new Error(FAIL);
}
function namespace(request: { originalUrl?: string }): boolean {
  if (typeof request.originalUrl !== 'string') return false;
  return request.originalUrl.split('?', 1)[0] === '/v2/me/sessions';
}
@Module({})
export class V2MobileListingHttpModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}
  static register(input: V2MobileListingHttpConfig): DynamicModule {
    const raw = snapshot(input);
    if (
      raw.environment !== 'development' ||
      raw.enabled !== true ||
      (Object.hasOwn(raw, 'clock') && typeof raw.clock !== 'function')
    )
      throw new Error(FAIL);
    const config = Object.freeze({
      environment: 'development',
      enabled: true,
      accessTokens: port(raw.accessTokens, 'verify'),
      principal: port(raw.principal, 'resolve'),
      repository: port(raw.repository, 'listForCurrentSession'),
      ...(raw.clock ? { clock: raw.clock } : {}),
    });
    return {
      module: V2MobileListingHttpModule,
      controllers: [V2MobileListingHttpController],
      providers: [
        { provide: CONFIG, useValue: config },
        {
          provide: V2MobileListingHttpService,
          useFactory: (value: V2MobileListingHttpConfig) =>
            new V2MobileListingHttpService(value),
          inject: [CONFIG],
        },
      ],
      exports: [V2MobileListingHttpService],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        (
          _req: unknown,
          res: { setHeader(name: string, value: string): void },
          next: () => void,
        ) => {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Pragma', 'no-cache');
          next();
        },
      )
      .forRoutes({ path: 'v2/me/sessions', method: RequestMethod.ALL });
    const parserErrorHandler: ErrorRequestHandler = (
      _error,
      request,
      response,
      next,
    ) => {
      if (!namespace(request)) {
        next(_error);
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
      if (!response.headersSent)
        response.status(400).type('application/problem+json').send({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'AUTH_REQUEST_UNAVAILABLE',
        });
      else next(_error);
    };
    this.adapterHost.httpAdapter.use('/v2/me/sessions', parserErrorHandler);
  }
}
