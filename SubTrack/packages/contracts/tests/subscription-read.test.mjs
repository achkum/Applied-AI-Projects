import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedUrl = new URL('../generated/zod.gen.ts', import.meta.url).href;

test('generated subscription read schemas preserve scoped wire projections and bounds', () => {
  const script = `
    import assert from 'node:assert/strict';
    const z = await import(${JSON.stringify(generatedUrl)});
    const id = 'd9428888-122b-4f8c-9e33-71a48c10d25a';
    const common = { id, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY',
      status: 'ACTIVE', expectedAmountMinor: '-9007199254740993', currency: 'SEK' };
    const owner = { visibility: 'owner', ...common, customName: null, merchantId: null,
      merchantName: 'Example', nextChargeDate: null, alwaysPrivate: true };
    const peer = { visibility: 'household', ...common };
    const inbox = { ...common, status: 'DETECTED', customName: null, merchantId: null,
      merchantName: null, confidence: 0.75, reasonCodes: ['CADENCE_MATCHED'], catalogPlanId: null };
    const keys = (schema) => Object.keys(schema.shape).sort();
    assert.deepEqual(keys(z.zSubscriptionOwnerView),
      ['visibility', 'id', 'customName', 'merchantId', 'merchantName', 'categoryCode',
       'cadence', 'status', 'expectedAmountMinor', 'currency', 'nextChargeDate', 'alwaysPrivate'].sort());
    assert.deepEqual(keys(z.zSubscriptionPeerView),
      ['visibility', 'id', 'categoryCode', 'cadence', 'status', 'expectedAmountMinor', 'currency'].sort());
    assert.deepEqual(keys(z.zReviewInboxItem),
      ['id', 'customName', 'merchantId', 'merchantName', 'categoryCode', 'cadence',
       'status', 'expectedAmountMinor', 'currency', 'confidence', 'reasonCodes', 'catalogPlanId'].sort());
    for (const item of [owner, peer]) {
      const parsed = z.zGetSubscriptionResponse.parse(item);
      assert.deepEqual(parsed, item);
      assert.equal(JSON.parse(JSON.stringify(parsed)).expectedAmountMinor, '-9007199254740993');
    }
    assert.deepEqual(z.zListSubscriptionsResponse.parse({ items: [owner, peer], nextCursor: null }).items,
      [owner, peer]);
    assert.deepEqual(z.zListReviewInboxResponse.parse({ items: [inbox], nextCursor: null }).items,
      [inbox]);
    for (const [schema, item] of [[z.zSubscriptionOwnerView, owner],
      [z.zSubscriptionPeerView, peer], [z.zReviewInboxItem, inbox]]) {
      for (const amount of [9007199254740993, 12.5, '1.5', '01', '-0', '+1', '1e3', ' 1'])
        assert.equal(schema.safeParse({ ...item, expectedAmountMinor: amount }).success, false,
          'minor units must be canonical decimal strings');
      assert.equal(schema.safeParse({ ...item, bankAccountId: id }).success, false);
      assert.equal(schema.safeParse({ ...item, detectionEvidence: {} }).success, false);
    }
    assert.equal(z.zSubscriptionPeerView.safeParse({ ...peer, status: 'DETECTED' }).success, false);
    assert.equal(z.zSubscriptionPeerView.safeParse({ ...peer, customName: 'Private' }).success, false);
    assert.equal(z.zReviewInboxItem.safeParse({ ...inbox, status: 'ACTIVE' }).success, false);
    assert.equal(z.zReviewInboxItem.safeParse({ ...inbox, reasonCodes: ['RAW_TRANSACTION'] }).success, false);
    assert.equal(z.zSubscriptionPage.safeParse({ items: Array(51).fill(peer), nextCursor: null }).success, false);
    assert.equal(z.zReviewInboxPage.safeParse({ items: Array(51).fill(inbox), nextCursor: null }).success, false);
    assert.deepEqual(keys(z.zListSubscriptionsQuery), ['scope', 'status', 'category', 'cursor', 'limit'].sort());
    assert.deepEqual(keys(z.zListReviewInboxQuery), ['cursor', 'limit']);
    assert.deepEqual(z.zListSubscriptionsQuery.parse({}), { scope: 'me', limit: 20 });
    assert.deepEqual(z.zListReviewInboxQuery.parse({}), { limit: 20 });
    for (const limit of [0, 51, 1.5, '20'])
      assert.equal(z.zSubscriptionLimit.safeParse(limit).success, false);
    for (const limit of [1, 50]) assert.equal(z.zSubscriptionLimit.safeParse(limit).success, true);
    for (const cursor of ['', 'a'.repeat(513), 'abc=', 'a/b'])
      assert.equal(z.zSubscriptionCursor.safeParse(cursor).success, false);
    assert.equal(z.zSubscriptionCursor.safeParse('Ab_09-').success, true);
    for (const query of [{ scope: 'member:' + id }, { status: 'UNKNOWN' },
      { category: 'UNKNOWN' }, { limit: 51 }, { cursor: 'abc=' }])
      assert.equal(z.zListSubscriptionsQuery.safeParse(query).success, false);
    assert.equal(z.zListSubscriptionsQuery.safeParse({ scope: 'household',
      status: 'DETECTED', category: 'VIDEO_STREAMING', limit: 50 }).success, true);
  `;
  const result = spawnSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
