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

const head='ab'.repeat(20),udid='123E4567-E89B-42D3-A456-426614174000';
const environment={...process.env,CI:'true',NODE_ENV:'development',SUBTRACK_PRIVATE_DEVICE_PROOF:'true',ST253_CAPTURE_ENABLED:'true',ST253_CAPTURE_PLATFORM:'ios',ST253_CAPTURE_HEAD_REPOSITORY:'achkum/Applied-AI-Projects',EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL:'https://localhost:3443',GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/codex/ios-startup-fixes',GITHUB_HEAD_REF:'',GITHUB_SHA:head,ST253_CAPTURE_SOURCE_HEAD:head,ST253_CAPTURE_DISPATCH_SOURCE:head,GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',SUBTRACK_SIMULATOR_UDID:udid};
delete environment.SUBTRACK_PRIVATE_FIXTURE_CONFIG;
const device={udid,name:'SubTrack-proof',state:'Booted',isAvailable:true,deviceTypeIdentifier:'com.apple.CoreSimulator.SimDeviceType.iPhone-17'};
const devices=()=>({devices:{'com.apple.CoreSimulator.SimRuntime.iOS-26-2':[{...device}]}}),context=preinputCaptureContext(environment,head);
const measured=()=>measuredIosSimulator(devices(),{},udid);

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
 const result=await runOwnedIosDriverPreflight({environment,root,head,measureDevice:measured,runChild:child(0)});assert.deepEqual(result,{success:true,sealed:false});assert.equal(fs.existsSync(join(root,'ios-driver-preflight')),false);assert.equal(fs.existsSync(join(root,'ios-driver-ready.json')),true);assert.equal(validatedIosDriverArtifact(root,context),false);
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
test('only bounded fixed-name owned Maestro and XCTest logs join the sealed payload',()=>fixture(async({root})=>{
 const invocation=join(root,'ios-driver-preflight'),stamp=join(invocation,'state','maestro','tests','2026-10-17_120000');fs.mkdirSync(stamp,{recursive:true,mode:448});fs.writeFileSync(join(invocation,'process.log'),'process-private',{mode:384});fs.writeFileSync(join(stamp,'maestro.log'),'maestro-private',{mode:384});fs.writeFileSync(join(stamp,'xctest_runner_2026-10-17_120000.log'),'runner-private',{mode:384});fs.writeFileSync(join(stamp,'unrelated.log'),'excluded-private',{mode:384});
 const payload=JSON.parse(collectIosDriverLogs(invocation));assert.equal(Buffer.from(payload.runner,'base64').toString(),'runner-private');assert.equal(JSON.stringify(payload).includes('excluded-private'),false);
 fs.writeFileSync(join(stamp,'xctest_runner_2026-10-17_120001.log'),'ambiguous',{mode:384});const ambiguous=JSON.parse(collectIosDriverLogs(invocation));assert.equal(ambiguous.maestro,null);assert.equal(ambiguous.runner,null);assert.equal(Buffer.from(ambiguous.process,'base64').toString(),'process-private');
 fs.unlinkSync(join(stamp,'xctest_runner_2026-10-17_120001.log'));fs.writeFileSync(join(stamp,'maestro.log'),Buffer.alloc(262145));const oversized=JSON.parse(collectIosDriverLogs(invocation));assert.equal(oversized.maestro,null);assert.equal(oversized.runner,null);assert.equal(Buffer.from(oversized.process,'base64').toString(),'process-private');
}));
test('workflow runs driver preflight before fixture/compiler and uploads only the distinct sealed artifact',()=>{
 const workflow=fs.readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8');assert.ok(workflow.indexOf('id: ios_driver_preflight')<workflow.indexOf('- name: Owned PostgreSQL16'));assert.ok(workflow.includes('node apps/mobile/scripts/private-runtime-ios-driver-preflight.mjs'));assert.ok(workflow.includes('path: ${{ runner.temp }}/subtrack-native-proof/sealed/ios-driver-preflight.st253sealed'));assert.equal(/path:.*(?:process\.log|maestro\.log|xctest_runner)/.test(workflow),false);
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
