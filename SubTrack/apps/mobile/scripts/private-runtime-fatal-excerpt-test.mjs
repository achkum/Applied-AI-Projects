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
// Synthetic invalid envelope: construct markers so secret scanners do not
// mistake the checked-in canary for a real private key. Runtime assertions
// still exercise the exact complete and truncated PEM marker strings.
const pemBegin = ['-----BEGIN', ' PRIVATE KEY-----'].join('');
const pemEnd = ['-----END', ' PRIVATE KEY-----'].join('');
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
    ['privateKey', `${pemBegin}\nprivate-pem-canary\n${pemEnd}`],
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
    phaseJson:'{"phase":"prebuild","exitCode":1}',
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
    `${pemBegin}\ntruncated-pem-canary`,
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
test('structured CocoaPods JSON failure wins over support footer without broadening selection', () => {
  const result = excerpt({
    phaseJson,
    log: [
      '[!] Oh no, an error occurred.',
      'Search for existing GitHub issues similar to yours:',
      'https://private-support.invalid/path',
      '### Error',
      '\u001b[31mJSON::ParserError - unexpected token at owner-canary-password\u001b[0m',
      '/private/canary/cdn_source.rb:123:in parse',
    ].join('\n'),
  });
  assert.equal(result.withheld, null);
  assert.match(result.lines[0], /^JSON::ParserError/);
  assert.ok(!result.lines.join('\n').includes('Search for existing'));
  assert.ok(!JSON.stringify(result).includes('owner-canary-password'));
  assert.ok(!JSON.stringify(result).includes('/private/canary'));
  for (const log of [
    'private-canary JSON::ParserError',
    'JSON::ParserErrorPrivateCanary: unknown',
    'normal compiler tail private-canary',
  ])
    assert.equal(excerpt({ log }).withheld, 'fatal-block-unavailable');
});

test('C21 scoped CocoaPods structured fatal beats footer, preserves redaction and excludes subsequent issue context',()=>{
 for(const fatal of ['RuntimeError: owner-canary-password','Error parsing JSON: owner-canary-password','unexpected token at owner-canary-password']){
 const result=excerpt({phaseJson,log:`[!] Oh no, an error occurred.\nSearch for existing GitHub issues similar to yours:\n### Error\n\`\`\`ruby\n${fatal}\n/private/canary/source.rb:12\n\`\`\`\nprivate-canary support issue title`});
 assert.equal(result.withheld,null);assert.ok(result.lines[0].includes('[secret]'));assert.equal(JSON.stringify(result).includes('owner-canary-password'),false);assert.equal(JSON.stringify(result).includes('/private/canary'),false);assert.equal(JSON.stringify(result).includes('support issue'),false);
 }
 for(const phase of ['prebuild','android-compile','ios-compile']){
 const result=excerpt({phaseJson:JSON.stringify({phase,exitCode:1}),log:'[!] Original fatal\n### Error\nRuntimeError: should not replace original'});assert.equal(result.lines[0],'[!] Original fatal');
 }
 const unknown=excerpt({log:'### Error\nUnknownPrivateError: private-canary'});assert.equal(unknown.withheld,'fatal-block-unavailable');
});

test('non-Pods legacy JSON fatal still outranks original generic header',()=>{
 const result=excerpt({phaseJson:'{"phase":"prebuild","exitCode":1}',log:'[!] Original support\nJSON::ParserError: invalid\nSpecific failure'});assert.equal(result.lines[0],'JSON::ParserError: invalid');
});

test('validated ios-pods footer-only or generic report never falls back to full-log excerpt',()=>{
 for(const log of ['[!] Oh no, an error occurred.\nSearch for existing GitHub issues similar to yours:\nIssue title JSON parse invalid','[!] Fatal: private-canary','### Error\nUnknownPrivateError: private-canary']){const result=excerpt({phaseJson,log});assert.equal(result.withheld,'fatal-block-unavailable');assert.deepEqual(result.lines,[]);}
});
