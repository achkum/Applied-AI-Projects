import type { IngestionRecord, SyncResult } from './types.js';

export function deduplicateRecords(
  existing: Map<string, IngestionRecord>,
  incoming: IngestionRecord[],
): SyncResult {
  const inserted: IngestionRecord[] = [];
  const updated: IngestionRecord[] = [];
  let unchanged = 0;

  for (const record of incoming) {
    const prior = existing.get(record.dedupKey);
    if (prior === undefined) {
      inserted.push(record);
    } else if (hasChanged(prior, record)) {
      updated.push(record);
    } else {
      unchanged++;
    }
  }

  return {
    accountId: incoming[0]?.accountId ?? '',
    inserted,
    updated,
    unchanged,
  };
}

function hasChanged(prior: IngestionRecord, next: IngestionRecord): boolean {
  return (
    prior.pending !== next.pending ||
    prior.amountMinor !== next.amountMinor ||
    prior.description !== next.description ||
    prior.valueDate?.getTime() !== next.valueDate?.getTime() ||
    prior.referenceText !== next.referenceText
  );
}
