import { Module, type DynamicModule } from '@nestjs/common';
import { OpsController } from './ops/ops.controller';
import { PrismaService } from './database/prisma.service';
import { PrivacyModule } from './privacy/privacy.module';
import { DataRightsModule } from './data-rights/data-rights.module';
import type { ApiConfig } from './config';
import { BrowserNonceHttpModule } from './auth/browser-nonce/browser-nonce-http.module';

@Module({
  imports: [PrivacyModule, DataRightsModule],
  controllers: [OpsController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}

export function appModuleFor(config?: ApiConfig): typeof AppModule | DynamicModule {
  if (!config?.AUTH_V2_BROWSER_NONCE_ENABLED) return AppModule;
  return {
    module: AppModule,
    imports: [BrowserNonceHttpModule.register({
      origins: config.AUTH_V2_ALLOWED_ORIGINS,
      cookieName: config.AUTH_V2_BINDING_COOKIE_NAME!,
      cookiePath: config.AUTH_V2_BINDING_COOKIE_PATH!,
      allowLoopbackHttp: config.AUTH_V2_ALLOW_LOOPBACK_HTTP,
      idempotencyKey: Buffer.from(config.AUTH_V2_IDEMPOTENCY_KEY!, 'hex'),
      originKey: Buffer.from(config.AUTH_V2_BROWSER_ORIGIN_HMAC_KEY!, 'hex'),
      otpEnabled: config.AUTH_V2_OTP_HTTP_ENABLED,
      ...(config.AUTH_V2_OTP_HTTP_ENABLED ? { otpKey: Buffer.from(config.AUTH_V2_OTP_HMAC_KEY!, 'hex'), rateKey: Buffer.from(config.AUTH_V2_RATE_LIMIT_HMAC_KEY!, 'hex') } : {}),
    })],
  };
}
