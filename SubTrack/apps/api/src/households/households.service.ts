import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create household ──────────────────────────────────────────────────────

  async createHousehold(name: string, creatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const household = await tx.household.create({
        data: { name },
      });
      await tx.householdMember.create({
        data: { householdId: household.id, identityId: creatorId, role: 'ADMIN' },
      });
      return household;
    });
  }

  // ─── List members ─────────────────────────────────────────────────────────

  async listMembers(householdId: string, callerId: string) {
    await this.requireMembership(householdId, callerId);
    return this.prisma.householdMember.findMany({
      where: { householdId, leftAt: null },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // ─── Update member role ───────────────────────────────────────────────────

  async updateMemberRole(
    householdId: string,
    memberId: string,
    newRole: 'ADMIN' | 'MEMBER',
    callerId: string,
  ) {
    await this.requireAdminRole(householdId, callerId);

    const target = await this.prisma.householdMember.findUnique({
      where: { id: memberId },
    });
    if (!target || target.householdId !== householdId || target.leftAt !== null) {
      throw new NotFoundException('Member not found.');
    }

    // If demoting, check last-admin invariant
    if (target.role === 'ADMIN' && newRole !== 'ADMIN') {
      await this.assertNotLastAdmin(householdId, memberId);
    }

    return this.prisma.householdMember.update({
      where: { id: memberId },
      data: { role: newRole },
    });
  }

  // ─── Remove member / leave ────────────────────────────────────────────────

  async removeMember(
    householdId: string,
    memberId: string,
    callerId: string,
  ) {
    const callerMember = await this.prisma.householdMember.findFirst({
      where: { householdId, identityId: callerId, leftAt: null },
    });
    if (!callerMember) {
      throw new ForbiddenException('Not a member of this household.');
    }

    const target = await this.prisma.householdMember.findUnique({
      where: { id: memberId },
    });
    if (!target || target.householdId !== householdId || target.leftAt !== null) {
      throw new NotFoundException('Member not found.');
    }

    // Only admins can remove others; members can only remove themselves
    const isSelf = target.identityId === callerId;
    if (!isSelf && callerMember.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can remove other members.');
    }

    // Prevent removing the last admin
    if (target.role === 'ADMIN') {
      await this.assertNotLastAdmin(householdId, memberId);
    }

    return this.prisma.householdMember.update({
      where: { id: memberId },
      data: { leftAt: new Date() },
    });
  }

  // ─── Add dependant ────────────────────────────────────────────────────────

  /**
   * Adds a dependant member — no login Identity required (AC3).
   * The dependant row uses identityId = adminId as a placeholder owner reference;
   * in practice a real product would have a separate dependant registry. For M1
   * the dependant is represented as a HouseholdMember with role=DEPENDANT and no
   * associated login capability. The name is stored as a JSON payload on a
   * corresponding AuditLog entry since HouseholdMember has no display-name field.
   */
  async addDependant(
    householdId: string,
    dependantName: string,
    callerId: string,
  ) {
    await this.requireAdminRole(householdId, callerId);

    return this.prisma.$transaction(async (tx) => {
      // Create a synthetic identity for the dependant (MOCK method, no email/phone)
      const dependantIdentity = await tx.identity.create({
        data: { authMethod: 'MOCK' },
      });

      const member = await tx.householdMember.create({
        data: {
          householdId,
          identityId: dependantIdentity.id,
          role: 'DEPENDANT',
        },
      });

      // Audit entry carries the display name (never in member row itself)
      await tx.auditLog.create({
        data: {
          actorId:     callerId,
          householdId,
          eventType:   'dependant_added',
          payload:     { memberId: member.id, displayName: dependantName },
        },
      });

      return member;
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async requireMembership(householdId: string, identityId: string) {
    const m = await this.prisma.householdMember.findFirst({
      where: { householdId, identityId, leftAt: null },
    });
    if (!m) throw new ForbiddenException('Not a member of this household.');
    return m;
  }

  private async requireAdminRole(householdId: string, identityId: string) {
    const m = await this.requireMembership(householdId, identityId);
    if (m.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required.');
    }
    return m;
  }

  /** Throws if memberId is the last active ADMIN in the household. */
  private async assertNotLastAdmin(householdId: string, memberId: string) {
    const adminCount = await this.prisma.householdMember.count({
      where: { householdId, role: 'ADMIN', leftAt: null },
    });
    const target = await this.prisma.householdMember.findUnique({
      where: { id: memberId },
    });
    if (adminCount === 1 && target?.role === 'ADMIN') {
      throw new ConflictException(
        'Cannot remove or demote the last admin. Transfer admin role first.',
      );
    }
  }
}
