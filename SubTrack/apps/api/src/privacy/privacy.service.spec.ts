import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyService } from './privacy.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockConsentFindMany   = vi.fn();
const mockConsentFindUnique = vi.fn();
const mockConsentUpsert     = vi.fn();
const mockMemberFindFirst   = vi.fn();
const mockMemberFindMany    = vi.fn();
const mockSubFindMany       = vi.fn();
const mockShareFindMany     = vi.fn();
const mockAuditFindFirst    = vi.fn();
const mockAuditCreate       = vi.fn();

function firstCallArgument<T>(calls: readonly (readonly unknown[])[], name: string): T {
  const call = calls[0];
  if (!call) throw new Error(`Expected ${name} to be called`);
  const argument = call[0];
  if (argument === undefined) throw new Error(`Expected ${name} to receive arguments`);
  return argument as T;
}

const mockPrisma = {
  consent: {
    findMany:   mockConsentFindMany,
    findUnique: mockConsentFindUnique,
    upsert:     mockConsentUpsert,
  },
  householdMember: {
    findFirst: mockMemberFindFirst,
    findMany:  mockMemberFindMany,
  },
  subscription:      { findMany: mockSubFindMany },
  subscriptionShare: { findMany: mockShareFindMany },
  auditLog: {
    findFirst: mockAuditFindFirst,
    create:    mockAuditCreate,
  },
} as never;

function makeService() {
  return new PrivacyService(mockPrisma);
}

const NOW = new Date('2026-10-01T12:00:00Z');

function makeMember(identityId: string, role = 'MEMBER') {
  return { id: `member-${identityId}`, householdId: 'hh-1', identityId, role, leftAt: null, joinedAt: NOW };
}

function makeConsent(identityId: string, openBook: boolean) {
  return {
    id: `consent-${identityId}`,
    identityId,
    scopeId: 'hh-1',
    scopeType: 'HOUSEHOLD',
    openBook,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeSubscription(id: string, ownerId: string, alwaysPrivate = false) {
  return {
    id,
    identityId: ownerId,
    customName: `Sub ${id}`,
    categoryCode: 'streaming',
    cadence: 'MONTHLY',
    status: 'ACTIVE',
    alwaysPrivate,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  mockAuditFindFirst.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
});

afterEach(() => {
  // Clear the module-level cache between tests to avoid leakage.
  // The cache is a module-level Map — force expiry by advancing time past TTL.
  vi.setSystemTime(NOW.getTime() + 10_000);
  vi.useRealTimers();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

// ─── getSettings ─────────────────────────────────────────────────────────────

describe('PrivacyService.getSettings', () => {
  it('returns consent settings for all households', async () => {
    mockConsentFindMany.mockResolvedValue([makeConsent('identity-1', true)]);
    const svc = makeService();
    const result = await svc.getSettings('identity-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ householdId: 'hh-1', openBook: true });
  });
});

// ─── setOpenBook ─────────────────────────────────────────────────────────────

describe('PrivacyService.setOpenBook', () => {
  it('upserts consent and writes a hash-chained audit event (AC1)', async () => {
    mockMemberFindFirst.mockResolvedValue(makeMember('identity-1'));
    mockConsentUpsert.mockResolvedValue(makeConsent('identity-1', true));

    const svc = makeService();
    const result = await svc.setOpenBook('identity-1', { householdId: 'hh-1', openBook: true });

    expect(mockConsentUpsert).toHaveBeenCalledOnce();
    expect(result.openBook).toBe(true);

    // Audit event written
    expect(mockAuditCreate).toHaveBeenCalledOnce();
    const auditArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockAuditCreate.mock.calls, 'auditLog.create');
    expect(auditArgs.data.eventType).toBe('consent_updated');
    const payload = auditArgs.data.payload as Record<string, unknown>;
    // prevHash is null when no prior event (genesis)
    expect(payload['prevHash']).toBeNull();
    expect(payload['openBook']).toBe(true);
  });

  it('includes prevHash from previous audit event (AC1 hash chain)', async () => {
    mockMemberFindFirst.mockResolvedValue(makeMember('identity-1'));
    mockConsentUpsert.mockResolvedValue(makeConsent('identity-1', false));
    mockAuditFindFirst.mockResolvedValue({
      id: 'audit-prev',
      eventType: 'consent_updated',
      payload: { openBook: true },
      createdAt: NOW,
    });

    const svc = makeService();
    await svc.setOpenBook('identity-1', { householdId: 'hh-1', openBook: false });

    const auditArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockAuditCreate.mock.calls, 'auditLog.create');
    const payload = auditArgs.data.payload as Record<string, unknown>;
    // prevHash must be a 64-char hex string
    expect(typeof payload['prevHash']).toBe('string');
    expect((payload['prevHash'] as string)).toHaveLength(64);
  });

  it('throws NotFoundException when caller is not a household member (AC4)', async () => {
    mockMemberFindFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.setOpenBook('stranger', { householdId: 'hh-1', openBook: true }),
    ).rejects.toThrow(NotFoundException);
    expect(mockConsentUpsert).not.toHaveBeenCalled();
  });
});

// ─── previewAsHousehold ───────────────────────────────────────────────────────

describe('PrivacyService.previewAsHousehold', () => {
  it('excludes profile-only dependants from consent and subscription owner lookups', async () => {
    const alice = 'identity-profile-only-test';
    mockMemberFindFirst.mockResolvedValue(makeMember(alice));
    mockMemberFindMany.mockResolvedValue([makeMember(alice), { ...makeMember('unused'), identityId: null, role: 'DEPENDANT' }]);
    mockConsentFindUnique.mockResolvedValue(makeConsent(alice, false));
    mockSubFindMany.mockResolvedValue([]);
    mockShareFindMany.mockResolvedValue([]);

    await makeService().previewAsHousehold(alice, 'hh-1');

    expect(mockConsentFindUnique).toHaveBeenCalledOnce();
    expect(mockConsentFindUnique).toHaveBeenCalledWith({ where: {
      identityId_scopeId_scopeType: { identityId: alice, scopeId: 'hh-1', scopeType: 'HOUSEHOLD' },
    } });
    expect(mockSubFindMany).toHaveBeenCalledWith({ where: { identityId: { in: [alice] } } });
  });
  it('returns subscriptions visible to caller via visibility policy (AC3)', async () => {
    const alice = 'identity-alice';
    const bob   = 'identity-bob';

    mockMemberFindFirst.mockResolvedValue(makeMember(alice));
    mockMemberFindMany.mockResolvedValue([makeMember(alice), makeMember(bob)]);
    // Alice has open_book ON; Bob has open_book OFF
    mockConsentFindUnique
      .mockResolvedValueOnce(makeConsent(alice, true))
      .mockResolvedValueOnce(makeConsent(bob, false));
    // Bob owns a subscription (visible via open_book Rule 3)
    mockSubFindMany.mockResolvedValue([
      makeSubscription('sub-alice', alice),
      makeSubscription('sub-bob', bob),
    ]);
    mockShareFindMany.mockResolvedValue([]);

    const svc = makeService();
    const result = await svc.previewAsHousehold(bob, 'hh-1');

    // Alice's open_book=true → Bob can see Alice's subs (Rule 3)
    // Bob is the requester for own sub → Rule 1
    const ids = result.map(s => s.id);
    expect(ids).toContain('sub-alice'); // Rule 3
    expect(ids).toContain('sub-bob');   // Rule 1 (own)
  });

  it('hides alwaysPrivate subscription from other members even if open_book=ON (AC2)', async () => {
    const alice = 'identity-alice';
    const bob   = 'identity-bob';

    mockMemberFindFirst.mockResolvedValue(makeMember(bob));
    mockMemberFindMany.mockResolvedValue([makeMember(alice), makeMember(bob)]);
    mockConsentFindUnique
      .mockResolvedValueOnce(makeConsent(alice, true))
      .mockResolvedValueOnce(makeConsent(bob, false));
    // Alice's subscription is alwaysPrivate
    mockSubFindMany.mockResolvedValue([makeSubscription('sub-alice-private', alice, true)]);
    mockShareFindMany.mockResolvedValue([]);

    const svc = makeService();
    const result = await svc.previewAsHousehold(bob, 'hh-1');

    // Even though Alice has open_book ON, alwaysPrivate blocks Rule 3 (AC2)
    expect(result.map(s => s.id)).not.toContain('sub-alice-private');
  });

  it('does not expose alwaysPrivate flag to non-owner (AC3)', async () => {
    const alice = 'identity-alice';
    const bob   = 'identity-bob';

    mockMemberFindFirst.mockResolvedValue(makeMember(bob));
    mockMemberFindMany.mockResolvedValue([makeMember(alice), makeMember(bob)]);
    mockConsentFindUnique
      .mockResolvedValueOnce(makeConsent(alice, true))
      .mockResolvedValueOnce(makeConsent(bob, false));
    // Alice's sub is shared explicitly so Bob can see it (Rule 2)
    mockSubFindMany.mockResolvedValue([makeSubscription('sub-alice', alice, false)]);
    mockShareFindMany.mockResolvedValue([{ subscriptionId: 'sub-alice', householdId: 'hh-1', revokedAt: null }]);

    const svc = makeService();
    const result = await svc.previewAsHousehold(bob, 'hh-1');

    const aliceSub = result.find(s => s.id === 'sub-alice');
    expect(aliceSub).toBeDefined();
    // alwaysPrivate must not appear for non-owner
    expect('alwaysPrivate' in (aliceSub ?? {})).toBe(false);
  });

  it('throws ForbiddenException when caller is not a household member', async () => {
    mockMemberFindFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.previewAsHousehold('stranger', 'hh-1')).rejects.toThrow(ForbiddenException);
  });
});
