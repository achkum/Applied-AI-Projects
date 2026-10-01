import type { BankDataProvider, BankAccount, BankTransaction } from '@subtrack/domain/bank';
import type { PersonaHousehold, PersonaSubscription } from './personas.js';
import { ALL_PERSONAS } from './personas.js';
import { createRng } from './rng.js';
import { nextSwedishBusinessDay } from './calendar.js';

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
  const dates: Date[] = [];
  const dayOfMonth = chargeDayOfMonth(householdSeed, sub.id);

  if (sub.billingCadence === 'MONTHLY') {
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= endMonth) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dayOfMonth);
      if (candidate >= from && candidate <= to) {
        dates.push(nextSwedishBusinessDay(candidate));
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    // ANNUAL: derive a stable month from a secondary hash
    const monthOfYear = fnv1a32(`${householdSeed}:${sub.id}:month`) % 12;
    for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
      const candidate = new Date(year, monthOfYear, dayOfMonth);
      if (candidate >= from && candidate <= to) {
        dates.push(nextSwedishBusinessDay(candidate));
      }
    }
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

    const rng = createRng(`${household.seed}:txns`);
    const txns: BankTransaction[] = [];
    let seq = 0;
    const seedSuffix = household.seed.slice(-8);

    for (const sub of household.subscriptions) {
      const subRng = rng.fork(sub.id);
      const dates = generateBillingDates(sub, household.seed, from, to);
      for (const date of dates) {
        seq++;
        const descriptor = subRng.pick(sub.descriptorVariants);
        const jitter = subRng.nextInt(-99, 99);
        const amount = sub.amountMinor + jitter;

        txns.push({
          id: `synth-${seedSuffix}-${seq}`,
          externalId: `ext-${seedSuffix}-${seq}`,
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
