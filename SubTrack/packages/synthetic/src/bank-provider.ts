import type { BankDataProvider, BankAccount, BankTransaction } from '@subtrack/domain/bank';
import type { PersonaHousehold, PersonaSubscription } from './personas.js';
import { ALL_PERSONAS } from './personas.js';
import { createRng } from './rng.js';
import { nextSwedishBusinessDayUtc } from './calendar.js';

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive a stable day-of-month (1..28) from household seed + subscription id. */
function chargeDayOfMonth(householdSeed: string, subscriptionId: string): number {
  return (fnv1a32(`${householdSeed}:${subscriptionId}`) % 28) + 1;
}

function generateBillingDates(
  sub: PersonaSubscription,
  householdSeed: string,
  from: Date,
  to: Date,
): Date[] {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
    throw new Error('Invalid billing window');
  }
  const dates: Date[] = [];
  const dayOfMonth = chargeDayOfMonth(householdSeed, sub.id);
  // Include the previous month because a holiday/weekend can shift into the window.
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
  const endMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  const monthOfYear = fnv1a32(`${householdSeed}:${sub.id}:month`) % 12;
  while (cursor <= endMonth) {
    if (sub.billingCadence === 'MONTHLY' || cursor.getUTCMonth() === monthOfYear) {
      const candidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), dayOfMonth));
      const shifted = nextSwedishBusinessDayUtc(candidate);
      if (shifted >= from && shifted <= to) dates.push(candidate);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return dates;
}

/**
 * Generates synthetic bank data deterministically from persona fixtures.
 * Used in tests and the demo-tenant reseed pipeline (ST-162).
 */
export class SyntheticBankProvider implements BankDataProvider {
  private readonly householdByUserId: Map<string, PersonaHousehold>;

  constructor(personas: readonly PersonaHousehold[] = ALL_PERSONAS) {
    this.householdByUserId = new Map();
    for (const household of personas) {
      this.householdByUserId.set(household.id, household);
      for (const member of household.members) {
        this.householdByUserId.set(member.id, household);
      }
    }
  }

  async getAccounts(userId: string): Promise<BankAccount[]> {
    const household = this.householdByUserId.get(userId);
    if (!household) return [];
    const ibanDigits = fnv1a32(household.seed).toString().padStart(18, '0').slice(0, 18);
    return [
      {
        id: `synth-acct-${userId}`,
        externalId: `synth-ext-${household.seed.replace(/[^a-zA-Z0-9]/g, '-')}`,
        iban: `SE${ibanDigits}`,
        bankName: 'Synth Bank AB',
        accountType: 'CHECKING',
        currency: 'SEK',
        ownerUserId: userId,
      },
    ];
  }

  async getTransactions(accountId: string, from: Date, to: Date): Promise<BankTransaction[]> {
    const userId = accountId.replace(/^synth-acct-/, '');
    const household = this.householdByUserId.get(userId);
    if (!household) return [];

    const txns: BankTransaction[] = [];

    for (const sub of household.subscriptions) {
      const dates = generateBillingDates(sub, household.seed, from, to);
      for (const billingDate of dates) {
        const chargeKey = `${household.seed}:${sub.id}:${billingDate.toISOString().slice(0, 10)}`;
        const subRng = createRng(chargeKey);
        const date = nextSwedishBusinessDayUtc(billingDate);
        const descriptor = subRng.pick(sub.descriptorVariants);
        const jitter = subRng.nextInt(-99, 99);
        const amount = sub.amountMinor + jitter;

        txns.push({
          id: `synth:${chargeKey}`,
          externalId: `ext:${chargeKey}`,
          accountId,
          date,
          description: descriptor,
          amountMinor: -Math.abs(amount),
          currency: sub.currency,
          direction: 'DEBIT',
          pending: false,
        });
      }
    }

    return txns.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
