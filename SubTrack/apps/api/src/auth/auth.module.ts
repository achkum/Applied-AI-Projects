import { Module } from '@nestjs/common';
import { OtpModule } from './otp/otp.module';
import { IdentityProviderModule } from './identity-provider/identity-provider.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [OtpModule, IdentityProviderModule, SessionsModule],
  exports: [OtpModule, IdentityProviderModule, SessionsModule],
})
export class AuthModule {}
