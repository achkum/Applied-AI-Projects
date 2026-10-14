import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { probeResult, identifierProbes } from './private-runtime-identifier-probe.mjs';

const labels = {
  MAESTRO_REQUEST_UNAVAILABLE: 'Could not continue. Restart verification.',
  MAESTRO_IDENTIFIER_LOADING: 'Please wait…',
  MAESTRO_EMAIL_LABEL: 'Email address',
  MAESTRO_OTP_LABEL: 'Verification code',
};
const negative = 'Assert that "Verification code" is visible... FAILED\nAssertion is false: "Verification code" is visible\n';
const result = (overrides = {}) => probeResult({ exitCode: 1, timedOut: false, log: negative, ...overrides });

test('only completed success or exact clean assertion-negative are observations', () => {
  assert.equal(result({ exitCode: 0, log: 'Assert that private-canary is visible COMPLETED' }), 'visible');
  assert.equal(result(), 'not-confirmed');
  assert.equal(result({ log: `\u001b[31m${negative}\u001b[0m` }), 'not-confirmed');
  const cases = [
    [{ timedOut: true }, 'timeout'], [{ exitCode: null }, 'launch-error'],
    [{ log: null }, 'negative-unparsed'], [{ log: 'x'.repeat(4_000_001) }, 'negative-unparsed'],
    [{ exitCode: 2 }, 'exit-other'], [{ exitCode: 124 }, 'exit-other'], [{ exitCode: 137 }, 'exit-other'],
    [{ log: '' }, 'negative-unparsed'],
    [{ log: 'Other FAILED\nAssertion is false: x is visible' }, 'negative-unparsed'],
    [{ log: 'Assert that x is visible FAILED\nunknown failure' }, 'negative-unparsed'],
    ...['Connection refused', 'Unable to parse configuration', 'No devices found', 'Failed to launch', 'Permission denied', 'unknown private-canary'].map(line => [{ log: `${negative}${line}` }, 'negative-unparsed']),
  ];
  for (const [overrides, category] of cases) assert.equal(result(overrides), category);
});

test('only exact failed identifier phase and strict issuance boolean with all trusted labels can run probes', async () => {
  const run = () => { throw new Error('Must not run'); };
  for (const overrides of [
    { phase: 'flow-enroll-add' }, { issued: null }, { issued: 'true' },
    { labels: null }, { labels: {} },
    { labels: { ...labels, MAESTRO_OTP_LABEL: '' } },
    { labels: { ...labels, MAESTRO_EMAIL_LABEL: 42 } },
  ]) assert.equal(await identifierProbes({ phase: 'flow-identifier', issued: true, labels, run, ...overrides }), null);
});

test('fixed sequential roster, inconclusive child errors, and private data never leave output', async () => {
  const calls = [];
  let active = false;
  const observations = await identifierProbes({
    phase: 'flow-identifier', issued: false, labels,
    run: async (name, label) => {
      assert.equal(active, false);
      active = true;
      calls.push([name, label]);
      await Promise.resolve();
      active = false;
      if (name === 'loading') throw Error('Bearer private-canary');
      if (name === 'request-unavailable') return { exitCode: 0, timedOut: false, log: 'person@example.test 123456' };
      if (name === 'email-field') return { exitCode: 124, timedOut: true, log: 'private-canary' };
      return { exitCode: 1, timedOut: false, log: negative };
    },
  });
  assert.deepEqual(calls, [
    ['request-unavailable', labels.MAESTRO_REQUEST_UNAVAILABLE],
    ['loading', labels.MAESTRO_IDENTIFIER_LOADING],
    ['email-field', labels.MAESTRO_EMAIL_LABEL],
    ['otp-field', labels.MAESTRO_OTP_LABEL],
  ]);
  assert.deepEqual(observations, { 'request-unavailable': 'visible', loading: 'launch-error', 'email-field': 'timeout', 'otp-field': 'not-confirmed' });
  assert.equal(/private-canary|123456|person@example/.test(JSON.stringify(observations)), false);
});

test('runtime integration uses only bounded read-only probe and retains failure cleanup', () => {
  const yaml = readFileSync(new URL('../e2e/private-runtime-identifier-probe.yaml', import.meta.url), 'utf8');
  assert.equal(yaml.replace(/\r\n/g, '\n'), 'appId: se.subtrack.app\n---\n- assertVisible: ${MAESTRO_IDENTIFIER_PROBE_LABEL}\n');
  const source = readFileSync(new URL('./private-runtime-device.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("spawn('timeout', ["));
  assert.ok(source.includes("'--signal=TERM', '--kill-after=5s', '20s'"));
  assert.ok(source.includes('const syntheticOtpIssued = code !== null;'));
  assert.ok(source.includes('issued: syntheticOtpIssued'));
  assert.ok(source.includes('harness.otpStartObservation()'));
  const addFlow = readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml', import.meta.url), 'utf8');
  assert.ok(addFlow.includes('- tapOn: ${MAESTRO_SAVE_SUBSCRIPTION}\n- scrollUntilVisible:\n    element: ${MAESTRO_PERSONAL_TITLE}\n    direction: UP\n- extendedWaitUntil:\n    visible: ${MAESTRO_SAVED}\n    timeout: 30000'));
  assert.equal(addFlow.match(/tapOn: \$\{MAESTRO_SAVE_SUBSCRIPTION\}/g).length, 1);
  assert.ok(source.includes('process.exitCode = 1;'));
  assert.ok(source.includes('await harness.dispose();'));
});
