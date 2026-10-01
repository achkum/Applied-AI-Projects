import { Module } from '@nestjs/common';
import { OpsController } from './ops/ops.controller';
import { PrismaService } from './database/prisma.service';
import { HouseholdsModule } from './households/households.module';

@Module({
  imports: [HouseholdsModule],
  controllers: [OpsController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
