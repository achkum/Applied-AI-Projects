import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, detectRecurring, monthlyTotal, normalizeTransaction } from '../src/core.mjs';

test('normalizes merchant variants without changing source data', () => {
  const source = FIXTURES[0]; const normalized = normalizeTransaction(source);
  assert.equal(normalized.merchantName, 'Spotify'); assert.equal(normalized.amount, 129); assert.equal(source.amount, -129);
});

test('detects only recurring merchants and explains confidence', () => {
  const result = detectRecurring(FIXTURES);
  assert.deepEqual(result.map(x => x.name).sort(), ['Netflix', 'SATS', 'Spotify']);
  assert.equal(result.find(x => x.name === 'Spotify').confidence, 'Medium');
  assert.ok(result.every(x => x.paymentCount === 3));
});

test('monthly total excludes dismissed candidates', () => {
  assert.equal(monthlyTotal([{ amount: 100, status: 'confirmed' }, { amount: 50, status: 'dismissed' }]), 100);
});
