import { compareNativePlans, projectNativeAnalytics, scopeNativeAnalytics, type AnalyticsCharge, type ComparisonPlan } from './nativeAnalyticsProjection';
import { syntheticComparisonCatalogue } from './syntheticComparisonCatalogue';
import type { PrivateOwnerSubscriptionView } from '../../../../packages/contracts/generated/types.gen';
jest.mock('./privateMobileApi', () => ({ readNativeProfile: jest.fn(), readNativeMode: jest.fn(), readNativeSubscriptions: jest.fn() }));
const row: PrivateOwnerSubscriptionView = { id: '123e4567-e89b-42d3-a456-426614174000', revision: '1', source: 'MANUAL', visibility: 'owner', customName: 'Example streaming', merchantId: null, merchantName: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '10000', currency: 'SEK', nextChargeDate: '2026-10-17', alwaysPrivate: true };
const now = new Date(2026, 9, 17, 12);
const second = { ...row, id: '223e4567-e89b-42d3-a456-426614174000', customName: 'Other streaming', expectedAmountMinor: '7000' };
const charges = (amounts = ['-10000', '-10000', '-10000', '-12000', '-12000']): AnalyticsCharge[] => amounts.map((amountMinor, index) => ({ id: `charge-${index}`, subscriptionId: row.id, displayName: 'Example streaming', date: `2026-${String(6 + index).padStart(2, '0')}-03`, amountMinor, currency: 'SEK' }));

it('normalizes active saved cycles with exact per-currency totals and custom cycles unknown', () => {
  const annual = { ...second, cadence: 'ANNUAL' as const, currency: 'EUR', expectedAmountMinor: '101' };
  const custom = { ...row, id: '323e4567-e89b-42d3-a456-426614174000', cadence: 'CUSTOM' as const };
  const paused = { ...row, id: '423e4567-e89b-42d3-a456-426614174000', status: 'PAUSED' as const };
  const large = { ...row, expectedAmountMinor: '9007199254740993' };
  const value = projectNativeAnalytics([large, annual, custom, paused], null, now);
  expect(value.active).toHaveLength(3); expect(value.unknownCadenceCount).toBe(1);
  expect(value.totals).toEqual([{ monthly: { minorUnits: 8n, currency: 'EUR' }, annual: { minorUnits: 101n, currency: 'EUR' } }, { monthly: { minorUnits: 9007199254740993n, currency: 'SEK' }, annual: { minorUnits: 108086391056891916n, currency: 'SEK' } }]);
  expect(value.historyAvailable).toBe(false); expect(value.priceIncreases).toEqual([]);
});
it('retains a validated immutable owner roster for confirmed inactive detail without changing active projections',()=>{
 const inactive={...second,status:'PAUSED' as const},input=[row,inactive],value=projectNativeAnalytics(input,[],now);
 expect(value.subscriptions).toEqual(input);expect(value.active.map(item=>item.id)).toEqual([row.id]);expect(Object.isFrozen(value.subscriptions)).toBe(true);expect(value.subscriptions.every(Object.isFrozen)).toBe(true);
 Object.assign(inactive,{revision:'2',customName:'Changed after read'});expect(value.subscriptions[1]).toMatchObject({revision:'1',customName:second.customName});
 expect(scopeNativeAnalytics(value,new Set([inactive.id]),now).subscriptions).toEqual([]);
});
it('shows category overlap as a review finding without inventing duplicate-service savings', () => {
  const value = projectNativeAnalytics([row, second], [], now);
  expect(value.overlaps).toEqual([{ categoryCode: row.categoryCode, count: 2, totals: [{ monthly: { minorUnits: 17000n, currency: 'SEK' }, annual: { minorUnits: 204000n, currency: 'SEK' } }], subscriptionIds: [row.id, second.id] }]);
  expect(value.overlaps[0]).not.toHaveProperty('savings');
});
it('confirms only the accepted SEK price-rise rule across five consecutive booked monthly cycles', () => {
  const value = projectNativeAnalytics([row], charges(), now);
  expect(value.priceIncreases).toEqual([{ subscriptionId: row.id, previous: { minorUnits: 10000n, currency: 'SEK' }, current: { minorUnits: 12000n, currency: 'SEK' }, monthlyDelta: { minorUnits: 2000n, currency: 'SEK' }, annualDelta: { minorUnits: 24000n, currency: 'SEK' }, dates: charges().map(item => item.date) }]);
  expect(projectNativeAnalytics([row], charges(['-10000', '-10000', '-10000', '-10200', '-10200']), now).priceIncreases).toEqual([]);
  expect(projectNativeAnalytics([row], charges(['-10000', '-10000', '-10000', '-12000', '-13000']), now).priceIncreases).toEqual([]);
  expect(projectNativeAnalytics([{ ...row, cadence: 'ANNUAL' }], charges(), now).priceIncreases).toEqual([]);
});
it('rejects missing/duplicate cycles, insufficient evidence and future confirmation', () => {
  expect(projectNativeAnalytics([row], charges().slice(1), now).priceIncreases).toEqual([]);
  expect(projectNativeAnalytics([row], charges().map((item, index) => index === 0 ? { ...item, date: '2026-05-03' } : item), now).priceIncreases).toEqual([]);
  expect(projectNativeAnalytics([row], charges().map((item, index) => index === 3 ? { ...item, date: '2026-08-04' } : item), now).priceIncreases).toEqual([]);
  expect(projectNativeAnalytics([row], charges().map((item, index) => index === 4 ? { ...item, date: '2026-11-03' } : item), now).priceIncreases).toEqual([]);
});
it('trends only attributed owner subscription outflows, with exact labels and current-month cutoff', () => {
  const input: AnalyticsCharge[] = [...charges(), { ...charges()[0]!, id: 'refund', amountMinor: '10000' }, { ...charges()[0]!, id: 'grocery', amountMinor: '-990000', subscriptionId: null }, { ...charges()[0]!, id: 'foreign', subscriptionId: second.id }, { ...charges()[0]!, id: 'future', date: '2026-10-28' }];
  const value = projectNativeAnalytics([row], input, now, [], true);
  expect(value.trend.map(item => [item.month, item.amount.minorUnits, item.chargeCount])).toEqual([['2026-05', 0n, 0], ['2026-06', 10000n, 1], ['2026-07', 10000n, 1], ['2026-08', 10000n, 1], ['2026-09', 12000n, 1], ['2026-10', 12000n, 1]]);
  expect(value.historyAvailable).toBe(true); expect(value.historyTruncated).toBe(true);
  expect(projectNativeAnalytics([], [], new Date(2027, 0, 1)).trend.map(item => item.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  for (const status of ['DETECTED', 'REJECTED'] as const) expect(projectNativeAnalytics([{ ...row, status }], charges(), now).trend.every(item => item.chargeCount === 0)).toBe(true);
  expect(projectNativeAnalytics([{ ...row, status: 'ARCHIVED' }], charges(), now).trend[5]?.amount.minorUnits).toBe(12000n);
});
it('rejects malformed, duplicated and foreign owner data and malformed history', () => {
  expect(() => projectNativeAnalytics([row, row], [], now)).toThrow();
  expect(() => projectNativeAnalytics([{ ...row, visibility: 'household' } as never], [], now)).toThrow();
  expect(() => projectNativeAnalytics([row], [charges()[0]!, charges()[0]!], now)).toThrow();
  for (const patch of [{ date: '2026-02-30' }, { amountMinor: '1.25' }, { amountMinor: '-9223372036854775809' }, { currency: 'EUR' }]) expect(() => projectNativeAnalytics([row], [{ ...charges()[0]!, ...patch } as AnalyticsCharge], now)).toThrow();
  expect(() => projectNativeAnalytics([row], [], new Date('invalid'))).toThrow();
});
it('compares saved and clearly synthetic plans only within one category and currency', () => {
  const value = projectNativeAnalytics([row, second], [], now, syntheticComparisonCatalogue);
  expect(value.plans.filter(plan => plan.source === 'synthetic-persona-fixture').length).toBeGreaterThan(10);
  const saved = value.plans.filter(plan => plan.source === 'saved');
  expect(compareNativePlans(saved[0]!, saved[1]!)).toEqual({ monthly: { minorUnits: 3000n, currency: 'SEK' }, annual: { minorUnits: 36000n, currency: 'SEK' } });
  expect(compareNativePlans(saved[0]!, saved[0]!)).toBeNull();
  expect(compareNativePlans(saved[0]!, { ...saved[1]!, currency: 'EUR' })).toBeNull();
  expect(compareNativePlans(saved[0]!, { ...saved[1]!, categoryCode: 'AI_TOOLS' })).toBeNull();
  expect(compareNativePlans(saved[0]!, { ...saved[1]!, cadence: 'CUSTOM' })).toBeNull();
  expect(value.plans.some(plan => 'verifiedAt' in plan)).toBe(false);
  expect(() => projectNativeAnalytics([row], [], now, [{ ...saved[0]!, source: 'synthetic-persona-fixture' }])).toThrow();
  expect(() => projectNativeAnalytics([row], [], now, [{ ...syntheticComparisonCatalogue[0]!, amountMinor: '0' }])).toThrow();
  expect(() => projectNativeAnalytics([row], [], now, [{ ...syntheticComparisonCatalogue[0]!, cadence: 'CUSTOM' }])).toThrow();
});
it('does not create synthetic active records or savings when the actual owner has no plans', () => {
  const value = projectNativeAnalytics([], [], now, syntheticComparisonCatalogue);
  expect(value.active).toEqual([]); expect(value.totals).toEqual([]); expect(value.priceIncreases).toEqual([]);
  expect(value.plans.every(plan => plan.source === 'synthetic-persona-fixture')).toBe(true);
  const custom: ComparisonPlan = { id: 'saved:custom', name: 'Custom', categoryCode: 'OTHER_SUBSCRIPTION', cadence: 'CUSTOM', amountMinor: '100', currency: 'SEK', source: 'saved' };
  expect(compareNativePlans(custom, { ...custom, id: 'different' })).toBeNull();
});
it('scopes actual booked history to selected active subscription IDs without retaining foreign or unassigned evidence',()=>{
 const secondCharges=charges(['-7000','-7000','-7000','-7000','-7000']).map(item=>({...item,id:`second-${item.id}`,subscriptionId:second.id}));
 const archived={...row,id:'323e4567-e89b-42d3-a456-426614174000',status:'ARCHIVED' as const};
 const other:AnalyticsCharge[]=[{...charges()[0]!,id:'archived',subscriptionId:archived.id},{...charges()[0]!,id:'unrelated',subscriptionId:null},{...charges()[0]!,id:'foreign',subscriptionId:'423e4567-e89b-42d3-a456-426614174000'}];
 const source=projectNativeAnalytics([row,second,archived],[...charges(),...secondCharges,...other],now,[],true),selected=scopeNativeAnalytics(source,new Set([row.id]),now);
 expect(selected.historyAvailable).toBe(true);expect(selected.historyTruncated).toBe(true);expect(selected.trend.map(month=>month.amount.minorUnits)).toEqual([0n,10000n,10000n,10000n,12000n,12000n]);expect(selected.attributedCharges.map(charge=>charge.id)).toEqual(charges().map(charge=>charge.id));expect(selected.priceIncreases.map(item=>item.subscriptionId)).toEqual([row.id]);
 const disjoint=scopeNativeAnalytics(source,new Set([second.id]),now);expect(disjoint.trend.map(month=>month.amount.minorUnits)).toEqual([0n,7000n,7000n,7000n,7000n,7000n]);expect(disjoint.priceIncreases).toEqual([]);expect(disjoint.attributedCharges.every(charge=>charge.subscriptionId===second.id)).toBe(true);
 const unknown=scopeNativeAnalytics(source,new Set([archived.id,'423e4567-e89b-42d3-a456-426614174000']),now);expect(unknown.active).toEqual([]);expect(unknown.attributedCharges).toEqual([]);expect(unknown.trend.every(month=>month.amount.minorUnits===0n&&month.chargeCount===0)).toBe(true);expect(unknown.priceIncreases).toEqual([]);
});
it('preserves unavailable versus available-empty scoped history and snapshots only eligible attributed charges',()=>{
 const unavailable=scopeNativeAnalytics(projectNativeAnalytics([row],null,now),new Set([row.id]),now);expect(unavailable.historyAvailable).toBe(false);expect(unavailable.attributedCharges).toEqual([]);
 const empty=scopeNativeAnalytics(projectNativeAnalytics([row],[],now,[],true),new Set([row.id]),now);expect(empty.historyAvailable).toBe(true);expect(empty.historyTruncated).toBe(true);expect(empty.attributedCharges).toEqual([]);
 const input=charges(),source=projectNativeAnalytics([row],input,now);Object.assign(input[0]!,{amountMinor:'-999999',subscriptionId:second.id});expect(source.attributedCharges[0]).toEqual(charges()[0]);expect(Object.isFrozen(source.attributedCharges)).toBe(true);expect(Object.isFrozen(source.attributedCharges[0])).toBe(true);
});
