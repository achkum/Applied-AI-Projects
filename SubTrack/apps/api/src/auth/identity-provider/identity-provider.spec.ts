import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { BankIdSimulator } from './bankid-simulator';
import { IdentityProviderService } from './identity-provider.service';

const HMAC_SECRET = 'test-secret';

function firstCallArgument<T>(calls: readonly (readonly unknown[])[], name: string): T {
  const call = calls[0];
  if (!call) throw new Error(`Expected ${name} to be called`);
  const argument = call[0];
  if (argument === undefined) throw new Error(`Expected ${name} to receive arguments`);
  return argument as T;
}

// ─── BankIdSimulator ──────────────────────────────────────────────────────────

describe('BankIdSimulator', () => {
  const sim = new BankIdSimulator(HMAC_SECRET);

  it('returns a verified identity for a known demo token', async () => {
    const result = await sim.verify('alice');
    expect(result.method).toBe('BANKID');
    expect(result.name).toBe('Alice Andersson');
    expect(result.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.personnummerHmac).toHaveLength(64); // SHA-256 hex
  });

  it('returns the same HMAC for the same identity (deterministic)', async () => {
    const r1 = await sim.verify('bob');
    const r2 = await sim.verify('bob');
    expect(r1.personnummerHmac).toBe(r2.personnummerHmac);
  });

  it('returns different HMACs for different identities', async () => {
    const r1 = await sim.verify('alice');
    const r2 = await sim.verify('bob');
    expect(r1.personnummerHmac).not.toBe(r2.personnummerHmac);
  });

  it('throws for an unknown demo token', async () => {
    await expect(sim.verify('unknown-token')).rejects.toThrow(Error);
  });

  it('never includes raw personnummer in the result', async () => {
    const result = await sim.verify('carol');
    const json = JSON.stringify(result);
    // Known fictional personnummer for carol is '200203037890'
    expect(json).not.toContain('200203037890');
  });
});

// ─── IdentityProviderService ──────────────────────────────────────────────────

describe('IdentityProviderService', () => {
  const mockFindFirst = vi.fn();
  const mockCreate    = vi.fn();

  const mockPrisma = {
    identity: { findFirst: mockFindFirst, create: mockCreate },
  } as never;

  const sim = new BankIdSimulator(HMAC_SECRET);

  function makeService() {
    return new IdentityProviderService(mockPrisma, sim);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a new identity and returns action=registered', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'new-id' });

    const svc = makeService();
    const result = await svc.verifyAndRegister('alice');

    expect(result.action).toBe('registered');
    expect(result.identityId).toBe('new-id');
    // Verify persisted data does NOT contain raw personnummer
    const createArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockCreate.mock.calls, 'identity.create');
    expect(JSON.stringify(createArgs.data)).not.toContain('199001012391');
    expect(createArgs.data.authMethod).toBe('BANKID');
  });

  it('returns action=logged_in when HMAC already exists (AC3)', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-id' });

    const svc = makeService();
    const result = await svc.verifyAndRegister('alice');

    expect(result.action).toBe('logged_in');
    expect(result.identityId).toBe('existing-id');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntity for an invalid token', async () => {
    const svc = makeService();
    await expect(svc.verifyAndRegister('not-a-real-token')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('stores externalId as the personnummerHmac — not the raw personnummer (AC2)', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'new-id' });

    const svc = makeService();
    await svc.verifyAndRegister('bob');

    const createArgs = firstCallArgument<{ data: Record<string, unknown> }>(mockCreate.mock.calls, 'identity.create');
    // externalId must be a 64-char hex HMAC
    expect(typeof createArgs.data.externalId).toBe('string');
    expect(createArgs.data.externalId as string).toHaveLength(64);
    // Must not be the raw personnummer
    expect(createArgs.data.externalId).not.toBe('198505054512');
  });
});
