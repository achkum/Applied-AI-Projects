import { Module } from '@nestjs/common';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';
import { InvitationsModule } from './invitations/invitations.module';

@Module({
  imports: [InvitationsModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
  exports: [HouseholdsService, InvitationsModule],
})
export class HouseholdsModule {}
