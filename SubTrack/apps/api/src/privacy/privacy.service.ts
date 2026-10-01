import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { SetOpenBookBody, ConsentSetting, SubscriptionSummary } from './privacy.dto';

// ─── In-process consent cache (AC1: TTL ≤5s) ─────────────────────────────────

const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  openBook: boolean;
  expiresAt: number;
}

// Key: `${identityId}:${householdId}`
const consentCache = new Map<string, CacheEntry>();

function cacheKey(identityId: string, householdId: string): string {
  return `${identityId}:${householdId}`;
}

function cacheGet(identityId: string, householdId: string): boolean | undefined {
  const entry = consentCache.get(cacheKey(identityId, householdId));
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    consentCache.delete(cacheKey(identityId, householdId));
    return undefined;
  }
  return entry.openBook;
}

function cacheSet(identityId: string, householdId: string, openBook: boolean): void {
  consentCache.set(cacheKey(identityId, householdId), {
    openBook,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function cacheInvalidate(identityId: string, householdId: string): void {
  consentCache.delete(cacheKey(identityId, householdId));
}

// ─── Inline visibility policy (mirrors packages/domain/policy) ────────────────

interface ActiveShare {
  subscriptionId: string;
  householdId: string;
}

interface HouseholdMembership {
  identityId: string;
  householdId: string;
  openBook: boolean;
}

function evaluateVisibility(
  requesterId: string,
  ctx: {
    subscriptionId: string;
    ownerId: string;
    alwaysPrivate: boolean;
    activeShares: ActiveShare[];
    activeMemberships: HouseholdMembership[];
  },
): 'GRANTED' | 'DENIED' {
  if (requesterId === ctx.ownerId) return 'GRANTED';

  const requesterHouseholds = new Set(
    ctx.activeMemberships.filter(m => m.identityId === requesterId).map(m => m.householdId),
  );

  const hasShare = ctx.activeShares.some(
    s => s.subscriptionId === ctx.subscriptionId && requesterHouseholds.has(s.householdId),
  );
  if (hasShare) return 'GRANTED';

  if (!ctx.alwaysPrivate) {
    const ownerOpenBookHouseholds = new Set(
      ctx.activeMemberships.filter(m => m.identityId === ctx.ownerId && m.openBook).map(m => m.householdId),
    );
    for (const hid of ownerOpenBookHouseholds) {
      if (requesterHouseholds.has(hid)) return 'GRANTED';
    }
  }

  return 'DENIED';
}

// ─── Hash-chain helpers ───────────────────────────────────────────────────────

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get consent settings for all households (AC1) ────────────────────────

  async getSettings(callerId: string): Promise<ConsentSetting[]> {
    const consents = await this.prisma.consent.findMany({
      where: { identityId: callerId, scopeType: 'HOUSEHOLD' },
      orderBy: { updatedAt: 'desc' },
    });
    return consents.map(c => ({
      householdId: c.scopeId,
      openBook: c.openBook,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  // ─── Toggle open_book (AC1, AC4) ──────────────────────────────────────────

  async setOpenBook(callerId: string, dto: SetOpenBookBody): Promise<ConsentSetting> {
    // AC4: only own privacy setting; admin cannot alter another member's
    // (callerId is always the identity being updated — no targetId parameter)

    // Verify caller is actually a member of this household
    const membership = await this.prisma.householdMember.findFirst({
      where: { householdId: dto.householdId, identityId: callerId, leftAt: null },
    });
    if (!membership) {
      throw new NotFoundException('Not a member of this household.');
    }

    // Upsert the consent record
    const consent = await this.prisma.consent.upsert({
      where: {
        identityId_scopeId_scopeType: {
          identityId: callerId,
          scopeId: dto.householdId,
          scopeType: 'HOUSEHOLD',
        },
      },
      update: { openBook: dto.openBook },
      create: {
        identityId: callerId,
        scopeId: dto.householdId,
        scopeType: 'HOUSEHOLD',
        openBook: dto.openBook,
      },
    });

    // Invalidate cache for this identity × household so next read is fresh (AC1)
    cacheInvalidate(callerId, dto.householdId);

    // Write hash-chained audit event (AC1)
    await this.appendPrivacyAuditEvent(callerId, dto.householdId, {
      eventType: 'consent_updated',
      openBook: dto.openBook,
      scopeId: dto.householdId,
    });

    return {
      householdId: consent.scopeId,
      openBook: consent.openBook,
      updatedAt: consent.updatedAt.toISOString(),
    };
  }

  // ─── Preview as household member (AC3) ────────────────────────────────────

  async previewAsHousehold(callerId: string, householdId: string): Promise<SubscriptionSummary[]> {
    // Verify caller is a member
    const callerMember = await this.prisma.householdMember.findFirst({
      where: { householdId, identityId: callerId, leftAt: null },
    });
    if (!callerMember) {
      throw new ForbiddenException('Not a member of this household.');
    }

    // Load all active members of the household
    const members = await this.prisma.householdMember.findMany({
      where: { householdId, leftAt: null },
    });

    const memberIdentityIds = members.map(m => m.identityId);

    // Load consent for open_book per member (cached where possible, AC1)
    const openBookMap = new Map<string, boolean>();
    for (const identityId of memberIdentityIds) {
      const cached = cacheGet(identityId, householdId);
      if (cached !== undefined) {
        openBookMap.set(identityId, cached);
      } else {
        const consent = await this.prisma.consent.findUnique({
          where: {
            identityId_scopeId_scopeType: {
              identityId,
              scopeId: householdId,
              scopeType: 'HOUSEHOLD',
            },
          },
        });
        const openBook = consent?.openBook ?? false;
        cacheSet(identityId, householdId, openBook);
        openBookMap.set(identityId, openBook);
      }
    }

    // Build activeMemberships with resolved openBook
    const activeMemberships: HouseholdMembership[] = members.map(m => ({
      identityId: m.identityId,
      householdId,
      openBook: openBookMap.get(m.identityId) ?? false,
    }));

    // Load all subscriptions owned by household members
    const subscriptions = await this.prisma.subscription.findMany({
      where: { identityId: { in: memberIdentityIds } },
    });

    // Load all active shares for this household
    const shares = await this.prisma.subscriptionShare.findMany({
      where: { householdId, revokedAt: null },
    });

    const activeShares: ActiveShare[] = shares.map(s => ({
      subscriptionId: s.subscriptionId,
      householdId: s.householdId,
    }));

    // Evaluate visibility for each subscription and build safe summaries (AC3)
    const results: SubscriptionSummary[] = [];
    for (const sub of subscriptions) {
      const decision = evaluateVisibility(callerId, {
        subscriptionId: sub.id,
        ownerId: sub.identityId,
        alwaysPrivate: sub.alwaysPrivate,
        activeShares,
        activeMemberships,
      });

      if (decision === 'GRANTED') {
        const summary: SubscriptionSummary = {
          id: sub.id,
          customName: sub.customName,
          categoryCode: sub.categoryCode,
          cadence: sub.cadence,
          status: sub.status,
        };
        // Only expose alwaysPrivate to the subscription owner
        if (callerId === sub.identityId) {
          summary.alwaysPrivate = sub.alwaysPrivate;
        }
        results.push(summary);
      }
    }

    return results;
  }

  // ─── Private: hash-chained audit event ───────────────────────────────────

  private async appendPrivacyAuditEvent(
    actorId: string,
    householdId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Fetch the previous privacy audit event for this actor to build the chain
    const prev = await this.prisma.auditLog.findFirst({
      where: { actorId, eventType: { startsWith: 'consent_' } },
      orderBy: { createdAt: 'desc' },
    });

    const prevHash = prev
      ? sha256hex(JSON.stringify({ id: prev.id, eventType: prev.eventType, payload: prev.payload, createdAt: prev.createdAt.toISOString() }))
      : null;

    await this.prisma.auditLog.create({
      data: {
        actorId,
        householdId,
        eventType: String(data['eventType']),
        payload: { ...data, prevHash },
      },
    });
  }
}
