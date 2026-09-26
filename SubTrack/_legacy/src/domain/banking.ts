export type Currency = "SEK" | "EUR" | "USD" | "GBP";

export interface Money { minorUnits: number; currency: Currency }
export interface BankAccount {
  id: string;
  providerAccountId: string;
  displayName: string;
  type: "checking" | "savings" | "credit";
  balance: Money;
}
export interface BankTransaction {
  id: string;
  providerTransactionId: string;
  accountId: string;
  bookedAt: string;
  amount: Money;
  description: string;
  merchantName?: string;
  status: "booked" | "pending";
}
export interface ProviderConnection {
  id: string;
  provider: string;
  externalUserId: string;
  status: "active" | "disconnected";
}
export interface ConnectRequest { userId: string; authorizationCode: string }
export interface TransactionQuery { accountId: string; from: string; to: string }

export interface BankDataProvider {
  readonly name: string;
  connect(request: ConnectRequest): Promise<ProviderConnection>;
  disconnect(connectionId: string): Promise<void>;
  listAccounts(connectionId: string): Promise<readonly BankAccount[]>;
  listTransactions(connectionId: string, query: TransactionQuery): Promise<readonly BankTransaction[]>;
}
