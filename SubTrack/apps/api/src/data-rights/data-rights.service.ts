import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { buildZip } from './zip.util';
import type { DeleteAccountBody, ExportJobResponse, ExportTokenEntry } from './data-rights.dto';

// ─── In-memory export token store (AC1: 24h TTL) ─────────────────────────────

const EXPORT_TTL_MS = 24 * 60 * 60 * 1_000;

const exportStore = new Map<string, ExportTokenEntry>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, entry] of exportStore) {
    if (entry.expiresAt.getTime() < now) exportStore.delete(token);
  }
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(fields: unknown[]): string {
  return fields.map(csvEscape).join(',');
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class DataRightsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── POST /v1/data-rights/export (AC1) ───────────────────────────────────

  async requestExport(callerId: string): Promise<ExportJobResponse> {
    pruneExpired();

    // Collect all data owned by this identity
    const [identity, memberships, sentInvitations, receivedInvitations, consents, auditEntries, subscriptions, shares] =
      await Promise.all([
        this.prisma.identity.findUnique({ where: { id: callerId } }),
        this.prisma.householdMember.findMany({ where: { identityId: callerId } }),
        this.prisma.invitation.findMany({ where: { inviterId: callerId } }),
        this.prisma.invitation.findMany({ where: { inviteeId: callerId } }),
        this.prisma.consent.findMany({ where: { identityId: callerId } }),
        this.prisma.auditLog.findMany({ where: { actorId: callerId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.subscription.findMany({ where: { identityId: callerId } }),
        this.prisma.subscriptionShare.findMany({ where: { sharedBy: callerId } }),
      ]);

    if (!identity) throw new NotFoundException('Identity not found.');

    // ── JSON export ───────────────────────────────────────────────────────────
    const exportData = {
      exportedAt: new Date().toISOString(),
      identity: {
        id: identity.id,
        externalId: identity.externalId,
        authMethod: identity.authMethod,
        email: identity.email,
        phone: identity.phone,
        createdAt: identity.createdAt.toISOString(),
        updatedAt: identity.updatedAt.toISOString(),
      },
      householdMemberships: memberships.map(m => ({
        id: m.id,
        householdId: m.householdId,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        leftAt: m.leftAt?.toISOString() ?? null,
      })),
      sentInvitations: sentInvitations.map(inv => ({
        id: inv.id,
        householdId: inv.householdId,
        channel: inv.channel,
        recipient: inv.recipient,
        status: inv.status,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
      receivedInvitations: receivedInvitations.map(inv => ({
        id: inv.id,
        householdId: inv.householdId,
        channel: inv.channel,
        status: inv.status,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
      consents: consents.map(c => ({
        id: c.id,
        scopeId: c.scopeId,
        scopeType: c.scopeType,
        openBook: c.openBook,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        customName: s.customName,
        categoryCode: s.categoryCode,
        cadence: s.cadence,
        expectedAmountMinor: s.expectedAmountMinor.toString(),
        currency: s.currency,
        status: s.status,
        alwaysPrivate: s.alwaysPrivate,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      subscriptionShares: shares.map(s => ({
        id: s.id,
        subscriptionId: s.subscriptionId,
        householdId: s.householdId,
        sharedAt: s.sharedAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null,
      })),
      auditEntries: auditEntries.map(e => ({
        id: e.id,
        eventType: e.eventType,
        householdId: e.householdId,
        createdAt: e.createdAt.toISOString(),
      })),
    };

    const jsonBuf = Buffer.from(JSON.stringify(exportData, null, 2), 'utf8');

    // ── CSV export (subscriptions) ────────────────────────────────────────────
    const csvLines = [
      rowToCsv(['id', 'customName', 'categoryCode', 'cadence', 'currency', 'expectedAmountMinor', 'status', 'alwaysPrivate', 'createdAt']),
      ...subscriptions.map(s =>
        rowToCsv([s.id, s.customName, s.categoryCode, s.cadence, s.currency, s.expectedAmountMinor.toString(), s.status, s.alwaysPrivate, s.createdAt.toISOString()]),
      ),
    ];
    const csvBuf = Buffer.from(csvLines.join('\n'), 'utf8');

    // ── Bundle into ZIP ───────────────────────────────────────────────────────
    const zip = buildZip([
      { name: 'export.json', data: jsonBuf },
      { name: 'subscriptions.csv', data: csvBuf },
    ]);

    // ── Store with 24h TTL ────────────────────────────────────────────────────
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
    exportStore.set(token, { callerId, data: zip, expiresAt });

    // Audit: export requested
    await this.appendAuditEvent(callerId, null, 'data_export_requested', { token: sha256hex(token) });

    return {
      token,
      downloadUrl: `/v1/data-rights/export/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ─── GET /v1/data-rights/export/:token (AC1, AC3) ────────────────────────

  getExportZip(token: string): Buffer {
    pruneExpired();
    const entry = exportStore.get(token);
    if (!entry) {
      // AC3: do not reveal whether token once existed
      throw new NotFoundException('Export not found or expired.');
    }
    if (entry.expiresAt.getTime() < Date.now()) {
      exportStore.delete(token);
      throw new NotFoundException('Export not found or expired.');
    }
    return entry.data;
  }

  // ─── DELETE /v1/data-rights/account (AC2) ────────────────────────────────

  async deleteAccount(callerId: string, dto: DeleteAccountBody): Promise<void> {
    // Verify identity exists and is not already deleted
    const identity = await this.prisma.identity.findUnique({ where: { id: callerId } });
    if (!identity) throw new NotFoundException('Identity not found.');
    if (identity.deletedAt !== null) throw new ForbiddenException('Account already deleted.');

    // AC2: re-auth gate — A5 is Assumed; in dev/simulator accept any non-empty string.
    // Real BankID verification must be wired before production (D-12).
    if (!dto.reAuthToken || dto.reAuthToken.trim().length === 0) {
      await this.appendAuditEvent(callerId, null, 'account_deletion_rejected', { reason: 'missing_reauth' });
      throw new UnauthorizedException('Re-authentication is required to delete your account.');
    }

    // AC2: if caller is the sole admin of a household with remaining active members,
    // require them to transfer the admin role before deletion.
    const adminMemberships = await this.prisma.householdMember.findMany({
      where: { identityId: callerId, role: 'ADMIN', leftAt: null },
      include: { household: { include: { members: { where: { leftAt: null } } } } },
    });

    for (const membership of adminMemberships) {
      const activeMembers = membership.household.members;
      const otherMembers = activeMembers.filter(m => m.identityId !== callerId);
      const otherAdmins = otherMembers.filter(m => m.role === 'ADMIN');

      if (otherMembers.length > 0 && otherAdmins.length === 0) {
        throw new BadRequestException(
          `You are the sole admin of household "${membership.household.name}". Transfer the admin role to another member before deleting your account.`,
        );
      }
    }

    // AC2: hard-delete personal data — null out PII fields, set deletedAt.
    // Audit log entries are kept with the pseudonymous actorId UUID.
    await this.prisma.$transaction(async tx => {
      // Erase PII fields on identity
      await tx.identity.update({
        where: { id: callerId },
        data: {
          externalId: null,
          email: null,
          phone: null,
          deletedAt: new Date(),
        },
      });

      // Remove consent records (identity-linked preferences)
      await tx.consent.deleteMany({ where: { identityId: callerId } });

      // Revoke any pending invitations sent by this identity
      await tx.invitation.updateMany({
        where: { inviterId: callerId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });

      // Leave household — mark all active memberships as left
      await tx.householdMember.updateMany({
        where: { identityId: callerId, leftAt: null },
        data: { leftAt: new Date() },
      });
    });

    // AC3: audit the deletion (keep pseudonymous identifier)
    await this.appendAuditEvent(callerId, null, 'account_deleted', {
      deletedAt: new Date().toISOString(),
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async appendAuditEvent(
    actorId: string,
    householdId: string | null,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const prev = await this.prisma.auditLog.findFirst({
      where: { actorId, eventType: { startsWith: 'data_' } },
      orderBy: { createdAt: 'desc' },
    });

    const prevHash = prev
      ? sha256hex(JSON.stringify({ id: prev.id, eventType: prev.eventType, payload: prev.payload, createdAt: prev.createdAt.toISOString() }))
      : null;

    await this.prisma.auditLog.create({
      data: {
        actorId,
        householdId,
        eventType,
        payload: { ...data, prevHash },
      },
    });
  }
}
