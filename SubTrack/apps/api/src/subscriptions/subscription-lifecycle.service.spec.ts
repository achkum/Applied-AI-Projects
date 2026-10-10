import { describe, expect, it, vi } from 'vitest';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import type { SubscriptionLifecycleRepository } from './subscription-lifecycle.repository';

const id = '11111111-1111-4111-8111-111111111111';
const context = { userId: '22222222-2222-4222-8222-222222222222' };

describe('lifecycle request dispatch', () => {
  it.each([
    ['ACTIVE', 'resume'], ['PAUSED', 'pause'], ['CANCELLED', 'cancel'], ['ARCHIVED', 'archive'],
  ])('derives %s as %s without caller-selected action', async (status, action) => {
    const apply = vi.fn().mockResolvedValue({ id, status });
    const service = new SubscriptionLifecycleService({ apply } as unknown as SubscriptionLifecycleRepository);
    await expect(service.update(context, id.toUpperCase(), { status })).resolves.toEqual({ id, status });
    expect(apply).toHaveBeenCalledWith(context, id, action);
  });
  it.each([
    ['bad id', 'not-a-uuid', { status: 'PAUSED' }],
    ['missing body', id, undefined],
    ['empty', id, {}],
    ['extra field', id, { status: 'PAUSED', ownerId: id }],
    ['unsupported target', id, { status: 'DETECTED' }],
    ['array', id, [{ status: 'PAUSED' }]],
    ['prototype object', id, Object.create({ status: 'PAUSED' })],
  ])('rejects %s before storage', async (_name, requestId, body) => {
    const apply = vi.fn();
    const service = new SubscriptionLifecycleService({ apply } as unknown as SubscriptionLifecycleRepository);
    await expect(service.update(context, requestId, body)).rejects.toMatchObject({ status: 400 });
    expect(apply).not.toHaveBeenCalled();
  });
  it.each([
    ['SUBSCRIPTION_NOT_FOUND', 404], ['LIFECYCLE_CONFLICT', 409],
  ])('maps private %s to %i', async (message, status) => {
    const apply = vi.fn().mockRejectedValue(new Error(message));
    const service = new SubscriptionLifecycleService({ apply } as unknown as SubscriptionLifecycleRepository);
    await expect(service.update(context, id, { status: 'PAUSED' })).rejects.toMatchObject({ status });
  });
  it('preserves storage faults for the global masked projection', async () => {
    const fault = new Error('secret database URL');
    const service = new SubscriptionLifecycleService({ apply: vi.fn().mockRejectedValue(fault) } as unknown as SubscriptionLifecycleRepository);
    await expect(service.update(context, id, { status: 'PAUSED' })).rejects.toBe(fault);
  });
});
