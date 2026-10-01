import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { DevNotificationAdapter } from './notification.adapter';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService, DevNotificationAdapter, PrismaService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
