export interface DemoMember {
  id: string;
  name: string;
}

export interface DemoSubscription {
  id: string;
  merchantId: string;
  merchantName: string;
  category: string;
  amountMinor: number;
  currency: 'SEK';
  billingCadence: 'MONTHLY' | 'ANNUAL';
  ownerType: 'ME' | 'HOUSEHOLD' | 'MEMBER';
  memberId?: string;
  isRecurring: true;
  normalizedAmountMinor: number;
}

export interface DemoTransaction {
  id: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: string;
  description: string;
  /** Negative = debit. */
  amountMinor: number;
  currency: 'SEK';
  /** Ground-truth subscription link; null only for non-subscription transactions. */
  subscriptionId: string | null;
}

export interface DemoHousehold {
  id: string;
  displayName: string;
  members: DemoMember[];
  subscriptions: DemoSubscription[];
  /** Transactions within the 13-month window ending at the snapshot asOf date. */
  transactions: DemoTransaction[];
}

export interface DemoSnapshot {
  /** ISO 8601 date — data is generated as if today is this date. */
  asOf: string;
  /** Semver for schema evolution. */
  schemaVersion: string;
  households: DemoHousehold[];
}
