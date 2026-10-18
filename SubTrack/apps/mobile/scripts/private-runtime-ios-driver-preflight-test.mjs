import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {measuredIosSimulator,runIosDriverChild,runOwnedIosDriverPreflight,collectIosDriverLogs,validatedIosDriverArtifact} from './private-runtime-ios-driver-preflight.mjs';
import {preinputCaptureContext,recordPreinputSimulator} from './private-runtime-maestro-metadata.mjs';
import {iosMeasurementStep} from './private-runtime-ios-simulator-measurement.mjs';
import console from 'node:console';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {execFileSync} from 'node:child_process';
import {setTimeout} from 'node:timers';
const {queueMicrotask}=globalThis;

const head='ab'.repeat(20),udid='123E4567-E89B-42D3-A456-426614174000';
const environment={...process.env,CI:'true',NODE_ENV:'development',SUBTRACK_PRIVATE_DEVICE_PROOF:'true',ST253_CAPTURE_ENABLED:'true',ST253_CAPTURE_PLATFORM:'ios',ST253_CAPTURE_HEAD_REPOSITORY:'achkum/Applied-AI-Projects',EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL:'https://localhost:3443',GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/codex/ios-startup-fixes',GITHUB_HEAD_REF:'',GITHUB_SHA:head,ST253_CAPTURE_SOURCE_HEAD:head,ST253_CAPTURE_DISPATCH_SOURCE:head,GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',SUBTRACK_SIMULATOR_UDID:udid};
delete environment.SUBTRACK_PRIVATE_FIXTURE_CONFIG;
const device={udid,name:'SubTrack-proof',state:'Booted',isAvailable:true,deviceTypeIdentifier:'com.apple.CoreSimulator.SimDeviceType.iPhone-17'};
const devices=()=>({devices:{'com.apple.CoreSimulator.SimRuntime.iOS-26-2':[{...device}]}}),context=preinputCaptureContext(environment,head);
const measured=()=>measuredIosSimulator(devices(),{},udid);

function controlledChild(file,{pid=process.pid+10000,verifiedContext=context,killFails=false,sampleDriver=async()=> 'ANDROID_DISCOVERY'}={}){
 const spawned=new EventEmitter();Object.assign(spawned,{pid,stdout:new PassThrough(),stderr:new PassThrough(),unref:()=>{}});
 const timers=[],signals=[],ports={platform:'darwin',verifiedContext,sampleDriver,spawnChild:(_program,_args,options)=>{assert.equal(options.detached,true);queueMicrotask(()=>spawned.emit('spawn'));return spawned;},signalProcess:(target,signal)=>{signals.push([target,signal]);if(killFails)throw Error('Synthetic kill failure');},schedule:(fn,ms)=>{const timer={fn,ms,cancelled:false};timers.push(timer);return timer;},cancel:timer=>{if(timer)timer.cancelled=true;}};
 const result=runIosDriverChild(file,['--device',udid,'--platform','ios','--verbose','hierarchy'],environment,180000,'maestro',ports);
 return {spawned,timers,signals,result};
}

test('deadline signals only its spawned owned POSIX group and preserves timeout failure',()=>fixture(async({root})=>{
 const c=controlledChild(join(root,'group.log'));await Promise.resolve();c.timers.find(t=>t.ms===180000).fn();
 expectNoProbe(c);assert.deepEqual(c.signals,[[-c.spawned.pid,'SIGKILL']]);assert.equal(c.spawned.stdout.destroyed,true);assert.equal(c.spawned.stderr.destroyed,true);
 c.spawned.emit('exit',null,'SIGKILL');c.spawned.emit('close',null,'SIGKILL');const result=await c.result;assert.equal(result.complete,false);assert.equal(result.timedOut,true);assert.equal(c.timers.find(t=>t.ms===120000).cancelled,true);
}));
function expectNoProbe(c){assert.equal(c.timers.find(t=>t.ms===120000)?.cancelled,true);}

test('failed kill and held pipes return bounded incomplete failure without a late reused-group signal',()=>fixture(async({root})=>{
 for(const exitedFirst of [false,true]){
  const c=controlledChild(join(root,`failed-kill-${exitedFirst}.log`),{killFails:true});await Promise.resolve();
  if(exitedFirst)c.spawned.emit('exit',1,null);c.timers.find(t=>t.ms===180000).fn();
  assert.equal(c.spawned.stdout.destroyed,true);c.timers.find(t=>t.ms===5000).fn();const result=await c.result;
  assert.deepEqual(result,{exitCode:null,complete:false,timedOut:true,closed:false});assert.equal(c.signals.length,exitedFirst?0:1);
  c.spawned.emit('exit',1,null);c.spawned.emit('close',1,null);c.timers.find(t=>t.ms===180000).fn();assert.equal(c.signals.length,exitedFirst?0:1);
 }
}));

test('sampling requires actual-head verified context, is cancelled on early exit and never signals an invalid PID',()=>fixture(async({root})=>{
 const calls=[];
 for(const [name,options]of [['foreign-head',{verifiedContext:null}],['invalid-pid',{pid:1}],['early-exit',{}]]){
  const c=controlledChild(join(root,`${name}.log`),{...options,sampleDriver:async value=>{calls.push(value);return 'HIERARCHY';}});await Promise.resolve();
  if(name==='invalid-pid'){c.timers.find(t=>t.ms===180000).fn();assert.equal(c.signals.length,0);c.spawned.emit('exit',null,'SIGKILL');c.spawned.emit('close',null,'SIGKILL');}
  else {c.spawned.emit('exit',0,null);c.spawned.emit('close',0,null);c.timers.find(t=>t.ms===120000)?.fn();}
  const result=await c.result;assert.equal(Object.hasOwn(result,'sampledStage'),false);
 }
 assert.equal(calls.length,0);
 let supplied;
 await runOwnedIosDriverPreflight({environment,root,head:'cd'.repeat(20),measureDevice:measured,runChild:async(file,_args,_env,_deadline,_program,ports)=>{supplied=ports.verifiedContext;fs.writeFileSync(file,'private canary',{mode:384});return {complete:false,exitCode:null,timedOut:true};}});
 assert.equal(supplied,null);assert.equal(fs.existsSync(join(root,'ios-driver-ready.json')),false);assert.equal(fs.existsSync(join(root,'ios-driver-failure.json')),false);
}));

test('one bounded sample emits only its closed stage separately and cancels with the original child',()=>fixture(async({root})=>{
 let samples=0,signal;
 const c=controlledChild(join(root,'sample.log'),{sampleDriver:async value=>{samples++;signal=value.signal;assert.equal(value.pid,c.spawned.pid);assert.equal(value.parentPid,process.pid);assert.equal(value.logFile,join(root,'thread-stack.log'));value.onCheck('THREAD_PRINT');return 'ANDROID_DISCOVERY';}});await Promise.resolve();
 c.timers.find(t=>t.ms===120000).fn();await Promise.resolve();await Promise.resolve();c.timers.find(t=>t.ms===180000).fn();c.spawned.emit('exit',null,'SIGKILL');c.spawned.emit('close',null,'SIGKILL');
 const result=await c.result;assert.equal(samples,1);assert.equal(signal.aborted,true);assert.equal(result.sampledStage,'ANDROID_DISCOVERY');assert.equal(result.sampledCheck,'THREAD_PRINT');assert.equal(result.complete,false);assert.equal(result.timedOut,true);
 const output=[];mock.method(console,'log',line=>output.push(line));
 const runChild=async file=>{fs.writeFileSync(file,'PRIVATE_CANARY',{mode:384});return {...result,sampledStage:'PRIVATE_CANARY\nforged',sampledCheck:'PRIVATE_CANARY\nforged'};};
 assert.deepEqual(await runOwnedIosDriverPreflight({environment,root,head,measureDevice:measured,runChild}),{success:false,sealed:false});assert.ok(output.includes('ST253_IOS_DRIVER original_reasons=UNKNOWN'));assert.ok(output.includes('ST253_IOS_DRIVER sampled_stage=UNKNOWN'));assert.equal(output.some(line=>line.includes('CANARY')),false);
}));

if(process.platform!=='win32')test('actual deadline terminates a POSIX descendant holding inherited output pipes',()=>fixture(async({root})=>{
 const file=join(root,'descendant.log'),script="const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore',process.stdout,process.stderr]});console.log('CHILD_PID='+c.pid);setInterval(()=>{},1000);";
 const result=await runIosDriverChild(file,['-e',script],process.env,1500,process.execPath);assert.equal(result.complete,false);assert.equal(result.timedOut,true);assert.notEqual(result.closed,false);
 const pid=Number(/^CHILD_PID=(\d+)$/m.exec(fs.readFileSync(file,'utf8'))?.[1]);assert.ok(Number.isSafeInteger(pid)&&pid>1);
 let stopped=false;for(let count=0;count<40;count++){try{const status=execFileSync('ps',['-p',String(pid),'-o','stat='],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:1000}).trim();if(!status||status.startsWith('Z')){stopped=true;break;}}catch{stopped=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}assert.equal(stopped,true);
}));

async function fixture(action){
 const temporary=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'subtrack-ios-driver-')),root=join(temporary,'subtrack-native-proof','private');fs.mkdirSync(root,{recursive:true,mode:448});
 // Windows cannot represent POSIX owner bits. Actual macOS runs exercise real
 // modes; this local port preserves real identities/data while supplying modes.
 if(typeof process.getuid!=='function'){
  for(const name of ['lstatSync','fstatSync']){const actual=fs[name];mock.method(fs,name,(...args)=>{const s=actual(...args),mode=typeof s.mode==='bigint'?(s.mode&~511n)|BigInt(s.isDirectory()?448:384):(s.mode&~511)|(s.isDirectory()?448:384);return Object.assign(Object.create(Object.getPrototypeOf(s)),s,{mode});});}syncBuiltinESMExports();
 }
 try{recordPreinputSimulator(root,context);await action({root,temporary});}finally{mock.restoreAll();syncBuiltinESMExports();fs.rmSync(temporary,{recursive:true,force:true});}
}
const child=code=>async(file,args,env)=>{assert.deepEqual(args,['--device',udid,'--platform','ios','--verbose','hierarchy']);assert.ok(env.XDG_STATE_HOME.endsWith(join('ios-driver-preflight','state')));return runIosDriverChild(file,['-e',`process.stdout.write('private startup canary');process.exit(${code})`],env,10000,process.execPath);};

test('measured simulator must be the one owned fresh device with neither SubTrack variant installed',()=>{
 assert.deepEqual(measured().udid,udid);
 for(const patch of [d=>d.devices['com.apple.CoreSimulator.SimRuntime.iOS-26-2'].push({...device}),d=>{d.devices['com.apple.CoreSimulator.SimRuntime.iOS-26-2'][0].udid='foreign';},d=>{d.devices['com.apple.CoreSimulator.SimRuntime.iOS-26-2'][0].isAvailable=false;},d=>{d.devices['com.apple.CoreSimulator.SimRuntime.iOS-26-2'][0].deviceTypeIdentifier='other';},d=>{d.devices['com.apple.CoreSimulator.SimRuntime.iOS-26-2'][0].name='other';}]){const value=devices();patch(value);assert.throws(()=>measuredIosSimulator(value,{},udid));}
 for(const name of ['se.subtrack.app','se.subtrack.app.sandbox'])assert.throws(()=>measuredIosSimulator(devices(),{[name]:{}},udid));
});
test('actual completed child success removes all raw output and records readiness only',()=>fixture(async({root})=>{
 const output=[];mock.method(console,'log',value=>output.push(value));
 const result=await runOwnedIosDriverPreflight({environment,root,head,measureDevice:measured,runChild:child(0)});assert.deepEqual(result,{success:true,sealed:false});assert.equal(fs.existsSync(join(root,'ios-driver-preflight')),false);assert.equal(fs.existsSync(join(root,'ios-driver-ready.json')),true);assert.equal(validatedIosDriverArtifact(root,context),false);
 assert.equal(output.some(line=>line.includes('original_reasons=')),false);
}));
test('actual failed child seals exact-command/source/custody only after raw cleanup',()=>fixture(async({root})=>{
 assert.deepEqual(await runOwnedIosDriverPreflight({environment,root,head,measureDevice:measured,runChild:child(1)}),{success:false,sealed:true});assert.equal(fs.existsSync(join(root,'ios-driver-preflight')),false);assert.equal(validatedIosDriverArtifact(root,context),true);
 const file=join(root,'ios-driver-failure.json'),binding=JSON.parse(fs.readFileSync(file));fs.writeFileSync(file,JSON.stringify({...binding,commandSha256:'00'.repeat(32)}));assert.equal(validatedIosDriverArtifact(root,context),false);fs.writeFileSync(file,JSON.stringify(binding));
 fs.mkdirSync(join(root,'ios-driver-preflight'),{mode:448});assert.equal(validatedIosDriverArtifact(root,context),false);
}));
test('fixture presence, changed measured device and foreign authority cannot publish diagnostic output',()=>fixture(async({root})=>{
 await assert.rejects(runOwnedIosDriverPreflight({environment:{...environment,SUBTRACK_PRIVATE_FIXTURE_CONFIG:''},root,head,measureDevice:()=>assert.fail('Fixture check must precede measurement')}));
 let count=0;await assert.rejects(runOwnedIosDriverPreflight({environment,root,head,measureDevice:()=>++count===1?measured():{...measured(),name:'changed'},runChild:child(1)}));assert.equal(fs.existsSync(join(root,'ios-driver-preflight')),false);assert.equal(fs.existsSync(join(root,'ios-driver-failure.json')),false);
 assert.deepEqual(await runOwnedIosDriverPreflight({environment:{...environment,GITHUB_REF:'refs/heads/other'},root,head,measureDevice:measured,runChild:child(1)}),{success:false,sealed:false});assert.equal(fs.existsSync(join(root,'ios-driver-failure.json')),false);
}));
test('timeout or oversized original child never grants a natural-failure capture ticket',()=>fixture(async({root})=>{
 for(const [name,script,time]of [['timeout','setInterval(()=>{},1000)',50],['oversize',"process.stdout.write(Buffer.alloc(300000));setTimeout(()=>{},1000)",10000]]){
  const file=join(root,name+'.log'),result=await runIosDriverChild(file,['-e',script],environment,time,process.execPath);assert.equal(result.complete,false);assert.equal(result.timedOut,true);assert.ok(fs.statSync(file).size<=262144);
 }
}));
test('before/after measurement failure emits only closed categories and never grants capture or readiness',async()=>{
 for(const phase of ['before','after'])await fixture(async({root})=>{
  const output=[];mock.method(console,'error',value=>output.push(value));let count=0;
  const measureDevice=()=>{if(++count===(phase==='before'?1:2))return iosMeasurementStep('APPS_QUERY',()=>{throw Object.assign(new Error('private measurement canary'),{code:'ETIMEDOUT',stderr:'private output canary'});});return measured();};
  await assert.rejects(runOwnedIosDriverPreflight({environment,root,head,measureDevice,runChild:phase==='before'?()=>assert.fail('No child before valid custody'):child(1)}));
  assert.ok(output.includes(`ST253_IOS_DRIVER measurement_phase=${phase} measurement_check=APPS_TIMEOUT`));assert.equal(output.some(line=>line.includes('canary')),false);
  for(const name of ['ios-driver-preflight','ios-driver-ready.json','ios-driver-failure.json'])assert.equal(fs.existsSync(join(root,name)),false);
  assert.equal(fs.existsSync(join(root,'..','sealed','ios-driver-preflight.st253sealed')),false);
 });
});

test('original failed child reason survives a later app-inventory timeout without granting artifacts or leaking original text',async()=>{
 for(const source of ['process','maestro','runner'])await fixture(async({root})=>{
  const output=[];mock.method(console,'log',value=>output.push(value));mock.method(console,'error',value=>output.push(value));let measurements=0;
  const runChild=async(file,args,env)=>{assert.deepEqual(args,['--device',udid,'--platform','ios','--verbose','hierarchy']);const text=source==='process'?'Connection refused PRIVATE_DRIVER_CANARY':'PRIVATE_DRIVER_CANARY';const result=await runIosDriverChild(file,['-e',`process.stdout.write(${JSON.stringify(text)});process.exit(1)`],env,10000,process.execPath);
   if(source!=='process'){const stamp=join(env.XDG_STATE_HOME,'maestro','tests','2026-10-17_120000');fs.mkdirSync(stamp,{recursive:true,mode:448});fs.writeFileSync(join(stamp,source==='maestro'?'maestro.log':'xctest_runner_2026-10-17_120000.log'),'Connection refused PRIVATE_DRIVER_CANARY',{mode:384});}return result;};
  const measureDevice=()=>{if(++measurements===2)return iosMeasurementStep('APPS_QUERY',()=>{throw Object.assign(new Error('PRIVATE_MEASUREMENT_CANARY'),{code:'ETIMEDOUT'});});return measured();};
  await assert.rejects(runOwnedIosDriverPreflight({environment,root,head,runChild,measureDevice}));
  const status=output.indexOf('ST253_IOS_DRIVER child_complete=true child_exit=1 child_timeout=false'),reason=output.indexOf('ST253_IOS_DRIVER original_reasons=connection'),measurement=output.indexOf('ST253_IOS_DRIVER measurement_phase=after measurement_check=APPS_TIMEOUT');assert.ok(status>=0&&status<reason&&reason<measurement);assert.equal(measurements,2);assert.equal(output.some(line=>line.includes('CANARY')||line.includes('Connection refused')),false);
  for(const name of ['ios-driver-preflight','ios-driver-ready.json','ios-driver-failure.json'])assert.equal(fs.existsSync(join(root,name)),false);assert.equal(validatedIosDriverArtifact(root,context),false);assert.equal(fs.existsSync(join(root,'..','sealed','ios-driver-preflight.st253sealed')),false);
 });
});

test('unknown original text and invalid or ambiguous optional logs yield UNKNOWN without partial process fallback',async()=>{
 for(const variant of ['unknown','timeout','empty-process','empty','oversized','ambiguous','invalid-utf8'])await fixture(async({root})=>{
  const output=[];mock.method(console,'log',value=>output.push(value));mock.method(console,'error',value=>output.push(value));let measurements=0;
  const runChild=async(file,args,env)=>{fs.writeFileSync(file,variant==='empty-process'?'':variant==='unknown'?'PRIVATE_DRIVER_CANARY':'Connection refused PRIVATE_DRIVER_CANARY',{mode:384});
   if(!['unknown','timeout','empty-process'].includes(variant)){const stamp=join(env.XDG_STATE_HOME,'maestro','tests','2026-10-17_120000');fs.mkdirSync(stamp,{recursive:true,mode:448});fs.writeFileSync(join(stamp,'maestro.log'),variant==='empty'?'':variant==='oversized'?Buffer.alloc(262145):variant==='invalid-utf8'?Buffer.from([255]):'PRIVATE_OPTIONAL_CANARY',{mode:384});if(variant==='ambiguous')for(const suffix of ['000000','000001'])fs.writeFileSync(join(stamp,`xctest_runner_2026-10-17_${suffix}.log`),'PRIVATE_RUNNER_CANARY',{mode:384});}
   return {complete:variant!=='timeout',exitCode:variant==='timeout'?null:1,timedOut:variant==='timeout'};};
  const measureDevice=()=>{if(++measurements===2)return iosMeasurementStep('APPS_QUERY',()=>{throw Object.assign(new Error('PRIVATE_MEASUREMENT_CANARY'),{code:'ETIMEDOUT'});});return measured();};
  await assert.rejects(runOwnedIosDriverPreflight({environment,root,head,runChild,measureDevice}));assert.ok(output.includes('ST253_IOS_DRIVER original_reasons=UNKNOWN'));assert.equal(output.some(line=>line.includes('original_reasons=connection')||line.includes('CANARY')),false);
  for(const name of ['ios-driver-preflight','ios-driver-ready.json','ios-driver-failure.json'])assert.equal(fs.existsSync(join(root,name)),false);assert.equal(fs.existsSync(join(root,'..','sealed','ios-driver-preflight.st253sealed')),false);
 });
});
test('only bounded fixed-name owned Maestro and XCTest logs join the sealed payload',()=>fixture(async({root})=>{
 const invocation=join(root,'ios-driver-preflight'),stamp=join(invocation,'state','maestro','tests','2026-10-17_120000');fs.mkdirSync(stamp,{recursive:true,mode:448});fs.writeFileSync(join(invocation,'process.log'),'process-private',{mode:384});fs.writeFileSync(join(stamp,'maestro.log'),'maestro-private',{mode:384});fs.writeFileSync(join(stamp,'xctest_runner_2026-10-17_120000.log'),'runner-private',{mode:384});fs.writeFileSync(join(stamp,'unrelated.log'),'excluded-private',{mode:384});
 const payload=JSON.parse(collectIosDriverLogs(invocation));assert.equal(Buffer.from(payload.runner,'base64').toString(),'runner-private');assert.equal(JSON.stringify(payload).includes('excluded-private'),false);
 fs.writeFileSync(join(stamp,'xctest_runner_2026-10-17_120001.log'),'ambiguous',{mode:384});const ambiguous=JSON.parse(collectIosDriverLogs(invocation));assert.equal(ambiguous.maestro,null);assert.equal(ambiguous.runner,null);assert.equal(Buffer.from(ambiguous.process,'base64').toString(),'process-private');
 fs.unlinkSync(join(stamp,'xctest_runner_2026-10-17_120001.log'));fs.writeFileSync(join(stamp,'maestro.log'),Buffer.alloc(262145));const oversized=JSON.parse(collectIosDriverLogs(invocation));assert.equal(oversized.maestro,null);assert.equal(oversized.runner,null);assert.equal(Buffer.from(oversized.process,'base64').toString(),'process-private');
}));
test('workflow runs driver preflight before database installation/fixture/compiler and uploads only the distinct sealed artifact',()=>{
 const workflow=fs.readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8');assert.ok(workflow.indexOf('id: ios_driver_preflight')<workflow.indexOf('- name: Owned PostgreSQL16'));assert.ok(workflow.includes('node apps/mobile/scripts/private-runtime-ios-driver-preflight.mjs'));assert.ok(workflow.includes('path: ${{ runner.temp }}/subtrack-native-proof/sealed/ios-driver-preflight.st253sealed'));assert.equal(/path:.*(?:process\.log|maestro\.log|xctest_runner)/.test(workflow),false);
 const database=workflow.slice(workflow.indexOf('- name: Owned PostgreSQL16'),workflow.indexOf('- name: Installed workflow,'));assert.equal((workflow.match(/brew install postgresql@16/g)||[]).length,1);assert.ok(database.includes("if [ '${{ matrix.platform }}' = ios ]; then"));assert.ok(database.includes('export PATH="$postgres_bin:$PATH"'));assert.ok(database.indexOf('brew install postgresql@16')<database.indexOf('bash tools/database/private-mobile-proof.sh start'));
});

test('invalid optional logs retain the original bounded child log and still require successful raw cleanup before sealing',async()=>{
 for(const variant of ['empty','oversized','ambiguous'])await fixture(async({root})=>{
  const runChild=async(file,args,env)=>{const result=await child(1)(file,args,env),stamp=join(env.XDG_STATE_HOME,'maestro','tests','2026-10-17_120000');fs.mkdirSync(stamp,{recursive:true,mode:448});fs.writeFileSync(join(stamp,'maestro.log'),variant==='oversized'?Buffer.alloc(262145):variant==='empty'?'':'tool-private',{mode:384});if(variant==='ambiguous')for(const suffix of ['000000','000001'])fs.writeFileSync(join(stamp,`xctest_runner_2026-10-17_${suffix}.log`),'ambiguous',{mode:384});return result;};
  assert.deepEqual(await runOwnedIosDriverPreflight({environment,root,head,measureDevice:measured,runChild}),{success:false,sealed:true});assert.equal(fs.existsSync(join(root,'ios-driver-preflight')),false);assert.equal(validatedIosDriverArtifact(root,context),true);
 });
 for(const variant of ['empty-process','unsafe-depth'])await fixture(async({root})=>{
  const runChild=async(file)=>{fs.writeFileSync(file,variant==='empty-process'?'':'process-private',{mode:384});if(variant==='unsafe-depth')fs.mkdirSync(join(root,'ios-driver-preflight',...Array(10).fill('nested')),{recursive:true,mode:448});return {complete:true,exitCode:1,timedOut:false};};
  await assert.rejects(runOwnedIosDriverPreflight({environment,root,head,measureDevice:measured,runChild}));assert.equal(fs.existsSync(join(root,'ios-driver-failure.json')),false);assert.equal(fs.existsSync(join(root,'..','sealed','ios-driver-preflight.st253sealed')),false);
 });
});
