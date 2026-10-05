import type { Money } from '@subtrack/money';

export type BillingCadence =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL';

export type DetectionDirection = 'CREDIT' | 'DEBIT';

export interface DetectionTransaction {
  id: string;
  accountId: string;
  date: Date;
  amountMinor: number;
  currency: string;
  direction: DetectionDirection;
  pending: boolean;
}

/** One owner/account/merchant/currency group supplied by the caller. */
export interface TransactionSeries {
  ownerId: string;
  accountId: string;
  merchantKey: string | null;
  currency: string;
  categoryCode?: string | null;
  transactions: readonly DetectionTransaction[];
}

export type DetectionReasonCode =
  | 'MERCHANT_RESOLVED'
  | 'CADENCE_MATCHED'
  | 'MIN_OCCURRENCES_MET'
  | 'DATE_PATTERN_STABLE'
  | 'AMOUNT_WITHIN_BAND'
  | 'SUBSCRIPTION_CATEGORY_PRIOR';

export interface DetectionReason {
  code: DetectionReasonCode;
  params?: Readonly<Record<string, string | number>>;
}

export interface AmountBand {
  minimum: Money;
  maximum: Money;
  representative: Money;
}

export interface RecurringCandidate {
  ownerId: string;
  accountId: string;
  merchantKey: string;
  currency: string;
  cadence: BillingCadence;
  amountBand: AmountBand;
  occurrenceCount: number;
  confidence: number;
  reasons: readonly DetectionReason[];
  transactionIds: readonly string[];
}
