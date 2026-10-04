import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { clearInbox, peekOtp } from './dev-inbox';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockFindFirst  = vi.fn();
const mockCreate     = vi.fn();
const mockUpdate     = vi.fn();
const mockAggregate  = vi.fn();

function firstCallArgument<T>(calls: readonly (readonly unknown[])[], name: string): T {
  const call = calls[0];
  if (!call) throw new Error(`Expected ${name} to be called`);
  const argument = call[0];
  if (argument === undefined) throw new Error(`Expected ${name} to receive arguments`);
  return argument as T;
}

const mockPrisma = {
  otpChallenge: {
    findFirst:  mockFindFirst,
    create:     mockCreate,
    update:     mockUpdate,
    aggregate:  mockAggregate,
  },
} as never;

function makeService() {
  return new OtpService(mockPrisma);
}

const NOW = new Date('2026-10-01T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  clearInbox();
  vi.setSystemTime(NOW);
});

// ─── requestOtp ──────────────────────────────────────────────────────────────

describe('OtpService.requestOtp', () => {
  it('creates a new challenge and delivers via DevInbox when no active challenge exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});

    const svc = makeService();
    await svc.requestOtp('user@example.com', 'development');

    expect(mockCreate).toHaveBeenCalledOnce();
    const args = firstCallArgument<{ data: Record<string, unknown> }>(mockCreate.mock.calls, 'otpChallenge.create');
    expect(args.data.identifier).toBe('user@example.com');
    expect(typeof args.data.codeHash).toBe('string');
    expect((args.data.codeHash as string)).toHaveLength(64); // SHA-256 hex
    // DevInbox received the code
    const code = peekOtp('user@example.com');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('rejects requests that are too soon (< 30s cooldown)', async () => {
    const lastSentAt = new Date(NOW.getTime() - 10_000); // 10s ago
    mockFindFirst.mockResolvedValue({
      id: 'challenge-1',
      identifier: 'user@example.com',
      lastSentAt,
      sendCount: 1,
      codeHash: 'abc',
      salt: 'salt',
      expiresAt: new Date(NOW.getTime() + 600_000),
      attemptCount: 0,
      lockedUntil: null,
    });

    const svc = makeService();
    await expect(svc.requestOtp('user@example.com', 'development')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when hourly send limit is reached', async () => {
    const lastSentAt = new Date(NOW.getTime() - 60_000); // 1 min ago — past cooldown
    mockFindFirst.mockResolvedValue({
      id: 'challenge-1',
      identifier: 'user@example.com',
      lastSentAt,
      sendCount: 5,
      codeHash: 'abc',
      salt: 'salt',
      expiresAt: new Date(NOW.getTime() + 600_000),
      attemptCount: 0,
      lockedUntil: null,
    });
    mockAggregate.mockResolvedValue({ _sum: { sendCount: 6 } }); // total = 6 (limit)

    const svc = makeService();
    await expect(svc.requestOtp('user@example.com', 'development')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refreshes the code for a resend past cooldown', async () => {
    const lastSentAt = new Date(NOW.getTime() - 60_000);
    mockFindFirst.mockResolvedValue({
      id: 'challenge-1',
      identifier: '+46701234567',
      lastSentAt,
      sendCount: 2,
      codeHash: 'old',
      salt: 'oldsalt',
      expiresAt: new Date(NOW.getTime() + 600_000),
      attemptCount: 0,
      lockedUntil: null,
    });
    mockAggregate.mockResolvedValue({ _sum: { sendCount: 2 } });
    mockUpdate.mockResolvedValue({});

    const svc = makeService();
    await svc.requestOtp('+46701234567', 'development');

    expect(mockUpdate).toHaveBeenCalledOnce();
    const code = peekOtp('+46701234567');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('throws an error in production mode (real delivery not implemented)', async () => {
    const svc = makeService();
    await expect(svc.requestOtp('user@example.com', 'production')).rejects.toThrow(Error);
  });
});

// ─── verifyOtp ───────────────────────────────────────────────────────────────

describe('OtpService.verifyOtp', () => {
  function makeChallenge(overrides: Record<string, unknown> = {}) {
    const salt = '0'.repeat(32);
    // Compute hash of '123456' + salt for valid-code tests
    return {
      id: 'challenge-1',
      identifier: 'user@example.com',
      salt,
      codeHash: createHash('sha256')
        .update('123456' + salt)
        .digest('hex'),
      expiresAt: new Date(NOW.getTime() + 600_000),
      attemptCount: 0,
      lockedUntil: null,
      verifiedAt: null,
      ...overrides,
    };
  }

  it('returns { verified: true } for a correct, unexpired code', async () => {
    mockFindFirst.mockResolvedValue(makeChallenge());
    mockUpdate.mockResolvedValue({});

    const svc = makeService();
    const result = await svc.verifyOtp('user@example.com', '123456');
    expect(result).toEqual({ verified: true });
    expect(mockUpdate).toHaveBeenCalledOnce();
    // Verify the update marks verifiedAt
    const updateArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockUpdate.mock.calls, 'otpChallenge.update');
    expect(updateArgs.data.verifiedAt).toBeInstanceOf(Date);
  });

  it('throws BadRequest for an incorrect code and increments attemptCount', async () => {
    mockFindFirst.mockResolvedValue(makeChallenge());
    mockUpdate.mockResolvedValue({});

    const svc = makeService();
    await expect(svc.verifyOtp('user@example.com', '000000')).rejects.toThrow(BadRequestException);
    const updateArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockUpdate.mock.calls, 'otpChallenge.update');
    expect(updateArgs.data.attemptCount).toBe(1);
  });

  it('locks identifier after 5 wrong attempts', async () => {
    mockFindFirst.mockResolvedValue(makeChallenge({ attemptCount: 4 }));
    mockUpdate.mockResolvedValue({});

    const svc = makeService();
    await expect(svc.verifyOtp('user@example.com', '000000')).rejects.toThrow(BadRequestException);
    const updateArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockUpdate.mock.calls, 'otpChallenge.update');
    expect(updateArgs.data.lockedUntil).toBeInstanceOf(Date);
  });

  it('throws BadRequest when identifier is locked', async () => {
    mockFindFirst.mockResolvedValue(
      makeChallenge({ lockedUntil: new Date(NOW.getTime() + 300_000) }),
    );

    const svc = makeService();
    await expect(svc.verifyOtp('user@example.com', '123456')).rejects.toThrow(BadRequestException);
  });

  it('throws UnprocessableEntity for expired OTP', async () => {
    mockFindFirst.mockResolvedValue(
      makeChallenge({ expiresAt: new Date(NOW.getTime() - 1_000) }),
    );

    const svc = makeService();
    await expect(svc.verifyOtp('user@example.com', '123456')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('throws UnprocessableEntity when no pending challenge exists', async () => {
    mockFindFirst.mockResolvedValue(null);

    const svc = makeService();
    await expect(svc.verifyOtp('user@example.com', '123456')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});
