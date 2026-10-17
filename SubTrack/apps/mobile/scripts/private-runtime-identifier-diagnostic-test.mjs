import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  identifierToolDiagnostic,
  restartToolDiagnostic,
  enrollmentToolDiagnostic,
  createEnrollmentExecution,
  enrollmentExecutionDiagnostic,
} from './private-runtime-identifier-diagnostic.mjs';
const labels = { createAccount: 'Create account', email: 'Email address', otp: 'Verification code' };
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
  date: 'Expected charge date (YYYY-MM-DD)',
  personalTitle: 'Your subscriptions',
  expectedAmount: 'Expected amount: 129,90\\s+SEK',
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
test('identifier email target accepts only the fixed input ID or literal trusted display label',()=>{
  for(const label of ['Email address','E-postadress','Email address (work)']){
    for(const text of [label,'native-identifier-input']){const result=classify({labels:{...labels,email:label},identifier:`Tap on "${text}" FAILED private-canary`});assert.deepEqual(result.targets,['email-field']);assert.equal(JSON.stringify(result).includes('private-canary'),false);assert.equal(JSON.stringify(result).includes('native-identifier-input'),false);}
    for(const text of [`${label}-private`,`private-${label}`,`${label}_private`])assert.deepEqual(classify({labels:{...labels,email:label},identifier:`Tap on "${text}" FAILED`}).targets,[]);
  }
  for(const text of ['native-identifier-input-private','private-native-identifier-input','native-identifier-input_private','native-unknown-input','Email addressPrivate'])assert.deepEqual(classify({identifier:`Tap on "${text}" FAILED`}).targets,[]);
  assert.deepEqual(classify({identifier:'Tap on native-identifier-input COMPLETED\nTap on unknown FAILED'}).targets,[]);
  assert.equal(classify({phase:'flow-enroll-add',identifier:'Tap on native-identifier-input FAILED'}).withheld,'outside-identifier');
  assert.equal(classify({identifier:'x'.repeat(4_000_001)+' native-identifier-input FAILED'}).withheld,'tool-input-unavailable');
});
test('fixed public editable IDs are aliases of existing targets only and reject token lookalikes',()=>{
  const aliases=[['native-registration-otp','otp-field'],['native-profile-name','profile-name'],['native-subscription-name','subscription-name'],['native-subscription-amount','subscription-amount'],['native-subscription-date','date-field']];
  for(const [id,target] of aliases){
    assert.deepEqual(enrollment({enrollment:`Tap on id: ${id} FAILED`}).targets,[target]);
    assert.deepEqual(enrollment({enrollment:`Scroll until id: "${id}" visible FAILED`}).targets,[target]);
    assert.deepEqual(enrollment({enrollment:`Tap on id: ${id} COMPLETED\nTap on unknown FAILED`}).targets,[]);
    for(const unknown of [`${id}-private`,`private-${id}`,`${id}_private`])assert.deepEqual(enrollment({enrollment:`Tap on id: ${unknown} FAILED`}).targets,[]);
  }
  assert.deepEqual(classify({identifier:'Tap on id: native-registration-otp FAILED'}).targets,['otp-field']);
  assert.deepEqual(classify({identifier:'Tap on id: native-identifier-input FAILED'}).targets,['email-field']);
  assert.equal(enrollment({phase:'flow-identifier',enrollment:'Tap on id: native-profile-name FAILED'}).withheld,'outside-enrollment');
  assert.equal(enrollment({labels:{},enrollment:'Tap on id: native-profile-name FAILED'}).withheld,'trusted-target-unavailable');
  assert.equal(enrollment({enrollment:'x'.repeat(4_000_001)+' native-profile-name'}).withheld,'tool-input-unavailable');
  assert.equal(JSON.stringify(enrollment({enrollment:'Tap on id: native-subscription-name FAILED private-canary 123456'})).includes('private-canary'),false);
});
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
    { ...labels, email: 1 }, { ...labels, email: '' }, { ...labels, email: undefined },
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
    'date-field',
    'personal-title',
    'expected-amount',
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
    'Example streaming',
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

test('enrollment execution is invocation-owned, terminal-latched and launch errors dominate later exits/close',()=>{
 assert.equal(createEnrollmentExecution('identifier'),null);
 const absent=createEnrollmentExecution('enroll-add');assert.equal(absent.snapshot(),null);absent.record('private-canary',123,'private-canary');assert.equal(absent.snapshot(),null);
 const failed=createEnrollmentExecution('enroll-add');assert.ok(Object.isFrozen(failed));failed.record('error',1,'private-canary');failed.record('exit',1,null);failed.record('close',0,null);assert.deepEqual(failed.snapshot(),{outcome:'launch-error',code:'unavailable',signal:'none',timeout:'not-applicable'});assert.ok(Object.isFrozen(failed.snapshot()));
 for(const [code,signal,outcome,bucket,signalBucket] of [[0,null,'completed','zero','none'],[1,undefined,'exit-nonzero','one','none'],[2,null,'exit-nonzero','other-nonzero','none'],[255,null,'exit-nonzero','other-nonzero','none'],[null,'SIGTERM','signal','unavailable','TERM'],[null,'SIGKILL','signal','unavailable','KILL'],[null,'private-canary','signal','unavailable','other'],[-1,null,'exit-nonzero','unavailable','none'],[256,null,'exit-nonzero','unavailable','none'],[1.5,null,'exit-nonzero','unavailable','none'],['private-canary',null,'exit-nonzero','unavailable','none']]){
  const record=createEnrollmentExecution('enroll-add');record.record('exit',code,signal);record.record('close',0,null);record.record('error');assert.deepEqual(record.snapshot(),{outcome,code:bucket,signal:signalBucket,timeout:'not-applicable'});assert.equal(JSON.stringify(record.snapshot()).includes('canary'),false);
 }
 const close=createEnrollmentExecution('enroll-add');close.record('close',1,null);assert.equal(close.snapshot().code,'one');
});
test('only exact failed enrollment emits bounded log presence and no fabricated timeout',()=>{
 const owner=createEnrollmentExecution('enroll-add');owner.record('exit',1,null);const execution=owner.snapshot();
 const project=(patch={})=>enrollmentExecutionDiagnostic({phase:'flow-enroll-add',execution,logSize:0,...patch});
 assert.equal(project({phase:'flow-identifier'}),null);assert.equal(project({execution:null}),null);assert.equal(project({execution:1}),null);assert.equal(project({execution:[]}),null);
 const completed=createEnrollmentExecution('enroll-add');completed.record('exit',0,null);assert.equal(project({execution:completed.snapshot()}),null);
 for(const changed of [Object.assign(Object.create(null),execution),{...execution,[Symbol('private-canary')]:1},{...execution,extra:'private-canary'},{...execution,outcome:'private-canary'},{...execution,code:129},{...execution,signal:'SIGPRIVATE'},{...execution,timeout:'timeout'}])assert.equal(project({execution:changed}),null);
 for(const [logSize,log] of [[0,'empty'],[1,'nonempty'],[4000000,'nonempty'],[4000001,'unavailable'],[-1,'unavailable'],[null,'unavailable'],[1.5,'unavailable'],['private-canary','unavailable']]){const result=project({logSize});assert.deepEqual(result,{...execution,log});assert.ok(Object.isFrozen(result));assert.equal(JSON.stringify(result).includes('canary'),false);assert.equal(result.timeout,'not-applicable');}
});
test('C18 source-bound targets come only from failed lines, with private values suppressed',()=>{
 const lines=[['date-field',enrollmentLabels.date],['personal-title',enrollmentLabels.personalTitle],['saved-row','Example streaming'],['expected-amount',enrollmentLabels.expectedAmount]];
 for(const [target,label] of lines){assert.deepEqual(enrollment({enrollment:`Scroll until ${label} FAILED private-canary`}).targets,[target]);assert.equal(enrollment({enrollment:`Scroll until ${label} COMPLETED`}).withheld,'unknown-tool-diagnostic');}
 assert.deepEqual(enrollment({enrollment:'Scroll until Your subscriptions FAILED',labels:{...enrollmentLabels,add:'subscriptions'}}).targets,['personal-title']);
 for(const key of ['date','personalTitle','expectedAmount']){assert.equal(enrollment({labels:{...enrollmentLabels,[key]:''}}).withheld,'trusted-target-unavailable');}
 const result=enrollment({enrollment:lines.map(([,label])=>`Assertion is false: ${label} otp-123456-canary Bearer private-token-canary`).join('\n')});assert.deepEqual(result.targets,lines.map(([target])=>target));assert.equal(JSON.stringify(result).includes('canary'),false);assert.equal(JSON.stringify(result).includes('123456'),false);
});

test('restart-family original failure projection is phase-bound, fixed and private',()=>{
 const trusted={createAccount:'Create account',verifyBankId:'Verify with BankID',expectedAmount:'Expected amount: 129,90[ \\u00a0\\u202f]+SEK',logout:'Log out',logoutConfirmed:'Logged out',edit:'Edit',saveEdit:'Save changes',editSaved:'Saved changes',pause:'Pause tracking',resume:'Resume tracking',cancelled:'Mark cancelled',archive:'Archive'};
 const options={phase:'flow-restart',restart:'FAILED Assert that "Verify with BankID" is visible\nAssertion is false: private-canary',metro:'',labels:trusted};
 for(const phase of ['flow-restart','flow-edit-status','flow-edit-status-api-restart']){
  const result=restartToolDiagnostic({...options,phase});assert.deepEqual(result.targets,['bankid-verify']);assert.deepEqual(result.commands,['wait-visible']);assert.deepEqual(result.reasons,['assertion']);assert.equal(JSON.stringify(result).includes('private-canary'),false);
 }
 for(const phase of ['flow-enroll-add','flow-identifier','other',undefined])assert.deepEqual(restartToolDiagnostic({...options,phase}),{withheld:'outside-restart'});
 for(const labels of [null,{},...Object.keys(trusted).map(key=>({...trusted,[key]:''})),{...trusted,logout:42}])assert.deepEqual(restartToolDiagnostic({...options,labels}),{withheld:'trusted-target-unavailable'});
 for(const [text,target] of [['Example streaming','saved-row'],['Example streaming Plus','edited-row'],...Object.entries(trusted).map(([key,value])=>[value,{createAccount:'welcome-create-account',verifyBankId:'bankid-verify',expectedAmount:'expected-amount',logout:'logout',logoutConfirmed:'logout-confirmed',edit:'edit',saveEdit:'save-edit',editSaved:'edit-saved',pause:'pause',resume:'resume',cancelled:'cancelled',archive:'archive'}[key]])])assert.deepEqual(restartToolDiagnostic({...options,restart:`FAILED Assert visible ${text}`}).targets,[target]);
 const canonical=restartToolDiagnostic({...options,restart:'No visible element found: Text matching regex: Edit\nprivate-canary'});
 assert.deepEqual(canonical.commands,['scroll']);assert.deepEqual(canonical.reasons,['element-not-found']);assert.deepEqual(canonical.targets,['edit']);assert.equal(JSON.stringify(canonical).includes('private-canary'),false);
 for(const [id,target] of [['native-subscription-name','subscription-name'],['native-subscription-date','date-field']]){assert.deepEqual(restartToolDiagnostic({...options,restart:`No visible element found: ${id}`}).targets,[target]);assert.deepEqual(restartToolDiagnostic({...options,restart:`No visible element found: ${id}-foreign`}).targets,[]);}
 assert.equal(restartToolDiagnostic({...options,restart:'private-canary only'}).withheld,'unknown-tool-diagnostic');
 for(const patch of [{restart:null},{restart:'x'.repeat(4_000_001)},{metro:null}])assert.equal(restartToolDiagnostic({...options,...patch}).withheld,'tool-input-unavailable');
});
