import { All, Controller, DynamicModule, Inject, MiddlewareConsumer, Module, NestModule, RequestMethod, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ErrorRequestHandler, Response } from 'express';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard.js';
import { MobileEnrollmentChallengeStore } from '../proofs-v2/mobile-enrollment-challenge-store.js';
import { InMemoryOtpChallengeRepository, OtpProofProducer } from '../proofs-v2/otp-proof-producer.js';
import { InMemoryProofRepository, ProofStore } from '../proofs-v2/proof-store.js';
import { OtpRateLimiter } from './otp-http.js';
import { DevelopmentMobileEnrollmentOtpHttpService, MobileEnrollmentOtpHttpController,
  type MobileEnrollmentOtpHttpConfig } from './mobile-enrollment-otp-http.js';

function namespace(url: string | undefined): boolean {
  return typeof url === 'string' && /^\/v2\/auth\/otp\/(?:start|verify)(?:\?.*)?$/.test(url);
}

@Controller('v2/auth/otp')
class UnavailableMobileEnrollmentOtpController {
  @All('start') start(@Res() response: Response): void { this.unavailable(response); }
  @All('verify') verify(@Res() response: Response): void { this.unavailable(response); }
  private unavailable(response: Response): void {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Pragma', 'no-cache');
    response.status(404).type('application/problem+json').send({
      type: 'about:blank', title: 'Not Found', status: 404, code: 'AUTH_RESTART_REQUIRED',
    });
  }
}

@Module({})
export class MobileEnrollmentOtpHttpModule implements NestModule {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}
  static register(input: MobileEnrollmentOtpHttpConfig | { readonly environment: string; readonly enabled?: boolean }): DynamicModule {
    if (input.environment !== 'development' || input.enabled !== true)
      return { module: MobileEnrollmentOtpHttpModule, controllers: [UnavailableMobileEnrollmentOtpController] };
    const config = input as MobileEnrollmentOtpHttpConfig;
    const clock = config.clock;
    const ports = config.ports ?? (() => {
      const challenges = new MobileEnrollmentChallengeStore(clock);
      const repository = new InMemoryOtpChallengeRepository();
      const proofs = new ProofStore(new InMemoryProofRepository(), clock);
      return {
        idempotency: new InMemoryIdempotencyGuard({ key: config.idempotencyKey, ttlMs: 86_400_000, clock }),
        challenges,
        producer: new OtpProofProducer(config.otpKey, repository, proofs, clock),
        rates: new OtpRateLimiter(Buffer.from(config.rateKey), clock),
      };
    })();
    const service = new DevelopmentMobileEnrollmentOtpHttpService(config, ports);
    return { module: MobileEnrollmentOtpHttpModule, controllers: [MobileEnrollmentOtpHttpController],
      providers: [{ provide: DevelopmentMobileEnrollmentOtpHttpService, useValue: service }],
      exports: [DevelopmentMobileEnrollmentOtpHttpService] };
  }
  configure(consumer: MiddlewareConsumer): void {
    const noStore = (_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Pragma', 'no-cache'); next();
    };
    for (const path of ['v2/auth/otp/start', 'v2/auth/otp/verify'])
      consumer.apply(noStore).forRoutes({ path, method: RequestMethod.ALL });
    const parserErrors: ErrorRequestHandler = (error, request, response, next) => {
      if (!namespace(request.originalUrl)) { next(error); return; }
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Pragma', 'no-cache');
      if (!response.headersSent) response.status(400).type('application/problem+json').send({
        type: 'about:blank', title: 'Bad Request', status: 400, code: 'AUTH_RESTART_REQUIRED',
      });
      else next(error);
    };
    this.adapterHost.httpAdapter.use('/v2/auth/otp/start', parserErrors);
    this.adapterHost.httpAdapter.use('/v2/auth/otp/verify', parserErrors);
  }
}
