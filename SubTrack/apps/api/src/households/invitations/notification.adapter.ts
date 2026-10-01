import { Injectable, Logger } from '@nestjs/common';
import type { InvitationChannel } from './invitations.dto';

export interface InviteDeliveryPayload {
  invitationId: string;
  channel: InvitationChannel;
  recipient: string | null;
  /** Raw token to embed in the link/message body. */
  rawToken: string;
  householdName: string;
  adminHandle: string;
  expiresAt: Date;
}

/** AC4: dev-only adapter — logs the token to the server console instead of
 *  sending real email/SMS. Real delivery requires D-09 founder approval. */
@Injectable()
export class DevNotificationAdapter {
  private readonly logger = new Logger(DevNotificationAdapter.name);

  async sendInvitation(payload: InviteDeliveryPayload): Promise<void> {
    this.logger.log(
      `[DEV] Invitation ${payload.invitationId} | channel=${payload.channel}` +
        (payload.recipient ? ` | to=${payload.recipient}` : '') +
        ` | token=${payload.rawToken}` +
        ` | household="${payload.householdName}"` +
        ` | expires=${payload.expiresAt.toISOString()}`,
    );
  }

  async notifyAdmin(payload: {
    adminIdentityId: string;
    inviteeHandle: string;
    eventType: 'INVITATION_ACCEPTED' | 'INVITATION_DECLINED';
    householdId: string;
  }): Promise<void> {
    this.logger.log(
      `[DEV] Admin notification | admin=${payload.adminIdentityId}` +
        ` | invitee=${payload.inviteeHandle}` +
        ` | event=${payload.eventType}` +
        ` | household=${payload.householdId}`,
    );
  }
}
