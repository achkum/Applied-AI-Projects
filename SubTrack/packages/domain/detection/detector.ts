import {
  assertSafeMinorUnits,
  assertValidCurrencyCode,
  greaterThan,
  lessThan,
  money,
  multiply,
  type Money,
} from '@subtrack/money';
import type {
  AmountBand,
  BillingCadence,
  DetectionReason,
  DetectionTransaction,
  RecurringCandidate,
  TransactionSeries,
} from './types.js';

const CADENCES: readonly { cadence: BillingCadence; minOccurrences: number; months: number | null }[] = [
  { cadence: 'WEEKLY', minOccurrences: 4, months: null },
  { cadence: 'MONTHLY', minOccurrences: 3, months: 1 },
  { cadence: 'QUARTERLY', minOccurrences: 3, months: 3 },
  { cadence: 'SEMIANNUAL', minOccurrences: 3, months: 6 },
  { cadence: 'ANNUAL', minOccurrences: 2, months: 12 },
];

const EXCLUDED_CATEGORIES = new Set([
  'SALARY', 'RENT', 'MORTGAGE', 'LOAN', 'INSURANCE', 'UTILITY_ELECTRICITY',
  'UTILITY_WATER', 'TAX', 'CHILD_ALLOWANCE', 'SAVINGS_TRANSFER',
  'INTERNAL_TRANSFER', 'SWISH', 'CSN', 'UNION_FEE',
]);

const SUBSCRIPTION_CATEGORIES = new Set([
  'VIDEO_STREAMING', 'MUSIC_AUDIO', 'AUDIOBOOKS_EBOOKS', 'NEWS_MAGAZINES',
  'GAMING', 'SOFTWARE_PRODUCTIVITY', 'CLOUD_STORAGE', 'AI_TOOLS', 'MOBILE_PLAN',
  'BROADBAND_TV', 'FITNESS_WELLNESS', 'FOOD_MEALKITS', 'TRANSPORT_MOBILITY',
  'HOME_SECURITY', 'EDUCATION_KIDS', 'PETS', 'SHOPPING_MEMBERSHIPS',
  'VPN_SECURITY', 'DONATIONS', 'DATING_SOCIAL', 'APP_STORE_BILLING',
  'OTHER_SUBSCRIPTION',
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_TOLERANCE_DAYS = 3;

interface Occurrence {
  transaction: DetectionTransaction;
  day: number;
  amount: Money;
}

interface ScheduleMatch {
  cadence: BillingCadence;
  minOccurrences: number;
  occurrences: readonly Occurrence[];
  dateParams: Readonly<Record<string, number>>;
  totalDateDrift: number;
}

function utcDay(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

function dateFromDay(day: number): Date {
  return new Date(day * DAY_MS);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function dateAtMonthDay(index: number, day: number): Date {
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month))));
}

function dayDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

/** Compare opaque identifiers using UTF-16 code-unit order, independent of locale. */
function compareStableIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  return a.day - b.day || compareStableIds(a.transaction.id, b.transaction.id);
}

function isBetterForSlot(candidate: Occurrence, current: Occurrence, dueDay: number): boolean {
  const candidateDrift = dayDistance(candidate.day, dueDay);
  const currentDrift = dayDistance(current.day, dueDay);
  return candidateDrift < currentDrift ||
    (candidateDrift === currentDrift && compareStableIds(candidate.transaction.id, current.transaction.id) < 0);
}

function collapseRetryDuplicates(occurrences: readonly Occurrence[]): Occurrence[] {
  const ordered = [...occurrences].sort(compareOccurrences);
  const lastKeptByAmount = new Map<string, Occurrence>();
  const result: Occurrence[] = [];

  for (const occurrence of ordered) {
    const amountKey = occurrence.amount.minorUnits.toString();
    const last = lastKeptByAmount.get(amountKey);
    if (last && occurrence.day - last.day <= DATE_TOLERANCE_DAYS) continue;
    result.push(occurrence);
    lastKeptByAmount.set(amountKey, occurrence);
  }
  return result;
}

function contiguousRuns(
  slots: ReadonlyMap<number, { occurrence: Occurrence; dueDay: number }>,
): ScheduleMatch['occurrences'][] {
  const ordered = [...slots.entries()].sort(([a], [b]) => a - b);
  const runs: ScheduleMatch['occurrences'][] = [];
  let run: Occurrence[] = [];
  let previousSlot: number | undefined;

  for (const [slot, value] of ordered) {
    if (previousSlot !== undefined && slot !== previousSlot + 1) {
      if (run.length > 0) runs.push(run);
      run = [];
    }
    run.push(value.occurrence);
    previousSlot = slot;
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function weeklySchedules(occurrences: readonly Occurrence[]): ScheduleMatch[] {
  const matches = new Map<string, ScheduleMatch>();
  for (const observed of occurrences) {
    for (let offset = -DATE_TOLERANCE_DAYS; offset <= DATE_TOLERANCE_DAYS; offset++) {
      const anchorDay = observed.day + offset;
      const slots = new Map<number, { occurrence: Occurrence; dueDay: number }>();
      let fitsAll = true;

      for (const occurrence of occurrences) {
        const slot = Math.round((occurrence.day - anchorDay) / 7);
        const dueDay = anchorDay + slot * 7;
        if (dayDistance(occurrence.day, dueDay) > DATE_TOLERANCE_DAYS) {
          fitsAll = false;
          break;
        }
        const current = slots.get(slot);
        if (!current || isBetterForSlot(occurrence, current.occurrence, dueDay)) {
          slots.set(slot, { occurrence, dueDay });
        }
      }
      if (!fitsAll || slots.size !== occurrences.length) continue;

      const [run] = contiguousRuns(slots);
      if (!run || run.length !== occurrences.length) continue;
      const ids = run.map((item) => item.transaction.id).sort().join('|');
      const totalDateDrift = [...slots.values()].reduce((sum, item) => sum + dayDistance(item.occurrence.day, item.dueDay), 0);
      const match: ScheduleMatch = {
        cadence: 'WEEKLY',
        minOccurrences: 4,
        occurrences: run,
        dateParams: { intervalDays: 7, toleranceDays: DATE_TOLERANCE_DAYS },
        totalDateDrift,
      };
      const previous = matches.get(ids);
      if (!previous || totalDateDrift < previous.totalDateDrift) matches.set(ids, match);
    }
  }
  return [...matches.values()];
}

function calendarSchedules(
  occurrences: readonly Occurrence[],
  cadence: BillingCadence,
  minOccurrences: number,
  intervalMonths: number,
): ScheduleMatch[] {
  const matches = new Map<string, ScheduleMatch>();
  const firstMonth = monthIndex(dateFromDay(occurrences[0]!.day)) - 1;
  const lastMonth = monthIndex(dateFromDay(occurrences[occurrences.length - 1]!.day)) + 1;

  for (let phase = 0; phase < intervalMonths; phase++) {
    for (let nominalDay = 1; nominalDay <= 31; nominalDay++) {
      const scheduleSlots: { slot: number; dueDay: number }[] = [];
      for (let month = firstMonth; month <= lastMonth; month++) {
        const offset = ((month - phase) % intervalMonths + intervalMonths) % intervalMonths;
        if (offset !== 0) continue;
        const dueDay = utcDay(dateAtMonthDay(month, nominalDay));
        scheduleSlots.push({ slot: Math.floor((month - phase) / intervalMonths), dueDay });
      }

      const assigned = new Map<number, { occurrence: Occurrence; dueDay: number }>();
      let fitsAll = true;
      let totalDateDrift = 0;
      for (const occurrence of occurrences) {
        let nearest: { slot: number; dueDay: number; drift: number } | undefined;
        for (const schedule of scheduleSlots) {
          const drift = dayDistance(occurrence.day, schedule.dueDay);
          if (drift > DATE_TOLERANCE_DAYS) continue;
          if (!nearest || drift < nearest.drift || (drift === nearest.drift && schedule.slot < nearest.slot)) {
            nearest = { ...schedule, drift };
          }
        }
        if (!nearest) {
          fitsAll = false;
          break;
        }
        const current = assigned.get(nearest.slot);
        if (current) {
          if (isBetterForSlot(occurrence, current.occurrence, nearest.dueDay)) {
            assigned.set(nearest.slot, { occurrence, dueDay: nearest.dueDay });
          }
          fitsAll = false;
          break;
        }
        assigned.set(nearest.slot, { occurrence, dueDay: nearest.dueDay });
        totalDateDrift += nearest.drift;
      }
      if (!fitsAll || assigned.size !== occurrences.length) continue;

      const runs = contiguousRuns(assigned);
      if (runs.length !== 1 || runs[0]!.length !== occurrences.length) continue;
      const run = runs[0]!;
      const ids = run.map((item) => item.transaction.id).sort().join('|');
      const match: ScheduleMatch = {
        cadence,
        minOccurrences,
        occurrences: run,
        dateParams: { intervalMonths, nominalDay, monthPhase: phase, toleranceDays: DATE_TOLERANCE_DAYS },
        totalDateDrift,
      };
      const previous = matches.get(ids);
      const previousNominalDay = previous?.dateParams['nominalDay'] ?? 32;
      if (!previous || totalDateDrift < previous.totalDateDrift ||
        (totalDateDrift === previous.totalDateDrift && nominalDay < previousNominalDay)) {
        matches.set(ids, match);
      }
    }
  }
  return [...matches.values()];
}

function amountBand(occurrences: readonly Occurrence[]): AmountBand | null {
  const amounts = occurrences.map((item) => item.amount).sort((a, b) =>
    lessThan(a, b) ? -1 : greaterThan(a, b) ? 1 : 0,
  );
  const representative = amounts[Math.floor((amounts.length - 1) / 2)];
  const minimum = amounts[0];
  const maximum = amounts[amounts.length - 1];
  if (!representative || !minimum || !maximum) return null;

  const lowLimit = multiply(representative, 9n, 10n);
  const highLimit = multiply(representative, 11n, 10n);
  if (lessThan(minimum, lowLimit) || greaterThan(maximum, highLimit)) return null;
  return { minimum, maximum, representative };
}

function makeCandidate(
  series: TransactionSeries,
  categoryCode: string | null,
  match: ScheduleMatch,
): RecurringCandidate | null {
  const merchantKey = series.merchantKey;
  if (!merchantKey?.trim()) return null;
  const band = amountBand(match.occurrences);
  if (!band) return null;
  const hasCategoryPrior = categoryCode !== null && SUBSCRIPTION_CATEGORIES.has(categoryCode);
  const confidence = Math.min(
    0.95,
    0.85 + Math.max(0, match.occurrences.length - match.minOccurrences) * 0.03 + (hasCategoryPrior ? 0.02 : 0),
  );
  const reasons: DetectionReason[] = [
    { code: 'MERCHANT_RESOLVED' },
    { code: 'CADENCE_MATCHED', params: { cadence: match.cadence } },
    {
      code: 'MIN_OCCURRENCES_MET',
      params: { count: match.occurrences.length, minimum: match.minOccurrences },
    },
    { code: 'DATE_PATTERN_STABLE', params: match.dateParams },
    { code: 'AMOUNT_WITHIN_BAND', params: { tolerancePercent: 10 } },
  ];
  if (hasCategoryPrior && categoryCode !== null) {
    reasons.push({ code: 'SUBSCRIPTION_CATEGORY_PRIOR', params: { categoryCode } });
  }

  return {
    ownerId: series.ownerId,
    accountId: series.accountId,
    merchantKey,
    currency: series.currency.toUpperCase(),
    cadence: match.cadence,
    amountBand: band,
    occurrenceCount: match.occurrences.length,
    confidence,
    reasons,
    transactionIds: match.occurrences.map((item) => item.transaction.id),
  };
}

/** Detect exact, deterministic recurring patterns from one pre-grouped series. */
export function detectRecurring(series: TransactionSeries): RecurringCandidate[] {
  if (!series.ownerId || !series.accountId || !series.merchantKey?.trim()) return [];
  const currency = series.currency.toUpperCase();
  assertValidCurrencyCode(currency);
  const categoryCode = series.categoryCode?.toUpperCase() ?? null;
  if (categoryCode && EXCLUDED_CATEGORIES.has(categoryCode)) return [];

  const occurrences: Occurrence[] = [];
  for (const transaction of series.transactions) {
    if (transaction.accountId !== series.accountId) return [];
    if (transaction.currency.toUpperCase() !== currency) return [];
    assertValidCurrencyCode(transaction.currency.toUpperCase());
    if (!Number.isFinite(transaction.date.getTime())) return [];
    assertSafeMinorUnits(transaction.amountMinor);
    if (transaction.pending || transaction.direction !== 'DEBIT') continue;

    const signedAmount = money(transaction.amountMinor, currency);
    // Bank debits use signed negative minor units; positive debit rows are not outflows.
    if (!lessThan(signedAmount, money(0n, currency))) continue;
    const outflow = multiply(signedAmount, -1n);
    occurrences.push({ transaction, day: utcDay(transaction.date), amount: outflow });
  }

  const collapsed = collapseRetryDuplicates(occurrences);
  if (collapsed.length < 2) return [];
  const candidates: RecurringCandidate[] = [];

  for (const cadence of CADENCES) {
    const matches = cadence.months === null
      ? weeklySchedules(collapsed)
      : calendarSchedules(collapsed, cadence.cadence, cadence.minOccurrences, cadence.months);
    const qualifying = matches
      .filter((match) => match.occurrences.length >= cadence.minOccurrences)
      .sort((a, b) => b.occurrences.length - a.occurrences.length ||
        a.totalDateDrift - b.totalDateDrift ||
        compareStableIds(a.occurrences[0]!.transaction.id, b.occurrences[0]!.transaction.id));
    const match = qualifying[0];
    if (!match) continue;
    const candidate = makeCandidate(series, categoryCode, match);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}
