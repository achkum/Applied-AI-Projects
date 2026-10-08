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
  V2SessionRevocationHttpController,
  V2SessionRevocationHttpService,
  captureV2SessionRevocationHttpConfig,
} from './v2-session-revocation-http.js';
import type { V2SessionRevocationHttpConfig } from './v2-session-revocation-http.js';

const CONFIG = Symbol('V2_SESSION_REVOCATION_HTTP_CONFIG');
function namespace(request: { originalUrl?: string }): boolean {
  return (
    typeof request.originalUrl === 'string' &&
    /^\/v2\/me\/sessions\/[^/]+\/?$/.test(
      request.originalUrl.split('?', 1)[0] ?? '',
    )
  );
}

@Module({})
export class V2SessionRevocationHttpModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}
  static register(config: V2SessionRevocationHttpConfig): DynamicModule {
    const captured = captureV2SessionRevocationHttpConfig(config);
    return {
      module: V2SessionRevocationHttpModule,
      controllers: [V2SessionRevocationHttpController],
      providers: [
        { provide: CONFIG, useValue: captured },
        {
          provide: V2SessionRevocationHttpService,
          useFactory: (value: V2SessionRevocationHttpConfig) =>
            new V2SessionRevocationHttpService(value),
          inject: [CONFIG],
        },
      ],
      exports: [V2SessionRevocationHttpService],
    };
  }
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        (
          _request: unknown,
          response: { setHeader(name: string, value: string): void },
          next: () => void,
        ) => {
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Pragma', 'no-cache');
          next();
        },
      )
      .forRoutes({ path: 'v2/me/sessions/:id', method: RequestMethod.ALL });
    const parserErrorHandler: ErrorRequestHandler = (
      error,
      request,
      response,
      next,
    ) => {
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
    this.adapterHost.httpAdapter.use('/v2/me/sessions', parserErrorHandler);
  }
}
