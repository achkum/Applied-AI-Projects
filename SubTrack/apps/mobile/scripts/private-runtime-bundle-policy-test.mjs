import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  staticBundleArguments,
  staticBundleEnvironment,
  graphFailureCategory,
  graphStatus,
  ownedGraphCertificateContext,
  boundedBundleChild,
} from './private-runtime-bundle-policy.mjs';
const versions = { native: '0.74.5', babel: '11.0.15' };
test('graph child preserves existing fixture proof and real CA context', () => {
  const original = {
    CI: 'true',
    SUBTRACK_PRIVATE_FIXTURE_CONFIG: '/private/config.json',
    SUBTRACK_PRIVATE_CA_CERT: '/private/ca.crt',
    SUBTRACK_PRIVATE_DEVICE_PROOF: 'true',
    NODE_OPTIONS: '--stack-trace-limit=10',
  };
  const child = staticBundleEnvironment(original, '/private/loopback.mjs');
  assert.equal(child.SUBTRACK_PRIVATE_DEVICE_PROOF, 'true');
  assert.equal(original.SUBTRACK_PRIVATE_DEVICE_PROOF, 'true');
  assert.equal(
    child.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL,
    'https://localhost:3443',
  );
  assert.equal(
    child.NODE_OPTIONS,
    '--stack-trace-limit=10 --import=/private/loopback.mjs',
  );
  assert.equal(
    staticBundleEnvironment(
      { ...original, NODE_OPTIONS: undefined },
      '/private/loopback.mjs',
    ).NODE_OPTIONS,
    ' --import=/private/loopback.mjs',
  );
  for (const patch of [
    { CI: 'false' },
    { SUBTRACK_PRIVATE_DEVICE_PROOF: 'false' },
    { SUBTRACK_PRIVATE_FIXTURE_CONFIG: '' },
    { SUBTRACK_PRIVATE_CA_CERT: '' },
  ])
    assert.throws(
      () =>
        staticBundleEnvironment(
          { ...original, ...patch },
          '/private/loopback.mjs',
        ),
      /Owned graph context required/,
    );
});
test('actual certificate metadata rejects readable config, changed CA or key material', () => {
  const facts = {
    configMode: 0o600,
    configVersion: 1,
    caPathsMatch: true,
    publicCa: true,
    privateKeyPresent: false,
  };
  assert.equal(ownedGraphCertificateContext(facts), true);
  for (const patch of [
    { configMode: undefined },
    { configMode: -1 },
    { configMode: 0o644 },
    { configVersion: 2 },
    { caPathsMatch: false },
    { publicCa: false },
    { privateKeyPresent: true },
  ])
    assert.equal(ownedGraphCertificateContext({ ...facts, ...patch }), false);
});
test('compiler/receipt diagnostics emit only fixed enums; malformed/injected/duplicate input withholds', () => {
  for (const [log, category] of [
    ['Unable to resolve module private-canary', 'module-resolution'],
    ['SyntaxError private-canary', 'syntax-transform'],
    ['ENOENT private-canary', 'asset-io'],
    ['EADDRINUSE private-canary', 'loopback-port-in-use'],
    ['ECONNREFUSED private-canary', 'connection-refused'],
    ['private-canary', 'withheld'],
  ])
    assert.equal(graphFailureCategory(log), category);
  const receipt =
    'ST244_JS platform=ios result=compiler-failed category=syntax-transform';
  assert.deepEqual(graphStatus(receipt, 'ios'), {
    result: 'compiler-failed',
    category: 'syntax-transform',
  });
  assert.deepEqual(
    graphStatus(
      'ST244_JS result=private-cleanup-failed category=withheld',
      'ios',
    ),
    { result: 'private-cleanup-failed', category: 'withheld' },
  );
  for (const [text, platform] of [
    [null, 'ios'],
    [receipt, 'web'],
    [receipt, 'android'],
    ['unknown', 'ios'],
    [receipt + '\n' + receipt, 'ios'],
    ['ST244_JS platform=ios result=private-canary category=none', 'ios'],
    [
      'ST244_JS platform=ios result=compiler-failed category=private-canary',
      'ios',
    ],
  ])
    assert.equal(graphStatus(text, platform), null);
});
test('static dev graph plan preserves exact platforms/SDK pins/options', () => {
  for (const platform of ['ios', 'android'])
    assert.deepEqual(
      staticBundleArguments(platform, versions, '/private/export'),
      [
        'export',
        '--platform',
        platform,
        '--dev',
        '--no-minify',
        '--no-bytecode',
        '--max-workers',
        '2',
        '--output-dir',
        '/private/export',
      ],
    );
  for (const args of [
    ['web', versions, 'out'],
    ['ios', null, 'out'],
    ['ios', { native: '0.74.0', babel: '11.0.15' }, 'out'],
    ['ios', { native: '0.74.5', babel: '10.0.2' }, 'out'],
    ['ios', versions, null],
    ['ios', versions, ''],
  ])
    assert.throws(
      () => staticBundleArguments(...args),
      /Static bundle policy rejected/,
    );
});
function harness(signalResult = true) {
  const child = new EventEmitter(),
    timers = [],
    cancelled = [],
    signals = [];
  const done = boundedBundleChild(child, {
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    cancel: (id) => cancelled.push(id),
    signal: (kind) => {
      signals.push(kind);
      return signalResult;
    },
  });
  return { child, timers, cancelled, signals, done };
}
test('normal success/failure/start-error exits cancel deadline; late callbacks cannot kill a new process', async () => {
  for (const [event, value, result] of [
    ['exit', 0, 'passed'],
    ['exit', 1, 'compiler-failed'],
    ['error', new Error('private-canary'), 'child-start-failed'],
  ]) {
    const h = harness();
    assert.equal(h.timers[0].ms, 600000);
    h.child.emit(event, value);
    assert.equal(await h.done, result);
    h.timers[0].fn();
    h.child.emit('exit', 1);
    assert.deepEqual(h.signals, []);
    assert.deepEqual(h.cancelled, [0]);
  }
});
test('deadline TERM then bounded KILL only while same child active; outcome cannot be success', async () => {
  const h = harness();
  h.timers[0].fn();
  assert.equal(h.timers[1].ms, 15000);
  assert.deepEqual(h.signals, ['SIGTERM']);
  h.timers[1].fn();
  assert.deepEqual(h.signals, ['SIGTERM', 'SIGKILL']);
  h.child.emit('exit', 0);
  assert.equal(await h.done, 'deadline');
  h.timers[1].fn();
  assert.deepEqual(h.signals, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(h.cancelled, [0, 1]);
  const failed = harness(false);
  failed.timers[0].fn();
  assert.equal(await failed.done, 'child-stop-failed');
  failed.timers[1].fn();
  assert.deepEqual(failed.signals, ['SIGTERM']);
});
test('interrupt triggers owned bounded cleanup and a later deadline cannot resignal', async () => {
  const h = harness();
  h.child.emit('proof-abort');
  h.timers[0].fn();
  assert.deepEqual(h.signals, ['SIGTERM']);
  h.child.emit('exit', 0);
  assert.equal(await h.done, 'interrupted');
});
