import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtService } from './jwt.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [JwtService, SessionsService, PrismaService],
  exports: [SessionsService, JwtService],
})
export class SessionsModule {}
