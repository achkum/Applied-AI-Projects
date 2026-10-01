export type { IngestionRecord, SyncResult } from './types.js';
export { normalizeTransaction } from './normalize.js';
export { deduplicateRecords } from './dedup.js';
export type { IngestionStore, IngestionOptions } from './worker.js';
export { InMemoryIngestionStore, IngestionWorker } from './worker.js';
