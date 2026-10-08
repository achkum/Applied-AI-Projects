import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const redocly = join(contractRoot, 'node_modules/.bin/redocly');
const source = join(contractRoot, 'openapi.yaml');

function bundle() {
  const dir = mkdtempSync(join(tmpdir(), 'st170a-contract-'));
  const output = join(dir, 'openapi.json');
  const result = spawnSync(redocly, ['bundle', source, '--output', output, '--dereferenced'], {
    cwd: contractRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { dir, document: JSON.parse(readFileSync(output, 'utf8')) };
}

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
      'GET /v1/version',
      'PATCH /v1/privacy/open-book',
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
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item).filter(([method]) => method.toLowerCase() === 'post')
        .map(([method, operation]) => [path, method, operation]),
    ).filter(([path]) => path.startsWith('/v2/'));
    assert.equal(operations.length, 7);
    for (const [path, , operation] of operations) {
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
    assert.match(document.components.parameters.SessionCsrf.description, /separate from browser nonce/i);
    for (const path of ['/v2/auth/otp/start', '/v2/auth/otp/verify']) {
      assert.ok(document.paths[path].post.responses['200'] || document.paths[path].post.responses['202']);
    }
    assert.ok(document.components.schemas.OtpStartResponse.properties.nextBrowserNonce);
    assert.ok(document.components.schemas.OtpVerifyResponse.properties.nextBrowserNonce);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v2 POST recovery contract stays generic and explains restart after reference resolution', () => {
  const { dir, document } = bundle();
  try {
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item).filter(([method]) => method.toLowerCase() === 'post')
        .map(([method, operation]) => [path, method, operation]),
    ).filter(([path]) => path.startsWith('/v2/'));
    assert.equal(operations.length, 7);
    for (const [path, , operation] of operations) {
      const response = operation.responses['409'];
      assert.ok(response, `${path} documents generic duplicate handling`);
      assert.match(response.description, /generic/i, `${path} keeps the conflict generic`);
      assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
      assert.equal(response.headers.Pragma.schema.const, 'no-cache');
      assert.equal(response.content['application/problem+json'].schema.allOf.find((part) => part.properties?.code).properties.code.type, 'string');
      assert.match(operation.description ?? '', /AUTH_RESTART_REQUIRED/);
      assert.match(operation.description ?? '', /fresh|discard/i,
        `${path} describes a recovery action`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
