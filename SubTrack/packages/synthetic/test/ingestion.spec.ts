import { describe, it, expect, beforeEach } from 'vitest';
import { SyntheticBankProvider, PERSONA_SOLBERG, PERSONA_LINDQVIST, ALL_PERSONAS } from '../src/index.js';
import {
  normalizeTransaction,
  deduplicateRecords,
  InMemoryIngestionStore,
  IngestionWorker,
  type IngestionRecord,
} from '@subtrack/domain/ingestion';

const FROM = new Date('2025-01-01');
const UNTIL = new Date('2025-12-31');

// ── normalizeTransaction ──────────────────────────────────────────────────────

describe('normalizeTransaction', () => {
  it('sets dedupKey as accountId:externalId', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const userId = PERSONA_SOLBERG.id;
    const [account] = await provider.getAccounts(userId);
    const [tx] = await provider.getTransactions(account!.id, FROM, UNTIL);
    const record = normalizeTransaction(tx!);
    expect(record.dedupKey).toBe(`${tx!.accountId}:${tx!.externalId}`);
  });

  it('preserves all transaction fields', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const userId = PERSONA_SOLBERG.id;
    const [account] = await provider.getAccounts(userId);
    const [tx] = await provider.getTransactions(account!.id, FROM, UNTIL);
    const record = normalizeTransaction(tx!);
    expect(record.accountId).toBe(tx!.accountId);
    expect(record.externalId).toBe(tx!.externalId);
    expect(record.date).toEqual(tx!.date);
    expect(record.description).toBe(tx!.description);
    expect(record.amountMinor).toBe(tx!.amountMinor);
    expect(record.currency).toBe(tx!.currency);
    expect(record.direction).toBe(tx!.direction);
    expect(record.pending).toBe(tx!.pending);
  });

  it('rawPayload is valid JSON containing the original fields', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const userId = PERSONA_SOLBERG.id;
    const [account] = await provider.getAccounts(userId);
    const [tx] = await provider.getTransactions(account!.id, FROM, UNTIL);
    const record = normalizeTransaction(tx!);
    const payload = JSON.parse(record.rawPayload) as Record<string, unknown>;
    expect(payload['externalId']).toBe(tx!.externalId);
    expect(payload['accountId']).toBe(tx!.accountId);
    expect(payload['amountMinor']).toBe(tx!.amountMinor);
  });

  it('date in rawPayload is an ISO string', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const userId = PERSONA_SOLBERG.id;
    const [account] = await provider.getAccounts(userId);
    const [tx] = await provider.getTransactions(account!.id, FROM, UNTIL);
    const record = normalizeTransaction(tx!);
    const payload = JSON.parse(record.rawPayload) as Record<string, unknown>;
    expect(typeof payload['date']).toBe('string');
    expect(new Date(payload['date'] as string).getTime()).toBe(tx!.date.getTime());
  });

  it('pending field is preserved', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const userId = PERSONA_SOLBERG.id;
    const [account] = await provider.getAccounts(userId);
    const txns = await provider.getTransactions(account!.id, FROM, UNTIL);
    const record = normalizeTransaction(txns[0]!);
    expect(record.pending).toBe(false);
  });
});

// ── deduplicateRecords ────────────────────────────────────────────────────────

describe('deduplicateRecords', () => {
  async function getRecords(userId: string, from: Date, until: Date): Promise<IngestionRecord[]> {
    const provider = new SyntheticBankProvider(ALL_PERSONAS);
    const [account] = await provider.getAccounts(userId);
    const txns = await provider.getTransactions(account!.id, from, until);
    return txns.map(normalizeTransaction);
  }

  it('all records are inserted on first sync (empty store)', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const result = deduplicateRecords(new Map(), records);
    expect(result.inserted.length).toBe(records.length);
    expect(result.updated.length).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  it('re-syncing identical records marks all as unchanged', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const existing = new Map(records.map((r) => [r.dedupKey, r]));
    const result = deduplicateRecords(existing, records);
    expect(result.inserted.length).toBe(0);
    expect(result.updated.length).toBe(0);
    expect(result.unchanged).toBe(records.length);
  });

  it('pending→settled change triggers update', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const original = records[0]!;
    const pending: IngestionRecord = { ...original, pending: true };
    const existing = new Map([[pending.dedupKey, pending]]);
    const result = deduplicateRecords(existing, [original]);
    expect(result.updated.length).toBe(1);
    expect(result.updated[0]!.pending).toBe(false);
  });

  it('amount correction triggers update', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const original = records[0]!;
    const modified: IngestionRecord = { ...original, amountMinor: original.amountMinor - 1 };
    const existing = new Map([[modified.dedupKey, modified]]);
    const result = deduplicateRecords(existing, [original]);
    expect(result.updated.length).toBe(1);
  });

  it('description change triggers update', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const original = records[0]!;
    const modified: IngestionRecord = { ...original, description: 'OLD DESC' };
    const existing = new Map([[modified.dedupKey, modified]]);
    const result = deduplicateRecords(existing, [original]);
    expect(result.updated.length).toBe(1);
  });

  it('accountId in result matches the incoming batch', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const result = deduplicateRecords(new Map(), records);
    expect(result.accountId).toBe(records[0]!.accountId);
  });

  it('inserted + updated + unchanged total equals incoming length', async () => {
    const records = await getRecords(PERSONA_SOLBERG.id, FROM, UNTIL);
    const half = records.slice(0, Math.floor(records.length / 2));
    const existing = new Map(half.map((r) => [r.dedupKey, r]));
    const result = deduplicateRecords(existing, records);
    const total = result.inserted.length + result.updated.length + result.unchanged;
    expect(total).toBe(records.length);
  });
});

// ── InMemoryIngestionStore ────────────────────────────────────────────────────

describe('InMemoryIngestionStore', () => {
  it('starts empty — getRecords returns empty Map', async () => {
    const store = new InMemoryIngestionStore();
    const records = await store.getRecords('acct-1');
    expect(records.size).toBe(0);
  });

  it('upsertRecords stores records by dedupKey', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const [account] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(account!.id, FROM, UNTIL);
    const records = txns.map(normalizeTransaction);
    const store = new InMemoryIngestionStore();
    await store.upsertRecords(records);
    const stored = await store.getRecords(account!.id);
    expect(stored.size).toBe(records.length);
  });

  it('upsert overwrites existing record with same dedupKey', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG]);
    const [account] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(account!.id, FROM, UNTIL);
    const original = normalizeTransaction(txns[0]!);
    const store = new InMemoryIngestionStore();
    await store.upsertRecords([original]);
    const updated = { ...original, description: 'UPDATED' };
    await store.upsertRecords([updated]);
    const stored = await store.getRecords(account!.id);
    expect(stored.get(original.dedupKey)!.description).toBe('UPDATED');
  });

  it('records for different accounts are stored separately', async () => {
    const provider = new SyntheticBankProvider([PERSONA_SOLBERG, PERSONA_LINDQVIST]);
    const [acctA] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const [acctB] = await provider.getAccounts(PERSONA_LINDQVIST.id);
    const txnsA = await provider.getTransactions(acctA!.id, FROM, UNTIL);
    const txnsB = await provider.getTransactions(acctB!.id, FROM, UNTIL);
    const store = new InMemoryIngestionStore();
    await store.upsertRecords(txnsA.map(normalizeTransaction));
    await store.upsertRecords(txnsB.map(normalizeTransaction));
    const storedA = await store.getRecords(acctA!.id);
    const storedB = await store.getRecords(acctB!.id);
    expect(storedA.size).toBe(txnsA.length);
    expect(storedB.size).toBe(txnsB.length);
  });
});

// ── IngestionWorker ───────────────────────────────────────────────────────────

describe('IngestionWorker', () => {
  let provider: SyntheticBankProvider;
  let store: InMemoryIngestionStore;
  let worker: IngestionWorker;

  beforeEach(() => {
    provider = new SyntheticBankProvider(ALL_PERSONAS);
    store = new InMemoryIngestionStore();
    worker = new IngestionWorker(provider, store);
  });

  it('syncUser inserts all transactions on first run', async () => {
    const results = await worker.syncUser(PERSONA_SOLBERG.id, { from: FROM, until: UNTIL });
    expect(results.length).toBeGreaterThan(0);
    const total = results.reduce((acc, r) => acc + r.inserted.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('syncUser on second run marks all as unchanged', async () => {
    await worker.syncUser(PERSONA_SOLBERG.id, { from: FROM, until: UNTIL });
    const results2 = await worker.syncUser(PERSONA_SOLBERG.id, { from: FROM, until: UNTIL });
    const inserted = results2.reduce((acc, r) => acc + r.inserted.length, 0);
    const updated = results2.reduce((acc, r) => acc + r.updated.length, 0);
    expect(inserted).toBe(0);
    expect(updated).toBe(0);
  });

  it('syncUser returns a result per account', async () => {
    const accounts = await provider.getAccounts(PERSONA_SOLBERG.id);
    const results = await worker.syncUser(PERSONA_SOLBERG.id, { from: FROM, until: UNTIL });
    expect(results.length).toBe(accounts.length);
  });

  it('syncAccount inserts transactions for a specific account', async () => {
    const [account] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const result = await worker.syncAccount(account!, { from: FROM, until: UNTIL });
    expect(result.accountId).toBe(account!.id);
    expect(result.inserted.length).toBeGreaterThan(0);
  });

  it('store has records after syncUser', async () => {
    const [account] = await provider.getAccounts(PERSONA_SOLBERG.id);
    await worker.syncUser(PERSONA_SOLBERG.id, { from: FROM, until: UNTIL });
    const records = await store.getRecords(account!.id);
    expect(records.size).toBeGreaterThan(0);
  });

  it('pending record is updated to settled on re-sync', async () => {
    const [account] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(account!.id, FROM, UNTIL);
    const pendingRecord = { ...normalizeTransaction(txns[0]!), pending: true };
    await store.upsertRecords([pendingRecord]);
    await worker.syncAccount(account!, { from: FROM, until: UNTIL });
    const stored = await store.getRecords(account!.id);
    const settled = stored.get(pendingRecord.dedupKey);
    expect(settled?.pending).toBe(false);
  });

  it('syncUser with unknown userId returns empty array', async () => {
    const results = await worker.syncUser('unknown-user-id', { from: FROM, until: UNTIL });
    expect(results).toEqual([]);
  });

  it('syncUser for all personas produces insertions', async () => {
    for (const persona of ALL_PERSONAS) {
      const results = await worker.syncUser(persona.id, { from: FROM, until: UNTIL });
      const total = results.reduce((acc, r) => acc + r.inserted.length, 0);
      expect(total).toBeGreaterThan(0);
    }
  });
});
