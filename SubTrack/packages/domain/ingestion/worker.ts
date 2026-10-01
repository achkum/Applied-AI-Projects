import type { BankDataProvider } from '../bank/provider.js';
import type { BankAccount } from '../bank/types.js';
import type { IngestionRecord, SyncResult } from './types.js';
import { normalizeTransaction } from './normalize.js';
import { deduplicateRecords } from './dedup.js';

export interface IngestionStore {
  getRecords(accountId: string): Promise<Map<string, IngestionRecord>>;
  upsertRecords(records: IngestionRecord[]): Promise<void>;
}

export class InMemoryIngestionStore implements IngestionStore {
  private readonly store = new Map<string, Map<string, IngestionRecord>>();

  async getRecords(accountId: string): Promise<Map<string, IngestionRecord>> {
    return this.store.get(accountId) ?? new Map();
  }

  async upsertRecords(records: IngestionRecord[]): Promise<void> {
    for (const record of records) {
      let accountMap = this.store.get(record.accountId);
      if (accountMap === undefined) {
        accountMap = new Map();
        this.store.set(record.accountId, accountMap);
      }
      accountMap.set(record.dedupKey, record);
    }
  }
}

export interface IngestionOptions {
  from: Date;
  until: Date;
}

export class IngestionWorker {
  constructor(
    private readonly provider: BankDataProvider,
    private readonly store: IngestionStore,
  ) {}

  async syncAccount(account: BankAccount, opts: IngestionOptions): Promise<SyncResult> {
    const transactions = await this.provider.getTransactions(account.id, opts.from, opts.until);
    const incoming = transactions.map(normalizeTransaction);
    const existing = await this.store.getRecords(account.id);
    const result = deduplicateRecords(existing, incoming);

    const toUpsert = [...result.inserted, ...result.updated];
    if (toUpsert.length > 0) {
      await this.store.upsertRecords(toUpsert);
    }

    return { ...result, accountId: account.id };
  }

  async syncUser(userId: string, opts: IngestionOptions): Promise<SyncResult[]> {
    const accounts = await this.provider.getAccounts(userId);
    const results: SyncResult[] = [];
    for (const account of accounts) {
      const result = await this.syncAccount(account, opts);
      results.push(result);
    }
    return results;
  }
}
