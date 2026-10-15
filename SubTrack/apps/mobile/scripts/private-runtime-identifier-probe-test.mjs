import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { probeResult, identifierProbes } from './private-runtime-identifier-probe.mjs';
test('identifier navigation waits for the actual input and requires enabled Continue before one tap',()=>{
  for(const name of ['identifier','identifier-android']){
    const flow=readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8');
    assert.match(flow,/visible: \$\{MAESTRO_CREATE_ACCOUNT\}\r?\n {4}timeout: 120000/);
    assert.match(flow,/- tapOn: \$\{MAESTRO_CREATE_ACCOUNT\}\r?\n- extendedWaitUntil:\r?\n {4}visible:\r?\n {6}id: native-identifier-input\r?\n {4}timeout: 30000\r?\n- tapOn:\r?\n {4}id: native-identifier-input\r?\n- inputText: [^\r\n]+\r?\n- hideKeyboard\r?\n- assertVisible:\r?\n {4}text: \$\{MAESTRO_CONTINUE\}\r?\n {4}enabled: true\r?\n- tapOn: \$\{MAESTRO_CONTINUE\}/);
    assert.equal(flow.match(/- tapOn: \$\{MAESTRO_CREATE_ACCOUNT\}/g).length,1);assert.equal(flow.match(/- tapOn: \$\{MAESTRO_CONTINUE\}/g).length,1);
    assert.match(flow,/visible: \$\{MAESTRO_OTP_LABEL\}\r?\n {4}timeout: 30000/);
  }
  const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');assert.ok(driver.includes('email: labels.MAESTRO_EMAIL_LABEL,'));
});
test('editable native flow targets select fixed input IDs while keeping single actions and visible acceptance',()=>{
  const read=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  for(const name of ['identifier','identifier-android']){const flow=read(name);assert.equal(flow.match(/- tapOn:\n {4}id: native-identifier-input/g).length,1);assert.equal(flow.includes('- tapOn: ${MAESTRO_EMAIL_LABEL}'),false);assert.ok(flow.includes('visible: ${MAESTRO_CREATE_ACCOUNT}'));assert.ok(flow.includes('visible: ${MAESTRO_OTP_LABEL}\n    timeout: 30000'));assert.equal(flow.match(/^- inputText:/gm).length,1);}
  const add=read('enroll-add');for(const id of ['native-registration-otp','native-profile-name','native-subscription-name','native-subscription-amount','native-subscription-date'])assert.equal(add.split(`- tapOn:\n    id: ${id}`).length-1,1);
  for(const id of ['native-subscription-name','native-subscription-amount','native-subscription-date'])assert.ok(add.includes(`element:\n      id: ${id}\n    direction: DOWN`));
  assert.ok(add.includes('visible: ${MAESTRO_PROFILE_NAME}\n    timeout: 30000'));assert.equal(add.match(/^- inputText:/gm).length,5);
  const edit=read('edit-status');for(const id of ['native-subscription-name','native-subscription-date']){assert.equal(edit.split(`- tapOn:\n    id: ${id}`).length-1,1);assert.ok(edit.includes(`element:\n      id: ${id}\n    direction: DOWN`));}assert.equal(edit.match(/^- inputText:/gm).length,1);assert.ok(edit.includes('visible: ${MAESTRO_EDIT_SAVED}\n    timeout: 30000'));
  for(const [flow,names] of [[add,['MAESTRO_OTP_LABEL','MAESTRO_PROFILE_NAME','MAESTRO_SUBSCRIPTION_NAME','MAESTRO_AMOUNT','MAESTRO_DATE']],[edit,['MAESTRO_SUBSCRIPTION_NAME','MAESTRO_DATE']]])for(const name of names)assert.equal(flow.includes(`- tapOn: \u0024{${name}}`),false);
});

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
  const addFlow = readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml', import.meta.url), 'utf8').replace(/\r\n/g,'\n');
  assert.ok(addFlow.includes('- tapOn: ${MAESTRO_SAVE_SUBSCRIPTION}\n- scrollUntilVisible:\n    element:\n      id: native-personal-title\n    direction: UP\n- assertVisible:\n    id: native-personal-title\n    text: ${MAESTRO_PERSONAL_TITLE}\n- extendedWaitUntil:\n    visible: ${MAESTRO_SAVED}\n    timeout: 30000'));
  assert.equal(addFlow.match(/tapOn: \$\{MAESTRO_SAVE_SUBSCRIPTION\}/g).length, 1);
  assert.ok(source.includes('process.exitCode = 1;'));
  assert.ok(source.includes('await harness.dispose();'));
});

test('authoritative setup hands off through Month and real Manage before the unchanged mandatory Add',()=>{
 const read=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');const add=read('enroll-add');
 assert.ok(add.includes('- tapOn: ${MAESTRO_JUST_ME}\n- extendedWaitUntil:\n    visible: ${MAESTRO_MONTH_TITLE}\n    timeout: 30000\n- tapOn: ${MAESTRO_MANAGE}\n- extendedWaitUntil:\n    visible:\n      id: native-personal-title\n      text: ${MAESTRO_PERSONAL_TITLE}\n    timeout: 30000\n- scrollUntilVisible:\n    element: ${MAESTRO_ADD}\n    direction: DOWN\n- extendedWaitUntil:\n    visible: ${MAESTRO_ADD}\n    timeout: 30000\n- tapOn: ${MAESTRO_ADD}'));
 assert.equal(add.split('- tapOn: ${MAESTRO_MANAGE}').length-1,1);assert.ok(add.includes('id: native-personal-title\n    text: ${MAESTRO_PROFILE_TITLE}'));
 assert.equal(read('save-header'),'appId: se.subtrack.app\n---\n- scrollUntilVisible:\n    element:\n      id: native-personal-title\n    direction: UP\n- assertVisible:\n    id: native-personal-title\n    text: ${MAESTRO_PERSONAL_TITLE}\n');
});

test('after create feedback at the exact header, persisted row below it is searched DOWN with original amount acceptance',()=>{
 const flow=readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.ok(flow.includes('text: ${MAESTRO_PERSONAL_TITLE}\n- extendedWaitUntil:\n    visible: ${MAESTRO_SAVED}\n    timeout: 30000\n- scrollUntilVisible:\n    element: Native restart proof\n    direction: DOWN\n- assertVisible: Native restart proof\n- assertVisible: ${MAESTRO_EXPECTED_AMOUNT}\n- takeScreenshot: accepted-add'));assert.equal(flow.split('- tapOn: ${MAESTRO_ADD}').length-1,1);assert.equal(flow.split('- tapOn: ${MAESTRO_SAVE_SUBSCRIPTION}').length-1,1);
});
