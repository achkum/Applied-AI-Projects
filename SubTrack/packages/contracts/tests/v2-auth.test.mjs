import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const redocly = join(contractRoot, 'node_modules/@redocly/cli/bin/cli.js');
const source = join(contractRoot, 'openapi.yaml');

function bundle() {
  const dir = mkdtempSync(join(tmpdir(), 'st170a-contract-'));
  const output = join(dir, 'openapi.json');
  const result = spawnSync(process.execPath, [redocly, 'bundle', source, '--output', output, '--dereferenced'], {
    cwd: contractRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { dir, document: JSON.parse(readFileSync(output, 'utf8')) };
}

const idempotentPostPaths = [
  '/v2/auth/browser-nonce', '/v2/auth/otp/start', '/v2/auth/otp/verify',
  '/v2/auth/enrollment/pending', '/v2/auth/enrollment/simulator/verify',
  '/v2/auth/enrollment/complete', '/v2/auth/login/simulator/verify',
  '/v2/auth/session', '/v2/auth/refresh',
  '/v2/me/reauth/otp/start', '/v2/me/reauth/otp/verify',
];
// Business receipts are separate from authentication credential replay/restart.
const privateBusinessIdempotentPostPaths = ['/v2/subscriptions/owner/manual', '/v2/subscriptions/owner/manual/{id}/edit'];
const privatePostPaths = [
  '/v2/me/profile/read', '/v2/me/mode', '/v2/me/mode/read',
  '/v2/subscriptions/owner/read', '/v2/subscriptions/{id}/read',
];
const privateMobilePostPaths = ['enrollment/complete','login/verify','session','refresh','logout','profile/read','profile','mode/read','mode','subscriptions/owner/read','subscriptions/owner/manual','subscriptions/owner/manual/edit','subscriptions/owner/status'].map(path=>`/v2/private/mobile/${path}`);

const privateMobileBankReadPaths = ['/v2/private/mobile/banks/synthetic/read'];
const privateMobileBankMutationPaths = ['connect','sync','disconnect'].map(operation=>`/v2/private/mobile/banks/synthetic/${operation}`);
const privateMobileDetectionReadPaths = ['/v2/private/mobile/detections/read'];
const privateMobileDetectionMutationPaths = ['scan', 'confirm', 'reject', 'undo'].map(operation => `/v2/private/mobile/detections/${operation}`);
const sandboxIssuancePaths = ['bootstrap', 'resume', 'refresh'].map(operation => `/v2/sandbox/mobile/${operation}`);
const sandboxLogoutPaths = ['/v2/sandbox/mobile/logout'];
const sandboxBusinessPaths = ['/v2/sandbox/mobile/business'];

function assertRequiredBrowserHeaders(operation, label) {
  const origin = operation.parameters.find((parameter) => parameter.name === 'Origin');
  const csrf = operation.parameters.find((parameter) => parameter.name === 'X-Session-CSRF');
  assert.equal(origin?.required, true, `${label} requires exact Origin`);
  assert.equal(csrf?.required, true, `${label} requires current session CSRF`);
  assert.equal(csrf.schema.minLength, 1, `${label} rejects empty session CSRF`);
}

function classifiedPosts(document) {
  const paths = Object.entries(document.paths)
    .filter(([path, item]) => path.startsWith('/v2/') && item.post)
    .map(([path]) => path);
  assert.deepEqual(paths.sort(), [...idempotentPostPaths, ...privatePostPaths, ...privateBusinessIdempotentPostPaths, ...privateMobilePostPaths, ...privateMobileBankReadPaths, ...privateMobileBankMutationPaths,
    ...privateMobileDetectionReadPaths, ...privateMobileDetectionMutationPaths, ...sandboxIssuancePaths, ...sandboxLogoutPaths, ...sandboxBusinessPaths].sort(),
    'every v2 POST must have an explicit reviewed idempotency classification');
  return idempotentPostPaths.map((path) => [path, document.paths[path].post]);
}

test('detection and sandbox POSTs have explicit distinct key and closed business classifications', () => {
  const { dir, document } = bundle();
  try {
    assert.equal(classifiedPosts(document).length, 11, 'original authentication recovery group remains unchanged');
    const browserHeaders = ['Origin', 'Cookie', 'X-Session-CSRF', 'X-Browser-Nonce'];
    for (const path of [...privateMobileDetectionReadPaths, ...privateMobileDetectionMutationPaths]) {
      const op = document.paths[path].post, parameters = op.parameters ?? [];
      assert.equal(op['x-runtime-availability'], 'unavailable-default');
      for (const browser of browserHeaders) assert.equal(parameters.some(p => p.name === browser), false);
      const keys = parameters.filter(p => p.name === 'Idempotency-Key');
      assert.equal(keys.length, privateMobileDetectionMutationPaths.includes(path) ? 1 : 0, `${path} has exact key classification`);
      if (keys.length) {
        assert.equal(keys[0].in, 'header'); assert.equal(keys[0].required, true);
        assert.equal(keys[0].schema.minLength, 16); assert.equal(keys[0].schema.maxLength, 255);
        assert.match(op.description, /immutable receipt replay after fresh current authority/);
      } else assert.match(op.description, /Idempotency-Key forbidden/);
      assert.equal(op.requestBody.content['application/json'].schema.additionalProperties, false);
    }
    for (const path of [...sandboxIssuancePaths, ...sandboxLogoutPaths, ...sandboxBusinessPaths]) {
      const op = document.paths[path].post, parameters = op.parameters ?? [];
      for (const browser of browserHeaders) assert.equal(parameters.some(p => p.name === browser), false);
      const keys = parameters.filter(p => p.name === 'Idempotency-Key');
      assert.equal(keys.length, sandboxLogoutPaths.includes(path) ? 0 : 1, `${path} has exact sandbox key classification`);
      if (keys.length) {
        assert.equal(keys[0].in, 'header'); assert.equal(keys[0].required, sandboxIssuancePaths.includes(path));
        assert.equal(keys[0].schema.format, 'uuid');
        const pattern = new RegExp(keys[0].schema.pattern);
        assert.equal(pattern.test('123e4567-e89b-42d3-a456-426614174000'), true);
        assert.equal(pattern.test('123e4567-e89b-12d3-a456-426614174000'), false);
      }
    }
    assert.deepEqual(document.paths[sandboxIssuancePaths[0]].post.security, []);
    assert.deepEqual(document.paths[sandboxIssuancePaths[1]].post.security, [{ SandboxCapability: [] }]);
    assert.deepEqual(document.paths[sandboxIssuancePaths[2]].post.security, [{ SandboxRefresh: [] }]);
    for (const path of [...sandboxLogoutPaths, ...sandboxBusinessPaths]) assert.deepEqual(document.paths[path].post.security, [{ SandboxAccess: [] }]);
    const business = document.paths[sandboxBusinessPaths[0]].post;
    assert.match(business.description, /bank mutations and detection mutations require Idempotency-Key/);
    assert.match(business.description, /Owner identifiers cannot be supplied/);
    const choices = business.requestBody.content['application/json'].schema.oneOf;
    assert.deepEqual(choices.map(choice => choice.properties.operation.const), ['profile-read', 'profile', 'mode-read', 'mode', 'owner-read', 'manual', 'manual-edit', 'status', 'bank-read', 'bank-connect', 'bank-sync', 'bank-disconnect', 'detection-read', 'detection-scan', 'detection-confirm', 'detection-reject', 'detection-undo', 'household-read', 'household-create', 'household-rename', 'dependant-add', 'dependant-edit', 'dependant-remove', 'bank-history', 'household-assign', 'subscription-edit', 'subscription-status']);
    for (const choice of choices) {
      assert.equal(choice.additionalProperties, false); assert.deepEqual(choice.required, ['operation', 'body']);
      assert.deepEqual(Object.keys(choice.properties).sort(), ['body', 'operation']);
      assert.equal(choice.properties.body.additionalProperties, false);
    }
    assert.deepEqual(choices.find(choice => choice.properties.operation.const === 'manual').properties.body.required,
      ['customName', 'categoryCode', 'cadence', 'expectedAmountMinor']);
    assert.ok(choices.find(choice => choice.properties.operation.const === 'manual').properties.body.properties.nextChargeDate);
    assert.deepEqual(choices.find(choice => choice.properties.operation.const === 'manual-edit').properties.body.required,
      ['id', 'customName', 'categoryCode', 'cadence', 'expectedAmountMinor', 'nextChargeDate', 'expectedRevision']);
    assert.equal(document.paths[sandboxIssuancePaths[2]].post.requestBody, undefined);
    assert.equal(document.paths[sandboxLogoutPaths[0]].post.requestBody.content['application/json'].schema.properties.transport.const, 'sandbox-mobile');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v1 route and schema baseline remains present and unchanged in the candidate', () => {
  const { dir, document } = bundle();
  try {
    const routes = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );
    const v1Routes = routes.filter((route) => route.includes('/v1/'));
    assert.deepEqual(v1Routes.sort(), [
      'DELETE /v1/data-rights/account',
      'GET /v1/data-rights/export/{token}',
      'GET /v1/privacy/preview-as/{householdId}',
      'GET /v1/privacy/settings',
      'GET /v1/review-inbox',
      'GET /v1/subscriptions',
      'GET /v1/subscriptions/{id}',
      'GET /v1/version',
      'PATCH /v1/privacy/open-book',
      'PATCH /v1/subscriptions/{id}',
      'POST /v1/data-rights/export',
    ]);
    for (const name of [
      'ConsentSetting', 'DeleteAccountBody', 'ExportJobResponse', 'HealthResponse',
      'Problem', 'ReadinessResponse', 'SetOpenBookBody', 'SubscriptionSummary', 'VersionResponse',
    ]) assert.ok(document.components.schemas[name], `v1 schema ${name} remains present`);
    assert.deepEqual(Object.keys(document.paths['/v1/data-rights/account'].delete.responses),
      ['204', '400', '401', '403', '404', 'default']);
    assert.equal(document.components.schemas.DeleteAccountBody.properties.reAuthToken.type, 'string');
    assert.deepEqual(document.paths['/v1/privacy/preview-as/{householdId}'].get.parameters
      .map((parameter) => parameter.name).sort(), ['X-Caller-Id', 'householdId']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v2 mutating POSTs require idempotency and browser state distinguishes nonce from CSRF', () => {
  const { dir, document } = bundle();
  try {
    const operations = classifiedPosts(document);
    assert.equal(operations.length, 11);
    for (const path of privatePostPaths) {
      const operation = document.paths[path].post;
      assert.equal(operation.parameters.some((parameter) => parameter.name === 'Idempotency-Key'), false,
        `${path} rejects Idempotency-Key`);
      assertRequiredBrowserHeaders(operation, `POST ${path}`);
    }
    assertRequiredBrowserHeaders(document.paths['/v2/me/profile'].patch, 'PATCH /v2/me/profile');
    const profileRead = document.paths['/v2/me/profile/read'].post;
    assert.equal(profileRead.requestBody.content['application/json'].schema.type, 'object');
    assert.equal(profileRead.requestBody.content['application/json'].schema.maxProperties, 0);
    for (const path of ['/v2/me/mode/read', '/v2/subscriptions/owner/read'])
      assert.equal(document.paths[path].post.requestBody.content['application/json'].schema.additionalProperties,
        false, `${path} accepts only its reviewed closed body`);
    assert.match(document.paths['/v2/me/mode'].post.description, /side-effect-free committed readback/i);
    assert.match(document.paths['/v2/me/mode'].post.description, /uncertain result is never retried/i);
    for (const [path, operation] of operations) {
      assert.ok(operation.parameters.some((parameter) =>
        parameter.name === 'Idempotency-Key' && parameter.required === true),
      `${path} requires Idempotency-Key`);
      assert.match(operation.description ?? '', /replay|retries|idempotency/i);
    }
    const nonce = document.paths['/v2/auth/browser-nonce'].post;
    assert.ok(nonce.parameters.some((parameter) => parameter.name === 'Origin' && parameter.required));
    assert.ok(nonce.responses['200'].headers['Set-Cookie']);
    assert.equal(nonce.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
    assert.equal(nonce.responses['200'].headers.Pragma.schema.const, 'no-cache');
    const session = document.paths['/v2/auth/session'].post;
    const sessionOrigin = session.parameters.find((parameter) => parameter.name === 'Origin');
    const sessionNonce = session.parameters.find((parameter) => parameter.name === 'X-Browser-Nonce');
    assert.equal(sessionOrigin.required, false);
    assert.match(sessionOrigin.description, /Required for web.*transport/i);
    assert.equal(sessionNonce.required, false);
    assert.match(sessionNonce.description, /Required for web transport only/i);
    assert.match(session.description, /HttpOnly binding cookie/i);
    assert.match(session.description, /exact.*Origin/i);
    assert.match(session.description, /same trusted browser chain/i);
    assert.match(session.description, /consume\s+the nonce terminally/i);
    assert.match(session.description, /session-bound CSRF/i);
    assert.match(session.description, /AUTH_RESTART_REQUIRED/i);
    assert.ok(document.components.parameters.SessionCsrf);
    assert.equal(document.components.parameters.SessionCsrf.required, false);
    assert.match(document.components.parameters.SessionCsrf.description, /separate from browser nonce/i);
    assert.equal(document.components.parameters.OriginForWeb.required, false);
    assert.equal(document.components.parameters.BrowserSessionCsrf.required, true);
    assert.equal(document.components.parameters.BrowserSessionCsrf.schema.minLength, 1);
    for (const path of ['/v2/auth/otp/start', '/v2/auth/otp/verify']) {
      assert.ok(document.paths[path].post.responses['200'] || document.paths[path].post.responses['202']);
    }
    assert.ok(document.components.schemas.OtpStartResponse.properties.nextBrowserNonce);
    assert.ok(document.components.schemas.OtpVerifyResponse.properties.nextBrowserNonce);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('private business idempotency uses current authority and durable manual receipt recovery', () => {
  const { dir, document } = bundle();
  try {
    assert.equal(classifiedPosts(document).length, 11, 'authentication recovery group stays unchanged');
    assert.deepEqual(privateBusinessIdempotentPostPaths, ['/v2/subscriptions/owner/manual', '/v2/subscriptions/owner/manual/{id}/edit']);
    for (const path of privateBusinessIdempotentPostPaths) {
      const operation = document.paths[path].post;
      assert.equal(operation['x-runtime-availability'], 'unavailable-default');
      assertRequiredBrowserHeaders(operation, `POST ${path}`);
      assert.equal(operation.parameters.some((parameter) => parameter.name === 'X-Browser-Nonce'), false,
        'manual writes use current CSRF, never an enrollment nonce');
      const keys = operation.parameters.filter((parameter) => parameter.name === 'Idempotency-Key');
      assert.equal(keys.length, 1);
      assert.equal(keys[0].required, true);
      const keyPattern = new RegExp(keys[0].schema.pattern);
      assert.ok(keyPattern.test('123e4567-e89b-42d3-a456-426614174000'));
      for (const invalid of ['123E4567-e89b-42d3-a456-426614174000',
        '123e4567-e89b-12d3-a456-426614174000', 'a'.repeat(16),
        '123e4567-e89b-42d3-a456-426614174000,123e4567-e89b-42d3-a456-426614174000'])
        assert.equal(keyPattern.test(invalid), false, 'manual key is exactly one lowercase UUIDv4');
      assert.deepEqual(Object.keys(operation.responses), path.endsWith('/edit') ? ['200', '400', '401', '403', '404', '409', '500'] : ['201', '400', '401', '403', '409', '500']);
      const success = operation.responses[path.endsWith('/edit') ? '200' : '201'];
      assert.equal(success.headers['Cache-Control'].schema.const, 'no-store');
      assert.equal(success.headers.Pragma.schema.const, 'no-cache');
      const result = success.content['application/json'].schema;
      assert.equal(result.additionalProperties, false);
      if (path.endsWith('/edit')) {
        assert.deepEqual(result.required, ['id', 'revision']);
        assert.deepEqual(Object.keys(result.properties), ['id', 'revision']);
        const codes = operation.responses['409'].content['application/problem+json'].schema.properties.code.enum;
        for (const code of ['MODE_CONFLICT', 'MANUAL_EDIT_IDEMPOTENCY_CONFLICT', 'MANUAL_EDIT_CONFLICT']) assert.ok(codes.includes(code));
        assert.match(operation.description, /receipt replay precedes target existence, eligibility and staleness/);
        assert.match(operation.description, /Separate edit namespace unique\(owner,key\) across all targets/);
        continue;
      }
      assert.deepEqual(result.required, ['id']);
      assert.deepEqual(Object.keys(result.properties), ['id']);
      const conflict = operation.responses['409'].content['application/problem+json'].schema;
      assert.ok(conflict.properties.code.enum.includes('MODE_CONFLICT'));
      assert.ok(conflict.properties.code.enum.includes('MANUAL_IDEMPOTENCY_CONFLICT'));
      assert.match(operation.description, /Gate complete\s+profile and just-me on create AND replay before receipt/);
      assert.match(operation.description, /Known commit and exact replay return 201 original id; changed-body same key 409/);
      assert.match(operation.description, /Immutable receipt survives status\/deletion\/restart\/expiry/);
      assert.match(operation.description, /every attempted-COMMIT failure\s+masked 500/);
      assert.match(operation.description, /No compensation\/automatic replay/);
      assert.doesNotMatch(operation.description, /AUTH_RESTART_REQUIRED/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v2 POST recovery contract stays generic and explains restart after reference resolution', () => {
  const { dir, document } = bundle();
  try {
    const operations = classifiedPosts(document);
    assert.equal(operations.length, 11);
    for (const [path, operation] of operations) {
      const response = operation.responses['409'];
      assert.ok(response, `${path} documents generic duplicate handling`);
      assert.match(response.description, /generic/i, `${path} keeps the conflict generic`);
      assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
      assert.equal(response.headers.Pragma.schema.const, 'no-cache');
      const problem = response.content['application/problem+json'].schema;
      const shapes = problem.oneOf ?? [problem];
      for (const shape of shapes)
        assert.equal((shape.properties ?? shape.allOf.find((part) => part.properties?.code).properties).code.type, 'string');
      assert.match(operation.description ?? '', /AUTH_RESTART_REQUIRED/);
      assert.match(operation.description ?? '', /fresh|discard/i,
        `${path} describes a recovery action`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('native Synthetic bank reads and immutable mutations have separate current-owner classification', () => {
  const {dir,document}=bundle();
  try {
    assert.equal(classifiedPosts(document).length,11,'authentication recovery remains unchanged');
    for(const path of [...privateMobileBankReadPaths,...privateMobileBankMutationPaths]) {
      const operation=document.paths[path].post;
      assert.equal(operation['x-runtime-availability'],'unavailable-default');
      assert.deepEqual(operation.security,[{V2AccessBearer:[]}]);
      const parameters=operation.parameters??[];
      assert.equal(parameters.some(parameter=>['Origin','X-Session-CSRF','X-Browser-Nonce','X-Caller-Id'].includes(parameter.name)),false);
      const keys=parameters.filter(parameter=>parameter.name==='Idempotency-Key');
      if(privateMobileBankReadPaths.includes(path)) {
        assert.equal(keys.length,0);
        assert.match(operation.description,/Idempotency-Key is forbidden/);
        assert.equal(operation.requestBody.content['application/json'].schema.maxProperties,0);
      } else {
        assert.equal(keys.length,1);
        assert.equal(keys[0].required,true);
        const pattern=new RegExp(keys[0].schema.pattern);
        assert.ok(pattern.test('123e4567-e89b-42d3-a456-426614174000'));
        assert.equal(pattern.test('123e4567-e89b-72d3-a456-426614174000'),false);
        assert.match(operation.description,/immutable result snapshot/);
        assert.match(operation.description,/never automatic retry/);
      }
      assert.deepEqual(Object.keys(operation.responses),['200','400','401','403','404','409','429','500']);
      assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const,'no-store');
      assert.equal(operation.responses['200'].headers.Pragma.schema.const,'no-cache');
      assert.match(operation.description,/Current verified session, complete profile and Just me/);
      assert.equal(operation.requestBody.content['application/json'].schema.additionalProperties,false);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('generated v2 Zod schemas validate transport envelopes and reject mixed or extra fields', () => {
  const generatedUrl = new URL('../generated/zod.gen.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    const z = await import(${JSON.stringify(generatedUrl)});
    const idempotencyKey = 'a'.repeat(16);
    const origin = 'https://app.example.test';
    const webHeaders = { idempotencyKey, origin, browserNonce: 'nonce' };
    const mobileHeaders = { idempotencyKey };
    const startBody = { transport: 'web', channel: 'sms', identifier: '+15555550123', purpose: 'enroll_identifier' };
    const verifyBody = { transport: 'web', challengeId: 'challenge', code: '123456' };
    assert.equal(z.zWebOtpStartCallEnvelope.safeParse({ transport: 'web', headers: webHeaders, body: startBody }).success, true);
    assert.equal(z.zWebOtpVerifyCallEnvelope.safeParse({ transport: 'web', headers: webHeaders, body: verifyBody }).success, true);
    assert.equal(z.zWebOtpStartCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, browserNonce: 'nonce' }, body: startBody }).success, false);
    assert.equal(z.zWebOtpVerifyCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin }, body: verifyBody }).success, false);
    assert.equal(z.zWebOtpStartCallEnvelope.safeParse({ transport: 'web', headers: webHeaders, body: { ...startBody, transport: 'mobile' } }).success, false);
    const mobileStart = { ...startBody, transport: 'mobile' };
    const mobileVerify = { ...verifyBody, transport: 'mobile' };
    assert.equal(z.zMobileOtpStartCallEnvelope.safeParse({ transport: 'mobile', headers: mobileHeaders, body: mobileStart }).success, true);
    assert.equal(z.zMobileOtpVerifyCallEnvelope.safeParse({ transport: 'mobile', headers: mobileHeaders, body: mobileVerify }).success, true);
    assert.equal(z.zMobileOtpStartCallEnvelope.safeParse({ transport: 'mobile', headers: { ...mobileHeaders, origin, browserNonce: 'nonce' }, body: mobileStart }).success, false);
    assert.equal(z.zMobileOtpVerifyCallEnvelope.safeParse({ transport: 'mobile', headers: mobileHeaders, body: { ...mobileVerify, origin } }).success, false);

    assert.equal(z.zWebSessionCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin, browserNonce: 'nonce' }, body: { transport: 'web', loginProof: 'proof' } }).success, true);
    assert.equal(z.zWebSessionCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin }, body: { transport: 'web', loginProof: 'proof' } }).success, false);
    assert.equal(z.zWebSessionCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey }, body: { transport: 'web', loginProof: 'proof' } }).success, false);
    assert.equal(z.zMobileSessionCallEnvelope.safeParse({ transport: 'mobile', headers: mobileHeaders, body: { transport: 'mobile', loginProof: 'proof', deviceName: 'Phone' } }).success, true);
    assert.equal(z.zMobileSessionCallEnvelope.safeParse({ transport: 'mobile', headers: { ...mobileHeaders, origin }, body: { transport: 'mobile', loginProof: 'proof' } }).success, false);
    assert.equal(z.zMobileSessionCallEnvelope.safeParse({ transport: 'mobile', headers: { ...mobileHeaders, browserNonce: 'nonce' }, body: { transport: 'mobile', loginProof: 'proof' } }).success, false);
    assert.equal(z.zMobileSessionCallEnvelope.safeParse({ transport: 'mobile', headers: { ...mobileHeaders, sessionCsrf: 'csrf' }, body: { transport: 'mobile', loginProof: 'proof' } }).success, false);
    assert.equal(z.zWebSessionCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin, browserNonce: 'nonce' }, body: { transport: 'web', loginProof: 'proof', deviceName: 'Phone' } }).success, false);

    assert.equal(z.zWebRefreshCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin, sessionCsrf: 'csrf' }, body: null }).success, true);
    assert.equal(z.zWebRefreshCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin }, body: null }).success, false);
    assert.equal(z.zWebRefreshCallEnvelope.safeParse({ transport: 'web', headers: { idempotencyKey, origin, sessionCsrf: 'csrf' }, body: {} }).success, false);
    assert.equal(z.zMobileRefreshCallEnvelope.safeParse({ transport: 'mobile', headers: { idempotencyKey, authorization: 'Refresh opaque' }, body: null }).success, true);
    assert.equal(z.zMobileRefreshCallEnvelope.safeParse({ transport: 'mobile', headers: { idempotencyKey, authorization: 'Bearer opaque' }, body: null }).success, false);
    assert.equal(z.zMobileRefreshCallEnvelope.safeParse({ transport: 'mobile', headers: { idempotencyKey, authorization: 'Refresh opaque', origin }, body: null }).success, false);

    const sessionId = 'd9428888-122b-4f8c-9e33-71a48c10d25a';
    assert.equal(z.zWebSessionResponse.safeParse({ transport: 'web', sessionId, csrfToken: 'csrf' }).success, true);
    assert.equal(z.zWebSessionResponse.safeParse({ transport: 'web', sessionId, csrfToken: 'csrf', accessToken: 'secret', refreshToken: 'secret' }).success, false);
    assert.equal(z.zWebSessionResponse.safeParse({ transport: 'web', sessionId, csrfToken: 'csrf', nextBrowserNonce: 'nonce' }).success, false);
    assert.equal(z.zMobileSessionResponse.safeParse({ transport: 'mobile', sessionId, accessToken: 'fictional.jwt.string', refreshToken: 'opaque-refresh' }).success, true);
    assert.equal(z.zDeleteOtpStartRequest.safeParse({ channel: 'email' }).success, true);
    assert.equal(z.zDeleteOtpStartRequest.safeParse({ channel: 'phone' }).success, false);
    for (const extra of [{ identifier: 'person@example.test' }, { environment: 'development' }, { identityId: 'someone' }]) {
      assert.equal(z.zDeleteOtpStartRequest.safeParse({ channel: 'sms', ...extra }).success, false);
      if (!('identifier' in extra)) {
        assert.equal(z.zOtpStartRequest.safeParse({ channel: 'sms', identifier: 'x', purpose: 'otp_step_up', transport: 'mobile', ...extra }).success, false);
      }
    }
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: contractRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('web and mobile credentials are disjoint and deletion proof cannot replace session guards', () => {
  const { dir, document } = bundle();
  try {
    const schemes = document.components.securitySchemes;
    assert.equal(schemes.V2WebAccessCookie.name, 'st_v2_access');
    assert.equal(schemes.V2WebRefreshCookie.name, 'st_v2_refresh');
    assert.match(schemes.V2MobileRefresh.description, /Refresh <opaque-secret>/);
    assert.match(schemes.V2AccessBearer.description, /no fallback to v1/i);
    const request = document.components.schemas.SessionRequest;
    assert.equal(request.oneOf.length, 2);
    assert.equal(document.components.schemas.WebSessionRequest.additionalProperties, false);
    assert.equal(document.components.schemas.MobileSessionRequest.additionalProperties, false);
    assert.equal(document.components.schemas.WebSessionRequest.properties.transport.const, 'web');
    assert.equal(document.components.schemas.MobileSessionRequest.properties.transport.const, 'mobile');
    const deletion = document.paths['/v2/me'].delete;
    assert.ok(deletion.security.length >= 2);
    assert.ok(deletion.parameters.some((parameter) => parameter.name === 'X-Session-CSRF'));
    assert.ok(deletion.description.includes('current active same-principal session'));
    assert.ok(deletion.requestBody);
    assert.match(document.components.schemas.DeleteMeRequest.properties.reauthProof.description,
      /atomically consumed/i);
    assert.match(document.paths['/v2/me/reauth/otp/start'].post.description,
      /AUTH_DELETE_OTP_DEV_ONLY=true/);
    assert.match(document.paths['/v2/me/reauth/otp/verify'].post.description,
      /never a login proof/i);
    const refresh = document.paths['/v2/auth/refresh'].post;
    assert.equal(refresh.requestBody, undefined);
    assert.match(refresh.description, /reject mixed cookie and Authorization/i);
    assert.match(refresh.description, /consumed-token reuse revokes the family/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('private login has closed fixture, proof and error schemas', () => {
  const {dir, document: doc} = bundle();
  try {
  const op = doc.paths['/v2/auth/login/simulator/verify'].post;
  assert.equal(op.operationId, 'verifyV2PrivateSimulatorLogin');
  assert.equal(op['x-runtime-availability'], 'unavailable-default');
  assert.deepEqual(op.security, []);
  assert.deepEqual(op.parameters.map(p => [p.name, p.in, p.required]), [
    ['Idempotency-Key', 'header', true], ['Origin', 'header', true], ['X-Browser-Nonce', 'header', true],
  ]);
  const request = op.requestBody.content['application/json'].schema;
  assert.equal(request.additionalProperties, false);
  assert.deepEqual(request.required, ['transport', 'demoIdentity']);
  assert.deepEqual(request.properties.demoIdentity.enum, ['alice', 'bob']);
  for (const key of ['identityId', 'subject', 'personnummerHmac', 'providerResult', 'verifiedAt'])
    assert.equal(request.properties[key], undefined);
  const success = op.responses['200'];
  assert.deepEqual(success.content['application/json'].schema.required,
    ['transport', 'loginProof', 'status', 'nextBrowserNonce']);
  assert.equal(success.content['application/json'].schema.properties.loginProof.pattern, '^v2\\.[A-Za-z0-9_-]{43}$');
  assert.equal(success.headers['Cache-Control'].schema.const, 'no-store');
  assert.equal(success.headers['Set-Cookie'], undefined);
  const errors = new Map([[400,'INVALID_LOGIN_REQUEST'],[403,'AUTH_ORIGIN_REJECTED'],
    [404,'LOGIN_UNAVAILABLE'],[409,'AUTH_RESTART_REQUIRED'],[500,'INTERNAL_ERROR']]);
  for (const [status, code] of errors) {
    const response = op.responses[String(status)];
    assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
    const choices = response.content['application/problem+json'].schema.oneOf;
    assert.deepEqual(choices.map(choice => [choice.properties.status.const, choice.properties.code.const]), [...errors]);
    for (const choice of choices) {
      assert.equal(choice.additionalProperties, false);
      assert.deepEqual(choice.required, ['type','title','status','code']);
    }
    assert.equal(response.headers['Set-Cookie'], undefined);
  }
  assert.match(doc.paths['/v2/auth/session'].post.description, /uncertain outcome requires a new verification chain/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('native Edit and tracking classify keys explicitly without widening browser or authentication recovery',()=>{
 const {dir,document}=bundle();
 try{
  const keyed=['enrollment/complete','login/verify','session','refresh','subscriptions/owner/manual','subscriptions/owner/manual/edit'].map(path=>`/v2/private/mobile/${path}`);
  for(const path of privateMobilePostPaths){
   const operation=document.paths[path].post;assert.equal(operation['x-runtime-availability'],'unavailable-default');
   const parameters=operation.parameters??[];const keys=parameters.filter(parameter=>parameter.name==='Idempotency-Key');
   assert.equal(keys.length,keyed.includes(path)?1:0,`${path} has an explicit key classification`);
   if(keys.length)assert.equal(keys[0].required,true);
   for(const browser of ['Origin','Cookie','X-Session-CSRF','X-Browser-Nonce'])assert.equal(parameters.some(parameter=>parameter.name===browser),false);
  }
  const edit=document.paths['/v2/private/mobile/subscriptions/owner/manual/edit'].post;
  const body=edit.requestBody.content['application/json'].schema;assert.equal(body.additionalProperties,false);
  assert.deepEqual(body.required,['id','customName','categoryCode','cadence','expectedAmountMinor','nextChargeDate','expectedRevision']);
  const pattern=new RegExp(edit.parameters[0].schema.pattern);assert.ok(pattern.test('123e4567-e89b-42d3-a456-426614174000'));assert.equal(pattern.test('123e4567-e89b-12d3-a456-426614174000'),false);
  assert.deepEqual(edit.responses['200'].content['application/json'].schema.required,['id','revision']);
  assert.match(edit.description,/exact replay returns original\s+committed revision before target lookup/);
  const status=document.paths['/v2/private/mobile/subscriptions/owner/status'].post;assert.equal(status.requestBody.content['application/json'].schema.additionalProperties,false);
  assert.deepEqual(status.requestBody.content['application/json'].schema.required,['id','status']);
  assert.deepEqual(status.requestBody.content['application/json'].schema.properties.status.enum,['ACTIVE','PAUSED','CANCELLED','ARCHIVED']);
  assert.deepEqual(status.responses['200'].content['application/json'].schema.required,['id','status']);
  assert.match(status.description,/Idempotency-Key is forbidden; no replay guarantee/);assert.match(status.description,/no provider cancellation or hard deletion/);
  for(const operation of [edit,status]){assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const,'no-store');assert.equal(operation.responses['200'].headers.Pragma.schema.const,'no-cache');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
