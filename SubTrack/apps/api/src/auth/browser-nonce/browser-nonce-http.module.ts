import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { BrowserNonceHttpController, BrowserNonceHttpService } from './browser-nonce-http.js';
import { BrowserNonceGuard } from './browser-nonce.js';
import { InMemoryIdempotencyGuard } from '../idempotency/idempotency-guard.js';
import { OtpHttpController, OtpHttpService } from '../otp-v2/otp-http.js';

export type BrowserNonceHttpConfig = Readonly<{
  origins: readonly string[]; cookieName: string; cookiePath: string; allowLoopbackHttp: boolean;
  idempotencyKey: Uint8Array; originKey: Uint8Array; otpEnabled?: boolean; otpKey?: Uint8Array; rateKey?: Uint8Array;
}>;

@Module({})
export class BrowserNonceHttpModule {
  static register(config: BrowserNonceHttpConfig): DynamicModule {
    const nonce = new BrowserNonceGuard({ allowedOrigins: config.origins, allowLoopbackHttpDevelopment: config.allowLoopbackHttp });
    const idempotency = new InMemoryIdempotencyGuard({ key: config.idempotencyKey, ttlMs: 86_400_000 });
    const providers: Provider[] = [
      { provide: BrowserNonceGuard, useValue: nonce },
      { provide: BrowserNonceHttpService, useValue: new BrowserNonceHttpService(config, { nonce, idempotency }) },
    ];
    const controllers: (typeof BrowserNonceHttpController | typeof OtpHttpController)[] = [BrowserNonceHttpController];
    if (config.otpEnabled) {
      if (!config.otpKey || !config.rateKey) throw new Error('OTP unavailable');
      providers.push({ provide: OtpHttpService, useValue: new OtpHttpService({ ...config, otpKey: config.otpKey, rateKey: config.rateKey }, { nonce, idempotency }) });
      controllers.push(OtpHttpController);
    }
    return { module: BrowserNonceHttpModule, controllers, providers };
  }
}
