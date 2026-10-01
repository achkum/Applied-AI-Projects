import { describe, it, expect } from 'vitest';
import {
  PERSONA_SOLBERG,
  PERSONA_LINDQVIST,
  PERSONA_AHMADI,
  SyntheticBankProvider,
  type PersonaHousehold,
  type PersonaSubscription,
} from '../src/index.js';

const provider = new SyntheticBankProvider();

const FROM_12M = new Date(2025, 0, 1);  // 2025-01-01
const TO_12M   = new Date(2025, 11, 31); // 2025-12-31
const FROM_24M = new Date(2024, 0, 1);
const TO_24M   = new Date(2025, 11, 31);

// ─── getAccounts ───────────────────────────────────────────────────────────────

describe('getAccounts', () => {
  it('returns empty array for unknown userId', async () => {
    expect(await provider.getAccounts('unknown-user-xyz')).toEqual([]);
  });

  it('returns exactly 1 account for PERSONA_SOLBERG household id', async () => {
    const accounts = await provider.getAccounts(PERSONA_SOLBERG.id);
    expect(accounts).toHaveLength(1);
  });

  it('returns 1 account for a member id ("emma" in Solberg)', async () => {
    const accounts = await provider.getAccounts('emma');
    expect(accounts).toHaveLength(1);
  });

  it('returns 1 account for PERSONA_LINDQVIST household id', async () => {
    const accounts = await provider.getAccounts(PERSONA_LINDQVIST.id);
    expect(accounts).toHaveLength(1);
  });

  it('account has currency SEK', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    expect(acct?.currency).toBe('SEK');
  });

  it('account has accountType CHECKING', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    expect(acct?.accountType).toBe('CHECKING');
  });

  it('account id matches pattern synth-acct-{userId}', async () => {
    const userId = PERSONA_SOLBERG.id;
    const [acct] = await provider.getAccounts(userId);
    expect(acct?.id).toBe(`synth-acct-${userId}`);
  });

  it('account ownerUserId matches the queried userId', async () => {
    const userId = PERSONA_SOLBERG.id;
    const [acct] = await provider.getAccounts(userId);
    expect(acct?.ownerUserId).toBe(userId);
  });

  it('account IBAN starts with SE', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    expect(acct?.iban?.startsWith('SE')).toBe(true);
  });

  it('bankName is Synth Bank AB', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    expect(acct?.bankName).toBe('Synth Bank AB');
  });
});

// ─── getTransactions ───────────────────────────────────────────────────────────

describe('getTransactions', () => {
  it('returns empty array for unknown accountId', async () => {
    const txns = await provider.getTransactions('synth-acct-unknown-xyz', FROM_12M, TO_12M);
    expect(txns).toEqual([]);
  });

  it('returns non-empty transactions over 12 months for Solberg', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    expect(txns.length).toBeGreaterThan(0);
  });

  it('SOLBERG monthly subs produce ≥33 transactions over 12 months (3 monthly × ~12 months)', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    // 3 MONTHLY subs × ~12 months = ~36, plus 1 ANNUAL may or may not fire
    expect(txns.length).toBeGreaterThanOrEqual(33);
  });

  it('all transactions have negative amountMinor', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (const t of txns) {
      expect(t.amountMinor).toBeLessThan(0);
    }
  });

  it('all transactions have direction DEBIT', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (const t of txns) {
      expect(t.direction).toBe('DEBIT');
    }
  });

  it('all transactions have pending = false', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (const t of txns) {
      expect(t.pending).toBe(false);
    }
  });

  it('all transaction dates fall within [from, to]', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (const t of txns) {
      expect(t.date.getTime()).toBeGreaterThanOrEqual(FROM_12M.getTime());
      expect(t.date.getTime()).toBeLessThanOrEqual(TO_12M.getTime());
    }
  });

  it('transactions are sorted chronologically', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (let i = 1; i < txns.length; i++) {
      expect(txns[i]!.date.getTime()).toBeGreaterThanOrEqual(txns[i - 1]!.date.getTime());
    }
  });

  it('transaction ids are unique within a result set', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    const ids = txns.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('descriptor matches one of the subscription descriptorVariants', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    const allVariants = new Set(
      PERSONA_SOLBERG.subscriptions.flatMap(s => s.descriptorVariants),
    );
    for (const t of txns) {
      expect(allVariants.has(t.description)).toBe(true);
    }
  });

  it('calling twice with same params returns identical results (deterministic)', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns1 = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    const txns2 = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    expect(txns1).toEqual(txns2);
  });

  it('PERSONA_LINDQVIST generates transactions for 6 subscription streams (≥55 over 12 months)', async () => {
    const [acct] = await provider.getAccounts(PERSONA_LINDQVIST.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    // 5 MONTHLY × ~12 + 1 ANNUAL × ~1 = ~61 — allow for business-day adjustments
    expect(txns.length).toBeGreaterThanOrEqual(55);
  });

  it('ANNUAL subscriptions generate at most 1 transaction per year in a 12-month window', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    // Solberg has 1 ANNUAL sub (linkedin). Over 12 months, should fire exactly once.
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    const linkedinVariants = new Set(
      PERSONA_SOLBERG.subscriptions
        .filter(s => s.billingCadence === 'ANNUAL')
        .flatMap(s => s.descriptorVariants),
    );
    const annualTxns = txns.filter(t => linkedinVariants.has(t.description));
    expect(annualTxns.length).toBeGreaterThanOrEqual(0);
    expect(annualTxns.length).toBeLessThanOrEqual(1);
  });

  it('ANNUAL subscription fires ≥1 time in a 24-month window for Solberg', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_24M, TO_24M);
    const linkedinVariants = new Set(
      PERSONA_SOLBERG.subscriptions
        .filter(s => s.billingCadence === 'ANNUAL')
        .flatMap(s => s.descriptorVariants),
    );
    const annualTxns = txns.filter(t => linkedinVariants.has(t.description));
    // Should fire at least once across 2 calendar years
    expect(annualTxns.length).toBeGreaterThanOrEqual(1);
  });

  it('each transaction has a non-empty accountId matching the queried accountId', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (const t of txns) {
      expect(t.accountId).toBe(acct!.id);
    }
  });

  it('each transaction has currency SEK', async () => {
    const [acct] = await provider.getAccounts(PERSONA_SOLBERG.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    for (const t of txns) {
      expect(t.currency).toBe('SEK');
    }
  });
});

// ─── custom personas ───────────────────────────────────────────────────────────

describe('custom persona instantiation', () => {
  it('can be instantiated with a custom personas array', async () => {
    const custom: PersonaHousehold = {
      id: 'household-test',
      displayName: 'Test',
      seed: 'test:seed',
      members: [{ id: 'user-test', name: 'Test User' }],
      subscriptions: [
        {
          id: 'sub-test',
          merchantId: 'testmerchant',
          merchantName: 'TestMerchant',
          category: 'software-productivity',
          amountMinor: 9900,
          currency: 'SEK',
          billingCadence: 'MONTHLY',
          ownerType: 'ME',
          descriptorVariants: ['TESTMERCHANT', 'TEST MERCH', 'TESTMERCH.COM'],
          groundTruth: { isRecurring: true, normalizedAmountMinor: 9900 },
        } satisfies PersonaSubscription,
      ],
    };
    const customProvider = new SyntheticBankProvider([custom]);
    const accounts = await customProvider.getAccounts('household-test');
    expect(accounts).toHaveLength(1);
    const [acct] = accounts;
    const txns = await customProvider.getTransactions(acct!.id, FROM_12M, TO_12M);
    expect(txns.length).toBeGreaterThanOrEqual(10);
    for (const t of txns) {
      expect(['TESTMERCHANT', 'TEST MERCH', 'TESTMERCH.COM']).toContain(t.description);
    }
  });

  it('returns empty for userId not in custom personas', async () => {
    const customProvider = new SyntheticBankProvider([]);
    expect(await customProvider.getAccounts('anyone')).toEqual([]);
  });

  it('getAccounts on member id also works (member → household mapping)', async () => {
    const accounts = await provider.getAccounts('lars');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.currency).toBe('SEK');
  });

  it('PERSONA_AHMADI member-owned subscriptions appear in household transactions', async () => {
    const [acct] = await provider.getAccounts(PERSONA_AHMADI.id);
    const txns = await provider.getTransactions(acct!.id, FROM_12M, TO_12M);
    const adobeVariants = new Set(
      PERSONA_AHMADI.subscriptions
        .filter(s => s.merchantId === 'adobe-creative-cloud')
        .flatMap(s => s.descriptorVariants),
    );
    const adobeTxns = txns.filter(t => adobeVariants.has(t.description));
    expect(adobeTxns.length).toBeGreaterThanOrEqual(10);
  });
});
