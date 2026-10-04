import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { DevNotificationAdapter } from './notification.adapter';
import type {
  CreateInvitationBody,
  InvitationPreview,
  InvitationResponse,
} from './invitations.dto';

/** 7-day TTL in milliseconds (AC1). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

function sha256hex(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Derives a non-PII handle from an identity's email or phone. */
function adminHandleOf(email: string | null, phone: string | null): string {
  if (email) return email.split('@')[0]!.slice(0, 32);
  if (phone) return `…${phone.slice(-4)}`;
  return 'Admin';
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: DevNotificationAdapter,
  ) {}

  // ─── Create invitation (admin only, AC1) ───────────────────────────────────

  async createInvitation(
    callerId: string,
    householdId: string,
    dto: CreateInvitationBody,
  ): Promise<InvitationResponse & { token?: string }> {
    await this.requireAdminRole(householdId, callerId);

    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
    });
    if (!household) throw new NotFoundException('Household not found.');

    const callerIdentity = await this.prisma.identity.findUnique({
      where: { id: callerId },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256hex(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invitation = await this.prisma.invitation.create({
      data: {
        householdId,
        inviterId: callerId,
        channel: dto.channel as never,
        recipient: dto.recipient ?? null,
        tokenHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    const adminHandle = adminHandleOf(
      callerIdentity?.email ?? null,
      callerIdentity?.phone ?? null,
    );

    await this.notifications.sendInvitation({
      invitationId: invitation.id,
      channel: dto.channel,
      recipient: dto.recipient ?? null,
      rawToken,
      householdName: household.name,
      adminHandle,
      expiresAt,
    });

    return {
      id: invitation.id,
      channel: dto.channel,
      recipient: invitation.recipient,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      // Return raw token so the admin can share the LINK/CODE; omit for EMAIL/SMS
      ...((dto.channel === 'LINK' || dto.channel === 'CODE') ? { token: rawToken } : {}),
    };
  }

  // ─── Preview (unauthenticated, AC2) ───────────────────────────────────────

  async getPreview(rawToken: string): Promise<InvitationPreview> {
    const tokenHash = sha256hex(rawToken);

    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        household: true,
        inviter: true,
      },
    });

    if (!invitation) return { status: 'NOT_FOUND' };
    if (invitation.status === 'REVOKED') return { status: 'REVOKED' };
    if (invitation.status === 'ACCEPTED' || invitation.status === 'DECLINED') {
      return { status: 'USED' };
    }
    if (new Date() > invitation.expiresAt) return { status: 'EXPIRED' };

    const memberCount = await this.prisma.householdMember.count({
      where: { householdId: invitation.householdId, leftAt: null },
    });

    return {
      status: 'VALID',
      householdName: invitation.household.name,
      adminHandle: adminHandleOf(
        invitation.inviter.email ?? null,
        invitation.inviter.phone ?? null,
      ),
      memberCount,
    };
  }

  // ─── Accept (idempotent, AC3) ──────────────────────────────────────────────

  async acceptInvitation(rawToken: string, inviteeId: string): Promise<void> {
    const inv = await this.lookupActiveInvitation(rawToken);

    if (inv.status === 'ACCEPTED') return; // idempotent

    if (inv.status !== 'PENDING' || new Date() > inv.expiresAt) {
      throw new UnprocessableEntityException(
        'Invitation is no longer valid.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: 'ACCEPTED', inviteeId },
      });
      await tx.householdMember.create({
        data: { householdId: inv.householdId, identityId: inviteeId, role: 'MEMBER' },
      });
      await tx.auditLog.create({
        data: {
          actorId: inviteeId,
          householdId: inv.householdId,
          eventType: 'INVITATION_ACCEPTED',
          payload: { invitationId: inv.id },
        },
      });
    });

    const invitee = await this.prisma.identity.findUnique({ where: { id: inviteeId } });
    await this.notifications.notifyAdmin({
      adminIdentityId: inv.inviterId,
      inviteeHandle: adminHandleOf(invitee?.email ?? null, invitee?.phone ?? null),
      eventType: 'INVITATION_ACCEPTED',
      householdId: inv.householdId,
    });
  }

  // ─── Decline (idempotent, AC3) ─────────────────────────────────────────────

  async declineInvitation(rawToken: string, inviteeId: string): Promise<void> {
    const inv = await this.lookupActiveInvitation(rawToken);

    if (inv.status === 'DECLINED') return; // idempotent

    if (inv.status !== 'PENDING' || new Date() > inv.expiresAt) {
      throw new UnprocessableEntityException(
        'Invitation is no longer valid.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.invitation.update({
        where: { id: inv.id },
        data: { status: 'DECLINED', inviteeId },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: inviteeId,
          householdId: inv.householdId,
          eventType: 'INVITATION_DECLINED',
          payload: { invitationId: inv.id },
        },
      }),
    ]);

    const invitee = await this.prisma.identity.findUnique({ where: { id: inviteeId } });
    await this.notifications.notifyAdmin({
      adminIdentityId: inv.inviterId,
      inviteeHandle: adminHandleOf(invitee?.email ?? null, invitee?.phone ?? null),
      eventType: 'INVITATION_DECLINED',
      householdId: inv.householdId,
    });
  }

  // ─── Revoke (admin only, AC1) ──────────────────────────────────────────────

  async revokeInvitation(
    callerId: string,
    householdId: string,
    invitationId: string,
  ): Promise<void> {
    await this.requireAdminRole(householdId, callerId);

    const inv = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!inv || inv.householdId !== householdId) {
      throw new NotFoundException('Invitation not found.');
    }
    if (inv.status === 'REVOKED') return; // idempotent

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    });
  }

  // ─── List invitations (admin, read-only) ───────────────────────────────────

  async listInvitations(callerId: string, householdId: string) {
    await this.requireAdminRole(householdId, callerId);
    return this.prisma.invitation.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        channel: true,
        recipient: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async requireAdminRole(householdId: string, identityId: string) {
    const m = await this.prisma.householdMember.findFirst({
      where: { householdId, identityId, leftAt: null },
    });
    if (!m) throw new ForbiddenException('Not a member of this household.');
    if (m.role !== 'ADMIN') throw new ForbiddenException('Admin role required.');
    return m;
  }

  private async lookupActiveInvitation(rawToken: string) {
    const tokenHash = sha256hex(rawToken);
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });
    if (!inv) throw new NotFoundException('Invitation not found or already used.');
    return inv;
  }
}
