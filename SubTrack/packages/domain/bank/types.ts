export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'UNKNOWN';
export type TransactionDirection = 'CREDIT' | 'DEBIT';

export interface BankAccount {
  id: string;
  externalId: string;
  iban?: string;
  bankName: string;
  accountType: AccountType;
  currency: string;
  ownerUserId: string;
}

export interface BankTransaction {
  id: string;
  externalId: string;
  accountId: string;
  date: Date;
  valueDate?: Date;
  description: string;
  amountMinor: number;
  currency: string;
  direction: TransactionDirection;
  pending: boolean;
  referenceText?: string;
}
