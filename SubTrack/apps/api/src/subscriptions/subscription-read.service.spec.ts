import { describe, expect, it, vi } from 'vitest';
import { SubscriptionReadService } from './subscription-read.service';
import type { SubscriptionReadRow } from './subscription-read.repository';

const ownerId = '11111111-1111-4111-8111-111111111111';
const peerId = '22222222-2222-4222-8222-222222222222';
const context = { userId: ownerId };
const row: SubscriptionReadRow = {
  id: '33333333-3333-4333-8333-333333333333', identityId: ownerId,
  merchantId: '44444444-4444-4444-8444-444444444444', merchantName: 'Catalog Name',
  catalogPlanId: null, customName: 'Private', categoryCode: 'VIDEO_STREAMING',
  cadence: 'MONTHLY', status: 'DETECTED', expectedAmountMinor: 9007199254740993n,
  currency: 'SEK', nextChargeDate: null, alwaysPrivate: true, confidence: null,
  detectionReasons: [{ code: 'CADENCE_MATCHED', params: { raw: 'secret' } }, { code: 'UNAPPROVED', value: 'secret' }],
  createdAt: '2026-10-10T12:00:00.123456Z',
};
function setup(rows: SubscriptionReadRow[] = [row]) {
  const list = vi.fn(async (context: unknown, filters: unknown, inbox: unknown) => { void context; void filters; void inbox; return rows; });
  const detail = vi.fn(async (context: unknown, id: unknown) => { void context; void id; return rows[0] ?? null; });
  return { service: new SubscriptionReadService({ list, detail } as never), list, detail };
}

describe('subscription read service', () => {
  it('serializes bigint exactly and emits owner-only review reason codes', async () => {
    const { service, list } = setup();
    const page = await service.list(context, {}, true);
    expect(page.items).toEqual([{
      id: row.id, customName: 'Private', merchantId: row.merchantId, merchantName: 'Catalog Name',
      catalogPlanId: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'DETECTED',
      expectedAmountMinor: '9007199254740993', currency: 'SEK', confidence: null, reasonCodes: ['CADENCE_MATCHED'],
    }]);
    expect(list.mock.calls[0]?.[2]).toBe(true);
    const own = await service.detail(context, row.id);
    expect(own).toMatchObject({ visibility: 'owner', alwaysPrivate: true, expectedAmountMinor: '9007199254740993' });
  });

  it('projects only approved peer fields and refuses detected peer data even after a query defect', async () => {
    const shared = { ...row, identityId: peerId, status: 'ACTIVE' };
    const { service } = setup([shared]);
    expect(await service.detail(context, row.id)).toEqual({
      visibility: 'household', id: row.id, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY',
      status: 'ACTIVE', expectedAmountMinor: '9007199254740993', currency: 'SEK',
    });
    await expect(setup([{ ...shared, status: 'DETECTED' }]).service.list(context, { scope: 'household' })).rejects.toThrow('Peer detection');
  });

  it('binds cursor to endpoint and normalized filters, rejecting tampering and unknown input', async () => {
    const first = { ...row, status: 'ACTIVE' };
    const second = { ...row, id: peerId, createdAt: '2026-10-09T12:00:00.123456Z', status: 'ACTIVE' };
    const { service, list } = setup([first, second]);
    const page = await service.list(context, { limit: '1', scope: 'me' });
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    await service.list(context, { limit: '1', cursor: page.nextCursor });
    expect(list.mock.calls[1]?.[1]).toMatchObject({ after: { id: row.id, createdAt: row.createdAt } });
    await expect(service.list(context, { cursor: page.nextCursor }, true)).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { cursor: page.nextCursor, scope: 'household' })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { cursor: 'A'.repeat(513) })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { scope: 'member:' + peerId })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { category: 'UNKNOWN' })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { status: 'INVALID' })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { limit: '51' })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { ownerId })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(context, { scope: 'me' }, true)).rejects.toMatchObject({ status: 400 });
  });

  it('returns the same missing error for absent detail', async () => {
    await expect(setup([]).service.detail(context, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(setup().service.detail(context, 'bad-id')).rejects.toMatchObject({ status: 400 });
  });
});
