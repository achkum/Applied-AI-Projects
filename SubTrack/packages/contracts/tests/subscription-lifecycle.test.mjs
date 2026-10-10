import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedUrl = new URL('../generated/zod.gen.ts', import.meta.url).href;
const generatedSdkUrl = new URL('../generated/sdk.gen.ts', import.meta.url).href;
const generatedTypesUrl = new URL('../generated/types.gen.ts', import.meta.url).href;

test('generated lifecycle client and strict schemas enforce the bounded wire contract', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    const z = await import(${JSON.stringify(generatedUrl)});
    const id = 'd9428888-122b-4f8c-9e33-71a48c10d25a';
    const keys = (schema) => Object.keys(schema.shape).sort();
    assert.deepEqual(keys(z.zPatchSubscriptionLifecycleBody), ['status']);
    assert.deepEqual(keys(z.zPatchSubscriptionLifecyclePath), ['id']);
    assert.deepEqual(keys(z.zPatchSubscriptionLifecycleResponse), ['id', 'status']);
    const targets = ['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'];
    for (const status of targets) {
      assert.deepEqual(z.zPatchSubscriptionLifecycleBody.parse({ status }), { status });
      assert.deepEqual(z.zPatchSubscriptionLifecycleResponse.parse({ id, status }), { id, status });
    }
    for (const status of ['DETECTED', 'TRIAL', 'REJECTED', 'UNKNOWN', null, 1])
      assert.equal(z.zPatchSubscriptionLifecycleBody.safeParse({ status }).success, false);
    for (const body of [{}, [], null, { status: 'ACTIVE', name: 'Edit' },
      { status: 'PAUSED', action: 'pause' }, { status: 'PAUSED', ownerId: id },
      { status: 'PAUSED', alwaysPrivate: false }, { status: 'PAUSED', catalogPlanId: id },
      { status: 'PAUSED', category: 'VIDEO_STREAMING' },
      { status: 'PAUSED', cadence: 'MONTHLY' }, { status: 'PAUSED', scope: 'household' },
      { status: 'PAUSED', price: 1 }, { status: 'PAUSED', date: '2026-10-10' }])
      assert.equal(z.zPatchSubscriptionLifecycleBody.safeParse(body).success, false);
    assert.equal(z.zPatchSubscriptionLifecyclePath.safeParse({ id }).success, true);
    for (const path of [{ id: 'bad' }, {}])
      assert.equal(z.zPatchSubscriptionLifecyclePath.safeParse(path).success, false);
    for (const response of [{ id, status: 'DETECTED' }, { id, status: 'ACTIVE', ownerId: id },
      { id, status: 'ACTIVE', expectedAmountMinor: '100' }, { status: 'ACTIVE' }])
      assert.equal(z.zPatchSubscriptionLifecycleResponse.safeParse(response).success, false);
    assert.deepEqual(keys(z.zSubscriptionLifecycleError), ['code', 'status', 'title', 'type']);
    for (const [status, code] of [[400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
      [401, 'AUTHENTICATION_REQUIRED'], [404, 'SUBSCRIPTION_NOT_FOUND'],
      [409, 'LIFECYCLE_CONFLICT'], [500, 'INTERNAL_ERROR']])
      assert.equal(z.zSubscriptionLifecycleError.safeParse({ type: 'about:blank',
        title: 'Problem', status, code }).success, true);
    assert.equal(z.zSubscriptionLifecycleError.safeParse({ type: 'about:blank',
      title: 'Problem', status: 404, code: 'SUBSCRIPTION_NOT_FOUND', ownerId: id }).success, false);
    const sdk = readFileSync(new URL(${JSON.stringify(generatedSdkUrl)}), 'utf8');
    assert.match(sdk, /export const patchSubscriptionLifecycle/);
    assert.match(sdk, /url: '\\/v1\\/subscriptions\\/\\{id\\}'/);
    const types = readFileSync(new URL(${JSON.stringify(generatedTypesUrl)}), 'utf8');
    assert.match(types, /export type PatchSubscriptionLifecycleData/);
  `;
  const result = spawnSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
