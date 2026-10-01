import type { BankAccount, BankTransaction } from './types.js';

export interface BankDataProvider {
  getAccounts(userId: string): Promise<BankAccount[]>;
  getTransactions(accountId: string, from: Date, to: Date): Promise<BankTransaction[]>;
}
