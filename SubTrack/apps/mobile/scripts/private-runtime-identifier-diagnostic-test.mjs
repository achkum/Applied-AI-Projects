import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  identifierToolDiagnostic,
  enrollmentToolDiagnostic,
} from './private-runtime-identifier-diagnostic.mjs';
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
const enrollmentLabels = {
  otp: 'Verification code',
  verifyOtp: 'Verify code',
  verifyBankId: 'Verify with BankID',
  profileName: 'Profile name',
  saveProfile: 'Save profile',
  justMe: 'Just me',
  add: 'Add subscription',
  subscriptionName: 'Subscription name',
  category: 'Video streaming',
  amount: 'Amount in SEK',
  saveSubscription: 'Save',
  saved: 'Saved subscription',
};
function enrollment(overrides = {}) {
  return enrollmentToolDiagnostic({
    phase: 'flow-enroll-add',
    enrollment: '',
    metro: '',
    labels: enrollmentLabels,
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
test('enrollment phase and complete static catalog roster are mandatory', () => {
  assert.equal(
    enrollment({ phase: 'flow-restart' }).withheld,
    'outside-enrollment',
  );
  for (const value of [
    null,
    {},
    { ...enrollmentLabels, otp: 123456 },
    { ...enrollmentLabels, otp: '' },
  ])
    assert.equal(
      enrollment({ labels: value }).withheld,
      'trusted-target-unavailable',
    );
  assert.equal(
    enrollment({ enrollment: null }).withheld,
    'tool-input-unavailable',
  );
  assert.equal(
    enrollment({ enrollment: 'unrelated typed private-canary' }).withheld,
    'unknown-tool-diagnostic',
  );
});
test('enrollment projects only fixed targets/commands and longest known overlapping labels', () => {
  const result = enrollment({
    enrollment:
      Object.values(enrollmentLabels)
        .map((label) => `Wait until ${label} visible FAILED`)
        .join('\n') + '\nScroll until private-canary FAILED',
  });
  assert.deepEqual(result.targets, [
    'otp-field',
    'otp-verify',
    'bankid-verify',
    'profile-name',
    'profile-save',
    'just-me',
    'add-open',
    'subscription-name',
    'subscription-category',
    'subscription-amount',
    'subscription-save',
    'subscription-saved',
  ]);
  assert.deepEqual(result.commands, ['wait-visible', 'scroll']);
  assert.equal(JSON.stringify(result).includes('private-canary'), false);
  assert.deepEqual(
    enrollment({ enrollment: 'Tap on Save profile FAILED' }).targets,
    ['profile-save'],
  );
  assert.deepEqual(
    enrollment({ enrollment: 'Tap on Saved subscription FAILED' }).targets,
    ['subscription-saved'],
  );
  assert.deepEqual(
    enrollment({
      enrollment: 'Tap on Save profile COMPLETED\nInput text 123456 FAILED',
    }).targets,
    [],
  );
});
test('enrollment actual typed secrets and arbitrary module/context values never survive', () => {
  for (const secret of [
    '123456',
    'native-proof@example.test',
    'Synthetic Native Proof',
    'Native restart proof',
    '129.90',
    'owner-password-canary',
    'Bearer access-canary',
    'refresh_token=refresh-canary',
    'https://private-canary.invalid',
    '/private-canary/path',
  ]) {
    const result = enrollment({
      enrollment: `Input text ${secret} FAILED\nWait until Verify with BankID visible FAILED ${secret}`,
      metro: `Unable to resolve module "${secret}"`,
    });
    assert.equal(result.withheld, null);
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.ok(!JSON.stringify(result).includes('canary'));
  }
});
