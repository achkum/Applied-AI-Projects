import { describe, expect, it } from 'vitest';
import {
  ALL_PERSONAS,
  SyntheticBankProvider,
  type PersonaHousehold,
} from '../src/index.js';
import { detectRecurring, type DetectionTransaction, type TransactionSeries } from '@subtrack/domain/detection';

const FROM = new Date(Date.UTC(2024, 0, 1));
const UNTIL = new Date(Date.UTC(2025, 11, 31, 23, 59, 59));

interface EvaluationCase {
  id: string;
  expectedCadence: 'MONTHLY' | 'ANNUAL' | null;
  series: TransactionSeries;
}

async function buildPositiveCases(): Promise<EvaluationCase[]> {
  const cases: EvaluationCase[] = [];
  for (const household of ALL_PERSONAS) {
    for (const subscription of household.subscriptions) {
      if (!subscription.groundTruth.isRecurring) continue;
      const persona: PersonaHousehold = { ...household, subscriptions: [subscription] };
      const provider = new SyntheticBankProvider([persona]);
      const ownerId = subscription.ownerType === 'MEMBER' && subscription.memberId
        ? subscription.memberId
        : household.id;
      const [account] = await provider.getAccounts(ownerId);
      if (!account) throw new Error(`Synthetic account unavailable for fixture ${household.id}`);
      const transactions = await provider.getTransactions(account.id, FROM, UNTIL);
      cases.push({
        id: `positive:${household.id}:${subscription.id}`,
        expectedCadence: subscription.billingCadence,
        series: {
          ownerId,
          accountId: account.id,
          merchantKey: subscription.merchantId,
          currency: subscription.currency,
          categoryCode: subscription.category.replaceAll('-', '_').toUpperCase(),
          transactions,
        },
      });
    }
  }
  return cases;
}

function day(year: number, month: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(year, month, dayOfMonth, 12));
}

function negativeTransaction(
  id: string,
  date: Date,
  amountMinor: number,
  direction: 'CREDIT' | 'DEBIT' = 'DEBIT',
): DetectionTransaction {
  return {
    id,
    accountId: 'negative-account',
    date,
    amountMinor,
    currency: 'SEK',
    direction,
    pending: false,
  };
}

function negativeCases(): EvaluationCase[] {
  const monthlyDates = Array.from({ length: 24 }, (_, i) => day(2024 + Math.floor(i / 12), i % 12, 25));
  const salary: EvaluationCase = {
    id: 'negative:salary',
    expectedCadence: null,
    series: {
      ownerId: 'negative-owner', accountId: 'negative-account', merchantKey: 'employer',
      currency: 'SEK', categoryCode: 'SALARY',
      transactions: monthlyDates.map((date, i) => negativeTransaction(`salary-${i}`, date, 3500000, 'CREDIT')),
    },
  };
  const groceryWeeklyDates = Array.from({ length: 104 }, (_, i) => day(2024, 0, 6 + i * 7));
  const weeklyGroceries: EvaluationCase = {
    id: 'negative:weekly-groceries',
    expectedCadence: null,
    series: {
      ownerId: 'negative-owner', accountId: 'negative-account', merchantKey: 'groceries-market',
      currency: 'SEK', categoryCode: 'GROCERIES',
      transactions: groceryWeeklyDates.map((date, i) => negativeTransaction(`weekly-grocery-${i}`, date, -85000)),
    },
  };
  const monthlyGroceries: EvaluationCase = {
    id: 'negative:monthly-groceries',
    expectedCadence: null,
    series: {
      ownerId: 'negative-owner', accountId: 'negative-account', merchantKey: 'groceries-market',
      currency: 'SEK', categoryCode: 'GROCERIES',
      transactions: monthlyDates.map((date, i) => negativeTransaction(`monthly-grocery-${i}`, date, -85000)),
    },
  };
  const weekdays: Date[] = [];
  for (let d = new Date(FROM); d <= UNTIL; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    const weekday = d.getUTCDay();
    if (weekday > 0 && weekday < 6) weekdays.push(day(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const weekdayCafe: EvaluationCase = {
    id: 'negative:weekday-cafe',
    expectedCadence: null,
    series: {
      ownerId: 'negative-owner', accountId: 'negative-account', merchantKey: 'weekday-cafe',
      currency: 'SEK', categoryCode: 'RESTAURANTS',
      transactions: weekdays.map((date, i) => negativeTransaction(`cafe-${i}`, date, -3900)),
    },
  };
  const rent: EvaluationCase = {
    id: 'negative:rent', expectedCadence: null,
    series: {
      ownerId: 'negative-owner', accountId: 'negative-account', merchantKey: 'landlord',
      currency: 'SEK', categoryCode: 'RENT',
      transactions: monthlyDates.map((date, i) => negativeTransaction(`rent-${i}`, date, -1200000)),
    },
  };
  const utility: EvaluationCase = {
    id: 'negative:utility', expectedCadence: null,
    series: {
      ownerId: 'negative-owner', accountId: 'negative-account', merchantKey: 'electricity-provider',
      currency: 'SEK', categoryCode: 'UTILITY_ELECTRICITY',
      transactions: monthlyDates.map((date, i) => negativeTransaction(`utility-${i}`, date, -75000)),
    },
  };
  return [salary, weeklyGroceries, monthlyGroceries, weekdayCafe, rent, utility];
}

function evaluate(cases: readonly EvaluationCase[]) {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (const evaluationCase of cases) {
    const candidates = detectRecurring(evaluationCase.series);
    const correct = evaluationCase.expectedCadence === null
      ? []
      : candidates.filter((candidate) => candidate.cadence === evaluationCase.expectedCadence);
    const hasCorrectDetection = correct.length > 0;
    truePositives += hasCorrectDetection ? 1 : 0;
    if (evaluationCase.expectedCadence !== null && !hasCorrectDetection) falseNegatives += 1;
    falsePositives += candidates.length - (hasCorrectDetection ? 1 : 0);
  }
  const precision = truePositives + falsePositives === 0
    ? 0
    : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0
    ? 0
    : truePositives / (truePositives + falseNegatives);
  return { truePositives, falsePositives, falseNegatives, precision, recall };
}

describe('recurring detection evaluation against synthetic truth', () => {
  it('uses all labeled positives and explicit non-subscription negatives', async () => {
    const positives = await buildPositiveCases();
    const cases = [...positives, ...negativeCases()];
    const expectedPositiveCount = ALL_PERSONAS.reduce((total, persona) => total + persona.subscriptions.length, 0);
    expect(positives).toHaveLength(expectedPositiveCount);
    expect(cases).toHaveLength(expectedPositiveCount + 6);

    const metrics = evaluate(cases);
    expect(metrics).toEqual({
      truePositives: expectedPositiveCount,
      falsePositives: 2,
      falseNegatives: 0,
      precision: expectedPositiveCount / (expectedPositiveCount + 2),
      recall: 1,
    });
    expect(metrics.precision).toBeGreaterThanOrEqual(0.9);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.85);
  });
});
