import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = (name) => new URL(`../generated/${name}`, import.meta.url).href;

test('browser detail POST is an isolated, unavailable read with bounded authority and errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'st219-contract-'));
  try {
    const output = join(dir, 'openapi.json');
    const result = spawnSync(process.execPath, [join(root, 'node_modules/@redocly/cli/bin/cli.js'),
      'bundle', join(root, 'openapi.yaml'), '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const doc = JSON.parse(readFileSync(output, 'utf8'));
    const path = '/v2/subscriptions/{id}/read';
    assert.deepEqual(Object.keys(doc.paths[path]), ['post']);
    const operation = doc.paths[path].post;
    assert.equal(operation.operationId, 'readV2BrowserSubscription');
    assert.equal(operation['x-runtime-availability'], 'unavailable-default');
    assert.deepEqual(operation.security, [{ V2WebAccessCookie: [] }]);
    assert.deepEqual(operation.parameters.map((parameter) => parameter.$ref
      ? doc.components.parameters[parameter.$ref.split('/').at(-1)] : parameter)
      .map(({ in: location, name, required }) =>
      [location, name, required]), [['path', 'id', true], ['header', 'Origin', true],
      ['header', 'X-Session-CSRF', true]]);
    assert.deepEqual(operation.parameters[0].schema, { type: 'string', format: 'uuid' });
    assert.deepEqual(Object.keys(operation.requestBody.content), ['application/json']);
    assert.equal(operation.requestBody.required, true);
    assert.deepEqual(operation.requestBody.content['application/json'].schema,
      { $ref: '#/components/schemas/BrowserSubscriptionReadRequest' });
    assert.deepEqual(doc.components.schemas.BrowserSubscriptionReadRequest,
      { type: 'object', additionalProperties: false, minProperties: 0, maxProperties: 0,
        description: 'Exactly an empty JSON object; no identity, scope or action fields.' });
    assert.deepEqual(Object.keys(operation.responses), ['200', '400', '401', '403', '404', '500']);
    assert.deepEqual(operation.responses['200'].content['application/json'].schema,
      { $ref: '#/components/schemas/VisibleSubscription' });
    assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
    for (const status of [400, 401, 403, 404, 500]) {
      assert.deepEqual(operation.responses[status],
        { $ref: '#/components/responses/BrowserSubscriptionReadProblem' });
    }
    const problem = doc.components.responses.BrowserSubscriptionReadProblem;
    assert.equal(problem.headers['Cache-Control'].schema.const, 'no-store');
    assert.deepEqual(problem.content['application/problem+json'].schema,
      { $ref: '#/components/schemas/BrowserSubscriptionReadProblem' });
    assert.deepEqual(doc.components.schemas.BrowserSubscriptionReadProblem.properties.status.enum,
      [400, 401, 403, 404, 500]);
    assert.deepEqual(doc.components.schemas.BrowserSubscriptionReadProblem.properties.code.enum,
      ['INVALID_SUBSCRIPTION_QUERY', 'AUTHENTICATION_REQUIRED', 'AUTH_CSRF_UNAVAILABLE',
        'SUBSCRIPTION_NOT_FOUND', 'INTERNAL_ERROR']);
    assert.equal(doc.components.schemas.BrowserSubscriptionReadProblem.additionalProperties, false);
    assert.match(operation.description, /direct HTTPS/);
    assert.match(operation.description, /exactly one st_v2_access.*one distinct.*browser binding cookie/s);
    assert.match(operation.description, /Reject duplicate credentials or headers, Authorization.*Refresh.*st_v2_refresh/s);
    assert.match(operation.description, /every query parameter/);
    assert.match(operation.description, /webContextForCurrentSession/);
    assert.match(operation.description, /DevelopmentV2PrincipalResolver\.resolve/);
    assert.match(operation.description, /SessionCsrfGuard/);
    assert.match(operation.description, /pure read.*no idempotency reservation/s);
    assert.equal(operation.parameters.some(({ name }) => name === 'Idempotency-Key'), false);
    assert.deepEqual(doc.paths['/v1/subscriptions/{id}'].get.security, [{ V1AccessBearer: [] }]);
    assert.deepEqual(doc.paths['/v1/subscriptions/{id}'].get.responses['200'].content['application/json'].schema,
      { $ref: '#/components/schemas/VisibleSubscription' });
    assert.deepEqual(doc.components.schemas.SubscriptionReadProblem.properties.code.enum,
      ['INVALID_SUBSCRIPTION_QUERY', 'SUBSCRIPTION_NOT_FOUND', 'AUTHENTICATION_REQUIRED', 'INTERNAL_ERROR']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generated SDK and Zod keep empty body, UUID, required wire headers and privacy projection', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    const z = await import(${JSON.stringify(generated('zod.gen.ts'))});
    const sdk = readFileSync(new URL(${JSON.stringify(generated('sdk.gen.ts'))}), 'utf8');
    const types = readFileSync(new URL(${JSON.stringify(generated('types.gen.ts'))}), 'utf8');
    const id = 'd9428888-122b-4f8c-9e33-71a48c10d25a';
    assert.deepEqual(z.zReadV2BrowserSubscriptionBody.parse({}), {});
    for (const body of [null, [], '', { ownerId: id }, { scope: 'household' }, { action: 'read' }])
      assert.equal(z.zReadV2BrowserSubscriptionBody.safeParse(body).success, false);
    assert.equal(z.zReadV2BrowserSubscriptionPath.safeParse({ id }).success, true);
    assert.equal(z.zReadV2BrowserSubscriptionPath.safeParse({ id: 'bad' }).success, false);
    const headers = { Origin: 'https://app.example.test', 'X-Session-CSRF': 'csrf' };
    assert.equal(z.zReadV2BrowserSubscriptionHeaders.safeParse(headers).success, true);
    for (const name of Object.keys(headers)) {
      const missing = { ...headers }; delete missing[name];
      assert.equal(z.zReadV2BrowserSubscriptionHeaders.safeParse(missing).success, false);
    }
    const common = { id, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE',
      expectedAmountMinor: '-9007199254740993', currency: 'SEK' };
    const owner = { visibility: 'owner', ...common, alwaysPrivate: true };
    const peer = { visibility: 'household', ...common };
    assert.deepEqual(z.zReadV2BrowserSubscriptionResponse.parse(owner), owner);
    assert.deepEqual(z.zReadV2BrowserSubscriptionResponse.parse(peer), peer);
    assert.equal(z.zReadV2BrowserSubscriptionResponse.safeParse({ ...peer, alwaysPrivate: true }).success, false);
    assert.equal(z.zReadV2BrowserSubscriptionResponse.safeParse({ ...peer, expectedAmountMinor: 2 }).success, false);
    for (const [status, code] of [[400, 'INVALID_SUBSCRIPTION_QUERY'], [401, 'AUTHENTICATION_REQUIRED'],
      [403, 'AUTH_CSRF_UNAVAILABLE'], [404, 'SUBSCRIPTION_NOT_FOUND'], [500, 'INTERNAL_ERROR']])
      assert.equal(z.zBrowserSubscriptionReadProblem.safeParse({ type: 'about:blank', title: 'Problem', status, code }).success, true);
    assert.equal(z.zBrowserSubscriptionReadProblem.safeParse({ type: 'about:blank', title: 'Problem',
      status: 404, code: 'SUBSCRIPTION_NOT_FOUND', ownerId: id }).success, false);
    assert.match(sdk, /export const readV2BrowserSubscription/);
    assert.match(sdk, /\\.post<ReadV2BrowserSubscriptionResponses/);
    assert.match(types, /export type ReadV2BrowserSubscriptionData = \\{[\\s\\S]*?body: BrowserSubscriptionReadRequest;[\\s\\S]*?Origin: string;[\\s\\S]*?'X-Session-CSRF': string;[\\s\\S]*?query\\?: never;[\\s\\S]*?url: '\\/v2\\/subscriptions\\/\\{id\\}\\/read';/);
  `;
  const result = spawnSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
