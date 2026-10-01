import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService, PrismaService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
