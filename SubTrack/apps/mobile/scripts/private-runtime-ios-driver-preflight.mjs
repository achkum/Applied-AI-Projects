import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {constants,openSync,closeSync,writeSync,fstatSync,lstatSync,readFileSync,writeFileSync,readdirSync,realpathSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {URL,pathToFileURL} from 'node:url';
import {setTimeout,clearTimeout} from 'node:timers';
import process from 'node:process';
import console from 'node:console';
import {maestroDevicePrefix} from './private-runtime-maestro-device.mjs';
import {preinputCaptureContext,PREINPUT_RECIPIENT_SHA256} from './private-runtime-maestro-metadata.mjs';
import {sealIosDriverLog,validSealedIosDriverLog} from './private-runtime-ios-driver-seal.mjs';
import {measureIosSimulator,iosMeasurementStep,iosMeasurementCategory} from './private-runtime-ios-simulator-measurement.mjs';
import {originalDriverToolDiagnostic} from './private-runtime-identifier-diagnostic.mjs';
import {sampleOwnedIosDriver} from './private-runtime-ios-driver-stack.mjs';
export {measuredIosSimulator} from './private-runtime-ios-simulator-measurement.mjs';

const LIMIT=262144,sha=value=>createHash('sha256').update(value).digest('hex');
const SAMPLE_CHECKS=['CONTEXT','JDK','CUSTODY','IDENTITY_BEFORE','THREAD_PRINT','IDENTITY_AFTER','CLASSIFICATION','COMPLETE'];
const keys=(value,list)=>assert.deepEqual(Object.keys(value).sort(),[...list].sort());
function owned(file,directory=false,maximum=LIMIT){const s=lstatSync(file);assert.equal(s.isSymbolicLink(),false);assert.equal(realpathSync(file),resolve(file));if(typeof process.getuid==='function')assert.equal(s.uid,process.getuid());assert.ok(directory?s.isDirectory():s.isFile()&&s.size>0&&s.size<=maximum);return s;}
function privateBytes(file,maximum=LIMIT){const before=owned(file,false,maximum);assert.equal(before.mode&511,384);const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const opened=fstatSync(fd);assert.equal(opened.ino,before.ino);assert.equal(opened.dev,before.dev);const bytes=readFileSync(fd),after=owned(file,false,maximum);assert.equal(bytes.length,before.size);assert.equal(after.ino,before.ino);assert.equal(after.size,before.size);return bytes;}finally{closeSync(fd);}}
function custody(root,context){const file=join(root,'preinput-ios-custody.json'),bytes=privateBytes(file,4096),value=JSON.parse(bytes);assert.equal(JSON.stringify(value),bytes.toString('utf8'));keys(value,['version','sourceHead','runId','attempt','udid','device','runtime','fresh']);assert.equal(value.version,1);for(const key of ['sourceHead','runId','attempt','udid'])assert.equal(value[key],context[key]);assert.equal(value.device,'iPhone-17');assert.equal(value.runtime,'iOS-26-2');assert.equal(value.fresh,true);return sha(bytes);}

/** Original child only; log bytes stay in the owned private directory. */
export async function runIosDriverChild(file,args,environment,timeoutMs=180000,program='maestro',{
 spawnChild=spawn,signalProcess=(pid,signal)=>process.kill(pid,signal),platform=process.platform,
 sampleDriver=sampleOwnedIosDriver,schedule=setTimeout,cancel=clearTimeout,verifiedContext=null,
}={}){
 const fd=openSync(file,'wx',384);let timeout=false,timer,cleanupTimer,probeTimer,probePromise,ownedPid=null,sampledStage='UNKNOWN',sampledCheck='UNKNOWN',probeAttempted=false;
 const probeAbort=new globalThis.AbortController(),group=platform!=='win32';
 try{return await new Promise((resolveChild,reject)=>{
  let child;try{child=spawnChild(program,args,{env:environment,stdio:['ignore','pipe','pipe'],detached:group});}catch{reject(Error('iOS driver spawn unavailable'));return;}
  let exited=null,invalid=false,closed=false;
  const finish=(code,signal,observedClose)=>{if(closed)return;closed=true;cancel(timer);cancel(cleanupTimer);cancel(probeTimer);probeAbort.abort();if(!observedClose)child.unref();const result=()=>({exitCode:code,complete:observedClose&&!invalid&&ownedPid!==null&&exited!==null&&exited.code===code&&exited.signal===null&&signal===null&&!timeout,timedOut:timeout,...(probeAttempted?{sampledStage,sampledCheck}:{}),...(!observedClose?{closed:false}:{})});if(observedClose)Promise.resolve(probePromise).then(()=>resolveChild(result()));else resolveChild(result());};
  const stop=()=>{if(timeout||closed)return;timeout=true;cancel(probeTimer);probeAbort.abort();cleanupTimer=schedule(()=>finish(null,null,false),5000);if(ownedPid!==null&&exited===null){try{signalProcess(group?-ownedPid:ownedPid,'SIGKILL');}catch{/* A failed kill never grants completion/readiness. */}}child.stdout.destroy();child.stderr.destroy();};
  timer=schedule(stop,timeoutMs);let size=0;
  child.once('spawn',()=>{if(timeout||closed||exited!==null)return;const pid=child.pid;if(!Number.isSafeInteger(pid)||pid<=1||pid===process.pid){invalid=true;return;}ownedPid=pid;
   if(platform==='darwin'&&program==='maestro'&&timeoutMs===180000&&verifiedContext?.sourceHead===environment.ST253_CAPTURE_SOURCE_HEAD&&verifiedContext?.udid===environment.SUBTRACK_SIMULATOR_UDID)probeTimer=schedule(()=>{if(timeout||closed||exited!==null||probeAbort.signal.aborted)return;probeAttempted=true;probePromise=Promise.resolve().then(()=>sampleDriver({pid,parentPid:process.pid,environment,signal:probeAbort.signal,logFile:join(dirname(file),'thread-stack.log'),onCheck:check=>{sampledCheck=SAMPLE_CHECKS.includes(check)?check:'UNKNOWN';}})).then(stage=>{if(['ANDROID_DISCOVERY','IOS_INVENTORY','SESSION_LOCK','XCTEST_INSTALL','XCTEST_STATUS','HIERARCHY'].includes(stage))sampledStage=stage;},()=>{});},120000);
  });
  const consume=chunk=>{if(timeout||closed)return;size+=chunk.length;if(size>LIMIT){stop();return;}try{let offset=0;while(offset<chunk.length){const wrote=writeSync(fd,chunk,offset,chunk.length-offset);if(wrote<1)throw Error();offset+=wrote;}}catch{stop();}};child.stdout.on('data',consume);child.stderr.on('data',consume);
  child.on('error',()=>{invalid=true;});child.on('exit',(code,signal)=>{if(exited!==null)invalid=true;exited={code,signal};cancel(probeTimer);probeAbort.abort();});
  child.on('close',(code,signal)=>finish(code,signal,true));
 });}finally{cancel(timer);cancel(cleanupTimer);cancel(probeTimer);probeAbort.abort();closeSync(fd);}
}
export function collectIosDriverLogs(invocation,{strict=false}={}){
 const processLog=privateBytes(join(invocation,'process.log'));let count=processLog.length;
 const payload={version:1,process:processLog.toString('base64'),maestro:null,runner:null};
 if(strict)for(const file of [join(invocation,'state'),join(invocation,'state','maestro'),join(invocation,'state','maestro','tests')]){try{owned(file,true);}catch(error){if(error.code==='ENOENT')return Buffer.from(JSON.stringify(payload));throw error;}}
 // These are optional tool logs, never authority for the original child.
 // Refuse ambiguous/oversized additions while retaining its bounded process log.
 try{
 const tests=join(invocation,'state','maestro','tests');let entries;try{owned(tests,true);entries=readdirSync(tests,{withFileTypes:true});}catch(error){if(strict)throw error;return Buffer.from(JSON.stringify(payload));}
 assert.equal(entries.length,1);assert.ok(entries[0].isDirectory()&&!entries[0].isSymbolicLink()&&/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(entries[0].name));const stamp=join(tests,entries[0].name);owned(stamp,true);
 const files=readdirSync(stamp,{withFileTypes:true});assert.ok(files.length<=32);
 for(const [kind,predicate]of [['maestro',name=>name==='maestro.log'],['runner',name=>/^xctest_runner_\d{4}-\d{2}-\d{2}_\d{6}\.log$/.test(name)]]){
  const matches=files.filter(file=>predicate(file.name));assert.ok(matches.length<=1);if(!matches.length)continue;const file=join(stamp,matches[0].name),s=owned(file,false);assert.ok(matches[0].isFile()&&!matches[0].isSymbolicLink());const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=fstatSync(fd);for(const key of ['ino','dev','size','mtimeMs','ctimeMs'])assert.equal(current[key],s[key]);const bytes=readFileSync(fd),openedAfter=fstatSync(fd),after=owned(file,false);for(const key of ['ino','dev','size','mtimeMs','ctimeMs']){assert.equal(openedAfter[key],current[key]);assert.equal(after[key],current[key]);}assert.equal(bytes.length,s.size);count+=bytes.length;assert.ok(count<=LIMIT);payload[kind]=bytes.toString('base64');}finally{closeSync(fd);}
 }
 assert.deepEqual(readdirSync(stamp).sort(),files.map(file=>file.name).sort());assert.deepEqual(readdirSync(tests).sort(),entries.map(entry=>entry.name).sort());return Buffer.from(JSON.stringify(payload));
 }catch(error){if(strict)throw error;return Buffer.from(JSON.stringify({...payload,maestro:null,runner:null}));}
}
/** A projection of the completed original child, not readiness or an artifact authorization. */
function originalDriverReasons(invocation,result){
 if(!result.complete||result.timedOut||!Number.isInteger(result.exitCode)||result.exitCode<1||result.exitCode>255)return ['UNKNOWN'];
 try{const payload=JSON.parse(collectIosDriverLogs(invocation,{strict:true})),texts=[];for(const key of ['process','maestro','runner']){if(payload[key]===null)continue;const bytes=Buffer.from(payload[key],'base64'),text=bytes.toString('utf8');assert.equal(Buffer.from(text).equals(bytes),true);texts.push(text);}return originalDriverToolDiagnostic(texts.join('\n'));}catch{return ['UNKNOWN'];}
}
function removeOwned(directory,parent){assert.equal(dirname(resolve(directory)),resolve(parent));owned(directory,true);const walk=(path,depth=0)=>{assert.ok(depth<=8);const entries=readdirSync(path,{withFileTypes:true});assert.ok(entries.length<=128);for(const entry of entries){const file=join(path,entry.name),s=lstatSync(file);if(typeof process.getuid==='function')assert.equal(s.uid,process.getuid());assert.equal(s.isSymbolicLink(),false);assert.equal(realpathSync(file),resolve(file));if(s.isDirectory())walk(file,depth+1);else assert.ok(s.isFile());}};walk(directory);rmSync(directory,{recursive:true});}
export function validatedIosDriverArtifact(root,context){try{if(!context)return false;const binding=JSON.parse(privateBytes(join(root,'ios-driver-failure.json'),4096));for(const name of ['sourceHead','runId','attempt','udid'])assert.equal(binding[name],context[name]);assert.equal(binding.commandSha256,sha(JSON.stringify(['maestro',...maestroDevicePrefix('ios',{SUBTRACK_SIMULATOR_UDID:context.udid}),'--verbose','hierarchy'])));assert.equal(binding.simulatorCustodySha256,custody(root,context));try{lstatSync(join(root,'ios-driver-preflight'));return false;}catch(error){assert.equal(error.code,'ENOENT');}return validSealedIosDriverLog(privateBytes(join(dirname(root),'sealed','ios-driver-preflight.st253sealed'),397312),binding);}catch{return false;}}

export async function runOwnedIosDriverPreflight({environment,root,head,measureDevice=measureIosSimulator,runChild=runIosDriverChild}){
 assert.equal(environment.CI,'true');assert.equal(environment.SUBTRACK_PRIVATE_DEVICE_PROOF,'true');assert.equal(Object.hasOwn(environment,'SUBTRACK_PRIVATE_FIXTURE_CONFIG'),false);
 const args=[...maestroDevicePrefix('ios',environment),'--verbose','hierarchy'],udid=environment.SUBTRACK_SIMULATOR_UDID,context=preinputCaptureContext(environment,head);
 mkdirSync(root,{recursive:true,mode:448});assert.equal(owned(root,true).mode&511,448);
 const measureAt=(phase,previous)=>{try{const value=measureDevice(udid);if(previous)iosMeasurementStep('SNAPSHOT_MATCH',()=>assert.deepEqual(value,previous));return value;}catch(error){console.error(`ST253_IOS_DRIVER measurement_phase=${phase} measurement_check=${iosMeasurementCategory(error)}`);throw error;}};
 const before=measureAt('before'),custodyHash=context?custody(root,context):null;
 const invocation=join(root,'ios-driver-preflight');mkdirSync(invocation,{mode:448});const state=join(invocation,'state');mkdirSync(state,{mode:448});
 let success=false,sealed=false,failure=null,stage='child';
 try{
  const result=await runChild(join(invocation,'process.log'),args,{...environment,XDG_STATE_HOME:state},180000,'maestro',{verifiedContext:context});
  console.log(`ST253_IOS_DRIVER child_complete=${result.complete===true} child_exit=${Number.isInteger(result.exitCode)&&result.exitCode>=0&&result.exitCode<=255?result.exitCode:'unavailable'} child_timeout=${result.timedOut===true}`);
  if(Object.hasOwn(result,'sampledStage'))console.log(`ST253_IOS_DRIVER sampled_stage=${['ANDROID_DISCOVERY','IOS_INVENTORY','SESSION_LOCK','XCTEST_INSTALL','XCTEST_STATUS','HIERARCHY'].includes(result.sampledStage)?result.sampledStage:'UNKNOWN'}`);
  if(Object.hasOwn(result,'sampledCheck'))console.log(`ST253_IOS_DRIVER sampled_check=${SAMPLE_CHECKS.includes(result.sampledCheck)?result.sampledCheck:'UNKNOWN'}`);
  if(result.closed===false)console.log('ST253_IOS_DRIVER child_closed=false');
  if(!result.complete||result.exitCode!==0||result.timedOut)console.log(`ST253_IOS_DRIVER original_reasons=${originalDriverReasons(invocation,result).join(',')}`);
  stage='after-device';measureAt('after',before);stage='after-custody';if(context)assert.equal(custody(root,context),custodyHash);
  stage='child-result';
  if(result.complete&&result.exitCode===0){success=true;writeFileSync(join(root,'ios-driver-ready.json'),JSON.stringify({sourceHead:head,udid,commandSha256:sha(JSON.stringify(['maestro',...args]))}),{flag:'wx',mode:384});}
  else if(context&&environment.GITHUB_EVENT_NAME==='workflow_dispatch'&&result.complete&&Number.isInteger(result.exitCode)&&result.exitCode>0&&result.exitCode<=255){
   const binding={version:1,purpose:'ios-driver-preflight',sourceHead:head,runId:context.runId,attempt:context.attempt,udid,simulatorCustodySha256:custodyHash,commandSha256:sha(JSON.stringify(['maestro',...args])),exitCode:result.exitCode,recipient:PREINPUT_RECIPIENT_SHA256};
   stage='logs';const payload=collectIosDriverLogs(invocation);stage='seal';const bytes=sealIosDriverLog(payload,binding,readFileSync(new URL('../../../.sdlc/evidence/ST-253/native-diagnostic-recipient.pem',import.meta.url)));
   stage='raw-cleanup';removeOwned(invocation,root);stage='publication';const destination=join(dirname(root),'sealed');mkdirSync(destination,{recursive:true,mode:448});assert.equal(owned(destination,true).mode&511,448);writeFileSync(join(root,'ios-driver-failure.json'),JSON.stringify(binding),{flag:'wx',mode:384});writeFileSync(join(destination,'ios-driver-preflight.st253sealed'),bytes,{flag:'wx',mode:384});stage='validation';assert.equal(validatedIosDriverArtifact(root,context),true);sealed=true;
  }
 }catch(error){failure=error;}finally{
  try{owned(invocation,true);removeOwned(invocation,root);}catch(error){if(error.code!=='ENOENT')failure??=error;}
  if(failure)console.error(`ST253_IOS_DRIVER failure_stage=${stage}`);
  console.log(`ST253_IOS_DRIVER readiness=${success?'ready':'failed'} diagnostic=${sealed?'sealed':'withheld'}`);
 }
 if(failure)throw failure;return {success,sealed};
}
async function main(){assert.equal(process.platform,'darwin');assert.equal(process.argv.length,2);const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),result=await runOwnedIosDriverPreflight({environment:process.env,root:join(process.env.RUNNER_TEMP,'subtrack-native-proof','private'),head});if(!result.success)process.exitCode=1;}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)void main().catch(()=>{console.error('ST253_IOS_DRIVER readiness=unavailable diagnostic=withheld');process.exitCode=1;});
