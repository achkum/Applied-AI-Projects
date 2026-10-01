import { Module } from '@nestjs/common';
import { OpsController } from './ops/ops.controller';
import { PrismaService } from './database/prisma.service';
import { PrivacyModule } from './privacy/privacy.module';

@Module({
  imports: [PrivacyModule],
  controllers: [OpsController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
