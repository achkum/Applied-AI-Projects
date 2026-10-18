import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {URL} from 'node:url';
import test from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {deflateSync,crc32} from 'node:zlib';
import {captureIosFrame,openOwnedIosSimulator,iosFrameFailure,IOS_FRAME_FAILURES,runIosFrameCapability} from './private-runtime-ios-frame-capability.mjs';

const udid='123E4567-E89B-42D3-A456-426614174000',head='ab'.repeat(20);
function chunk(kind,body=Buffer.alloc(0)){const h=Buffer.alloc(8),c=Buffer.alloc(4);h.writeUInt32BE(body.length);h.write(kind,4);c.writeUInt32BE(crc32(Buffer.concat([h.subarray(4),body])));return Buffer.concat([h,body,c]);}
function png(){const h=Buffer.alloc(13);h.writeUInt32BE(1);h.writeUInt32BE(1,4);h[8]=8;h[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0]))),chunk('IEND')]);}
function env(temp){return {CI:'true',NODE_ENV:'development',RUNNER_TEMP:temp,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/codex/ios-startup-fixes',GITHUB_SHA:head,GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',GITHUB_HEAD_REF:'',ST253_CAPTURE_DISPATCH_SOURCE:head,ST253_CAPTURE_ENABLED:'true',ST253_CAPTURE_PLATFORM:'ios',ST253_CAPTURE_HEAD_REPOSITORY:'achkum/Applied-AI-Projects',ST253_CAPTURE_SOURCE_HEAD:head,GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',SUBTRACK_SIMULATOR_UDID:udid,SUBTRACK_NATIVE_PROOF_SCOPE:'full',SUBTRACK_PRIVATE_DEVICE_PROOF:'true',EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL:'https://localhost:3443'};}
async function fixture(work){
 const temp=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'st253-frame-'))),root=join(temp,'subtrack-native-proof','private');fs.mkdirSync(root,{recursive:true,mode:448});fs.chmodSync(root,448);
 const environment=env(temp),context={sourceHead:head,runId:'1234',attempt:'1',udid};fs.writeFileSync(join(root,'preinput-ios-custody.json'),JSON.stringify({version:1,...context,device:'iPhone-17',runtime:'iOS-26-2',fresh:true}),{mode:384});
 const originalUmask=process.umask,prior=process.umask(63),saved={};if(process.platform==='win32')process.umask=()=>63;
 // Windows lacks POSIX permission bits; virtualize only those bits on the test
 // filesystem while the actual production entrypoint still requires Darwin.
 if(process.platform==='win32')for(const name of ['lstatSync','fstatSync']){saved[name]=fs[name];fs[name]=(...args)=>{const s=saved[name](...args);return new Proxy(s,{get(t,key){if(key==='mode')return (t.mode&~511)|(t.isDirectory()?448:384);const value=t[key];return typeof value==='function'?value.bind(t):value;}});};}syncBuiltinESMExports();
 const calls=[];const ports={platform:'darwin',measure:id=>{assert.equal(id,udid);calls.push('measure');return{runtime:'iOS-26-2',udid,name:'SubTrack-proof',deviceType:'iPhone-17'};},openSimulator:async id=>{assert.equal(id,udid);calls.push('gui');},capture:async(id,file)=>{assert.equal(id,udid);calls.push('capture');fs.writeFileSync(file,png(),{mode:384,flag:'wx'});}};
 try{return await work({root,environment,calls,ports});}finally{for(const [name,value]of Object.entries(saved))fs[name]=value;syncBuiltinESMExports();process.umask=originalUmask;process.umask(prior);fs.rmSync(temp,{recursive:true,force:true});}
}
test('original screenshot and pinned Maestro GUI commands keep exact owned UDID, single attempt and ten-second deadline',async()=>{
 const calls=[],execute=(binary,args,options,done)=>{calls.push({binary,args,options});done(null);};const file=resolve('frame.png');
 await captureIosFrame(udid,file,undefined,{execute});await openOwnedIosSimulator(udid,undefined,{execute});
 assert.deepEqual(calls[0].args,['simctl','io',udid,'screenshot',file]);assert.equal(calls[0].binary,'xcrun');assert.deepEqual(calls[1].args,['-a','/Applications/Xcode_26.2.app/Contents/Developer/Applications/Simulator.app','--args','-CurrentDeviceUDID',udid]);assert.equal(calls[1].binary,'/usr/bin/open');
 for(const call of calls)assert.deepEqual(call.options,{timeout:10000,killSignal:'SIGKILL',maxBuffer:65536,encoding:'utf8'});
 assert.throws(()=>captureIosFrame('booted',file));assert.throws(()=>captureIosFrame(udid,'relative.png'));assert.throws(()=>openOwnedIosSimulator('foreign'));
});
test('command failures expose only closed categories, including terminated instead of an invented timeout cause',async()=>{
 for(const [error,want]of [[{code:'ENOENT'},'SPAWN'],[{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',killed:true},'OUTPUT_LIMIT'],[{killed:true,signal:'SIGKILL'},'TERMINATED'],[{code:1},'EXIT_NONZERO'],[new Proxy({},{get(){throw Error('private-canary');}}),'OTHER']]){
  assert.equal(iosFrameFailure(error),want);const seen=[];await assert.rejects(captureIosFrame(udid,resolve('frame.png'),value=>seen.push(value),{execute:(_b,_a,_o,done)=>done(error)}),value=>value.iosFrameFailure===want&&!value.message.includes('private-canary'));assert.deepEqual(seen,[want]);
 }
 assert.ok(Object.isFrozen(IOS_FRAME_FAILURES));const seen=[];await assert.rejects(openOwnedIosSimulator(udid,value=>{seen.push(value);throw Error('private-canary');},{execute:()=>{throw Object.assign(Error('private-canary'),{code:'EACCES'});}}));assert.deepEqual(seen,['SPAWN']);
});
test('one fixture-free capability check opens exact Simulator, validates a complete PNG and removes all raw output before readiness',()=>fixture(async f=>{
 const result=await runIosFrameCapability({...f,head},f.ports);assert.deepEqual(f.calls,['measure','gui','capture','measure']);assert.deepEqual(result,{schema:'st253-ios-frame-capability-v1',ready:true,stage:'COMPLETE',commandFailure:null,cleanupVerified:true});assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.deepEqual(fs.readdirSync(f.root).sort(),['ios-frame-capability-claim.json','preinput-ios-custody.json']);
 const repeated=await runIosFrameCapability({...f,head},f.ports);assert.equal(repeated.ready,false);assert.equal(repeated.stage,'CUSTODY');assert.deepEqual(f.calls,['measure','gui','capture','measure']);
}));
test('wrong source/scope/platform/fixture/custody prevents every GUI or frame command',async()=>{
 for(const patch of [{SUBTRACK_PRIVATE_FIXTURE_CONFIG:'private-canary'},{SUBTRACK_NATIVE_PROOF_SCOPE:'profile'},{GITHUB_REF:'refs/heads/main'},{GITHUB_SHA:'cd'.repeat(20)},{ST253_CAPTURE_PLATFORM:'android'},{GITHUB_EVENT_NAME:'pull_request'},{ST253_CAPTURE_ENABLED:'false'}])await fixture(async f=>{const result=await runIosFrameCapability({...f,head,environment:{...f.environment,...patch}},f.ports);assert.equal(result.ready,false);assert.deepEqual(f.calls,[]);assert.ok(!JSON.stringify(result).includes('private-canary'));});
 await fixture(async f=>{const result=await runIosFrameCapability({...f,head},{...f.ports,platform:'win32'});assert.equal(result.stage,'CONTEXT');assert.deepEqual(f.calls,[]);});
 await fixture(async f=>{fs.writeFileSync(join(f.root,'preinput-ios-custody.json'),'{}');const result=await runIosFrameCapability({...f,head},f.ports);assert.equal(result.stage,'CUSTODY');assert.deepEqual(f.calls,[]);});
});
test('invalid frame, partial capture, changed simulator or custody withholds readiness and removes owned raw bytes',async()=>{
 for(const kind of ['png','capture','after','custody'])await fixture(async f=>{
  let count=0;const capture=async(id,file,report)=>{await f.ports.capture(id,file,report);if(kind==='png')fs.writeFileSync(file,png().subarray(0,32));if(kind==='capture'){report('TERMINATED');throw Error('private-canary');}if(kind==='custody')fs.writeFileSync(join(f.root,'preinput-ios-custody.json'),'{}');};
  const result=await runIosFrameCapability({...f,head},{...f.ports,capture,measure:id=>{const value=f.ports.measure(id);return kind==='after'&&++count===2?{...value,udid:'foreign'}:value;}});
  assert.equal(result.ready,false);assert.equal(result.cleanupVerified,true);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.ok(!JSON.stringify(result).includes('private-canary'));if(kind==='capture')assert.equal(result.commandFailure,'TERMINATED');
 });
});
test('unavailable inventory or GUI stops without capture and does not retry',async()=>{
 await fixture(async f=>{const result=await runIosFrameCapability({...f,head},{...f.ports,measure:()=>{throw Error('private-canary');}});assert.equal(result.stage,'BEFORE');assert.deepEqual(f.calls,[]);});
 await fixture(async f=>{const result=await runIosFrameCapability({...f,head},{...f.ports,openSimulator:async(_id,report)=>{report('EXIT_NONZERO');throw Error('private-canary');}});assert.equal(result.stage,'GUI');assert.equal(result.commandFailure,'EXIT_NONZERO');assert.deepEqual(f.calls,['measure']);});
});
test('a replaced private output directory is retained and cannot authorize readiness or unsafe cleanup',()=>fixture(async f=>{
 const directory=join(f.root,'ios-frame-capability');const result=await runIosFrameCapability({...f,head},{...f.ports,capture:async(id,file)=>{await f.ports.capture(id,file);fs.renameSync(directory,directory+'-retained');fs.mkdirSync(directory,{mode:448});fs.writeFileSync(join(directory,'foreign-marker'),'retained');}});
 assert.equal(result.ready,false);assert.equal(result.stage,'CLEANUP');assert.equal(result.cleanupVerified,false);assert.equal(fs.readFileSync(join(directory,'foreign-marker'),'utf8'),'retained');assert.ok(fs.existsSync(directory+'-retained/frame.png'));
}));
test('existing owned driver-only and full authorities permit the same one fixture-free capability check',async()=>{
 for(const patch of [{SUBTRACK_NATIVE_PROOF_SCOPE:'ios-driver'},{GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/304/merge',GITHUB_HEAD_REF:'codex/sweden-data-native-followup',ST253_CAPTURE_BASE_REF:'st/native-synthetic-bank'}])await fixture(async f=>{const result=await runIosFrameCapability({...f,head,environment:{...f.environment,...patch}},f.ports);assert.equal(result.ready,true);assert.equal(f.calls.filter(value=>value==='capture').length,1);});
});
test('workflow gates one authorized driver-only or full capability check before database fixture and compilation',()=>{
 const workflow=fs.readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8');const name='- name: Fresh owned iOS screenshot capability before fixture or compilation',start=workflow.indexOf(name),end=workflow.indexOf('- name:',start+name.length),block=workflow.slice(start,end);
 const expression=block.match(/if: (.+)/)[1].replaceAll(' == ',' === ').replaceAll('needs.select-proof','needs.selectProof');const allow=(platform,scope,enabled)=>Function('matrix','needs','env',`return ${expression}`)({platform},{selectProof:{outputs:{scope}}},{ST253_CAPTURE_ENABLED:enabled});
 assert.equal(allow('ios','full','true'),true);assert.equal(allow('ios','ios-driver','true'),true);for(const tuple of [['android','full','true'],['ios','profile','true'],['ios','full','false']])assert.equal(allow(...tuple),false);
 assert.ok(workflow.indexOf('- name: Owned iOS driver readiness')<start);assert.ok(start<workflow.indexOf('- name: Owned PostgreSQL16'));assert.ok(block.includes('umask 077'));assert.equal(block.split('node apps/mobile/scripts/private-runtime-ios-frame-capability.mjs').length-1,1);assert.ok(!block.includes('upload-artifact'));assert.ok(workflow.includes('private-runtime-ios-frame-capability-test.mjs'));
});
