export class MockBankProvider {
  async connect() { return { connectionId: 'sandbox-se-001', institution: 'Nordic Sandbox Bank' }; }
  async getTransactions() { return structuredClone(FIXTURES); }
}

export const FIXTURES = [
  ['t1', '2026-09-02', -129, 'SPOTIFY AB STOCKHOLM', 'SEK'],
  ['t2', '2026-08-02', -129, 'Spotify P1234', 'SEK'],
  ['t3', '2026-07-02', -119, 'SPOTIFY*PREMIUM', 'SEK'],
  ['t4', '2026-09-14', -109, 'NETFLIX.COM 800', 'SEK'],
  ['t5', '2026-08-14', -109, 'Netflix Intl', 'SEK'],
  ['t6', '2026-07-14', -109, 'NETFLIX.COM', 'SEK'],
  ['t7', '2026-09-20', -349, 'SATSAUTOGIRO', 'SEK'],
  ['t8', '2026-08-20', -349, 'SATS SWEDEN', 'SEK'],
  ['t9', '2026-07-20', -349, 'SATS AUTOGIRO', 'SEK'],
  ['t10', '2026-09-21', -624.5, 'ICA MAXI SOLNA', 'SEK'],
  ['t11', '2026-09-19', -43, 'SL ACCESS', 'SEK']
].map(([id, date, amount, description, currency]) => ({ id, date, amount, description, currency }));

const merchants = [
  [/spotify/i, ['spotify', 'Spotify', 'Music']],
  [/netflix/i, ['netflix', 'Netflix', 'Streaming']],
  [/sats/i, ['sats', 'SATS', 'Fitness']],
  [/ica/i, ['ica', 'ICA Maxi', 'Groceries']],
  [/sl\s/i, ['sl', 'SL', 'Transport']]
];

export function normalizeTransaction(transaction) {
  const match = merchants.find(([pattern]) => pattern.test(transaction.description));
  const [merchantId, merchantName, category] = match?.[1] ?? ['unknown', transaction.description, 'Other'];
  return { ...transaction, merchantId, merchantName, category, amount: Math.abs(Number(transaction.amount)), direction: transaction.amount < 0 ? 'debit' : 'credit' };
}

export function detectRecurring(transactions) {
  const groups = Object.groupBy(transactions.map(normalizeTransaction).filter(t => t.direction === 'debit'), t => t.merchantId);
  return Object.entries(groups).flatMap(([merchantId, payments]) => {
    if (merchantId === 'unknown' || payments.length < 3) return [];
    const sorted = payments.toSorted((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((t, i) => (new Date(t.date) - new Date(sorted[i].date)) / 86400000);
    const regular = gaps.every(days => days >= 25 && days <= 35);
    if (!regular) return [];
    const amounts = sorted.map(t => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variation = Math.max(...amounts.map(v => Math.abs(v - avg) / avg));
    const last = sorted.at(-1);
    const next = new Date(`${last.date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length));
    return [{ id: merchantId, merchantId, name: last.merchantName, category: last.category, amount: last.amount, currency: last.currency, cadence: 'Monthly', nextDate: next.toISOString().slice(0,10), confidence: variation < .05 ? 'High' : 'Medium', paymentCount: payments.length, history: sorted }];
  });
}

export function monthlyTotal(subscriptions) { return subscriptions.filter(s => s.status !== 'dismissed').reduce((sum, s) => sum + s.amount, 0); }
