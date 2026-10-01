import { ALL_PERSONAS, createRng } from '@subtrack/synthetic';
import type { PersonaHousehold, PersonaSubscription } from '@subtrack/synthetic';
import type {
  DemoSnapshot,
  DemoHousehold,
  DemoSubscription,
  DemoTransaction,
} from './types.js';

export const SCHEMA_VERSION = '1.0.0';

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function chargeDayOfMonth(householdSeed: string, subId: string): number {
  return (fnv1a32(`${householdSeed}:${subId}`) % 28) + 1;
}

function generateBillingDates(
  sub: PersonaSubscription,
  householdSeed: string,
  from: Date,
  to: Date,
): Date[] {
  const dates: Date[] = [];
  const dom = chargeDayOfMonth(householdSeed, sub.id);

  if (sub.billingCadence === 'MONTHLY') {
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= endMonth) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
      if (candidate >= from && candidate <= to) dates.push(new Date(candidate));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const monthOfYear = fnv1a32(`${householdSeed}:${sub.id}:month`) % 12;
    for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
      const candidate = new Date(year, monthOfYear, dom);
      if (candidate >= from && candidate <= to) dates.push(new Date(candidate));
    }
  }

  return dates;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateHousehold(household: PersonaHousehold, asOf: Date): DemoHousehold {
  const rng = createRng(`${household.seed}:demo`);

  const subscriptions: DemoSubscription[] = household.subscriptions.map((sub) => ({
    id: sub.id,
    merchantId: sub.merchantId,
    merchantName: sub.merchantName,
    category: sub.category,
    amountMinor: sub.amountMinor,
    currency: sub.currency,
    billingCadence: sub.billingCadence,
    ownerType: sub.ownerType,
    ...(sub.memberId !== undefined ? { memberId: sub.memberId } : {}),
    isRecurring: true as const,
    normalizedAmountMinor: sub.groundTruth.normalizedAmountMinor,
  }));

  const from = new Date(asOf);
  from.setMonth(from.getMonth() - 13);

  const transactions: DemoTransaction[] = [];
  let seq = 0;

  for (const sub of household.subscriptions) {
    const subRng = rng.fork(sub.id);
    const dates = generateBillingDates(sub, household.seed, from, asOf);

    for (const date of dates) {
      seq++;
      const descriptor = subRng.pick(sub.descriptorVariants);
      const jitter = subRng.nextInt(-99, 99);

      transactions.push({
        id: `demo-${household.seed.slice(-8)}-${seq}`,
        date: toIsoDate(date),
        description: descriptor,
        amountMinor: -(sub.amountMinor + jitter),
        currency: sub.currency,
        subscriptionId: sub.id,
      });
    }
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return {
    id: household.id,
    displayName: household.displayName,
    members: household.members.map((m) => ({ id: m.id, name: m.name })),
    subscriptions,
    transactions,
  };
}

/** Generate a demo snapshot of all persona households as of the given date. */
export function generateDemoSnapshot(asOfDate: Date): DemoSnapshot {
  return {
    asOf: toIsoDate(asOfDate),
    schemaVersion: SCHEMA_VERSION,
    households: ALL_PERSONAS.map((h) => generateHousehold(h, asOfDate)),
  };
}
