import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {URL} from 'node:url';
import test from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {deflateSync,crc32} from 'node:zlib';
import {captureIosFrame,openOwnedIosSimulator,iosFrameFailure,iosFramePngFacts,IOS_FRAME_FAILURES,runIosFrameCapability,IOS_FRAME_FLOW,IOS_FRAME_CONFIG} from './private-runtime-ios-frame-capability.mjs';
import {validPreinputPng} from './private-runtime-maestro-metadata.mjs';
import {runIosDriverChild} from './private-runtime-ios-driver-preflight.mjs';
import {iosMeasurementStep} from './private-runtime-ios-simulator-measurement.mjs';

const udid='123E4567-E89B-42D3-A456-426614174000',head='ab'.repeat(20);
function chunk(kind,body=Buffer.alloc(0)){const h=Buffer.alloc(8),c=Buffer.alloc(4);h.writeUInt32BE(body.length);h.write(kind,4);c.writeUInt32BE(crc32(Buffer.concat([h.subarray(4),body])));return Buffer.concat([h,body,c]);}
function png(){const h=Buffer.alloc(13);h.writeUInt32BE(1);h.writeUInt32BE(1,4);h[8]=8;h[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0]))),chunk('IEND')]);}
function hdrPng(){const h=Buffer.alloc(13);h.writeUInt32BE(1);h.writeUInt32BE(1,4);h[8]=16;h[9]=6;const pixels=Buffer.from([0,255,255,0,0,0,0,255,255]);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('cICP',Buffer.from([9,16,0,1])),chunk('mDCV',Buffer.alloc(24)),chunk('cLLI',Buffer.alloc(8)),chunk('IDAT',deflateSync(pixels)),chunk('IEND')]);}
function env(temp){return {CI:'true',NODE_ENV:'development',RUNNER_TEMP:temp,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/codex/ios-startup-fixes',GITHUB_SHA:head,GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',GITHUB_HEAD_REF:'',ST253_CAPTURE_DISPATCH_SOURCE:head,ST253_CAPTURE_ENABLED:'true',ST253_CAPTURE_PLATFORM:'ios',ST253_CAPTURE_HEAD_REPOSITORY:'achkum/Applied-AI-Projects',ST253_CAPTURE_SOURCE_HEAD:head,GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',SUBTRACK_SIMULATOR_UDID:udid,SUBTRACK_NATIVE_PROOF_SCOPE:'full',SUBTRACK_PRIVATE_DEVICE_PROOF:'true',EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED:'true',EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL:'https://localhost:3443'};}
async function fixture(work){
 const temp=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'st253-frame-'))),root=join(temp,'subtrack-native-proof','private');fs.mkdirSync(root,{recursive:true,mode:448});fs.chmodSync(root,448);
 const environment=env(temp),context={sourceHead:head,runId:'1234',attempt:'1',udid};fs.writeFileSync(join(root,'preinput-ios-custody.json'),JSON.stringify({version:1,...context,device:'iPhone-17',runtime:'iOS-26-2',fresh:true}),{mode:384});
 const originalUmask=process.umask,prior=process.umask(63),saved={};if(process.platform==='win32')process.umask=()=>63;
 // Windows lacks POSIX permission bits; virtualize only those bits on the test
 // filesystem while the actual production entrypoint still requires Darwin.
 if(process.platform==='win32')for(const name of ['lstatSync','fstatSync']){saved[name]=fs[name];fs[name]=(...args)=>{const s=saved[name](...args);return new Proxy(s,{get(t,key){if(key==='mode')return (t.mode&~511)|(t.isDirectory()?448:384);const value=t[key];return typeof value==='function'?value.bind(t):value;}});};}syncBuiltinESMExports();
 const calls=[];const ports={platform:'darwin',measure:id=>{assert.equal(id,udid);calls.push('measure');return{runtime:'iOS-26-2',udid,name:'SubTrack-proof',deviceType:'iPhone-17'};},openSimulator:async id=>{assert.equal(id,udid);calls.push('gui');},capture:async(id,file)=>{assert.equal(id,udid);calls.push('capture');fs.mkdirSync(dirname(file),{recursive:true,mode:448});fs.writeFileSync(file,png(),{mode:384,flag:'wx'});}};
 try{return await work({root,environment,calls,ports});}finally{for(const [name,value]of Object.entries(saved))fs[name]=value;syncBuiltinESMExports();process.umask=originalUmask;process.umask(prior);fs.rmSync(temp,{recursive:true,force:true});}
}
test('pinned Maestro GUI launch keeps exact owned UDID and one bounded cold-start call',async()=>{
 const calls=[],execute=(binary,args,options,done)=>{calls.push({binary,args,options});done(null);};await openOwnedIosSimulator(udid,undefined,{execute});
 assert.deepEqual(calls[0].args,['-a','/Applications/Xcode_26.2.app/Contents/Developer/Applications/Simulator.app','--args','-CurrentDeviceUDID',udid]);assert.equal(calls[0].binary,'/usr/bin/open');assert.deepEqual(calls[0].options,{timeout:60000,killSignal:'SIGKILL',maxBuffer:65536,encoding:'utf8'});assert.throws(()=>openOwnedIosSimulator('foreign'));
 await assert.rejects(captureIosFrame('booted','relative.png'));await assert.rejects(captureIosFrame(udid,'relative.png'));
});

test('command failures expose only closed categories, including terminated instead of an invented timeout cause',async()=>{
 for(const [error,want]of [[{code:'ENOENT'},'SPAWN'],[{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',killed:true},'OUTPUT_LIMIT'],[{killed:true,signal:'SIGKILL'},'TERMINATED'],[{code:1},'EXIT_NONZERO'],[new Proxy({},{get(){throw Error('private-canary');}}),'OTHER']]){
  assert.equal(iosFrameFailure(error),want);const seen=[];await assert.rejects(openOwnedIosSimulator(udid,value=>seen.push(value),{execute:(_b,_a,_o,done)=>done(error)}),value=>value.iosFrameFailure===want&&!value.message.includes('private-canary'));assert.deepEqual(seen,[want]);
 }
 assert.ok(Object.isFrozen(IOS_FRAME_FAILURES));const seen=[];await assert.rejects(openOwnedIosSimulator(udid,value=>{seen.push(value);throw Error('private-canary');},{execute:()=>{throw Object.assign(Error('private-canary'),{code:'EACCES'});}}));assert.deepEqual(seen,['SPAWN']);
});
test('one fixture-free capability check opens exact Simulator, validates a complete PNG and removes all raw output before readiness',()=>fixture(async f=>{
 const result=await runIosFrameCapability({...f,head},f.ports);assert.deepEqual(f.calls,['gui','measure','capture','measure']);assert.deepEqual(result,{schema:'st253-ios-frame-capability-v1',ready:true,stage:'COMPLETE',failureStage:null,commandFailure:null,originalReasons:null,measurementCheck:null,pngFailure:null,pngStructure:null,cleanupFailure:null,cleanupRosterFailure:null,cleanupVerified:true});assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.deepEqual(fs.readdirSync(f.root).sort(),['ios-frame-capability-claim.json','preinput-ios-custody.json']);
 const repeated=await runIosFrameCapability({...f,head},f.ports);assert.equal(repeated.ready,false);assert.equal(repeated.stage,'CUSTODY');assert.deepEqual(f.calls,['gui','measure','capture','measure']);
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
  assert.equal(result.ready,false);assert.equal(result.cleanupVerified,true);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.ok(!JSON.stringify(result).includes('private-canary'));if(kind==='capture'){assert.equal(result.commandFailure,'TERMINATED');assert.equal(result.failureStage,'CAPTURE');}if(kind==='png'){assert.equal(result.failureStage,'PNG');assert.equal(result.pngFailure,'PNG_FORMAT');}
 });
});
test('a real sixteen-bit RGBA HDR envelope yields only fixed structural facts while PNG acceptance and cleanup remain strict',()=>fixture(async f=>{
 const image=hdrPng();assert.equal(validPreinputPng(image),false);
 const result=await runIosFrameCapability({...f,head},{...f.ports,capture:async(id,file)=>{await f.ports.capture(id,file);fs.writeFileSync(file,image);}});
 assert.equal(result.ready,false);assert.equal(result.failureStage,'PNG');assert.equal(result.pngFailure,'PNG_FORMAT');assert.equal(result.cleanupVerified,true);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);
 assert.deepEqual(result.pngStructure,{signature:'PNG',envelope:'ENDED',width:1,height:1,bitDepth:16,colorType:6,compression:'ZERO',filter:'ZERO',interlace:'NONE',chunkTypes:['IHDR','cICP','mDCV','cLLI','IDAT','IEND']});assert.equal(Object.isFrozen(result.pngStructure),true);assert.equal(Object.isFrozen(result.pngStructure.chunkTypes),true);
}));

test('PNG structural projection suppresses text, unknown chunk names, payloads and CRC values and bounds its complete output',()=>{
 const base=png(),canary=Buffer.from('PRIVATE_TEXT_PAYLOAD_CANARY'),image=Buffer.concat([base.subarray(0,33),chunk('tEXt',canary),chunk('iTXt',canary),chunk('zTXt',canary),chunk('eXIf',canary),chunk('pRIV',canary),base.subarray(33)]);
 const facts=iosFramePngFacts(image);assert.deepEqual(facts,{signature:'PNG',envelope:'ENDED',width:1,height:1,bitDepth:8,colorType:2,compression:'ZERO',filter:'ZERO',interlace:'NONE',chunkTypes:['IHDR','tEXt','iTXt','zTXt','eXIf','OTHER','IDAT','IEND']});assert.ok(!JSON.stringify(facts).includes('PRIVATE_'));assert.ok(!JSON.stringify(facts).includes('pRIV'));assert.deepEqual(Object.keys(facts),['signature','envelope','width','height','bitDepth','colorType','compression','filter','interlace','chunkTypes']);
 const header=Buffer.from(base.subarray(16,29));header.writeUInt32BE(4294967295);header[8]=7;header[9]=1;header[10]=3;header[11]=4;header[12]=1;const odd=Buffer.concat([base.subarray(0,8),chunk('IHDR',header),base.subarray(33)]);
 assert.deepEqual(iosFramePngFacts(odd),{signature:'PNG',envelope:'ENDED',width:null,height:1,bitDepth:'OTHER',colorType:'OTHER',compression:'OTHER',filter:'OTHER',interlace:'ADAM7',chunkTypes:['IHDR','IDAT','IEND']});header[12]=3;assert.equal(iosFramePngFacts(Buffer.concat([base.subarray(0,8),chunk('IHDR',header),base.subarray(33)])).interlace,'OTHER');
 const many=Buffer.concat([base.subarray(0,33),...Array.from({length:130},()=>chunk('pRIV')),base.subarray(33)]),bounded=iosFramePngFacts(many);assert.equal(bounded.envelope,'CHUNK_LIMIT');assert.equal(bounded.chunkTypes.length,128);assert.ok(JSON.stringify(bounded).length<2048);
 assert.equal(iosFramePngFacts(base.subarray(0,20)).envelope,'TRUNCATED');assert.equal(iosFramePngFacts(Buffer.concat([base,canary])).envelope,'TRAILING');assert.equal(iosFramePngFacts(base.subarray(0,base.length-12)).envelope,'MISSING_END');assert.equal(iosFramePngFacts(Buffer.alloc(8388609)).envelope,'UNAVAILABLE');
 assert.equal(iosFramePngFacts(Buffer.concat([Buffer.from([255,216,255]),canary])).signature,'JPEG');assert.equal(iosFramePngFacts(canary).signature,'OTHER');assert.equal(iosFramePngFacts(null).signature,'OTHER');
});

test('GUI failure prevents inventory and a failed BEFORE inventory after GUI prevents every child command without retry',async()=>{
 await fixture(async f=>{let children=0,measurements=0;const result=await runIosFrameCapability({...f,head},{...f.ports,measure:()=>{measurements++;throw Error('private-canary');},capture:async()=>{children++;throw Error('Unexpected child');}});assert.equal(result.stage,'BEFORE');assert.deepEqual(f.calls,['gui']);assert.equal(measurements,1);assert.equal(children,0);assert.equal(result.cleanupVerified,true);});
 await fixture(async f=>{const result=await runIosFrameCapability({...f,head},{...f.ports,openSimulator:async(_id,report)=>{report('EXIT_NONZERO');throw Error('private-canary');}});assert.equal(result.stage,'GUI');assert.equal(result.commandFailure,'EXIT_NONZERO');assert.deepEqual(f.calls,[]);});
});
test('only BEFORE and AFTER measurement failures project existing fixed checks, never private error text or unknown tags',async()=>{
 for(const phase of ['BEFORE','AFTER'])for(const kind of ['known','unknown'])await fixture(async f=>{
  let calls=0;const result=await runIosFrameCapability({...f,head},{...f.ports,measure:id=>{
   if(++calls===(phase==='BEFORE'?1:2)){
    if(kind==='known')return iosMeasurementStep('DEVICES_QUERY',()=>{throw Object.assign(Error('PRIVATE_MEASUREMENT_CANARY'),{code:'ETIMEDOUT'});});
    throw Object.assign(Error('PRIVATE_MEASUREMENT_CANARY'),{iosSimulatorCheck:'PRIVATE_TAG_CANARY'});
   }
   return f.ports.measure(id);
  }});
  assert.equal(result.ready,false);assert.equal(result.failureStage,phase);assert.equal(result.measurementCheck,kind==='known'?'DEVICES_TIMEOUT':'UNKNOWN');assert.equal(result.cleanupVerified,true);assert.equal(result.originalReasons,null);assert.equal(calls,phase==='BEFORE'?1:2);assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
 });
 await fixture(async f=>{const result=await runIosFrameCapability({...f,head},{...f.ports,openSimulator:async()=>{throw Object.assign(Error('PRIVATE_GUI_CANARY'),{iosSimulatorCheck:'DEVICES_TIMEOUT'});}});assert.equal(result.failureStage,'GUI');assert.equal(result.measurementCheck,null);assert.ok(!JSON.stringify(result).includes('PRIVATE_'));});
});

test('a replaced private output directory is retained and cannot authorize readiness or unsafe cleanup',()=>fixture(async f=>{
 const directory=join(f.root,'ios-frame-capability');const result=await runIosFrameCapability({...f,head},{...f.ports,capture:async(id,file)=>{await f.ports.capture(id,file);fs.renameSync(directory,directory+'-retained');fs.mkdirSync(directory,{mode:448});fs.writeFileSync(join(directory,'foreign-marker'),'retained');}});
 assert.equal(result.ready,false);assert.equal(result.stage,'CLEANUP');assert.equal(result.cleanupVerified,false);assert.equal(fs.readFileSync(join(directory,'foreign-marker'),'utf8'),'retained');assert.ok(fs.existsSync(join(directory+'-retained','output/ios-frame-capability/takeScreenshot/frame.png')));
 assert.equal(result.failureStage,'PNG');assert.equal(result.pngFailure,'READ_OR_IDENTITY');assert.equal(result.cleanupFailure,'DIRECTORY_CUSTODY');
}));

test('cleanup failure preserves the original failed capture and closed command category without exposing errors',()=>fixture(async f=>{
 const result=await runIosFrameCapability({...f,head},{...f.ports,capture:async(id,file,report)=>{await f.ports.capture(id,file);fs.writeFileSync(join(f.root,'ios-frame-capability','private-canary'),'retained');report('TERMINATED');throw Error('private-canary');}});
 assert.equal(result.ready,false);assert.equal(result.stage,'CLEANUP');assert.equal(result.failureStage,'CAPTURE');assert.equal(result.commandFailure,'TERMINATED');assert.equal(result.pngFailure,null);assert.equal(result.cleanupFailure,'ROSTER');assert.equal(result.cleanupRosterFailure,'UNEXPECTED_FILE');assert.equal(result.cleanupVerified,false);assert.ok(!JSON.stringify(result).includes('private-canary'));
}));

test('a nonprivate screenshot is neither read nor deleted and reports both original PNG custody and cleanup failure',()=>fixture(async f=>{
 const original=fs.lstatSync;fs.lstatSync=(file,...args)=>{const value=original(file,...args);if(String(file).endsWith('frame.png'))return new Proxy(value,{get(target,key){if(key==='mode')return(target.mode&~511)|420;const got=target[key];return typeof got==='function'?got.bind(target):got;}});return value;};syncBuiltinESMExports();
 try{const result=await runIosFrameCapability({...f,head},f.ports);assert.equal(result.ready,false);assert.equal(result.stage,'CLEANUP');assert.equal(result.failureStage,'PNG');assert.equal(result.pngFailure,'PERMISSIONS');assert.equal(result.commandFailure,null);assert.equal(result.cleanupFailure,'ROSTER');assert.equal(result.cleanupRosterFailure,'PERMISSIONS');assert.equal(result.cleanupVerified,false);assert.ok(fs.existsSync(join(f.root,'ios-frame-capability','output/ios-frame-capability/takeScreenshot/frame.png')));assert.deepEqual(f.calls,['gui','measure','capture']);}finally{fs.lstatSync=original;syncBuiltinESMExports();}
}));

test('cleanup-only failure is distinguished from any earlier capture or PNG failure',()=>fixture(async f=>{
 let calls=0;const result=await runIosFrameCapability({...f,head},{...f.ports,measure:id=>{const value=f.ports.measure(id);if(++calls===2)fs.writeFileSync(join(f.root,'ios-frame-capability','private-canary'),'retained');return value;}});
 assert.equal(result.ready,false);assert.equal(result.stage,'CLEANUP');assert.equal(result.failureStage,null);assert.equal(result.commandFailure,null);assert.equal(result.pngFailure,null);assert.equal(result.cleanupFailure,'ROSTER');assert.equal(result.cleanupVerified,false);assert.ok(!JSON.stringify(result).includes('private-canary'));
}));
test('existing owned driver-only and full authorities permit the same one fixture-free capability check',async()=>{
 for(const patch of [{SUBTRACK_NATIVE_PROOF_SCOPE:'ios-driver'},{GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/304/merge',GITHUB_HEAD_REF:'codex/sweden-data-native-followup',ST253_CAPTURE_BASE_REF:'st/native-synthetic-bank'}])await fixture(async f=>{const result=await runIosFrameCapability({...f,head,environment:{...f.environment,...patch}},f.ports);assert.equal(result.ready,true);assert.equal(f.calls.filter(value=>value==='capture').length,1);});
});

test('one generated SpringBoard screenshot command binds exact argv, private config, PNG path and bounded natural child result',()=>fixture(async f=>{
 let calls=0;const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async(log,args,environment,deadline,program)=>{
  calls++;const directory=dirname(log);assert.equal(program,'maestro');assert.equal(deadline,180000);assert.deepEqual(args,['--device',udid,'--platform','ios','test','--config',join(directory,'config.yaml'),'--debug-output',join(directory,'output'),'--flatten-debug-output',join(directory,'flow.yaml')]);assert.equal(environment.XDG_STATE_HOME,join(directory,'state'));assert.equal(fs.readFileSync(args.at(-1),'utf8'),IOS_FRAME_FLOW);assert.equal(fs.readFileSync(join(directory,'config.yaml'),'utf8'),IOS_FRAME_CONFIG);assert.equal(IOS_FRAME_FLOW.split('\n').filter(line=>line.startsWith('- ')).length,1);for(const forbidden of ['launchApp','clearState','tapOn','inputText','onFlowStart','onFlowComplete','runScript'])assert.ok(!IOS_FRAME_FLOW.includes(forbidden));
  fs.writeFileSync(log,'PRIVATE_PROCESS_CANARY',{mode:384,flag:'wx'});await f.ports.capture(id,file);const flow=dirname(dirname(file));fs.writeFileSync(join(flow,'commands.json'),'[]',{mode:384});fs.writeFileSync(join(flow,'manifest.json'),'{}',{mode:384});fs.writeFileSync(join(directory,'output','maestro.log'),'PRIVATE_LOG_CANARY',{mode:384});fs.writeFileSync(join(directory,'output','xctest_runner_2026-10-18_220000.log'),'PRIVATE_RUNNER_CANARY',{mode:384});fs.mkdirSync(join(flow,'logs'),{mode:448});fs.writeFileSync(join(flow,'logs','device-simulator.log'),'PRIVATE_DEVICE_CANARY',{mode:384});return {exitCode:0,complete:true,timedOut:false};
 }});
 const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,true);assert.equal(result.cleanupVerified,true);assert.equal(calls,1);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
}));

test('actual owned Node child exit and close produce only private bounded output before complete probe cleanup',()=>fixture(async f=>{
 const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async(log,_args,environment,deadline,program)=>{
  assert.equal(program,'maestro');
  const code=`const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(path.dirname(process.argv[1]),{recursive:true,mode:448});fs.writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'),{flag:'wx',mode:384});process.stdout.write('PRIVATE_CHILD_CANARY');`;
  return runIosDriverChild(log,['-e',code,file,png().toString('base64')],{...process.env,...environment},deadline,process.execPath);
 }});const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,true);assert.equal(result.cleanupVerified,true);assert.ok(!JSON.stringify(result).includes('PRIVATE_CHILD_CANARY'));assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);
}));

test('a successful command removes the pinned initial opt-out analytics state without ever reading its contents',()=>fixture(async f=>{
 const original=fs.openSync;let reads=0;
 fs.openSync=(file,flags,...args)=>{if(String(file).endsWith('analytics.json')&&flags===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)){reads++;throw Error('ANALYTICS_MUST_NOT_BE_READ');}return original(file,flags,...args);};syncBuiltinESMExports();
 try{
  const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async(log,_args,environment)=>{
   const state=join(environment.XDG_STATE_HOME,'maestro');fs.mkdirSync(state,{mode:448});
   // Pinned saveInitialState(granted=false): fixed CI identity, opted out,
   // and no uploaded/authenticated user. These bytes are cleanup-only.
   fs.writeFileSync(join(state,'analytics.json'),JSON.stringify({uuid:'PRIVATE_CI_CANARY',enabled:false,lastUploadedTime:null})+'\n',{mode:384,flag:'wx'});
   fs.writeFileSync(log,'private',{mode:384,flag:'wx'});await f.ports.capture(id,file);return {exitCode:0,complete:true,timedOut:false};
  }});
  const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,true);assert.equal(result.cleanupVerified,true);assert.equal(reads,0);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
 }finally{fs.openSync=original;syncBuiltinESMExports();}
}));

test('the exact analytics-state exception never admits other nested state files or directories',async()=>{
 for(const directory of [false,true])await fixture(async f=>{
  const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async(log,_args,environment)=>{
   const state=join(environment.XDG_STATE_HOME,'maestro');fs.mkdirSync(state,{mode:448});fs.writeFileSync(join(state,'analytics.json'),'PRIVATE_ANALYTICS_CANARY',{mode:384,flag:'wx'});
   const unexpected=join(state,'PRIVATE_UNEXPECTED_CANARY');if(directory)fs.mkdirSync(unexpected,{mode:448});else fs.writeFileSync(unexpected,'retained',{mode:384,flag:'wx'});
   fs.writeFileSync(log,'private',{mode:384,flag:'wx'});await f.ports.capture(id,file);return {exitCode:0,complete:true,timedOut:false};
  }});
  const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,false);assert.equal(result.failureStage,'OUTPUT');assert.equal(result.cleanupVerified,false);assert.equal(result.cleanupRosterFailure,directory?'UNEXPECTED_DIRECTORY':'UNEXPECTED_FILE');assert.ok(fs.existsSync(join(f.root,'ios-frame-capability','state','maestro','PRIVATE_UNEXPECTED_CANARY')));assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
 });
});

test('nonzero incomplete timed-out and signalled child evidence never authorizes a valid-looking PNG or retry',async()=>{
 for(const child of [{exitCode:1,complete:true,timedOut:false},{exitCode:0,complete:false,timedOut:false},{exitCode:0,complete:true,timedOut:true},{exitCode:0,complete:true,timedOut:false,closed:false},{exitCode:0,complete:true,timedOut:false,signal:'SIGTERM'},{exitCode:0,complete:true,timedOut:false,error:'PRIVATE_CANARY'},{exitCode:0,complete:'true',timedOut:false}])await fixture(async f=>{let calls=0;const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async log=>{calls++;fs.writeFileSync(log,'PRIVATE_CANARY',{mode:384,flag:'wx'});await f.ports.capture(id,file);return child;}});const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,false);assert.equal(result.failureStage,'CAPTURE');assert.equal(result.cleanupVerified,true);assert.equal(calls,1);assert.equal(f.calls.filter(value=>value==='measure').length,1);assert.ok(!JSON.stringify(result).includes('PRIVATE_CANARY'));});
});

test('only a naturally completed nonzero original child reads its exact process log once and emits existing closed reasons',async()=>{
 for(const kind of ['natural','unknown','timeout','incomplete','unclosed','signal','error','bad-exit'])await fixture(async f=>{
  const original=fs.openSync;let reads=0,calls=0;
  fs.openSync=(file,flags,...args)=>{if(String(file)===join(f.root,'ios-frame-capability','process.log')&&flags===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW))reads++;return original(file,flags,...args);};syncBuiltinESMExports();
  try{
   const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async log=>{
    calls++;fs.writeFileSync(log,kind==='unknown'?'PRIVATE_CANARY':'failed to connect PRIVATE_CANARY',{mode:384,flag:'wx'});
    return {exitCode:kind==='bad-exit'?256:1,complete:kind!=='incomplete',timedOut:kind==='timeout',...(kind==='unclosed'?{closed:false}:{}),...(kind==='signal'?{signal:'SIGTERM'}:{}),...(kind==='error'?{error:'PRIVATE_CANARY'}:{})};
   }});
   const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,false);assert.equal(calls,1);assert.equal(result.failureStage,'CAPTURE');assert.equal(result.cleanupVerified,true);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);
   const natural=['natural','unknown'].includes(kind);assert.equal(reads,natural?1:0);assert.deepEqual(result.originalReasons,natural?[kind==='natural'?'connection':'UNKNOWN']:null);assert.ok(!JSON.stringify(result).includes('PRIVATE_CANARY'));
  }finally{fs.openSync=original;syncBuiltinESMExports();}
 });
});

test('a known process read failure stays UNKNOWN and unexpected directories retain custody without disclosing names',()=>fixture(async f=>{
 const original=fs.openSync;let reads=0;
 fs.openSync=(file,flags,...args)=>{if(String(file)===join(f.root,'ios-frame-capability','process.log')&&flags===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)){reads++;throw Error('PRIVATE_READ_CANARY');}return original(file,flags,...args);};syncBuiltinESMExports();
 try{
  const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async log=>{fs.writeFileSync(log,'failed to connect PRIVATE_CONTENT_CANARY',{mode:384,flag:'wx'});fs.mkdirSync(join(dirname(log),'state','PRIVATE_DIRECTORY_CANARY'),{mode:448});return {exitCode:1,complete:true,timedOut:false};}});
  const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(reads,1);assert.equal(result.ready,false);assert.deepEqual(result.originalReasons,['UNKNOWN']);assert.equal(result.cleanupFailure,'ROSTER');assert.equal(result.cleanupRosterFailure,'UNEXPECTED_DIRECTORY');assert.equal(result.cleanupVerified,false);assert.ok(fs.existsSync(join(f.root,'ios-frame-capability','state','PRIVATE_DIRECTORY_CANARY')));assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
 }finally{fs.openSync=original;syncBuiltinESMExports();}
}));

test('changed generated inputs or unexpected child outputs withhold readiness without deleting unknown output',async()=>{
 for(const kind of ['flow','config','foreign','duplicate-flow','extra-png'])await fixture(async f=>{const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async log=>{const directory=dirname(log);fs.writeFileSync(log,'private',{mode:384,flag:'wx'});await f.ports.capture(id,file);if(kind==='flow')fs.appendFileSync(join(directory,'flow.yaml'),'\n- launchApp\n');if(kind==='config')fs.writeFileSync(join(directory,'config.yaml'),'onFlowStart: private');if(kind==='foreign')fs.writeFileSync(join(directory,'foreign-private'),'retain',{mode:384});if(kind==='duplicate-flow')fs.mkdirSync(join(directory,'output','ios-frame-capability-2'),{mode:448});if(kind==='extra-png')fs.writeFileSync(join(dirname(file),'foreign.png'),png(),{mode:384});return {exitCode:0,complete:true,timedOut:false};}});const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,false);assert.equal(result.failureStage,['flow','config'].includes(kind)?'INPUT':'OUTPUT');assert.equal(result.cleanupVerified,['flow','config'].includes(kind));assert.ok(!JSON.stringify(result).includes('foreign-private'));if(!result.cleanupVerified)assert.ok(fs.existsSync(join(f.root,'ios-frame-capability')));});
});

test('oversized known logs and replaced output directories withhold without reading or deleting unknown custody',async()=>{
 for(const kind of ['oversize','output-swap'])await fixture(async f=>{const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async log=>{const directory=dirname(log);fs.writeFileSync(log,'private',{mode:384,flag:'wx'});await f.ports.capture(id,file);if(kind==='oversize')fs.writeFileSync(join(directory,'output','maestro.log'),Buffer.alloc(2097153),{mode:384});else{fs.renameSync(join(directory,'output'),join(directory,'output-retained'));fs.mkdirSync(join(directory,'output'),{mode:448});fs.writeFileSync(join(directory,'output','foreign-private'),'retain',{mode:384});}return {exitCode:0,complete:true,timedOut:false};}});const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,false);assert.equal(result.failureStage,kind==='oversize'?'OUTPUT':'INPUT');assert.equal(result.cleanupVerified,false);assert.ok(fs.existsSync(join(f.root,'ios-frame-capability')));assert.ok(!JSON.stringify(result).includes('foreign-private'));});
});

test('successful child must produce exactly the commanded PNG; known failure frames remain cleanup-only',async()=>{
 for(const suffix of ['.png','.png.tmp'])for(const exitCode of [0,1])await fixture(async f=>{
  const capture=(id,file,report,options)=>captureIosFrame(id,file,report,{...options,runChild:async log=>{fs.writeFileSync(log,'private',{mode:384,flag:'wx'});await f.ports.capture(id,file);const screenshots=join(dirname(dirname(file)),'screenshots');fs.mkdirSync(screenshots,{mode:448});fs.writeFileSync(join(screenshots,'step-002-takeScreenshot'+suffix),png(),{mode:384});return {exitCode,complete:true,timedOut:false};}});
  const result=await runIosFrameCapability({...f,head},{...f.ports,capture});assert.equal(result.ready,false);assert.equal(result.failureStage,exitCode===0?'OUTPUT':'CAPTURE');assert.equal(result.cleanupVerified,true);assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);assert.equal(f.calls.filter(value=>value==='measure').length,1);
 });
});

test('concurrent PNG growth never allocates or reads beyond the original size plus one and clears its backing buffer',()=>fixture(async f=>{
 const original=fs.readSync,frame=join(f.root,'ios-frame-capability','output/ios-frame-capability/takeScreenshot/frame.png');let backing,grew=false;
 fs.readSync=(fd,buffer,...args)=>{if(!grew&&fs.existsSync(frame)&&fs.fstatSync(fd).size===png().length){grew=true;backing=buffer;assert.equal(buffer.length,png().length+1);fs.appendFileSync(frame,Buffer.alloc(1048576));}return original(fd,buffer,...args);};syncBuiltinESMExports();
 try{const result=await runIosFrameCapability({...f,head},f.ports);assert.equal(grew,true);assert.equal(result.ready,false);assert.equal(result.failureStage,'PNG');assert.equal(result.pngFailure,'READ_OR_IDENTITY');assert.equal(result.cleanupVerified,true);assert.ok(backing.every(byte=>byte===0));assert.equal(fs.existsSync(join(f.root,'ios-frame-capability')),false);}finally{fs.readSync=original;syncBuiltinESMExports();}
}));
test('the documented Apple iDOT token is observed without disclosing its payload',()=>{
 const original=png(),canary=Buffer.from('PRIVATE_PAYLOAD_CANARY');
 const file=Buffer.concat([original.subarray(0,33),chunk('iDOT',canary),original.subarray(33)]);
 const facts=iosFramePngFacts(file);assert.deepEqual(facts.chunkTypes,['IHDR','iDOT','IDAT','IEND']);assert.ok(!JSON.stringify(facts).includes('PRIVATE_'));
});

test('workflow gates one authorized driver-only or full capability check before database fixture and compilation',()=>{
 const workflow=fs.readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8');const name='- name: Fresh owned iOS screenshot capability before fixture or compilation',start=workflow.indexOf(name),end=workflow.indexOf('- name:',start+name.length),block=workflow.slice(start,end);
 const expression=block.match(/if: (.+)/)[1].replaceAll(' == ',' === ').replaceAll('needs.select-proof','needs.selectProof');const allow=(platform,scope,enabled)=>Function('matrix','needs','env',`return ${expression}`)({platform},{selectProof:{outputs:{scope}}},{ST253_CAPTURE_ENABLED:enabled});
 assert.equal(allow('ios','full','true'),true);assert.equal(allow('ios','ios-driver','true'),true);for(const tuple of [['android','full','true'],['ios','profile','true'],['ios','full','false']])assert.equal(allow(...tuple),false);
 const boot=workflow.indexOf('- name: iOS 26.2 / Xcode 26.2 simulator'),driver=workflow.indexOf('- name: Owned iOS driver readiness'),fixture=workflow.indexOf('- name: Owned PostgreSQL16'),driverBlock=workflow.slice(driver,fixture);
 assert.ok(boot>=0&&boot<start&&start<driver&&driver<fixture);assert.ok(workflow.slice(boot,start).includes('recordPreinputSimulator(root,context)'));assert.ok(block.includes('umask 077'));assert.equal(block.split('node apps/mobile/scripts/private-runtime-ios-frame-capability.mjs').length-1,1);assert.ok(!block.includes('upload-artifact'));assert.ok(workflow.includes('private-runtime-ios-frame-capability-test.mjs'));
 // Both remain natural hard-failure steps. A failed driver cannot prevent
 // measuring the independent frame surface, but neither can authorize a fixture.
 for(const step of [block,driverBlock]){assert.ok(!step.includes('continue-on-error'));assert.ok(!step.includes('always()'));assert.ok(!step.includes('!cancelled()'));}
 assert.ok(driverBlock.includes("if: matrix.platform == 'ios'"));assert.equal(driverBlock.split('node apps/mobile/scripts/private-runtime-ios-driver-preflight.mjs').length-1,1);
});
