import { Module } from '@nestjs/common';
import { OtpModule } from './otp/otp.module';
import { IdentityProviderModule } from './identity-provider/identity-provider.module';

@Module({
  imports: [OtpModule, IdentityProviderModule],
  exports: [OtpModule, IdentityProviderModule],
})
export class AuthModule {}
