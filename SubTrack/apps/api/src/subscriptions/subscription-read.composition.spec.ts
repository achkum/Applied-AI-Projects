import type { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertSubscriptionReadStorage, bounded, createSubscriptionReadApp,
  type SubscriptionReadCompositionOptions } from './subscription-read.composition';

const role = { database: 'subscription_read_proof', role: 'st212_runtime', login: true,
  superuser: false, bypass: false, member: true, memberships: 1n };
const names = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const tables = names.map(name => ({ name, owner: 'fixture_owner', rls: true, select: true }));

function fixture(roles: unknown = [role], relations: unknown = tables) {
  const query = vi.fn().mockResolvedValueOnce(roles).mockResolvedValueOnce(relations);
  const options: SubscriptionReadCompositionOptions = {
    prisma: { $queryRaw: query } as unknown as PrismaClient,
    verifier: { verify: vi.fn() }, developmentEnabled: true, host: '127.0.0.1',
    expectedDatabase: 'subscription_read_proof', expectedRole: 'st212_runtime',
  };
  return { options, query };
}

describe('subscription read startup boundary', () => {
  it('bounds an operation that never settles', async () => {
    vi.useFakeTimers();
    try {
      const waiting = bounded(new Promise<void>(() => undefined), 25);
      const denied = expect(waiting).rejects.toThrow('Subscription read operation timed out');
      await vi.advanceTimersByTimeAsync(25);
      await denied;
    } finally { vi.useRealTimers(); }
  });
  it('closes the app after initialization rejects and sanitizes the failure', async () => {
    const app = { init: vi.fn().mockRejectedValue(new Error('secret database URL')),
      close: vi.fn().mockResolvedValue(undefined) } as unknown as INestApplication;
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app);
    try {
      await expect(createSubscriptionReadApp(fixture().options))
        .rejects.toThrow(/^Subscription read startup denied$/);
      expect(app.close).toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });
  it('initializes once, listens only on numeric loopback, and closes', async () => {
    const app = { init: vi.fn().mockResolvedValue(undefined),
      listen: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) } as unknown as INestApplication;
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app);
    try {
      const composition = await createSubscriptionReadApp(fixture().options);
      expect(app.init).toHaveBeenCalledOnce();
      for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
        await expect(composition.listen(port)).rejects.toThrow('Subscription read port denied');
      }
      expect(app.listen).not.toHaveBeenCalled();
      await composition.listen(4300);
      expect(app.listen).toHaveBeenCalledWith(4300, '127.0.0.1');
      await composition.close();
      expect(app.close).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); }
  });
  it('rejects failed creation without leaking the driver failure', async () => {
    const create = vi.spyOn(NestFactory, 'create').mockRejectedValue(new Error('secret database URL'));
    try {
      await expect(createSubscriptionReadApp(fixture().options))
        .rejects.toThrow(/^Subscription read startup denied$/);
    } finally { create.mockRestore(); }
  });
  it('closes an app that arrives after the creation deadline', async () => {
    vi.useFakeTimers();
    let finishCreate!: (app: INestApplication) => void;
    const app = { close: vi.fn().mockResolvedValue(undefined) } as unknown as INestApplication;
    const create = vi.spyOn(NestFactory, 'create').mockReturnValue(
      new Promise(resolve => { finishCreate = resolve; }));
    try {
      const started = createSubscriptionReadApp(fixture().options);
      const denied = expect(started).rejects.toThrow('Subscription read startup denied');
      await vi.advanceTimersByTimeAsync(20_000);
      await denied;
      finishCreate(app);
      await vi.advanceTimersByTimeAsync(0);
      expect(app.close).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });
  it('bounds late initialization and closes the app again if initialization finishes later', async () => {
    vi.useFakeTimers();
    let finishInit!: (app: INestApplication) => void;
    const app = { init: vi.fn(), close: vi.fn().mockResolvedValue(undefined) } as unknown as INestApplication;
    vi.mocked(app.init).mockReturnValue(new Promise(resolve => { finishInit = resolve; }));
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app);
    try {
      const started = createSubscriptionReadApp(fixture().options);
      const denied = expect(started).rejects.toThrow('Subscription read startup denied');
      await vi.advanceTimersByTimeAsync(20_000);
      await denied;
      expect(app.close).toHaveBeenCalledTimes(1);
      finishInit(app);
      await vi.advanceTimersByTimeAsync(0);
      expect(app.close).toHaveBeenCalledTimes(2);
    } finally {
      create.mockRestore();
      vi.useRealTimers();
    }
  });
  it('accepts the expected ordinary role and seven RLS tables', async () => {
    const { options, query } = fixture();
    await expect(assertSubscriptionReadStorage(options)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['disabled', { developmentEnabled: false }],
    ['non-loopback', { host: 'localhost' }],
    ['wrong database', { expectedDatabase: 'other' }],
    ['wrong role', { expectedRole: 'fixture_owner' }],
    ['missing verifier', { verifier: undefined }],
  ])('rejects %s before touching storage', async (_label, override) => {
    const { options, query } = fixture();
    await expect(assertSubscriptionReadStorage({ ...options, ...override } as SubscriptionReadCompositionOptions))
      .rejects.toThrow('Subscription read startup denied');
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    ['owner', { role: 'fixture_owner' }],
    ['superuser', { superuser: true }],
    ['bypass RLS', { bypass: true }],
    ['no runtime membership', { member: false }],
    ['extra membership', { memberships: 2n }],
    ['wrong database', { database: 'persistent' }],
  ])('rejects a %s connection', async (_label, override) => {
    const { options } = fixture([{ ...role, ...override }]);
    await expect(assertSubscriptionReadStorage(options)).rejects.toThrow('Subscription read storage preflight denied');
  });
  it.each([
    ['missing table', tables.slice(1)],
    ['different owner', tables.map((table, index) => index ? table : { ...table, owner: 'st212_runtime' })],
    ['RLS disabled', tables.map((table, index) => index ? table : { ...table, rls: false })],
    ['SELECT revoked', tables.map((table, index) => index ? table : { ...table, select: false })],
  ])('rejects %s', async (_label, relations) => {
    const { options } = fixture([role], relations);
    await expect(assertSubscriptionReadStorage(options)).rejects.toThrow('Subscription read storage preflight denied');
  });
  it('sanitizes driver failures', async () => {
    const { options, query } = fixture();
    query.mockReset().mockRejectedValue(new Error('secret database URL'));
    await expect(assertSubscriptionReadStorage(options)).rejects.toThrow(/^Subscription read storage preflight denied$/);
  });
});
