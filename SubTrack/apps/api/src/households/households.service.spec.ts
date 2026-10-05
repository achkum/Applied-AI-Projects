import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { HouseholdsService } from './households.service';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

const mkTx = (overrides: Record<string, unknown> = {}) => ({
  household: { create: vi.fn() },
  householdMember: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  identity: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  ...overrides,
});

function firstCallArgument<T>(calls: readonly (readonly unknown[])[], name: string): T {
  const call = calls[0];
  if (!call) throw new Error(`Expected ${name} to be called`);
  const argument = call[0];
  if (argument === undefined) throw new Error(`Expected ${name} to receive arguments`);
  return argument as T;
}

const mkPrisma = () => {
  const tx = mkTx();
  return {
    ...tx,
    $transaction: vi.fn((fn: (context: ReturnType<typeof mkTx>) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  };
};

let prisma: ReturnType<typeof mkPrisma>;
let svc: HouseholdsService;

beforeEach(() => {
  prisma = mkPrisma();
  svc = new HouseholdsService(prisma as never);
});

// ─── createHousehold ──────────────────────────────────────────────────────────

describe('createHousehold', () => {
  it('creates household and ADMIN member in a transaction', async () => {
    const household = { id: 'hh-1', name: 'My House' };
    prisma._tx.household.create.mockResolvedValue(household);
    prisma._tx.householdMember.create.mockResolvedValue({});

    const result = await svc.createHousehold('My House', 'caller-id');

    expect(result).toEqual(household);
    const memberArgs = firstCallArgument<{ data: Record<string, unknown> }>(prisma._tx.householdMember.create.mock.calls, 'householdMember.create');
    expect(memberArgs.data.role).toBe('ADMIN');
    expect(memberArgs.data.identityId).toBe('caller-id');
  });
});

// ─── listMembers ──────────────────────────────────────────────────────────────

describe('listMembers', () => {
  it('returns active members when caller is a member', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'm1', role: 'MEMBER', leftAt: null });
    prisma.householdMember.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);

    const result = await svc.listMembers('hh-1', 'caller-id');
    expect(result).toHaveLength(2);
  });

  it('throws ForbiddenException when caller is not a member', async () => {
    prisma.householdMember.findFirst.mockResolvedValue(null);
    await expect(svc.listMembers('hh-1', 'stranger')).rejects.toThrow(ForbiddenException);
  });
});

// ─── updateMemberRole ─────────────────────────────────────────────────────────

describe('updateMemberRole', () => {
  it('demotes a non-last admin to MEMBER', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'caller-m', role: 'ADMIN', leftAt: null });
    prisma.householdMember.findUnique.mockResolvedValue({ id: 'target-m', householdId: 'hh-1', role: 'ADMIN', leftAt: null, identityId: 'other' });
    prisma.householdMember.count.mockResolvedValue(2); // 2 admins → safe to demote
    prisma.householdMember.update.mockResolvedValue({ id: 'target-m', role: 'MEMBER' });

    const result = await svc.updateMemberRole('hh-1', 'target-m', 'MEMBER', 'caller-id');
    expect(result.role).toBe('MEMBER');
  });

  it('rejects demoting last admin', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'caller-m', role: 'ADMIN', leftAt: null });
    prisma.householdMember.findUnique.mockResolvedValue({ id: 'target-m', householdId: 'hh-1', role: 'ADMIN', leftAt: null, identityId: 'caller-id' });
    prisma.householdMember.count.mockResolvedValue(1);

    await expect(
      svc.updateMemberRole('hh-1', 'target-m', 'MEMBER', 'caller-id'),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ForbiddenException for non-admin caller', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'm1', role: 'MEMBER', leftAt: null });
    await expect(
      svc.updateMemberRole('hh-1', 'target-m', 'ADMIN', 'caller-id'),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe('removeMember', () => {
  it('allows a member to remove themselves', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'm1', role: 'MEMBER', identityId: 'caller-id', leftAt: null });
    prisma.householdMember.findUnique.mockResolvedValue({ id: 'm1', householdId: 'hh-1', role: 'MEMBER', leftAt: null, identityId: 'caller-id' });
    prisma.householdMember.update.mockResolvedValue({ id: 'm1', leftAt: new Date() });

    await svc.removeMember('hh-1', 'm1', 'caller-id');
    expect(prisma.householdMember.update).toHaveBeenCalledOnce();
  });

  it('prevents member from removing others without admin role', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'caller-m', role: 'MEMBER', identityId: 'caller-id', leftAt: null });
    prisma.householdMember.findUnique.mockResolvedValue({ id: 'other-m', householdId: 'hh-1', role: 'MEMBER', leftAt: null, identityId: 'other-id' });

    await expect(svc.removeMember('hh-1', 'other-m', 'caller-id')).rejects.toThrow(ForbiddenException);
  });

  it('prevents removing last admin', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'admin-m', role: 'ADMIN', identityId: 'caller-id', leftAt: null });
    prisma.householdMember.findUnique.mockResolvedValue({ id: 'admin-m', householdId: 'hh-1', role: 'ADMIN', leftAt: null, identityId: 'caller-id' });
    prisma.householdMember.count.mockResolvedValue(1);

    await expect(svc.removeMember('hh-1', 'admin-m', 'caller-id')).rejects.toThrow(ConflictException);
  });
});

// ─── addDependant ─────────────────────────────────────────────────────────────

describe('addDependant', () => {
  it('creates a synthetic MOCK identity and DEPENDANT member row (AC3)', async () => {
    // requireAdminRole path
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'admin-m', role: 'ADMIN', leftAt: null });
    const dependantId = 'dep-identity-id';
    prisma._tx.identity.create.mockResolvedValue({ id: dependantId });
    prisma._tx.householdMember.create.mockResolvedValue({ id: 'dep-m', role: 'DEPENDANT' });
    prisma._tx.auditLog.create.mockResolvedValue({});

    const result = await svc.addDependant('hh-1', 'Child A', 'caller-id');

    expect(result.role).toBe('DEPENDANT');
    const identityArgs = firstCallArgument<{ data: Record<string, unknown> }>(prisma._tx.identity.create.mock.calls, 'identity.create');
    // No email, no phone — synthetic identity
    expect(identityArgs.data.email).toBeUndefined();
    expect(identityArgs.data.phone).toBeUndefined();
    expect(identityArgs.data.authMethod).toBe('MOCK');
    // Audit log carries the display name, not the member row
    const auditArgs = firstCallArgument<{ data: Record<string, unknown> }>(prisma._tx.auditLog.create.mock.calls, 'auditLog.create');
    expect((auditArgs.data.payload as Record<string, string>).displayName).toBe('Child A');
  });

  it('throws ForbiddenException for non-admin caller', async () => {
    prisma.householdMember.findFirst.mockResolvedValue({ id: 'm1', role: 'MEMBER', leftAt: null });
    await expect(svc.addDependant('hh-1', 'Child A', 'caller-id')).rejects.toThrow(ForbiddenException);
  });
});
