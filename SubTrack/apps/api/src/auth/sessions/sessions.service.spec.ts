import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from './jwt.service';
import { SessionsService } from './sessions.service';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockCreate       = vi.fn();
const mockFindUnique   = vi.fn();
const mockUpdate       = vi.fn();
const mockUpdateMany   = vi.fn();
const mockFindMany     = vi.fn();
const mockTransaction  = vi.fn();

const mockPrisma = {
  session: {
    create:      mockCreate,
    findUnique:  mockFindUnique,
    update:      mockUpdate,
    updateMany:  mockUpdateMany,
    findMany:    mockFindMany,
  },
  $transaction: mockTransaction,
} as never;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeService() {
  const jwt = new JwtService();
  return { svc: new SessionsService(mockPrisma, jwt), jwt };
}

const NOW = new Date('2026-10-01T12:00:00Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id:               'sess-1',
    identityId:       'identity-1',
    deviceName:       'Chrome on macOS',
    refreshTokenHash: 'a'.repeat(64),
    familyId:         'family-1',
    generation:       0,
    createdAt:        NOW,
    lastUsedAt:       NOW,
    revokedAt:        null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
});

// ─── createSession ────────────────────────────────────────────────────────────

describe('SessionsService.createSession', () => {
  it('creates a session row and returns a non-empty access + refresh token pair', async () => {
    const session = makeSession({ id: 'sess-new' });
    mockCreate.mockResolvedValue(session);

    const { svc } = makeService();
    const result = await svc.createSession('identity-1', 'Chrome on macOS');

    expect(mockCreate).toHaveBeenCalledOnce();
    const args = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data.identityId).toBe('identity-1');
    expect(typeof args.data.refreshTokenHash).toBe('string');
    expect((args.data.refreshTokenHash as string)).toHaveLength(64); // SHA-256 hex

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toHaveLength(64); // 32 bytes → 64 hex chars
  });
});

// ─── refresh ─────────────────────────────────────────────────────────────────

describe('SessionsService.refresh', () => {
  it('rotates the refresh token and returns new access + refresh tokens', async () => {
    const existing = makeSession({ revokedAt: null });
    const rotated  = makeSession({ id: 'sess-2', generation: 1 });

    mockFindUnique.mockResolvedValue(existing);
    mockTransaction.mockResolvedValue([existing, rotated]);

    const { svc } = makeService();
    const result = await svc.refresh('a'.repeat(64));

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toHaveLength(64);
    // New refresh token must differ from the incoming one
    expect(result.refreshToken).not.toBe('a'.repeat(64));
  });

  it('throws UnauthorizedException for an unknown refresh token', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { svc } = makeService();
    await expect(svc.refresh('b'.repeat(64))).rejects.toThrow(UnauthorizedException);
  });

  it('revokes the entire family when a revoked token is reused (AC2)', async () => {
    const revoked = makeSession({ revokedAt: new Date(), familyId: 'family-x' });
    mockFindUnique.mockResolvedValue(revoked);
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const { svc } = makeService();
    await expect(svc.refresh('c'.repeat(64))).rejects.toThrow(UnauthorizedException);

    expect(mockUpdateMany).toHaveBeenCalledOnce();
    const args = mockUpdateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(args.where.familyId).toBe('family-x');
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });
});

// ─── listDevices ─────────────────────────────────────────────────────────────

describe('SessionsService.listDevices', () => {
  it('queries only non-revoked sessions for the caller (AC4)', async () => {
    mockFindMany.mockResolvedValue([]);

    const { svc } = makeService();
    await svc.listDevices('identity-1');

    expect(mockFindMany).toHaveBeenCalledOnce();
    const args = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.identityId).toBe('identity-1');
    expect(args.where.revokedAt).toBeNull();
  });

  it('returns device list with expected shape', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'sess-1', deviceName: 'iPhone', createdAt: NOW, lastUsedAt: NOW },
      { id: 'sess-2', deviceName: 'Chrome', createdAt: NOW, lastUsedAt: NOW },
    ]);

    const { svc } = makeService();
    const result = await svc.listDevices('identity-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'sess-1', deviceName: 'iPhone' });
  });
});

// ─── revokeDevice ─────────────────────────────────────────────────────────────

describe('SessionsService.revokeDevice', () => {
  it('revokes the session for the correct owner (AC3)', async () => {
    mockFindUnique.mockResolvedValue(makeSession({ id: 'sess-1', revokedAt: null }));
    mockUpdate.mockResolvedValue({});

    const { svc } = makeService();
    await svc.revokeDevice('sess-1', 'identity-1');

    expect(mockUpdate).toHaveBeenCalledOnce();
    const args = mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });

  it('is idempotent when the session is already revoked', async () => {
    mockFindUnique.mockResolvedValue(makeSession({ revokedAt: NOW }));

    const { svc } = makeService();
    await svc.revokeDevice('sess-1', 'identity-1');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when session belongs to a different user (AC4)', async () => {
    mockFindUnique.mockResolvedValue(makeSession({ identityId: 'other-identity' }));

    const { svc } = makeService();
    await expect(svc.revokeDevice('sess-1', 'identity-1')).rejects.toThrow(NotFoundException);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a non-existent session', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { svc } = makeService();
    await expect(svc.revokeDevice('sess-missing', 'identity-1')).rejects.toThrow(NotFoundException);
  });
});
