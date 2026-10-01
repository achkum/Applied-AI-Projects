/** Normalized, de-duplicated transaction ready for persistent storage. */
export interface IngestionRecord {
  /** Stable dedup key: `${accountId}:${externalId}`. */
  dedupKey: string;
  accountId: string;
  externalId: string;
  date: Date;
  valueDate?: Date;
  description: string;
  /** Signed amount in minor units (negative = debit). */
  amountMinor: number;
  currency: string;
  /** CREDIT | DEBIT */
  direction: string;
  /** True while transaction has not yet settled. */
  pending: boolean;
  referenceText?: string;
  /** The raw BankTransaction as received from the provider, JSON-serialised. */
  rawPayload: string;
}

export interface SyncResult {
  accountId: string;
  inserted: IngestionRecord[];
  updated: IngestionRecord[];
  unchanged: number;
}
