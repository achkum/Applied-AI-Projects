import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SubscriptionLifecycleRepository } from './subscription-lifecycle.repository';

const owner = '11111111-1111-4111-8111-111111111111';
const peer = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';

function harness(status: string | null, identityId = owner) {
  const execute = vi.fn(async () => 1);
  const query = vi.fn<(sql: Prisma.Sql) => Promise<{ id: string; identityId?: string; status: string }[]>>(async () => {
    if (query.mock.calls.length === 1) return status ? [{ id, identityId, status }] : [];
    return [{ id, status: status === 'ACTIVE' ? 'PAUSED' : 'ARCHIVED' }];
  });
  const tx = { $executeRaw: execute, $queryRaw: query };
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  return { repository: new SubscriptionLifecycleRepository({ $transaction: transaction } as never), execute, query, transaction };
}

describe('private lifecycle repository', () => {
  it.each([
    ['ACTIVE', 'pause', 'PAUSED'], ['ACTIVE', 'cancel', 'CANCELLED'], ['ACTIVE', 'archive', 'ARCHIVED'],
    ['PAUSED', 'resume', 'ACTIVE'], ['PAUSED', 'cancel', 'CANCELLED'], ['PAUSED', 'archive', 'ARCHIVED'],
    ['CANCELLED', 'archive', 'ARCHIVED'],
  ] as const)('%s %s updates with scoped transaction', async (current, action, next) => {
    const h = harness(current);
    h.query.mockImplementation(async () => h.query.mock.calls.length === 1
      ? [{ id, identityId: owner, status: current }] : [{ id, status: next }]);
    await expect(h.repository.apply({ userId: owner }, id, action)).resolves.toEqual({ id, status: next });
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.query).toHaveBeenCalledTimes(2);
    const lock = h.query.mock.calls[0]?.[0] as { values: unknown[] };
    const update = h.query.mock.calls[1]?.[0] as { values: unknown[] };
    expect(lock.values).toContain(owner);
    expect(update.values).toContain(owner);
    expect(update.values).toContain(current);
    expect(update.values).toContain(next);
  });

  it.each(['DETECTED', 'TRIAL', 'REJECTED', 'ARCHIVED'])('rejects %s even for core actions', async status => {
    const h = harness(status);
    await expect(h.repository.apply({ userId: owner }, id, 'archive')).rejects.toThrow('LIFECYCLE_CONFLICT');
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('maps invisible and missing rows identically without attempting update', async () => {
    for (const [status, identity] of [[null, owner], ['ACTIVE', peer]] as const) {
      const h = harness(status, identity);
      await expect(h.repository.apply({ userId: owner }, id, 'pause')).rejects.toThrow('SUBSCRIPTION_NOT_FOUND');
      expect(h.query).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects malformed authority and unsupported actions before a transaction', async () => {
    const h = harness('ACTIVE');
    await expect(h.repository.apply({ userId: peer }, 'bad', 'pause')).rejects.toThrow('SUBSCRIPTION_NOT_FOUND');
    await expect(h.repository.apply({ userId: owner }, id, 'confirm' as never)).rejects.toThrow('LIFECYCLE_CONFLICT');
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('conflicts on stale conditional update and masks driver errors', async () => {
    const stale = harness('ACTIVE');
    stale.query.mockImplementation(async () => stale.query.mock.calls.length === 1
      ? [{ id, identityId: owner, status: 'ACTIVE' }] : []);
    await expect(stale.repository.apply({ userId: owner }, id, 'pause')).rejects.toThrow('LIFECYCLE_CONFLICT');
    const failed = harness('ACTIVE');
    failed.query.mockRejectedValue(new Error('driver fixture secret'));
    await expect(failed.repository.apply({ userId: owner }, id, 'pause')).rejects.toThrow('SUBSCRIPTION_STORAGE_ERROR');
  });
});
