import type { BankAccount, BankDataProvider, BankTransaction, ConnectRequest, ProviderConnection, TransactionQuery } from "../domain/banking.js";

const ACCOUNTS: readonly BankAccount[] = Object.freeze([
  { id: "acct-main", providerAccountId: "mock-account-001", displayName: "Everyday account", type: "checking", balance: { minorUnits: 284_350, currency: "SEK" } }
]);
const TRANSACTIONS: readonly BankTransaction[] = Object.freeze([
  { id: "txn-netflix-jan", providerTransactionId: "mock-txn-001", accountId: "acct-main", bookedAt: "2025-01-05T10:00:00.000Z", amount: { minorUnits: -1_490, currency: "SEK" }, description: "NETFLIX.COM", merchantName: "Netflix", status: "booked" },
  { id: "txn-netflix-feb", providerTransactionId: "mock-txn-002", accountId: "acct-main", bookedAt: "2025-02-05T10:00:00.000Z", amount: { minorUnits: -1_490, currency: "SEK" }, description: "NETFLIX.COM", merchantName: "Netflix", status: "booked" },
  { id: "txn-spotify-feb", providerTransactionId: "mock-txn-003", accountId: "acct-main", bookedAt: "2025-02-12T08:30:00.000Z", amount: { minorUnits: -1_190, currency: "SEK" }, description: "SPOTIFY", merchantName: "Spotify", status: "booked" }
]);

export class MockBankProvider implements BankDataProvider {
  readonly name = "mock";
  #active = new Set<string>();
  async connect(request: ConnectRequest): Promise<ProviderConnection> {
    if (!request.authorizationCode) throw new Error("authorizationCode is required");
    const id = `mock:${request.userId}`;
    this.#active.add(id);
    return { id, provider: this.name, externalUserId: `fixture:${request.userId}`, status: "active" };
  }
  async disconnect(connectionId: string): Promise<void> { this.#active.delete(connectionId); }
  async listAccounts(connectionId: string): Promise<readonly BankAccount[]> {
    this.#assertActive(connectionId); return structuredClone(ACCOUNTS);
  }
  async listTransactions(connectionId: string, query: TransactionQuery): Promise<readonly BankTransaction[]> {
    this.#assertActive(connectionId);
    const from = Date.parse(query.from), to = Date.parse(query.to);
    return structuredClone(TRANSACTIONS.filter(t => t.accountId === query.accountId && Date.parse(t.bookedAt) >= from && Date.parse(t.bookedAt) <= to));
  }
  #assertActive(id: string): void { if (!this.#active.has(id)) throw new Error("bank connection is not active"); }
}
