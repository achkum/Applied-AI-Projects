import { Module } from '@nestjs/common';
import { IdentityProviderController } from './identity-provider.controller';
import { IdentityProviderService } from './identity-provider.service';
import { BankIdSimulator } from './bankid-simulator';
import { IDENTITY_PROVIDER } from './identity-provider.interface';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [IdentityProviderController],
  providers: [
    PrismaService,
    {
      provide: IDENTITY_PROVIDER,
      useFactory: () => {
        const secret = process.env['BANKID_HMAC_SECRET'] ?? 'dev-insecure-secret';
        return new BankIdSimulator(secret);
      },
    },
    {
      provide: IdentityProviderService,
      useFactory: (prisma: PrismaService, provider: BankIdSimulator) =>
        new IdentityProviderService(prisma, provider),
      inject: [PrismaService, IDENTITY_PROVIDER],
    },
  ],
  exports: [IdentityProviderService],
})
export class IdentityProviderModule {}
