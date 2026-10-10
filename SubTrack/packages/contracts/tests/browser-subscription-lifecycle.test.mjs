import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = (name) => new URL(`../generated/${name}`, import.meta.url).href;

test('v2 lifecycle PATCH contracts only the browser owner transition and bounded outcomes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'st223-contract-'));
  try {
    const output = join(dir, 'openapi.json');
    const result = spawnSync(process.execPath, [join(root, 'node_modules/@redocly/cli/bin/cli.js'),
      'bundle', join(root, 'openapi.yaml'), '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const doc = JSON.parse(readFileSync(output, 'utf8'));
    const operation = doc.paths['/v2/subscriptions/{id}'].patch;
    assert.deepEqual(Object.keys(doc.paths['/v2/subscriptions/{id}']), ['patch']);
    assert.equal(operation.operationId, 'patchV2BrowserSubscriptionLifecycle');
    assert.equal(operation['x-runtime-availability'], 'unavailable-default');
    assert.deepEqual(operation.security, [{ V2WebAccessCookie: [] }]);
    assert.deepEqual(operation.parameters.map((parameter) => parameter.$ref
      ? doc.components.parameters[parameter.$ref.split('/').at(-1)] : parameter)
      .map(({ in: location, name, required }) => [location, name, required]),
    [['path', 'id', true], ['header', 'Origin', true], ['header', 'X-Session-CSRF', true]]);
    assert.deepEqual(operation.parameters[0].schema, { type: 'string', format: 'uuid' });
    assert.equal(operation.requestBody.required, true);
    assert.deepEqual(Object.keys(operation.requestBody.content), ['application/json']);
    assert.deepEqual(operation.requestBody.content['application/json'].schema,
      { $ref: '#/components/schemas/SubscriptionLifecyclePatch' });
    assert.deepEqual(doc.components.schemas.SubscriptionLifecyclePatch.required, ['status']);
    assert.equal(doc.components.schemas.SubscriptionLifecyclePatch.additionalProperties, false);
    assert.equal(doc.components.schemas.SubscriptionLifecyclePatch.maxProperties, 1);
    assert.deepEqual(doc.components.schemas.SubscriptionLifecycleTarget.enum,
      ['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED']);
    assert.deepEqual(Object.keys(operation.responses), ['200', '400', '401', '403', '404', '409', '500']);
    assert.deepEqual(operation.responses['200'].content['application/json'].schema,
      { $ref: '#/components/schemas/SubscriptionLifecycleResult' });
    assert.equal(doc.components.schemas.SubscriptionLifecycleResult.additionalProperties, false);
    assert.deepEqual(doc.components.schemas.SubscriptionLifecycleResult.required, ['id', 'status']);
    assert.equal(operation.responses['200'].headers['Cache-Control'].required, true);
    assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
    for (const status of [400, 401, 403, 404, 409, 500]) {
      assert.deepEqual(operation.responses[status],
        { $ref: '#/components/responses/BrowserSubscriptionLifecycleProblem' });
      const response = doc.components.responses[operation.responses[status].$ref.split('/').at(-1)];
      assert.equal(response.headers['Cache-Control'].required, true, `${status} requires Cache-Control`);
      assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
    }
    const problem = doc.components.responses.BrowserSubscriptionLifecycleProblem;
    assert.equal(problem.headers['Cache-Control'].required, true);
    assert.equal(problem.headers['Cache-Control'].schema.const, 'no-store');
    assert.deepEqual(problem.content['application/problem+json'].schema,
      { $ref: '#/components/schemas/BrowserSubscriptionLifecycleError' });
    const error = doc.components.schemas.BrowserSubscriptionLifecycleError;
    assert.equal(error.additionalProperties, false);
    assert.deepEqual(error.required, ['type', 'title', 'status', 'code']);
    assert.deepEqual(error.properties.status.enum, [400, 401, 403, 404, 409, 500]);
    assert.deepEqual(error.properties.code.enum,
      ['INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST', 'AUTHENTICATION_REQUIRED',
        'AUTH_CSRF_UNAVAILABLE', 'SUBSCRIPTION_NOT_FOUND', 'LIFECYCLE_CONFLICT', 'INTERNAL_ERROR']);
    const description = operation.description;
    for (const pattern of [/direct HTTPS/, /exactly one Origin/, /exactly one st_v2_access/,
      /distinct.*browser binding cookie/s, /exactly one session-bound X-Session-CSRF/,
      /Reject duplicate credentials or headers, Authorization.*st_v2_refresh.*Idempotency-Key/s,
      /every query parameter with 400/, /JSON with exactly one status target/,
      /no caller identity, owner, household.*action, transport or edit selector/s,
      /webContextForCurrentSession/, /DevelopmentV2PrincipalResolver\.resolve/,
      /recheck current session, binding and chain after asynchronous resolution/,
      /SessionCsrfGuard/, /server-only subscription RequestContext/,
      /locked current row under transaction-local ordinary-role PostgreSQL RLS/,
      /ACTIVE to PAUSED\/CANCELLED\/ARCHIVED, PAUSED to\s+ACTIVE\/CANCELLED\/ARCHIVED, and CANCELLED to ARCHIVED/,
      /same-status, conflict/, /ACTIVE=resume, PAUSED=pause, CANCELLED=cancel, ARCHIVED=archive/,
      /no unlocked read drives dispatch/, /Missing and foreign IDs return the\s+identical 404/,
      /After 409 or an uncertain PATCH response.*POST \/v2\/subscriptions\/\{id\}\/read/s,
      /automatically retry PATCH.*fall back\s+to V1 authority or convert tokens/s,
      /clear the private\s+view and disable lifecycle actions/s,
      /no replay receipt, nonce mutation, mutating-POST\s+idempotency reservation/s])
      assert.match(description, pattern);
    assert.deepEqual(doc.paths['/v1/subscriptions/{id}'].patch.security, [{ V1AccessBearer: [] }]);
    assert.deepEqual(Object.keys(doc.paths['/v1/subscriptions/{id}'].patch.responses),
      ['200', '400', '401', '404', '409', '500']);
    assert.deepEqual(doc.components.schemas.SubscriptionLifecycleError.properties.status.enum,
      [400, 401, 404, 409, 500]);
    assert.deepEqual(Object.keys(doc.paths['/v2/subscriptions/{id}/read'].post.responses),
      ['200', '400', '401', '403', '404', '500']);
    assert.deepEqual(doc.paths['/v2/subscriptions/{id}/read'].post.security,
      [{ V2WebAccessCookie: [] }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generated SDK, types and Zod agree on strict browser lifecycle wire shape', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    const z = await import(${JSON.stringify(generated('zod.gen.ts'))});
    const sdk = readFileSync(new URL(${JSON.stringify(generated('sdk.gen.ts'))}), 'utf8');
    const types = readFileSync(new URL(${JSON.stringify(generated('types.gen.ts'))}), 'utf8');
    const id = 'd9428888-122b-4f8c-9e33-71a48c10d25a';
    const headers = { Origin: 'https://app.example.test', 'X-Session-CSRF': 'csrf' };
    assert.deepEqual(z.zPatchV2BrowserSubscriptionLifecycleBody.parse({ status: 'PAUSED' }), { status: 'PAUSED' });
    for (const body of [{}, { status: 'TRIAL' }, { status: 'ACTIVE', ownerId: id },
      { status: 'ACTIVE', action: 'resume' }, { status: 'ACTIVE', transport: 'web' }])
      assert.equal(z.zPatchV2BrowserSubscriptionLifecycleBody.safeParse(body).success, false);
    assert.equal(z.zPatchV2BrowserSubscriptionLifecyclePath.safeParse({ id }).success, true);
    assert.equal(z.zPatchV2BrowserSubscriptionLifecyclePath.safeParse({ id: 'bad' }).success, false);
    assert.equal(z.zPatchV2BrowserSubscriptionLifecycleHeaders.safeParse(headers).success, true);
    for (const name of Object.keys(headers)) {
      const missing = { ...headers }; delete missing[name];
      assert.equal(z.zPatchV2BrowserSubscriptionLifecycleHeaders.safeParse(missing).success, false);
    }
    assert.deepEqual(z.zPatchV2BrowserSubscriptionLifecycleResponse.parse({ id, status: 'ARCHIVED' }),
      { id, status: 'ARCHIVED' });
    assert.equal(z.zPatchV2BrowserSubscriptionLifecycleResponse.safeParse({ id, status: 'ACTIVE', ownerId: id }).success, false);
    for (const [status, code] of [[400, 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
      [401, 'AUTHENTICATION_REQUIRED'], [403, 'AUTH_CSRF_UNAVAILABLE'],
      [404, 'SUBSCRIPTION_NOT_FOUND'], [409, 'LIFECYCLE_CONFLICT'], [500, 'INTERNAL_ERROR']])
      assert.equal(z.zBrowserSubscriptionLifecycleError.safeParse({ type: 'about:blank',
        title: 'Problem', status, code }).success, true);
    assert.equal(z.zBrowserSubscriptionLifecycleError.safeParse({ type: 'about:blank',
      title: 'Problem', status: 404, code: 'SUBSCRIPTION_NOT_FOUND', ownerId: id }).success, false);
    assert.match(sdk, /export const patchV2BrowserSubscriptionLifecycle/);
    assert.match(sdk, /\\.patch<PatchV2BrowserSubscriptionLifecycleResponses/);
    assert.match(types, /export type PatchV2BrowserSubscriptionLifecycleData = \\{[\\s\\S]*?body: SubscriptionLifecyclePatch;[\\s\\S]*?Origin: string;[\\s\\S]*?'X-Session-CSRF': string;[\\s\\S]*?query\\?: never;[\\s\\S]*?url: '\\/v2\\/subscriptions\\/\\{id\\}';/);
    assert.match(types, /export type PatchV2BrowserSubscriptionLifecycleErrors = \\{[\\s\\S]*?403: BrowserSubscriptionLifecycleError;/);
  `;
  const result = spawnSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
