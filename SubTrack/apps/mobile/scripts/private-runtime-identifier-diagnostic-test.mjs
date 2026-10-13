import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identifierToolDiagnostic } from './private-runtime-identifier-diagnostic.mjs';
const labels = { createAccount: 'Create account', otp: 'Verification code' };
function classify(overrides = {}) {
  return identifierToolDiagnostic({
    phase: 'flow-identifier',
    identifier: '',
    metro: '',
    labels,
    ...overrides,
  });
}
test('only first-flow fixed child-tool inputs and valid trusted target inputs are accepted', () => {
  assert.equal(
    classify({ phase: 'flow-enroll-add' }).withheld,
    'outside-identifier',
  );
  for (const values of [
    { identifier: null },
    { metro: null },
    { identifier: 'x'.repeat(4_000_001) },
    { metro: 'x'.repeat(4_000_001) },
  ])
    assert.equal(classify(values).withheld, 'tool-input-unavailable');
  for (const value of [
    null,
    {},
    { createAccount: 1, otp: 'code' },
    { createAccount: '', otp: 'code' },
    { createAccount: 'account', otp: 1 },
    { createAccount: 'account', otp: '' },
  ])
    assert.equal(
      classify({ labels: value }).withheld,
      'trusted-target-unavailable',
    );
  assert.equal(
    classify({
      identifier: 'ordinary private-canary',
      metro: 'ordinary private-canary',
    }).withheld,
    'unknown-tool-diagnostic',
  );
});
test('failed commands/reasons/targets use fixed enums; no success-line target extraction', () => {
  const result = classify({
    identifier:
      'Launch app private-canary FAILED\nWait until Create account visible FAILED\nTap on private-canary FAILED\nInput text private-password-canary ERROR\nHide keyboard FAILED\nAssertion is false: Verification code\nElement private-canary not found\nFailed to launch private-canary\nNo devices found\nInvalid command private-canary\nConnection refused private-canary',
  });
  assert.deepEqual(result.commands, [
    'launch',
    'wait-visible',
    'tap',
    'input',
    'hide-keyboard',
  ]);
  assert.deepEqual(result.reasons, [
    'assertion',
    'element-not-found',
    'launch',
    'device-unavailable',
    'tool-config',
    'connection',
  ]);
  assert.deepEqual(result.targets, ['welcome-create-account', 'otp-field']);
  assert.ok(!JSON.stringify(result).includes('private-canary'));
  assert.deepEqual(
    classify({
      identifier:
        'Launch app COMPLETED\nWait until Create account visible COMPLETED\nAssertion is false: other',
    }).targets,
    [],
  );
  assert.deepEqual(
    classify({ identifier: '\u001b[31mLaunch app FAILED\u001b[0m' }).commands,
    ['launch'],
  );
});
test('Metro cause and exact known modules only; paths/private values/prefix lookalikes rejected', () => {
  const result = classify({
    metro:
      'Unable to resolve module "@subtrack/contracts" from /private-canary/file\nCannot find module `react-native`\nSyntaxError private-canary\nAsset private-canary not found\nECONNREFUSED private-canary\nUnable to resolve module "private-canary"\nCannot find module "react-native-private-canary"',
  });
  assert.deepEqual(result.metro, [
    'module-resolution',
    'syntax-transform',
    'asset',
    'connection',
  ]);
  assert.deepEqual(result.modules, ['@subtrack/contracts', 'react-native']);
  assert.ok(!JSON.stringify(result).includes('private-canary'));
  assert.deepEqual(
    classify({ metro: 'Unable to resolve module private-unquoted-canary' })
      .modules,
    [],
  );
  assert.deepEqual(
    classify({
      metro: 'ordinary "react-native"',
      identifier: 'Launch app FAILED',
    }).modules,
    [],
  );
  const roster = [
    'expo-router',
    'expo',
    'react',
    'react-native',
    '@babel/runtime',
    'expo-font',
    'expo-secure-store',
    'expo-crypto',
    '@subtrack/config',
  ];
  assert.equal(
    classify({
      metro: roster.map((name) => `Cannot find module "${name}"`).join('\n'),
    }).modules.length,
    8,
  );
});
test('adversarial credential and typed-value data never becomes output, even around known markers', () => {
  const canaries = [
    'owner-password-canary',
    'actor-password-canary',
    'otp-123456-canary',
    'Bearer secret-canary',
    'refresh_token=secret-canary',
    ['-----BEGIN', ' PRIVATE KEY-----\nprivate-key-canary'].join(''),
    'person@example.test',
    'https://private-canary.invalid',
    '/private-canary/file',
    'C:\\private-canary\\file',
    'longOpaqueSecretCanary012345678901234567',
  ];
  for (const value of canaries) {
    const result = classify({
      identifier: `Launch app FAILED ${value}\nWait until ${labels.createAccount} visible FAILED ${value}`,
      metro: `Cannot find module "${value}"`,
    });
    assert.ok(!JSON.stringify(result).includes(value));
    assert.ok(!JSON.stringify(result).includes('canary'));
  }
});
