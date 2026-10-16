import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import childProcess, {spawn as realSpawn} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import process from 'node:process';
import {setTimeout,clearTimeout} from 'node:timers';
import { probeResult, identifierProbes, runIdentifierProbe } from './private-runtime-identifier-probe.mjs';
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
  MAESTRO_CREATE_ACCOUNT: 'Create account',
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
    ['welcome-create-account', labels.MAESTRO_CREATE_ACCOUNT],
    ['request-unavailable', labels.MAESTRO_REQUEST_UNAVAILABLE],
    ['loading', labels.MAESTRO_IDENTIFIER_LOADING],
    ['email-field', labels.MAESTRO_EMAIL_LABEL],
    ['otp-field', labels.MAESTRO_OTP_LABEL],
  ]);
  assert.deepEqual(observations, { 'welcome-create-account': 'not-confirmed', 'request-unavailable': 'visible', loading: 'launch-error', 'email-field': 'timeout', 'otp-field': 'not-confirmed' });
  assert.equal(/private-canary|123456|person@example/.test(JSON.stringify(observations)), false);
});

test('runtime integration uses only bounded read-only probe and retains failure cleanup', () => {
  const yaml = readFileSync(new URL('../e2e/private-runtime-identifier-probe.yaml', import.meta.url), 'utf8');
  assert.equal(yaml.replace(/\r\n/g, '\n'), 'appId: se.subtrack.app\n---\n- assertVisible: ${MAESTRO_IDENTIFIER_PROBE_LABEL}\n');
  const source = readFileSync(new URL('./private-runtime-device.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('await identifierProbes('),false);
  assert.equal(source.includes('await runIdentifierProbe('),false);
  assert.ok(source.includes('startupStageDiagnostic({phase:currentPhase,log:readTool(\'metro.log\')})'));
  assert.ok(source.includes('startup_stage_diagnostic=unavailable'));
  assert.ok(source.includes('const syntheticOtpIssued = code !== null;'));
  assert.ok(source.includes('harness.otpStartObservation()'));
  const addFlow = readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml', import.meta.url), 'utf8').replace(/\r\n/g,'\n');
  assert.ok(addFlow.includes('- tapOn: ${MAESTRO_SAVE_SUBSCRIPTION}\n- scrollUntilVisible:\n    element:\n      id: native-personal-title\n    direction: UP\n- assertVisible:\n    id: native-personal-title\n    text: ${MAESTRO_PERSONAL_TITLE}\n- extendedWaitUntil:\n    visible: ${MAESTRO_SAVED}\n    timeout: 30000'));
  assert.equal(addFlow.match(/tapOn: \$\{MAESTRO_SAVE_SUBSCRIPTION\}/g).length, 1);
  assert.ok(source.includes('process.exitCode = 1;'));
  assert.ok(source.includes('await harness.dispose();'));
});

test('authoritative setup hands off through Month and real Manage before the unchanged mandatory Add',()=>{
 const read=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');const add=read('enroll-add');
 assert.ok(add.includes('- tapOn: ${MAESTRO_JUST_ME}\n- extendedWaitUntil:\n    visible: ${MAESTRO_MONTH_TITLE}\n    timeout: 30000\n- tapOn: ${MAESTRO_MANAGE}\n- scrollUntilVisible:\n    element:\n      id: native-personal-title\n    direction: UP\n- extendedWaitUntil:\n    visible:\n      id: native-personal-title\n      text: ${MAESTRO_PERSONAL_TITLE}\n    timeout: 30000\n- scrollUntilVisible:\n    element: ${MAESTRO_ADD}\n    direction: DOWN\n- extendedWaitUntil:\n    visible: ${MAESTRO_ADD}\n    timeout: 30000\n- tapOn: ${MAESTRO_ADD}'));
 assert.equal(add.split('- tapOn: ${MAESTRO_MANAGE}').length-1,1);assert.ok(add.includes('id: native-personal-title\n    text: ${MAESTRO_PROFILE_TITLE}'));
 assert.equal(read('save-header'),'appId: se.subtrack.app\n---\n- scrollUntilVisible:\n    element:\n      id: native-personal-title\n    direction: UP\n- assertVisible:\n    id: native-personal-title\n    text: ${MAESTRO_PERSONAL_TITLE}\n');
});

test('after create feedback at the exact header, persisted row below it is searched DOWN with original amount acceptance',()=>{
 const flow=readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.ok(flow.includes('text: ${MAESTRO_PERSONAL_TITLE}\n- extendedWaitUntil:\n    visible: ${MAESTRO_SAVED}\n    timeout: 30000\n- scrollUntilVisible:\n    element: Native restart proof\n    direction: DOWN\n- assertVisible: Native restart proof\n- assertVisible: ${MAESTRO_EXPECTED_AMOUNT}\n- takeScreenshot: accepted-add'));assert.equal(flow.split('- tapOn: ${MAESTRO_ADD}').length-1,1);assert.equal(flow.split('- tapOn: ${MAESTRO_SAVE_SUBSCRIPTION}').length-1,1);
});

function childFixture({pid=24680,platform='darwin',throwSpawn=false,signalError=false}={}) {
  const child=new EventEmitter();child.pid=pid;
  const timers=[],signals=[],spawned=[];
  const schedule=(action,ms)=>{const timer={action,ms,cancelled:false};timers.push(timer);return timer;};
  const cancel=timer=>{if(timer)timer.cancelled=true;};
  const ports={platform,parentPid:13579,schedule,cancel,spawn:(command,args,options)=>{
    spawned.push({command,args,options});if(throwSpawn)throw Error('private-canary');return child;
  },kill:(pid,signal)=>{signals.push([pid,signal]);if(signalError)throw Error('private-canary');}};
  const result=runIdentifierProbe(['test','owned-flow.yaml'],{cwd:'owned',stdio:'ignore',env:{PUBLIC:'test'}},ports);
  return {child,timers,signals,spawned,result,ports};
}

test('portable child port fixes invocation, owns successful spawn only and latches normal completion',async()=>{
  const f=childFixture();assert.deepEqual(f.spawned,[{command:'maestro',args:['test','owned-flow.yaml'],options:{cwd:'owned',stdio:'ignore',env:{PUBLIC:'test'},detached:true}}]);
  assert.equal(f.timers[0].ms,20000);f.child.emit('spawn');f.child.emit('close',0,null);assert.deepEqual(await f.result,{exitCode:0,timedOut:false});assert.ok(f.timers.every(t=>t.cancelled));
  f.timers[0].action();f.child.emit('error',Error('private-canary'));assert.deepEqual(f.signals,[]);
  for(const code of [null,-1,256,'private-canary']){const g=childFixture();g.child.emit('spawn');g.child.emit('close',code,'SIGTERM');assert.deepEqual(await g.result,{exitCode:-1,timedOut:false});assert.equal(probeResult({...await g.result,log:''}),'exit-other');}
});

test('spawn failures and invalid PID custody never send a signal',async()=>{
  const thrown=childFixture({throwSpawn:true});assert.deepEqual(await thrown.result,{exitCode:null,timedOut:false});assert.deepEqual(thrown.signals,[]);
  const failure=childFixture();failure.child.emit('error',Error('private-canary'));failure.child.emit('close',-1,null);failure.child.emit('spawn');assert.deepEqual(await failure.result,{exitCode:null,timedOut:false});assert.deepEqual(failure.signals,[]);
  for(const pid of [undefined,NaN,1,0,-1,13579,1.5]){const f=childFixture({pid});if(pid===undefined)f.child.pid=undefined;f.child.emit('spawn');assert.deepEqual(await f.result,{exitCode:null,timedOut:false});f.timers[0].action();assert.deepEqual(f.signals,[]);assert.ok(f.timers[0].cancelled);}
  const missing=childFixture();missing.child.emit('close',0,null);assert.deepEqual(await missing.result,{exitCode:null,timedOut:false});
  const owned=childFixture();owned.child.emit('spawn');owned.child.emit('error',Error('private-canary'));assert.deepEqual(await owned.result,{exitCode:null,timedOut:false});assert.deepEqual(owned.signals,[[-24680,'SIGKILL']]);
});

test('timeout keeps POSIX group cleanup after leader close, then escalates exactly once at five seconds',async()=>{
  const f=childFixture();f.child.emit('spawn');f.timers[0].action();assert.deepEqual(f.signals,[[-24680,'SIGTERM']]);assert.equal(f.timers[1].ms,5000);
  let settled=false;void f.result.then(()=>{settled=true;});f.child.emit('close',0,null);f.child.emit('error',Error('private-canary'));await Promise.resolve();assert.equal(settled,false);assert.equal(f.timers[1].cancelled,false);
  f.timers[1].action();assert.deepEqual(await f.result,{exitCode:0,timedOut:true});assert.deepEqual(f.signals,[[-24680,'SIGTERM'],[-24680,'SIGKILL']]);assert.ok(f.timers.every(t=>t.cancelled));f.timers[1].action();assert.equal(f.signals.length,2);assert.equal(probeResult({...await f.result,log:'private-canary'}),'timeout');
  const open=childFixture({signalError:true});open.child.emit('spawn');open.timers[0].action();open.timers[1].action();assert.deepEqual(await open.result,{exitCode:-1,timedOut:true});assert.equal(open.signals.length,2);open.child.emit('close',1,null);
  const notSpawned=childFixture();notSpawned.timers[0].action();notSpawned.child.emit('close',1,null);notSpawned.timers[1].action();assert.deepEqual(await notSpawned.result,{exitCode:1,timedOut:true});assert.deepEqual(notSpawned.signals,[]);
});

test('Windows uses only the captured positive child PID and clears cleanup on its terminal close',async()=>{
  const f=childFixture({platform:'win32'});assert.equal(f.spawned[0].options.detached,false);f.child.emit('spawn');f.timers[0].action();f.child.emit('close',null,'SIGTERM');assert.deepEqual(await f.result,{exitCode:-1,timedOut:true});assert.deepEqual(f.signals,[[24680,'SIGTERM']]);f.timers[1].action();assert.equal(f.signals.length,1);
  const child=new EventEmitter();child.pid=24680;const timers=[];const result=runIdentifierProbe([],{stdio:'ignore'},{platform:'win32',parentPid:13579,spawn:()=>child,kill:(_pid,signal)=>child.emit('close',null,signal),schedule:(action,ms)=>{const t={action,ms};timers.push(t);return t;},cancel:()=>{}});child.emit('spawn');timers[0].action();assert.deepEqual(await result,{exitCode:-1,timedOut:true});assert.equal(timers.length,1);
  const raced=new EventEmitter();raced.pid=24680;const raceTimers=[],raceSignals=[];
  const race=runIdentifierProbe([],{stdio:'ignore'},{platform:'win32',parentPid:13579,spawn:()=>raced,kill:(pid,signal)=>{raceSignals.push([pid,signal]);if(signal==='SIGKILL')raced.emit('close',9,null);},schedule:(action,ms)=>{const timer={action,ms};raceTimers.push(timer);return timer;},cancel:()=>{}});
  raced.emit('spawn');raceTimers[0].action();raceTimers[1].action();assert.deepEqual(await race,{exitCode:9,timedOut:true});assert.deepEqual(raceSignals,[[24680,'SIGTERM'],[24680,'SIGKILL']]);

});

test('real Node spawn port reports actual process exit, missing executable and signal termination',async(t)=>{
  const capture=[];
  const adapt=(program,script)=>({spawn:(command,args,options)=>{capture.push([command,args,options.detached]);return realSpawn(program,script,options);}});
  const done=await runIdentifierProbe(['test','owned'],{stdio:'ignore'},adapt(process.execPath,['-e','process.exit(7)']));assert.deepEqual(done,{exitCode:7,timedOut:false});assert.equal(capture[0][0],'maestro');assert.deepEqual(capture[0][1],['test','owned']);
  assert.deepEqual(await runIdentifierProbe([],{stdio:'ignore'},adapt('subtrack-no-such-executable-private-probe',[])),{exitCode:null,timedOut:false});
  const live=adapt(process.execPath,['-e','setInterval(()=>{},1000)']);const stopped=await runIdentifierProbe([],{stdio:'ignore'},{...live,schedule:(action,ms)=>setTimeout(action,ms===20000?100:25),cancel:clearTimeout});assert.equal(stopped.timedOut,true);assert.equal(probeResult({...stopped,log:''}),'timeout');
  const child=new EventEmitter();child.pid=24680;
  t.mock.method(childProcess,'spawn',()=>child);syncBuiltinESMExports();
  try{const defaults=runIdentifierProbe([],{stdio:'ignore'});child.emit('spawn');child.emit('close',0,null);assert.deepEqual(await defaults,{exitCode:0,timedOut:false});}finally{t.mock.restoreAll();syncBuiltinESMExports();}
});


test('pre-input frame remains exact-source iOS PR293 only, first-flow/zero-total gated and ciphertext-only upload',()=>{
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes("matrix.platform == 'ios' && github.event_name == 'pull_request' && github.event.pull_request.number == 293 && github.repository == 'achkum/Applied-AI-Projects' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.head.ref == 'codex/native-owner-search'"));
 assert.ok(workflow.includes('ST253_CAPTURE_SOURCE_HEAD: ${{ github.event.pull_request.head.sha }}'));assert.ok(workflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'));
 assert.ok(driver.includes("const captureContext=platform==='ios'?preinputCaptureContext(process.env,head):null"));assert.ok(driver.includes("currentPhase === 'flow-identifier' && captureContext && preinputMetadata"));assert.ok(driver.includes("label==='identifier'&&args.at(-1)===join(app,'e2e/private-runtime-identifier.yaml')"));assert.ok(driver.includes('observe:()=>harness.allApiObservation()'));
 for(const command of ["['simctl','list','devices','booted','--json']","['simctl','get_app_container',udid,'se.subtrack.app','app']","['simctl','io',udid,'screenshot',file]"])assert.ok(driver.includes(command));assert.ok(driver.includes("['Info.plist','SubTrack']"));
 const validation=workflow.slice(workflow.indexOf('- name: Validate sealed pre-input'),workflow.indexOf('- name: Owned fixture and debug server cleanup'));
 assert.ok(validation.includes('validatedPreinputArtifact'));assert.ok(validation.includes("steps.sealed_preinput.outputs.ready == 'true'"));assert.ok(validation.includes('path: ${{ runner.temp }}/subtrack-native-proof/sealed/preinput-ios.st253sealed'));assert.equal(/path:.*(?:\*|\.png|private\/)/.test(validation),false);assert.ok(validation.includes('retention-days: 1'));
 assert.equal(workflow.includes('pull_request_target'),false);assert.equal(driver.includes('await identifierProbes('),false);
});


test('encrypted frame failure projection is a fixed stage only after the capture helper settles and cleanup completes',()=>{
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');const start=driver.indexOf("if (currentPhase === 'flow-identifier' && captureContext && preinputMetadata)");const end=driver.indexOf("if (currentPhase === 'flow-identifier')",start+1);const block=driver.slice(start,end);
 assert.ok(block.includes("let sealed=false,withheldStage='CUSTODY'"));assert.ok(block.includes('if(PREINPUT_WITHHELD_STAGES.includes(value))withheldStage=value'));assert.ok(block.includes('onStage:captureStage'));assert.ok(block.includes("captureStage('CAPTURE');await nativeRead(['simctl','io',udid,'screenshot',file])"));assert.ok(block.indexOf('await captureSealedPreinput')<block.indexOf('console.error(`ST244_NATIVE preinput_frame='));assert.ok(block.includes("preinput_frame=${sealed?'sealed':'withheld'} stage=${withheldStage}"));assert.equal(/console\.(?:error|log)\([^`]/.test(block),false);
});


test('ownership detail is fixed, withheld-only and emitted after cleanup; legacy text targets are explicitly unobserved',()=>{
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');
 assert.ok(driver.includes("if(!sealed&&withheldStage==='METADATA_OWNERSHIP')try{const check=preinputMetadata.ownershipCheck();if(PREINPUT_METADATA_CHECKS.includes(check))metadataCheck=check;}"));
 assert.ok(driver.includes("let metadataCheck='UNKNOWN'"));assert.ok(driver.includes("withheldStage==='METADATA_OWNERSHIP'?` metadata_check=${metadataCheck}`:''"));
 assert.ok(driver.indexOf('await captureSealedPreinput')<driver.indexOf("let metadataCheck='UNKNOWN'"));
 assert.ok(driver.includes('identifier_diagnostic=fixed source=legacy-text target_observation=unobserved'));assert.ok(driver.includes("legacy_targets=${diagnostic.targets.join(',') || 'none'}"));
});
