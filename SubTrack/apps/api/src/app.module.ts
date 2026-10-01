import { Module } from '@nestjs/common';
import { OpsController } from './ops/ops.controller';
import { PrismaService } from './database/prisma.service';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OpsController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
