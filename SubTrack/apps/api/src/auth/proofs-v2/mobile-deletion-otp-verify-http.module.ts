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
  DevelopmentMobileDeletionOtpVerifyHttpService,
  MobileDeletionOtpVerifyHttpController,
  type MobileDeletionOtpVerifyHttpConfig,
} from './mobile-deletion-otp-verify-http.js';

const CONFIG = Symbol('MOBILE_DELETION_OTP_VERIFY_HTTP_CONFIG');
const FAILURE = 'Authentication request unavailable';
const KEYS = [
  'environment',
  'enabled',
  'authDeleteOtpDevOnly',
  'accessTokens',
  'principal',
  'repository',
  'registeredContacts',
  'otpProofs',
  'idempotency',
  'authorityDigestKey',
  'clock',
] as const;
function snapshot(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error(FAILURE);
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== KEYS.length ||
    keys.some(
      (k) =>
        typeof k !== 'string' || !KEYS.includes(k as (typeof KEYS)[number]),
    )
  )
    throw new Error(FAILURE);
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of KEYS) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !d.enumerable || !('value' in d)) throw new Error(FAILURE);
    out[key] = d.value;
  }
  return out;
}
function captured(target: unknown, names: readonly string[]): object {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    throw new Error(FAILURE);
  const out = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    let p: object | null = target;
    let found = false;
    while (p) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d) {
        if (!('value' in d) || typeof d.value !== 'function')
          throw new Error(FAILURE);
        out[name] = Function.prototype.bind.call(d.value, target);
        found = true;
        break;
      }
      p = Object.getPrototypeOf(p) as object | null;
    }
    if (!found) throw new Error(FAILURE);
  }
  return Object.freeze(out);
}
function namespace(request: { originalUrl?: string }): boolean {
  return (
    typeof request.originalUrl === 'string' &&
    /^\/v2\/me\/reauth\/otp\/verify\/?(?:\?.*)?$/.test(request.originalUrl)
  );
}
@Module({})
export class MobileDeletionOtpVerifyHttpModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}
  static register(input: MobileDeletionOtpVerifyHttpConfig): DynamicModule {
    const raw = snapshot(input);
    if (
      raw.environment !== 'development' ||
      raw.enabled !== true ||
      raw.authDeleteOtpDevOnly !== true ||
      typeof raw.clock !== 'function' ||
      !(raw.authorityDigestKey instanceof Uint8Array)
    )
      throw new Error(FAILURE);
    const key = new Uint8Array(raw.authorityDigestKey);
    if (key.byteLength < 32) throw new Error(FAILURE);
    const config = Object.freeze({
      environment: 'development' as const,
      enabled: true as const,
      authDeleteOtpDevOnly: true as const,
      accessTokens: captured(raw.accessTokens, ['verify']),
      principal: captured(raw.principal, ['resolve']),
      repository: captured(raw.repository, ['readSession']),
      registeredContacts: captured(raw.registeredContacts, [
        'readRegisteredContact',
      ]),
      otpProofs: captured(raw.otpProofs, ['verify']),
      idempotency: captured(raw.idempotency, ['reserve', 'settle']),
      authorityDigestKey: key,
      clock: raw.clock,
    });
    return {
      module: MobileDeletionOtpVerifyHttpModule,
      controllers: [MobileDeletionOtpVerifyHttpController],
      providers: [
        { provide: CONFIG, useValue: config },
        {
          provide: DevelopmentMobileDeletionOtpVerifyHttpService,
          useFactory: (value: MobileDeletionOtpVerifyHttpConfig) =>
            new DevelopmentMobileDeletionOtpVerifyHttpService(value),
          inject: [CONFIG],
        },
      ],
      exports: [DevelopmentMobileDeletionOtpVerifyHttpService],
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
      .forRoutes({
        path: 'v2/me/reauth/otp/verify',
        method: RequestMethod.ALL,
      });
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
    this.adapterHost.httpAdapter.use(
      '/v2/me/reauth/otp/verify',
      parserErrorHandler,
    );
  }
}
