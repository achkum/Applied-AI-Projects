import { createNativeAnalyticsReader } from './nativeAnalyticsReader';
import type { NativePersonalApi } from '@/components/onboarding/NativePersonalScreen';
import type { PrivateOwnerSubscriptionView } from '../../../../packages/contracts/generated/types.gen';
jest.mock('./privateMobileApi', () => ({ readNativeProfile: jest.fn(), readNativeMode: jest.fn(), readNativeSubscriptions: jest.fn() }));
const profile = { displayName: 'Example', avatarColourToken: null, avatarEmoji: null, language: 'en' as const, theme: 'system' as const, defaultCurrency: 'SEK' as const, profileComplete: true };
const row: PrivateOwnerSubscriptionView = { id: '123e4567-e89b-42d3-a456-426614174000', revision: '1', source: 'MANUAL', visibility: 'owner', customName: 'Example streaming', merchantId: null, merchantName: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '10000', currency: 'SEK', nextChargeDate: '2026-10-17', alwaysPrivate: true };
const now = new Date(2026, 9, 17, 12);
function fixture() {
  return { readNativeProfile: jest.fn().mockResolvedValue(profile), readNativeMode: jest.fn().mockResolvedValue({ mode: 'just-me' }), readNativeSubscriptions: jest.fn().mockResolvedValue({ items: [row], nextCursor: null }) } satisfies Pick<NativePersonalApi, 'readNativeProfile' | 'readNativeMode' | 'readNativeSubscriptions'>;
}
it('checks durable profile and mode before accessing private owner rows or bank history', async () => {
  for (const gate of ['profile', 'mode']) {
    const api = fixture(), history = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    if (gate === 'profile') api.readNativeProfile.mockResolvedValue({ ...profile, profileComplete: false });
    else api.readNativeMode.mockResolvedValue({ mode: null });
    expect(await createNativeAnalyticsReader(api, { history })('token', new AbortController().signal, now)).toEqual({ kind: 'setup-required' });
    expect(api.readNativeSubscriptions).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
  }
});
it('collects every owner page then reads history under the same authority signal/token', async () => {
  const api = fixture(), history = jest.fn().mockResolvedValue({ items: [], nextCursor: null }), controller = new AbortController();
  api.readNativeSubscriptions.mockResolvedValueOnce({ items: [row], nextCursor: 'next-page' }).mockResolvedValueOnce({ items: [{ ...row, id: '223e4567-e89b-42d3-a456-426614174000' }], nextCursor: null });
  const value = await createNativeAnalyticsReader(api, { history })('isolated-token', controller.signal, now);
  expect(value.kind).toBe('ready'); if (value.kind === 'ready') { expect(value.projection.active).toHaveLength(2); expect(value.projection.historyAvailable).toBe(true); expect(value.projection.profile).toEqual({ displayName: 'Example', avatarEmoji: null }); }
  expect(api.readNativeSubscriptions).toHaveBeenNthCalledWith(1, 'isolated-token', controller.signal, undefined);
  expect(api.readNativeSubscriptions).toHaveBeenNthCalledWith(2, 'isolated-token', controller.signal, 'next-page');
  expect(history).toHaveBeenCalledWith('isolated-token', controller.signal);
});
it('does not show partial results after pagination, authorization, or history failure', async () => {
  for (const defect of ['duplicate', 'cursor', 'read-error', 'history-error']) {
    const api = fixture(), history = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    if (defect === 'history-error') history.mockRejectedValue(new Error('unavailable'));
    else {
      api.readNativeSubscriptions.mockResolvedValueOnce({ items: [row], nextCursor: 'same' });
      if (defect === 'read-error') api.readNativeSubscriptions.mockRejectedValueOnce(new Error('unavailable'));
      else api.readNativeSubscriptions.mockResolvedValueOnce({ items: defect === 'duplicate' ? [row] : [], nextCursor: defect === 'cursor' ? 'same' : null });
    }
    await expect(createNativeAnalyticsReader(api, { history })('token', new AbortController().signal, now)).rejects.toThrow();
    if (defect !== 'history-error') expect(history).not.toHaveBeenCalled();
  }
});
it('aborts before access and rejects a response completed after authority cancellation', async () => {
  const early = new AbortController(); early.abort(); const api = fixture();
  await expect(createNativeAnalyticsReader(api)('token', early.signal, now)).rejects.toThrow(); expect(api.readNativeProfile).not.toHaveBeenCalled();
  const late = new AbortController(), history = async () => { late.abort(); return { items: [], nextCursor: null }; };
  await expect(createNativeAnalyticsReader(api, { history })('token', late.signal, now)).rejects.toThrow();
});
it('keeps a production owner projection honest when no historical adapter is authorized', async () => {
  const result = await createNativeAnalyticsReader(fixture())('token', new AbortController().signal, now);
  expect(result.kind).toBe('ready'); if (result.kind === 'ready') { expect(result.projection.historyAvailable).toBe(false); expect(result.projection.plans.every(plan => plan.source === 'saved')).toBe(true); expect(result.projection.household).toBeUndefined(); }
});
it('reads only the injected current owner household with the same authority and refuses malformed or revoked metadata', async () => {
  const householdView = { household: { id: '323e4567-e89b-42d3-a456-426614174000', name: 'Example household', members: [{ id: '423e4567-e89b-42d3-a456-426614174000', displayName: 'Example owner', role: 'ADMIN' as const }], assignments: [] } };
  const controller = new AbortController(), household = jest.fn().mockResolvedValue(householdView);
  const result = await createNativeAnalyticsReader(fixture(), { household })('owner-token', controller.signal, now);
  expect(household).toHaveBeenCalledWith('owner-token', controller.signal); expect(result.kind === 'ready' && result.projection.household).toEqual(householdView.household);
  household.mockResolvedValue({ household: { ...householdView.household, members: [] } });
  await expect(createNativeAnalyticsReader(fixture(), { household })('owner-token', controller.signal, now)).rejects.toThrow();
  const revoked = new AbortController();
  await expect(createNativeAnalyticsReader(fixture(), { household: async () => { revoked.abort(); return householdView; } })('owner-token', revoked.signal, now)).rejects.toThrow();
});
