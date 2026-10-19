import type { PrivateOwnerSubscriptionView } from '../../../../packages/contracts/generated/types.gen';
import { parsePrivateOwnerView } from '@subtrack/contracts/private-onboarding';
import { add, money, multiply, subtract, type Money } from '../../../../packages/money/src/money';
import { recurringCost, recurringCostDifference, type RecurringCadence } from '../../../../packages/money/src/recurring-cost';
import { isConfirmedSekPriceIncrease } from '../../../../packages/money/src/price-increase';
import { renewalDateDay } from './privateMobileRenewals';

export type AnalyticsCharge = Readonly<{ id: string; subscriptionId: string | null; displayName: string; date: string; amountMinor: string; currency: 'SEK' }>;
export type ComparisonPlan = Readonly<{ id: string; name: string; categoryCode: string; cadence: RecurringCadence; amountMinor: string; currency: string; source: 'saved' | 'synthetic-persona-fixture'; subscriptionId?: string }>;
export type AnalyticsTotal = Readonly<{ monthly: Money; annual: Money }>;
export type AnalyticsCategory = Readonly<{ categoryCode: string; count: number; totals: readonly AnalyticsTotal[]; subscriptionIds: readonly string[] }>;
export type AnalyticsTrendMonth = Readonly<{ month: string; amount: Money; chargeCount: number }>;
export type AnalyticsIncrease = Readonly<{ subscriptionId: string; previous: Money; current: Money; monthlyDelta: Money; annualDelta: Money; dates: readonly string[] }>;
export type NativeAnalytics = Readonly<{ subscriptions: readonly PrivateOwnerSubscriptionView[]; active: readonly PrivateOwnerSubscriptionView[]; totals: readonly AnalyticsTotal[]; categories: readonly AnalyticsCategory[]; unknownCadenceCount: number; overlaps: readonly AnalyticsCategory[]; trend: readonly AnalyticsTrendMonth[]; priceIncreases: readonly AnalyticsIncrease[]; attributedCharges: readonly AnalyticsCharge[]; historyAvailable: boolean; historyTruncated: boolean; plans: readonly ComparisonPlan[] }>;

function totalsFor(rows: readonly PrivateOwnerSubscriptionView[]): readonly AnalyticsTotal[] {
  const totals = new Map<string, AnalyticsTotal>();
  for (const row of rows) {
    const cost = recurringCost(money(BigInt(row.expectedAmountMinor), row.currency), row.cadence);
    if (!cost) continue;
    const previous = totals.get(row.currency);
    totals.set(row.currency, { monthly: add(previous?.monthly ?? money(0n, row.currency), cost.monthly), annual: add(previous?.annual ?? money(0n, row.currency), cost.annual) });
  }
  return [...totals.values()].sort((left, right) => left.monthly.currency.localeCompare(right.monthly.currency));
}

/** Only complete scoped owner responses enter this selector; no identities are selected by a caller. */
export function projectNativeAnalytics(input: readonly PrivateOwnerSubscriptionView[], history: readonly AnalyticsCharge[] | null, now: Date, fixture: readonly ComparisonPlan[] = [], historyTruncated = false): NativeAnalytics {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Analytics unavailable');
  const seen = new Set<string>();
  const all = Object.freeze(input.map(value => {
    const row = parsePrivateOwnerView(value);
    if (seen.has(row.id)) throw new Error('Analytics unavailable');
    seen.add(row.id); return Object.freeze({...row});
  }));
  const active = all.filter(row => row.status === 'ACTIVE');
  const historicalSubscriptionIds = new Set(all.filter(row => row.status !== 'DETECTED' && row.status !== 'REJECTED').map(row => row.id));
  const grouped = new Map<string, PrivateOwnerSubscriptionView[]>();
  for (const row of active) grouped.set(row.categoryCode, [...(grouped.get(row.categoryCode) ?? []), row]);
  const categories = [...grouped].map(([categoryCode, rows]) => ({ categoryCode, count: rows.length, totals: totalsFor(rows), subscriptionIds: rows.map(row => row.id) }))
    .sort((a, b) => b.count - a.count || a.categoryCode.localeCompare(b.categoryCode));
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(0); date.setUTCFullYear(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const charges: AnalyticsCharge[] = [], chargeIds = new Set<string>();
  for (const row of history ?? []) {
    renewalDateDay(row.date);
    if (!row.id || chargeIds.has(row.id) || row.currency !== 'SEK' || !/^(?:0|-?[1-9]\d*)$/.test(row.amountMinor)) throw new Error('Analytics unavailable');
    if (BigInt(row.amountMinor) < -9223372036854775808n || BigInt(row.amountMinor) > 9223372036854775807n) throw new Error('Analytics unavailable');
    chargeIds.add(row.id);
    // Attribution must belong to this exact authorized read. Refunds and unrelated bank spending are excluded.
    if (row.subscriptionId !== null && historicalSubscriptionIds.has(row.subscriptionId) && BigInt(row.amountMinor) < 0n && row.date <= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`) charges.push(Object.freeze({...row}));
  }
  const trend = months.map(month => {
    const items = charges.filter(row => row.date.startsWith(month));
    return { month, amount: items.reduce((sum, row) => add(sum, multiply(money(BigInt(row.amountMinor), row.currency), -1n)), money(0n, 'SEK')), chargeCount: items.length };
  });
  const priceIncreases: AnalyticsIncrease[] = [];
  for (const subscription of active) {
    if (subscription.cadence !== 'MONTHLY' || subscription.currency !== 'SEK') continue;
    const values = charges.filter(row => row.subscriptionId === subscription.id).sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
    if (values.length !== 5) continue;
    // Five consecutive calendar cycles, one eligible booked charge each. No duplicated-cycle confirmation.
    const cycles = values.map(row => Number(row.date.slice(0, 4)) * 12 + Number(row.date.slice(5, 7)));
    if (cycles.some((value, index) => index > 0 && value !== cycles[index - 1]! + 1)) continue;
    const amounts = values.map(row => multiply(money(BigInt(row.amountMinor), row.currency), -1n));
    if (!isConfirmedSekPriceIncrease(amounts[3]!, amounts[4]!, amounts.slice(0, 3))) continue;
    const previous = [...amounts.slice(0, 3)].sort((a, b) => a.minorUnits < b.minorUnits ? -1 : a.minorUnits > b.minorUnits ? 1 : 0)[1]!;
    const delta = subtract(amounts[4]!, previous);
    priceIncreases.push({ subscriptionId: subscription.id, previous, current: amounts[4]!, monthlyDelta: delta, annualDelta: multiply(delta, 12n), dates: values.map(row => row.date) });
  }
  const plans: ComparisonPlan[] = active.map(row => ({ id: `saved:${row.id}`, name: row.customName ?? row.merchantName ?? '', categoryCode: row.categoryCode, cadence: row.cadence, amountMinor: row.expectedAmountMinor, currency: row.currency, source: 'saved', subscriptionId: row.id }));
  for (const plan of fixture) {
    if (plan.source !== 'synthetic-persona-fixture' || !/^fixture:[a-z0-9-]+$/.test(plan.id) || !/^[1-9]\d*$/.test(plan.amountMinor) || plan.currency !== 'SEK' || !plan.name || !recurringCost(money(BigInt(plan.amountMinor), plan.currency), plan.cadence)) throw new Error('Analytics unavailable');
    plans.push(plan);
  }
  return { subscriptions:all, active, totals: totalsFor(active), categories, unknownCadenceCount: active.filter(row => row.cadence === 'CUSTOM').length, overlaps: categories.filter(row => row.count > 1), trend, priceIncreases, attributedCharges:Object.freeze(charges), historyAvailable: history !== null, historyTruncated, plans };
}

export function compareNativePlans(left: ComparisonPlan, right: ComparisonPlan) {
  if (!isNativeComparisonAlternative(left,right)) return null;
  return recurringCostDifference(money(BigInt(left.amountMinor), left.currency), left.cadence, money(BigInt(right.amountMinor), right.currency), right.cadence);
}

/** An identical named sample is a snapshot of this plan, not another choice. Saved duplicates remain reviewable. */
export function isNativeComparisonAlternative(left:ComparisonPlan,right:ComparisonPlan):boolean{
 const canonical=(name:string)=>name.normalize('NFC').trim().toLocaleLowerCase('en');
 return left.id!==right.id&&left.currency===right.currency&&left.categoryCode===right.categoryCode&&!(right.source==='synthetic-persona-fixture'&&canonical(left.name)===canonical(right.name));
}

/** A display scope over this owner's already-authorized rows. It grants no member access. */
export function scopeNativeAnalytics(value: NativeAnalytics, subscriptionIds: ReadonlySet<string>, now: Date): NativeAnalytics {
  const subscriptions=value.subscriptions.filter(row=>subscriptionIds.has(row.id)),ids=new Set(subscriptions.map(row=>row.id));
  const history=value.historyAvailable?value.attributedCharges.filter(row=>row.subscriptionId!==null&&ids.has(row.subscriptionId)):null;
  return projectNativeAnalytics(subscriptions,history,now,value.plans.filter(plan=>plan.source==='synthetic-persona-fixture'),value.historyTruncated);
}
