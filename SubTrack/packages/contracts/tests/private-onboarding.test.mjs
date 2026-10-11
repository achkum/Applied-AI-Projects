import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const moduleUrl = new URL('../private-onboarding.ts', import.meta.url).href;
function run(code) {
  const source = `import assert from 'node:assert/strict'; import * as p from ${JSON.stringify(moduleUrl)}; ${code}`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const id = '123e4567-e89b-42d3-a456-426614174000';
const owner = { visibility: 'owner', id, customName: 'Example', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '999',
  currency: 'SEK', nextChargeDate: '2026-10-11', alwaysPrivate: false };

test('private HTTPS contract keeps default routes unavailable and freezes owner-only response matrix', () => {
  const root = resolve(new URL('..', import.meta.url).pathname.slice(1));
  const dir = mkdtempSync(join(tmpdir(), 'st238-contract-'));
  try {
    const output = join(dir, 'openapi.json');
    const bundled = spawnSync(process.execPath, [join(root, 'node_modules/@redocly/cli/bin/cli.js'),
      'bundle', join(root, 'openapi.yaml'), '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(bundled.status, 0, bundled.stderr || bundled.stdout);
    const doc = JSON.parse(readFileSync(output, 'utf8'));
    const paths = doc.paths;
    for (const path of ['/v2/me/mode', '/v2/me/mode/read', '/v2/subscriptions/owner/read'])
      assert.equal(paths[path].post['x-runtime-availability'], 'unavailable-default');
    const list = paths['/v2/subscriptions/owner/read'].post;
    assert.deepEqual(list.responses['200'], { $ref: '#/components/responses/PrivateOwnerPage' });
    assert.match(JSON.stringify(doc.components.schemas.PrivateOwnerPage), /SubscriptionOwnerView|"visibility"/);
    assert.equal(doc.components.schemas.PrivateOwnerPage.properties.items.maxItems, 50);
    for (const [path, verb, success] of [
      ['/v2/subscriptions/{id}/read', 'post', 'SubscriptionOwnerView'],
      ['/v2/subscriptions/{id}', 'patch', 'SubscriptionLifecycleResult']]) {
      const operation = paths[path][verb];
      assert.equal(operation['x-runtime-availability'], 'unavailable-default');
      const privateSuccess = operation['x-private-https-responses']['200'];
      assert.ok(privateSuccess.$ref === `#/components/schemas/${success}` ||
        (privateSuccess.additionalProperties === false && privateSuccess.properties?.id));
      for (const status of ['400', '401', '403', '404', '409', '500']) {
        const privateError = operation['x-private-https-responses'][status];
        assert.ok(privateError.$ref === '#/components/responses/PrivateSubscriptionProblem' ||
          privateError.content?.['application/problem+json']?.schema?.$ref === '#/components/schemas/PrivateSubscriptionError');
      }
      assert.equal(operation['x-private-https-problem-codes']['404'], 'SUBSCRIPTION_NOT_FOUND');
    }
    assert.equal(paths['/v2/subscriptions/{id}/read'].post['x-private-https-problem-codes']['409'], 'MODE_CONFLICT');
    assert.deepEqual(paths['/v2/subscriptions/{id}'].patch['x-private-https-problem-codes']['409'],
      ['MODE_CONFLICT', 'LIFECYCLE_CONFLICT']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mode and page requests are closed, with only nullable persisted mode and bounded cursor', () => run(`
  assert.deepEqual(p.parseModeView({mode:null}), {mode:null});
  assert.deepEqual(p.parseModeView({mode:'just-me'}), {mode:'just-me'});
  for (const value of [{}, {mode:'household'}, {mode:null,ownerId:'x'}]) assert.throws(() => p.parseModeView(value));
  assert.deepEqual(p.parsePrivateOwnerPageRequest({}), {});
  assert.deepEqual(p.parsePrivateOwnerPageRequest({cursor:'abc'}), {cursor:'abc'});
  for (const value of [{cursor:null},{cursor:''},{limit:50},{ownerId:'x'},{cursor:'a'.repeat(513)}])
    assert.throws(() => p.parsePrivateOwnerPageRequest(value));
`));

test('owner projection rejects peer fields, invalid money, malformed dates and unknown enum values', () => run(`
  const row = ${JSON.stringify(owner)};
  assert.deepEqual(p.parsePrivateOwnerView(row), row);
  for (const bad of [
    {...row, visibility:'household'}, {...row, rawDescription:'private'}, {...row, expectedAmountMinor:9.99},
    {...row, expectedAmountMinor:'01'}, {...row, expectedAmountMinor:'9223372036854775808'},
    {...row, nextChargeDate:'2026-02-30'}, {...row, categoryCode:'UNKNOWN'}, {...row, id:row.id.toUpperCase()},
    {...row, merchantId:undefined}
  ]) assert.throws(() => p.parsePrivateOwnerView(bad));
`));

test('owner page caps fifty and lifecycle result is a closed committed status', () => run(`
  const row = ${JSON.stringify(owner)};
  assert.deepEqual(p.parsePrivateOwnerPage({items:[],nextCursor:null}), {items:[],nextCursor:null});
  const fifty = Array.from({length:50}, (_,i) => ({...row,id:'123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0')}));
  assert.equal(p.parsePrivateOwnerPage({items:fifty,nextCursor:'abc'}).items.length,50);
  for (const page of [{items:[row,row],nextCursor:null}, {items:[row],nextCursor:'abc'},
    {items:[...fifty,row],nextCursor:null}, {items:[],nextCursor:null,ownerId:'x'}])
    assert.throws(() => p.parsePrivateOwnerPage(page));
  assert.deepEqual(p.parsePrivateLifecycleResult({id:row.id,status:'PAUSED'}), {id:row.id,status:'PAUSED'});
  for (const result of [{id:row.id,status:'DETECTED'},{id:row.id,status:'ACTIVE',ownerId:'x'}])
    assert.throws(() => p.parsePrivateLifecycleResult(result));
`));
