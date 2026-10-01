import type { BankTransaction } from '../bank/types.js';
import type { IngestionRecord } from './types.js';

export function normalizeTransaction(tx: BankTransaction): IngestionRecord {
  const raw: Record<string, unknown> = {
    id: tx.id,
    externalId: tx.externalId,
    accountId: tx.accountId,
    date: tx.date.toISOString(),
    description: tx.description,
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    direction: tx.direction,
    pending: tx.pending,
  };
  if (tx.valueDate !== undefined) raw['valueDate'] = tx.valueDate.toISOString();
  if (tx.referenceText !== undefined) raw['referenceText'] = tx.referenceText;

  return {
    dedupKey: `${tx.accountId}:${tx.externalId}`,
    accountId: tx.accountId,
    externalId: tx.externalId,
    date: tx.date,
    ...(tx.valueDate !== undefined ? { valueDate: tx.valueDate } : {}),
    description: tx.description,
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    direction: tx.direction,
    pending: tx.pending,
    ...(tx.referenceText !== undefined ? { referenceText: tx.referenceText } : {}),
    rawPayload: JSON.stringify(raw),
  };
}
