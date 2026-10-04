import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsService } from './invitations.service';
import { DevNotificationAdapter } from './notification.adapter';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreate       = vi.fn();
const mockFindUnique   = vi.fn();
const mockFindFirst    = vi.fn();
const mockFindMany     = vi.fn();
const mockUpdate       = vi.fn();
const mockCount        = vi.fn();
const mockTransaction  = vi.fn();
const mockHouseholdFindUnique = vi.fn();
const mockIdentityFindUnique = vi.fn();
const mockSendInvitation = vi.fn();
const mockNotifyAdmin = vi.fn();

function firstCallArgument<T>(calls: readonly (readonly unknown[])[], name: string): T {
  const call = calls[0];
  if (!call) throw new Error(`Expected ${name} to be called`);
  const argument = call[0];
  if (argument === undefined) throw new Error(`Expected ${name} to receive arguments`);
  return argument as T;
}

const mockPrisma = {
  invitation: { create: mockCreate, findUnique: mockFindUnique, update: mockUpdate, findMany: mockFindMany },
  household:  { findUnique: mockHouseholdFindUnique },
  identity:   { findUnique: mockIdentityFindUnique },
  householdMember: { create: vi.fn(), findFirst: mockFindFirst, count: mockCount },
  auditLog:   { create: vi.fn() },
  $transaction: mockTransaction,
};

const mockNotifications = {
  sendInvitation: mockSendInvitation,
  notifyAdmin:    mockNotifyAdmin,
} as unknown as DevNotificationAdapter;

function makeService() {
  return new InvitationsService(mockPrisma as never, mockNotifications);
}

const NOW = new Date('2026-10-01T12:00:00Z');
const FUTURE = new Date('2026-10-08T12:00:00Z'); // 7 days out

function makeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id:           'inv-1',
    householdId:  'hh-1',
    inviterId:    'identity-admin',
    inviteeId:    null,
    channel:      'EMAIL',
    recipient:    'test@example.com',
    tokenHash:    'a'.repeat(64),
    status:       'PENDING',
    expiresAt:    FUTURE,
    createdAt:    NOW,
    updatedAt:    NOW,
    ...overrides,
  };
}

function makeAdminMember() {
  return { id: 'member-1', householdId: 'hh-1', identityId: 'identity-admin', role: 'ADMIN', leftAt: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  mockHouseholdFindUnique.mockResolvedValue({ id: 'hh-1', name: 'Smith Family' });
  mockIdentityFindUnique.mockResolvedValue({ id: 'identity-admin', email: 'admin@example.com', phone: null });
  mockFindFirst.mockResolvedValue(makeAdminMember());
  mockSendInvitation.mockResolvedValue(undefined);
  mockNotifyAdmin.mockResolvedValue(undefined);
});

// ─── createInvitation ─────────────────────────────────────────────────────────

describe('InvitationsService.createInvitation', () => {
  it('creates an invitation with tokenHash and 7-day expiry (AC1)', async () => {
    const created = makeInvitation({ status: 'PENDING' });
    mockCreate.mockResolvedValue(created);

    const svc = makeService();
    const result = await svc.createInvitation('identity-admin', 'hh-1', {
      channel: 'EMAIL',
      recipient: 'user@example.com',
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const args = firstCallArgument<{ data: Record<string, unknown> }>(mockCreate.mock.calls, 'invitation.create');
    expect(typeof args.data.tokenHash).toBe('string');
    expect((args.data.tokenHash as string)).toHaveLength(64);
    // 7-day expiry
    const expiresAt = args.data.expiresAt as Date;
    expect(expiresAt.getTime() - NOW.getTime()).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
    expect(result.status).toBe('PENDING');
  });

  it('returns raw token for LINK channel (AC1)', async () => {
    const created = makeInvitation({ channel: 'LINK', recipient: null });
    mockCreate.mockResolvedValue(created);

    const svc = makeService();
    const result = await svc.createInvitation('identity-admin', 'hh-1', {
      channel: 'LINK',
    });

    expect(result.token).toBeDefined();
    expect(result.token).toHaveLength(64);
  });

  it('returns raw token for CODE channel', async () => {
    const created = makeInvitation({ channel: 'CODE', recipient: null });
    mockCreate.mockResolvedValue(created);

    const svc = makeService();
    const result = await svc.createInvitation('identity-admin', 'hh-1', {
      channel: 'CODE',
    });

    expect(result.token).toBeDefined();
    expect(result.token).toHaveLength(64);
  });

  it('does not return raw token for EMAIL channel', async () => {
    mockCreate.mockResolvedValue(makeInvitation());
    const svc = makeService();
    const result = await svc.createInvitation('identity-admin', 'hh-1', {
      channel: 'EMAIL',
      recipient: 'x@example.com',
    });
    expect(result.token).toBeUndefined();
    expect(Object.hasOwn(result, 'token')).toBe(false);
  });

  it('throws ForbiddenException when caller is not an admin (AC1)', async () => {
    mockFindFirst.mockResolvedValue({ ...makeAdminMember(), role: 'MEMBER' });
    const svc = makeService();
    await expect(
      svc.createInvitation('identity-member', 'hh-1', { channel: 'LINK' }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ─── getPreview ───────────────────────────────────────────────────────────────

describe('InvitationsService.getPreview', () => {
  it('returns VALID preview with household name, adminHandle and memberCount (AC2)', async () => {
    mockFindUnique.mockResolvedValue({
      ...makeInvitation(),
      household: { name: 'Smith Family' },
      inviter: { email: 'admin@example.com', phone: null },
    });
    mockCount.mockResolvedValue(3);

    const svc = makeService();
    // We can't compute the real hash without the actual rawToken, so test the
    // observable behavior: pass any 64-char hex string and mock returns the record.
    const result = await svc.getPreview('b'.repeat(64));

    expect(result.status).toBe('VALID');
    expect(result.householdName).toBe('Smith Family');
    expect(result.adminHandle).toBe('admin'); // email prefix
    expect(result.memberCount).toBe(3);
  });

  it('returns NOT_FOUND for unknown token (AC2)', async () => {
    mockFindUnique.mockResolvedValue(null);
    const svc = makeService();
    const result = await svc.getPreview('c'.repeat(64));
    expect(result.status).toBe('NOT_FOUND');
  });

  it('returns REVOKED for a revoked invitation (AC2)', async () => {
    mockFindUnique.mockResolvedValue({
      ...makeInvitation({ status: 'REVOKED' }),
      household: { name: 'X' },
      inviter: { email: null, phone: null },
    });
    const svc = makeService();
    const result = await svc.getPreview('d'.repeat(64));
    expect(result.status).toBe('REVOKED');
  });

  it('returns USED for accepted invitation (AC2)', async () => {
    mockFindUnique.mockResolvedValue({
      ...makeInvitation({ status: 'ACCEPTED' }),
      household: { name: 'X' },
      inviter: { email: null, phone: null },
    });
    const svc = makeService();
    const result = await svc.getPreview('e'.repeat(64));
    expect(result.status).toBe('USED');
  });

  it('returns EXPIRED for a past-expiry invitation (AC2)', async () => {
    mockFindUnique.mockResolvedValue({
      ...makeInvitation({ expiresAt: new Date(NOW.getTime() - 1000) }),
      household: { name: 'X' },
      inviter: { email: null, phone: null },
    });
    const svc = makeService();
    const result = await svc.getPreview('f'.repeat(64));
    expect(result.status).toBe('EXPIRED');
  });
});

// ─── acceptInvitation ─────────────────────────────────────────────────────────

describe('InvitationsService.acceptInvitation', () => {
  it('accepts a valid invitation and creates HouseholdMember (AC3)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation());
    mockTransaction.mockResolvedValue([{}, {}, {}]);

    const svc = makeService();
    await svc.acceptInvitation('a'.repeat(64), 'identity-invitee');

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockNotifications.notifyAdmin).toHaveBeenCalledOnce();
    expect(firstCallArgument<Record<string, unknown>>(mockNotifyAdmin.mock.calls, 'notifyAdmin')).toMatchObject({
      eventType: 'INVITATION_ACCEPTED',
    });
  });

  it('is idempotent when already accepted (AC3)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation({ status: 'ACCEPTED' }));

    const svc = makeService();
    await expect(svc.acceptInvitation('a'.repeat(64), 'identity-invitee')).resolves.toBeUndefined();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException for a revoked invitation', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation({ status: 'REVOKED' }));

    const svc = makeService();
    await expect(svc.acceptInvitation('a'.repeat(64), 'identity-invitee')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('throws NotFoundException for unknown token', async () => {
    mockFindUnique.mockResolvedValue(null);

    const svc = makeService();
    await expect(svc.acceptInvitation('a'.repeat(64), 'identity-invitee')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── declineInvitation ────────────────────────────────────────────────────────

describe('InvitationsService.declineInvitation', () => {
  it('declines a valid invitation and queues admin notification (AC3)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation());
    mockTransaction.mockResolvedValue([{}, {}]);

    const svc = makeService();
    await svc.declineInvitation('a'.repeat(64), 'identity-invitee');

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockNotifications.notifyAdmin).toHaveBeenCalledOnce();
    expect(firstCallArgument<Record<string, unknown>>(mockNotifyAdmin.mock.calls, 'notifyAdmin')).toMatchObject({
      eventType: 'INVITATION_DECLINED',
    });
  });

  it('is idempotent when already declined (AC3)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation({ status: 'DECLINED' }));

    const svc = makeService();
    await expect(svc.declineInvitation('a'.repeat(64), 'identity-invitee')).resolves.toBeUndefined();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// ─── revokeInvitation ─────────────────────────────────────────────────────────

describe('InvitationsService.revokeInvitation', () => {
  it('revokes a pending invitation (AC1)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation());
    mockUpdate.mockResolvedValue({});

    const svc = makeService();
    await svc.revokeInvitation('identity-admin', 'hh-1', 'inv-1');

    expect(mockUpdate).toHaveBeenCalledOnce();
    const args = firstCallArgument<{ data: Record<string, unknown> }>(mockUpdate.mock.calls, 'invitation.update');
    expect(args.data.status).toBe('REVOKED');
  });

  it('is idempotent when already revoked (AC1)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation({ status: 'REVOKED' }));

    const svc = makeService();
    await svc.revokeInvitation('identity-admin', 'hh-1', 'inv-1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when caller is not an admin (AC1)', async () => {
    mockFindFirst.mockResolvedValue({ ...makeAdminMember(), role: 'MEMBER' });

    const svc = makeService();
    await expect(svc.revokeInvitation('identity-member', 'hh-1', 'inv-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for wrong household (AC1)', async () => {
    mockFindUnique.mockResolvedValue(makeInvitation({ householdId: 'other-hh' }));

    const svc = makeService();
    await expect(svc.revokeInvitation('identity-admin', 'hh-1', 'inv-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
