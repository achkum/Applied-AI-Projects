import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stages = [
  ['pending', 'admitV2WebEnrollment', '201', 'WebEnrollmentPendingRequest', 'WebEnrollmentPendingResponse', 'WebEnrollmentPendingCallEnvelope'],
  ['simulator/verify', 'verifyV2WebSimulatorEnrollment', '200', 'WebEnrollmentSimulatorRequest', 'WebEnrollmentSimulatorResponse', 'WebEnrollmentSimulatorCallEnvelope'],
  ['complete', 'completeV2WebEnrollment', '201', 'WebEnrollmentCompleteRequest', 'WebSessionResponse', 'WebEnrollmentCompleteCallEnvelope'],
];

function document() {
  const dir = mkdtempSync(join(tmpdir(), 'st229-contract-'));
  try {
    const out = join(dir, 'contract.json');
    const run = spawnSync(process.execPath, [join(root, 'node_modules/@redocly/cli/bin/cli.js'),
      'bundle', join(root, 'openapi.yaml'), '--output', out, '--dereferenced'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('private enrollment operations expose exact authority, statuses and no-store projections', () => {
  const doc = document();
  for (const [path, id, status, requestName, responseName, envelope] of stages) {
    const op = doc.paths[`/v2/auth/enrollment/${path}`].post;
    assert.equal(op.operationId, id);
    assert.equal(op['x-runtime-availability'], 'unavailable-default');
    assert.deepEqual(op['x-wire-call-envelopes'], [envelope]);
    assert.deepEqual(op.security, []);
    assert.deepEqual(op.parameters.map((p) => [p.name, p.in, p.required]), [
      ['Idempotency-Key', 'header', true], ['Origin', 'header', true], ['X-Browser-Nonce', 'header', true],
    ]);
    assert.equal(op.parameters[0].schema.pattern, '^[\\x21-\\x7e]{16,255}$');
    assert.equal(op.parameters[2].schema.pattern, '^[A-Za-z0-9_-]{43}$');
    assert.equal(op.requestBody.required, true);
    assert.deepEqual(op.requestBody.content['application/json'].schema, doc.components.schemas[requestName]);
    assert.deepEqual(op.responses[status].content['application/json'].schema, doc.components.schemas[responseName]);
    assert.deepEqual(Object.keys(op.responses).sort(), ['400', '401', '403', '404', '409', '429', '500', status].sort());
    for (const [code, response] of Object.entries(op.responses)) {
      assert.equal(response.headers['Cache-Control'].required, true);
      assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
      assert.equal(response.headers.Pragma.required, true);
      assert.equal(response.headers.Pragma.schema.const, 'no-cache');
      if (code !== status) {
        const problem = response.content['application/problem+json'].schema;
        assert.deepEqual(problem.oneOf.map((p) => p.properties.status.const), [400, 401, 403, 404, 409, 429, 500]);
        for (const branch of problem.oneOf) {
          assert.equal(branch.additionalProperties, false);
          assert.deepEqual(branch.required, ['type', 'title', 'status', 'code']);
          assert.deepEqual(Object.keys(branch.properties), ['type', 'title', 'status', 'code']);
          assert.equal(branch.properties.type.const, 'about:blank');
          assert.equal(branch.properties.title.const, 'Authentication unavailable');
        }
        assert.equal(response.headers['Set-Cookie'], undefined);
      }
    }
    assert.match(op.description, /private development HTTPS web/);
    assert.match(op.description, /AUTH_RESTART_REQUIRED/);
    assert.match(op.description, /never replay|never replays/);
    assert.match(op.description, /fresh verified login/);
  }
  const complete = doc.paths['/v2/auth/enrollment/complete'].post;
  assert.match(complete.responses['201'].headers['Set-Cookie'].description, /postcommit/);
  assert.match(complete.responses['201'].headers['Set-Cookie'].description, /st_v2_access Path=\/v2/);
  assert.match(complete.responses['201'].headers['Set-Cookie'].description, /st_v2_refresh Path=\/v2\/auth/);
  assert.match(complete.responses['201'].headers['Set-Cookie'].description, /Secure; HttpOnly; SameSite=Lax/);
  assert.match(complete.description, /ENROLLMENT_LOGIN_REQUIRED/);
  assert.match(complete.description, /No successor nonce/);
  assert.match(doc.components.schemas.WebEnrollmentHeaders.description, /duplicate\/framing/);
  assert.match(doc.components.schemas.WebEnrollmentHeaders.description, /Authorization/);
  assert.match(doc.components.schemas.WebEnrollmentCookies.description, /never expose cookie to JavaScript/);
});

test('purpose and server prerequisites keep OTP, simulator authority and terminal session separate', () => {
  const doc = document();
  const pending = doc.paths['/v2/auth/enrollment/pending'].post.description;
  const verify = doc.paths['/v2/auth/enrollment/simulator/verify'].post.description;
  const complete = doc.paths['/v2/auth/enrollment/complete'].post.description;
  assert.match(pending, /enrollment\/enroll-credential/);
  assert.match(pending, /OTP never establishes login/);
  assert.match(pending, /future prerequisites/);
  assert.match(verify, /outside account locks/);
  assert.match(verify, /after awaits/);
  assert.match(verify, /separate authoritative one-use/);
  assert.match(verify, /SAME Origin\/chain\/binding cookie/);
  assert.match(verify, /cross-purpose transition is a future reviewed core prerequisite/);
  assert.match(verify, /cannot outlive pending expiry/);
  assert.match(complete, /terminally consume nonce and authoritative record/);
  assert.match(complete, /idempotency operation allowlist and async/);
  assert.match(complete, /security-reviewed gates/);
  assert.match(doc.paths['/v2/auth/session'].post.description, /OTP enrollment and step-up proofs are not login proofs/);
  assert.deepEqual(doc.components.schemas.WebEnrollmentPendingRequest.required, ['transport', 'identifierProof']);
  assert.deepEqual(doc.components.schemas.WebEnrollmentSimulatorRequest.required, ['transport', 'continuation']);
  assert.deepEqual(doc.components.schemas.WebEnrollmentCompleteRequest.required, ['transport', 'verifiedEnrollment']);
});

test('generated enrollment validators reject mixed authority, selectors and handle domain confusion', () => {
  const script = `
    import assert from 'node:assert/strict';
    const z = await import(${JSON.stringify(new URL('../generated/zod.gen.ts', import.meta.url).href)});
    const nonce = 'a'.repeat(43);
    const headers = { idempotencyKey: '!'.repeat(16), origin: 'https://app.example.test', browserNonce: nonce };
    const cookies = { bindingCookie: nonce };
    const bodies = [
      ['WebEnrollmentPending', { transport: 'web', identifierProof: 'v2.' + nonce }],
      ['WebEnrollmentSimulator', { transport: 'web', continuation: 'wep.' + nonce }],
      ['WebEnrollmentComplete', { transport: 'web', verifiedEnrollment: 'wev.' + nonce }],
    ];
    for (const [name, body] of bodies) {
      const schema = z['z' + name + 'CallEnvelope'];
      const good = { transport: 'web', headers, cookies, body };
      assert.equal(schema.safeParse(good).success, true);
      for (const key of ['identityId', 'subject', 'providerResult', 'name', 'givenName', 'role', 'contact', 'challengeId', 'loginProof'])
        assert.equal(schema.safeParse({ ...good, body: { ...body, [key]: 'caller-selected' } }).success, false);
      for (const key of ['authorization', 'sessionCsrf', 'callerId'])
        assert.equal(schema.safeParse({ ...good, headers: { ...headers, [key]: 'extra' } }).success, false);
      for (const key of Object.keys(headers)) {
        const missing = { ...headers }; delete missing[key];
        assert.equal(schema.safeParse({ ...good, headers: missing }).success, false);
      }
      for (const key of ['accessCookie', 'refreshCookie'])
        assert.equal(schema.safeParse({ ...good, cookies: { ...cookies, [key]: nonce } }).success, false);
      for (const bad of [{}, { bindingCookie: nonce.slice(1) }, { bindingCookie: nonce + '=' }])
        assert.equal(schema.safeParse({ ...good, cookies: bad }).success, false);
      assert.equal(schema.safeParse({ ...good, transport: 'mobile' }).success, false);
      assert.equal(schema.safeParse({ ...good, body: { ...body, transport: 'mobile' } }).success, false);
      assert.equal(schema.safeParse({ ...good, query: {} }).success, false);
    }
    for (const bad of [' '.repeat(16), '!'.repeat(15), '!'.repeat(256), 'a'.repeat(15) + '\\n', 'é'.repeat(16)])
      assert.equal(z.zWebEnrollmentKey.safeParse(bad).success, false);
    for (const good of ['!'.repeat(16), '~'.repeat(255)]) assert.equal(z.zWebEnrollmentKey.safeParse(good).success, true);
    for (const [name, prefix] of [['WebEnrollmentIdentifierProof', 'v2.'], ['WebEnrollmentContinuation', 'wep.'], ['WebVerifiedEnrollment', 'wev.']]) {
      assert.equal(z['z' + name].safeParse(prefix + nonce).success, true);
      for (const other of ['v2.', 'wep.', 'wev.'].filter((v) => v !== prefix))
        assert.equal(z['z' + name].safeParse(other + nonce).success, false);
      assert.equal(z['z' + name].safeParse(prefix + nonce.slice(1)).success, false);
    }
    const pending = { transport: 'web', continuation: 'wep.' + nonce, status: 'pending', nextBrowserNonce: nonce };
    const verified = { transport: 'web', verifiedEnrollment: 'wev.' + nonce, status: 'verified', nextBrowserNonce: nonce };
    for (const [name, response] of [['WebEnrollmentPendingResponse', pending], ['WebEnrollmentSimulatorResponse', verified]]) {
      assert.equal(z['z' + name].safeParse(response).success, true);
      for (const extra of [{ accessToken: 'secret' }, { refreshToken: 'secret' }, { identityId: 'owner' }, { name: 'private' }])
        assert.equal(z['z' + name].safeParse({ ...response, ...extra }).success, false);
      assert.equal(z['z' + name].safeParse({ ...response, nextBrowserNonce: null }).success, false);
    }
    const session = { transport: 'web', sessionId: 'd9428888-122b-4f8c-9e33-71a48c10d25a', csrfToken: 'csrf' };
    assert.equal(z.zWebSessionResponse.safeParse(session).success, true);
    for (const extra of [{ accessToken: 'secret' }, { refreshToken: 'secret' }, { nextBrowserNonce: nonce }])
      assert.equal(z.zWebSessionResponse.safeParse({ ...session, ...extra }).success, false);
    const problem = { type: 'about:blank', title: 'Authentication unavailable', status: 409, code: 'AUTH_RESTART_REQUIRED' };
    assert.equal(z.zWebEnrollmentProblem.safeParse(problem).success, true);
    for (const extra of [{ detail: 'private' }, { instance: '/private' }, { contact: 'private' }])
      assert.equal(z.zWebEnrollmentProblem.safeParse({ ...problem, ...extra }).success, false);
    assert.equal(z.zWebEnrollmentProblem.safeParse({ ...problem, title: 'private' }).success, false);
    assert.equal(z.zWebEnrollmentProblem.safeParse({ ...problem, status: 400 }).success, false);
    const pairs = [[400, 'INVALID_ENROLLMENT_REQUEST'], [401, 'ENROLLMENT_AUTHORITY_INVALID'],
      [403, 'AUTH_ORIGIN_REJECTED'], [404, 'ENROLLMENT_UNAVAILABLE'], [409, 'AUTH_RESTART_REQUIRED'],
      [409, 'ENROLLMENT_LOGIN_REQUIRED'], [429, 'ENROLLMENT_RATE_LIMITED'], [500, 'INTERNAL_ERROR']];
    for (const [status, code] of pairs) {
      const valid = { ...problem, status, code };
      assert.equal(z.zWebEnrollmentProblem.safeParse(valid).success, true);
      assert.equal(z.zWebEnrollmentProblem.safeParse({ ...valid, detail: 'private' }).success, false);
      for (const [wrong] of pairs.filter(([other]) => other !== status))
        assert.equal(z.zWebEnrollmentProblem.safeParse({ ...valid, status: wrong }).success, false);
    }
  `;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const sdk = readFileSync(join(root, 'generated/sdk.gen.ts'), 'utf8');
  for (const [, id] of stages) assert.match(sdk, new RegExp(`export const ${id}\\b`));
});
