import { Module } from '@nestjs/common';
import { DataRightsController } from './data-rights.controller';
import { DataRightsService } from './data-rights.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [DataRightsController],
  providers: [DataRightsService, PrismaService],
  exports: [DataRightsService],
})
export class DataRightsModule {}
