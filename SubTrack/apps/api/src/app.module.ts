import { Module } from '@nestjs/common';
import { OpsController } from './ops/ops.controller';
import { PrismaService } from './database/prisma.service';
import { PrivacyModule } from './privacy/privacy.module';
import { DataRightsModule } from './data-rights/data-rights.module';

@Module({
  imports: [PrivacyModule, DataRightsModule],
  controllers: [OpsController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
