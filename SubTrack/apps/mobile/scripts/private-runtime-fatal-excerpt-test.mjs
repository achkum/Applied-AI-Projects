import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  failingBuildLog,
  fixtureDiagnosticSecrets,
  fatalBuildExcerpt,
} from './private-runtime-fatal-excerpt.mjs';

const phaseJson = '{"phase":"ios-pods","exitCode":1}';
const config = {
  ownerPassword: 'owner-canary-password',
  actorPassword: 'actor-canary-password',
};
function bundle() {
  return Object.fromEntries([
    ...[
      'otp',
      'rate',
      'idempotency',
      'anonymous',
      'subject',
      'person',
      'simulator',
      'credential',
    ].map((key, i) => [key, String(i + 1).repeat(64)]),
    [
      'privateKey',
      '-----BEGIN PRIVATE KEY-----\nprivate-pem-canary\n-----END PRIVATE KEY-----',
    ],
    [
      'nested',
      {
        extra: ['nested-secret-canary'],
        number: 1,
        enabled: true,
        absent: null,
      },
    ],
  ]);
}
function excerpt(overrides = {}) {
  return fatalBuildExcerpt({
    nativeBuild: true,
    phaseJson,
    log: '[!] Fatal build failure',
    secrets: fixtureDiagnosticSecrets(config, bundle()),
    ...overrides,
  });
}

test('validated phase selects only a fixed failing compiler/Pods child log', () => {
  for (const [phase, file] of [
    ['prebuild', 'prebuild.log'],
    ['android-compile', 'build.log'],
    ['android-install', 'install.log'],
    ['ios-pods', 'pods.log'],
    ['ios-compile', 'build.log'],
  ])
    assert.equal(failingBuildLog(JSON.stringify({ phase, exitCode: 1 })), file);
  for (const value of [
    'bad-json',
    'null',
    '{}',
    '{"phase":"ios-pods","exitCode":0}',
    '{"phase":"ios-pods","exitCode":256}',
    '{"phase":"ios-pods","exitCode":1.5}',
    '{"phase":"ios-pods","exitCode":"1"}',
    '{"phase":"ios-pods","exitCode":1,"extra":"private"}',
    '{"phase":"flow-enroll-add","exitCode":1}',
    '{"phase":"metro","exitCode":1}',
    '{"phase":"__proto__","exitCode":1}',
  ])
    assert.equal(failingBuildLog(value), null);
});

test('actual owner/actor passwords and recursively collected key bundle are mandatory', () => {
  const secrets = fixtureDiagnosticSecrets(config, bundle());
  assert.ok(secrets.includes(config.ownerPassword));
  assert.ok(secrets.includes(config.actorPassword));
  assert.ok(secrets.includes('nested-secret-canary'));
  for (const [c, b] of [
    [null, bundle()],
    [config, null],
    [config, []],
    [{ ...config, ownerPassword: 1 }, bundle()],
    [{ ...config, ownerPassword: 'short' }, bundle()],
    [{ ...config, actorPassword: 1 }, bundle()],
    [{ ...config, actorPassword: 'short' }, bundle()],
    [config, { ...bundle(), privateKey: 1 }],
    [config, { ...bundle(), privateKey: 'wrong' }],
    [config, { ...bundle(), otp: 1 }],
    [config, { ...bundle(), otp: 'short' }],
    [config, { ...bundle(), nested: '' }],
    [config, { ...bundle(), nested: undefined }],
    [config, { ...bundle(), nested: () => 0 }],
  ])
    assert.equal(fixtureDiagnosticSecrets(c, b), null);
  const cyclic = bundle();
  cyclic.nested = cyclic;
  assert.equal(fixtureDiagnosticSecrets(config, cyclic), null);
});

test('secrets and credential/PEM/email/URL/path/opaque forms never survive', () => {
  const privateBundle = bundle();
  const secrets = fixtureDiagnosticSecrets(config, privateBundle);
  const canaries = [
    config.ownerPassword,
    config.actorPassword,
    ...Object.values(privateBundle).filter((v) => typeof v === 'string'),
    'nested-secret-canary',
    'bearer-canary',
    'basic-canary',
    'access-canary',
    'refresh-canary',
    'proof-canary',
    'password-canary',
    'ghp_github-canary',
    'github_pat_githubcanary',
    'private.email@example.invalid',
    'https://private.invalid/path',
    'C:\\private-canary\\file',
    '/private-canary/file',
    'opaqueCanaryValue01234567890123456789',
  ];
  // Test each separately so a PEM block cannot hide a later coverage failure.
  const inputs = [
    config.ownerPassword,
    config.actorPassword,
    privateBundle.otp,
    'nested-secret-canary',
    privateBundle.privateKey,
    '-----BEGIN PRIVATE KEY-----\ntruncated-pem-canary',
    'Bearer bearer-canary',
    'Basic basic-canary',
    'access_token="access-canary"',
    "refreshToken='refresh-canary'",
    'proof=proof-canary',
    'password:password-canary',
    'ghp_githubcanary',
    'github_pat_githubcanary',
    'private.email@example.invalid',
    'https://private.invalid/path',
    'C:\\private-canary\\file',
    '/private-canary/file',
    'opaqueCanaryValue01234567890123456789',
  ];
  for (const value of inputs) {
    const result = excerpt({ log: `[!] Fatal: ${value}`, secrets });
    for (const canary of [
      ...canaries,
      'truncated-pem-canary',
      'ghp_githubcanary',
    ])
      assert.ok(!JSON.stringify(result).includes(canary), canary);
  }
  assert.ok(
    !JSON.stringify(
      excerpt({ log: '\u001b[31m[!] Fatal:\u001b[0m é\u0000' }),
    ).includes('\u001b'),
  );
  for (const value of [
    "loginProof='short-canary'",
    'enrollment_proof=short-canary',
    'mobile-proof=short-canary',
    '"/private space/short-canary"',
    "'C:\\private space\\short-canary'",
    '/private space/short-canary',
    'C:\\private space\\short-canary',
    '\\\\server\\private space\\short-canary',
  ])
    assert.ok(
      !JSON.stringify(excerpt({ log: `[!] Fatal: ${value}` })).includes(
        'short-canary',
      ),
    );
});

test('positive fatal selection is capped, no tail fallback, unrelated or unavailable input fails closed', () => {
  assert.equal(excerpt({ nativeBuild: false }).withheld, 'outside-build');
  assert.equal(
    excerpt({ phaseJson: '{}' }).withheld,
    'unsupported-build-phase',
  );
  for (const secrets of [null, [], [null], ['']])
    assert.equal(excerpt({ secrets }).withheld, 'secret-input-unavailable');
  for (const log of [null, 'x'.repeat(4_000_001)])
    assert.equal(excerpt({ log }).withheld, 'child-log-unavailable');
  assert.equal(
    excerpt({ log: 'private tail without a fatal marker' }).withheld,
    'fatal-block-unavailable',
  );
  assert.equal(
    excerpt({ log: '[!] Fatal: /private/value', secrets: ['path'] }).withheld,
    'redaction-check-failed',
  );
  for (const marker of [
    '* What went wrong:',
    '[!] Fatal',
    'error: Failed',
    'fatal error: Failed',
    'FAILURE: Build failed',
    'JSON::ParserError',
  ]) {
    const result = excerpt({
      log: `unrelated private preface\n${marker}\nSpecific failure\n* Try:\nprivate tail`,
    });
    assert.equal(result.withheld, null);
    assert.ok(!result.lines.join('\n').includes('private'));
    assert.ok(result.lines.includes('Specific failure'));
  }
  const capped = excerpt({
    log:
      '[!] Fatal\n' + Array(20).fill('ordinary words '.repeat(40)).join('\n'),
  });
  assert.ok(capped.lines.length <= 12);
  assert.ok(capped.lines.every((line) => line.length <= 240));
  assert.ok(capped.lines.reduce((sum, line) => sum + line.length, 0) <= 1800);
});
