import assert from 'node:assert/strict';
import console from 'node:console';
import {execFile,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants,lstatSync,realpathSync,openSync,fstatSync,readFileSync,writeFileSync,closeSync,mkdirSync,readdirSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {preinputCaptureContext,validPreinputPng} from './private-runtime-maestro-metadata.mjs';
import {measureIosSimulator} from './private-runtime-ios-simulator-measurement.mjs';

export const IOS_FRAME_FAILURES=Object.freeze(['SPAWN','OUTPUT_LIMIT','TERMINATED','EXIT_NONZERO','OTHER']);
export function iosFrameFailure(error){
 try{
 if(['ENOENT','EACCES','EPERM'].includes(error?.code))return 'SPAWN';
 if(error?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')return 'OUTPUT_LIMIT';
 if(error?.killed===true||error?.signal==='SIGKILL'||error?.signal==='SIGTERM')return 'TERMINATED';
 if(Number.isInteger(error?.code)&&error.code>0&&error.code<=255)return 'EXIT_NONZERO';
 return 'OTHER';
 }catch{return 'OTHER';}
}
function boundedCommand(binary,args,onFailure,execute){
 return new Promise((accept,reject)=>{
  const failed=error=>{const category=iosFrameFailure(error);try{onFailure?.(category);}catch{/* Observation cannot authorize readiness. */}reject(Object.assign(Error('iOS frame command unavailable'),{iosFrameFailure:category}));};
  try{execute(binary,args,{timeout:10000,killSignal:'SIGKILL',maxBuffer:65536,encoding:'utf8'},error=>error?failed(error):accept());}catch(error){failed(error);}
 });
}
export function captureIosFrame(udid,file,onFailure,{execute=execFile}={}){
 assert.match(udid,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/);assert.equal(resolve(file),file);
 // Apple WWDC2019, Getting the Most Out of Simulator: simctl io <device> screenshot <output.png>.
 return boundedCommand('xcrun',['simctl','io',udid,'screenshot',file],onFailure,execute);
}
export function openOwnedIosSimulator(udid,onFailure,{execute=execFile}={}){
 assert.match(udid,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/);
 // Match pinned Maestro cli-2.11.0 LocalSimulatorUtils.launchSimulator; no renderer defaults changes.
 // https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-ios-driver/src/main/kotlin/util/LocalSimulatorUtils.kt#L111-L125
 return boundedCommand('/usr/bin/open',['-a','/Applications/Xcode_26.2.app/Contents/Developer/Applications/Simulator.app','--args','-CurrentDeviceUDID',udid],onFailure,execute);
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function privateState(file,isDirectory=false,limit=8388608){const s=lstatSync(file);assert.equal(s.isSymbolicLink(),false);assert.equal(realpathSync(file),resolve(file));assert.equal(s.uid,process.getuid?.()??s.uid);assert.equal(s.mode&511,isDirectory?448:384);assert.ok(isDirectory?s.isDirectory():s.isFile()&&s.nlink===1&&s.size>0&&s.size<=limit);return s;}
function identity(one,two){for(const key of ['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid','nlink'])assert.equal(one[key],two[key]);}
function directoryIdentity(file,state){const actual=privateState(file,true);assert.equal(actual.dev,state.dev);assert.equal(actual.ino,state.ino);}
function privateBytes(file,limit){const before=privateState(file,false,limit),fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{identity(before,fstatSync(fd));const bytes=readFileSync(fd);identity(before,fstatSync(fd));identity(before,privateState(file,false,limit));assert.equal(bytes.length,before.size);return bytes;}finally{closeSync(fd);}}
function custody(root,context){const bytes=privateBytes(join(root,'preinput-ios-custody.json'),4096),v=JSON.parse(bytes);assert.deepEqual(v,{version:1,...context,device:'iPhone-17',runtime:'iOS-26-2',fresh:true});return sha(bytes);}
export async function runIosFrameCapability({environment,head,root},{platform=process.platform,measure=measureIosSimulator,capture=captureIosFrame,openSimulator=openOwnedIosSimulator}={}){
 let stage='CONTEXT',commandFailure='OTHER',directory,ownedDirectory,ready=false,cleanupVerified=true;
 const observe=value=>{if(IOS_FRAME_FAILURES.includes(value))commandFailure=value;};
 try{
  assert.equal(platform,'darwin');assert.equal(environment.CI,'true');assert.ok(['full','ios-driver'].includes(environment.SUBTRACK_NATIVE_PROOF_SCOPE));assert.equal(environment.SUBTRACK_PRIVATE_FIXTURE_CONFIG,undefined);assert.equal(process.umask()&63,63);
  const context=preinputCaptureContext(environment,head);assert.ok(context);assert.equal(root,join(environment.RUNNER_TEMP,'subtrack-native-proof','private'));stage='CUSTODY';privateState(root,true);const original=custody(root,context);
  writeFileSync(join(root,'ios-frame-capability-claim.json'),JSON.stringify({schema:'st253-ios-frame-capability-claim-v1',...context}),{flag:'wx',mode:384});
  stage='BEFORE';const before=measure(context.udid);stage='GUI';await openSimulator(context.udid,observe);
  stage='CUSTODY';directory=join(root,'ios-frame-capability');mkdirSync(directory,{mode:448});cleanupVerified=false;ownedDirectory=privateState(directory,true);
  const file=join(directory,'frame.png');assert.equal(existsSync(file),false);stage='CAPTURE';await capture(context.udid,file,observe);
  stage='PNG';const png=privateBytes(file,8388608);try{assert.equal(validPreinputPng(png),true);}finally{png.fill(0);}
  stage='AFTER';assert.deepEqual(measure(context.udid),before);assert.equal(custody(root,context),original);ready=true;
 }catch{/* Only fixed phase/categories leave this fixture-free capability check. */}
 finally{
  if(ownedDirectory)try{directoryIdentity(directory,ownedDirectory);const entries=readdirSync(directory);assert.ok(entries.length===0||entries.length===1&&entries[0]==='frame.png');if(entries.length){const file=join(directory,'frame.png'),s=lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===(process.getuid?.()??s.uid)&&(s.mode&511)===384);unlinkSync(file);}rmdirSync(directory);cleanupVerified=!existsSync(directory);}catch{stage='CLEANUP';ready=false;cleanupVerified=false;}
 }
 return Object.freeze({schema:'st253-ios-frame-capability-v1',ready:ready&&cleanupVerified,stage:ready&&cleanupVerified?'COMPLETE':stage,commandFailure:['GUI','CAPTURE'].includes(stage)?commandFailure:null,cleanupVerified});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 void(async()=>{assert.equal(process.argv.length,2);const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),result=await runIosFrameCapability({environment:process.env,head,root:join(process.env.RUNNER_TEMP,'subtrack-native-proof','private')});console.log(JSON.stringify(result));if(!result.ready)process.exitCode=1;})().catch(()=>{console.log(JSON.stringify({schema:'st253-ios-frame-capability-v1',ready:false,stage:'CONTEXT',commandFailure:null,cleanupVerified:false}));process.exitCode=1;});
}
