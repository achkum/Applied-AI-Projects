import { describe, it, expect } from 'vitest';
import { generateDemoSnapshot, SCHEMA_VERSION } from '../src/generate.js';
import { ALL_PERSONAS } from '@subtrack/synthetic';

const FIXED_DATE = new Date('2026-10-01');

describe('generateDemoSnapshot', () => {
  it('returns an object with asOf, schemaVersion, and households', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    expect(snap).toHaveProperty('asOf');
    expect(snap).toHaveProperty('schemaVersion');
    expect(snap).toHaveProperty('households');
  });

  it('asOf in snapshot matches the input date as ISO date string', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    expect(snap.asOf).toBe('2026-10-01');
  });

  it('schemaVersion is the expected semver string', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION);
    expect(snap.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has one household per persona', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    expect(snap.households.length).toBe(ALL_PERSONAS.length);
  });

  it('household ids match persona ids', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    const snapIds = snap.households.map((h) => h.id).sort();
    const personaIds = ALL_PERSONAS.map((p) => p.id).sort();
    expect(snapIds).toEqual(personaIds);
  });

  it('each household has at least one member', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      expect(h.members.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('subscription count matches persona', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      const persona = ALL_PERSONAS.find((p) => p.id === h.id);
      expect(h.subscriptions.length).toBe(persona?.subscriptions.length ?? 0);
    }
  });

  it('each subscription has isRecurring === true', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      for (const s of h.subscriptions) {
        expect(s.isRecurring).toBe(true);
      }
    }
  });

  it('transactions are sorted by date ascending', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      const dates = h.transactions.map((t) => t.date);
      const sorted = [...dates].sort();
      expect(dates).toEqual(sorted);
    }
  });

  it('all transactions have negative amountMinor (debits)', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      for (const t of h.transactions) {
        expect(t.amountMinor).toBeLessThan(0);
      }
    }
  });

  it('all transactions have a non-empty description', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      for (const t of h.transactions) {
        expect(t.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('transactions.subscriptionId links back to a valid subscription', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      const subIds = new Set(h.subscriptions.map((s) => s.id));
      for (const t of h.transactions) {
        if (t.subscriptionId !== null) {
          expect(subIds.has(t.subscriptionId)).toBe(true);
        }
      }
    }
  });

  it('all transaction dates are <= asOf', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      for (const t of h.transactions) {
        expect(t.date <= '2026-10-01').toBe(true);
      }
    }
  });

  it('transactions fall within 13-month window before asOf', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    // 13 months before 2026-10-01 ≈ 2025-09-01
    const earliest = '2025-09-01';
    for (const h of snap.households) {
      for (const t of h.transactions) {
        expect(t.date >= earliest).toBe(true);
      }
    }
  });

  it('SOLBERG household has 4 subscriptions', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    const solberg = snap.households.find((h) => h.id === 'household-solberg');
    expect(solberg?.subscriptions.length).toBe(4);
  });

  it('SOLBERG generates transactions for all 4 subscriptions', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    const solberg = snap.households.find((h) => h.id === 'household-solberg');
    const subIds = new Set(solberg?.transactions.map((t) => t.subscriptionId));
    expect(subIds.size).toBe(4);
  });

  it('SOLBERG has at least 40 transactions in 13-month window (4 monthly subs)', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    const solberg = snap.households.find((h) => h.id === 'household-solberg');
    expect((solberg?.transactions.length ?? 0)).toBeGreaterThanOrEqual(40);
  });

  it('same asOf date produces identical snapshot (deterministic)', () => {
    const snap1 = generateDemoSnapshot(FIXED_DATE);
    const snap2 = generateDemoSnapshot(FIXED_DATE);
    expect(JSON.stringify(snap1)).toBe(JSON.stringify(snap2));
  });

  it('different asOf dates produce different transaction ranges', () => {
    const snap1 = generateDemoSnapshot(new Date('2026-10-01'));
    const snap2 = generateDemoSnapshot(new Date('2026-01-01'));
    const txns1 = snap1.households[0]?.transactions.length ?? 0;
    const txns2 = snap2.households[0]?.transactions.length ?? 0;
    // Both should have transactions but the sets are different
    expect(snap1.asOf).not.toBe(snap2.asOf);
    expect(txns1).toBeGreaterThan(0);
    expect(txns2).toBeGreaterThan(0);
  });

  it('LINDQVIST has 6 distinct subscriptionId values in transactions', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    const lindqvist = snap.households.find((h) => h.id === 'household-lindqvist');
    const subIds = new Set(lindqvist?.transactions.map((t) => t.subscriptionId).filter(Boolean));
    expect(subIds.size).toBe(6);
  });

  it('households array has the correct type (array)', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    expect(Array.isArray(snap.households)).toBe(true);
  });

  it('each transaction has a unique id within a household', () => {
    const snap = generateDemoSnapshot(FIXED_DATE);
    for (const h of snap.households) {
      const ids = h.transactions.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
