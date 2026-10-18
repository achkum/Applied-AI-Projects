import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import console from 'node:console';
import {execFile,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants,lstatSync,realpathSync,openSync,fstatSync,readSync,writeFileSync,closeSync,mkdirSync,readdirSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {preinputCaptureContext,validPreinputPng} from './private-runtime-maestro-metadata.mjs';
import {measureIosSimulator} from './private-runtime-ios-simulator-measurement.mjs';
import {runIosDriverChild} from './private-runtime-ios-driver-preflight.mjs';
import {maestroDevicePrefix} from './private-runtime-maestro-device.mjs';

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
export const IOS_FRAME_FLOW='appId: com.apple.springboard\nname: ios-frame-capability\n---\n- takeScreenshot: frame\n';
export const IOS_FRAME_CONFIG='{}\n';
const frameRelative='output/ios-frame-capability/takeScreenshot/frame.png';
export async function captureIosFrame(udid,file,onFailure,{environment=process.env,runChild=runIosDriverChild}={}){
 assert.match(udid,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/);assert.equal(resolve(file),file);
 const directory=dirname(dirname(dirname(dirname(file))));assert.equal(file,join(directory,frameRelative));const directoryBefore=privateState(directory,true);
 const flow=join(directory,'flow.yaml'),config=join(directory,'config.yaml'),output=join(directory,'output'),state=join(directory,'state');
 for(const target of [flow,config,output,state,join(directory,'process.log')])assert.equal(existsSync(target),false);
 writeFileSync(flow,IOS_FRAME_FLOW,{flag:'wx',mode:384});writeFileSync(config,IOS_FRAME_CONFIG,{flag:'wx',mode:384});mkdirSync(output,{mode:448});mkdirSync(state,{mode:448});
 const flowBefore=privateState(flow),configBefore=privateState(config),outputBefore=privateState(output,true),stateBefore=privateState(state,true);
 // cli-2.11.0: ApplyConfiguration is nonmutating; uncropped takeScreenshot
 // and automatic failure artifacts both call Maestro.takeScreenshot(...,false).
 // TestDebugReporter flatten + ArtifactCollector give this exact PNG path.
 const args=[...maestroDevicePrefix('ios',{SUBTRACK_SIMULATOR_UDID:udid}),'test','--config',config,'--debug-output',output,'--flatten-debug-output',flow];
 let result;try{result=await runChild(join(directory,'process.log'),args,{...environment,XDG_STATE_HOME:state},180000,'maestro');}catch{onFailure?.('OTHER');throw Error('iOS frame child unavailable');}
 if(result?.complete!==true||result.exitCode!==0||result.timedOut!==false||result.closed===false||result.signal!=null||result.error!=null){const category=result?.timedOut||result?.closed===false||result?.signal!=null?'TERMINATED':result?.complete&&Number.isInteger(result.exitCode)&&result.exitCode>0?'EXIT_NONZERO':'OTHER';try{onFailure?.(category);}catch{/* Observation cannot authorize readiness. */}throw Error('iOS frame child unavailable');}
 try{directoryIdentity(directory,directoryBefore);directoryIdentity(output,outputBefore);directoryIdentity(state,stateBefore);identity(flowBefore,privateState(flow));identity(configBefore,privateState(config));assert.equal(privateBytes(flow,4096).toString('utf8'),IOS_FRAME_FLOW);assert.equal(privateBytes(config,4096).toString('utf8'),IOS_FRAME_CONFIG);}catch(error){throw Object.assign(error,{frameStage:'INPUT'});}
 try{const rows=frameRoster(directory);assert.deepEqual(rows.filter(row=>!row.directory&&/\.png(?:\.tmp)?$/.test(row.file)).map(row=>relative(directory,row.file).replaceAll('\\','/')),[frameRelative]);}catch(error){throw Object.assign(error,{frameStage:'OUTPUT'});}
}
export function openOwnedIosSimulator(udid,onFailure,{execute=execFile}={}){
 assert.match(udid,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/);
 // Match pinned Maestro cli-2.11.0 LocalSimulatorUtils.launchSimulator; no renderer defaults changes.
 // https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-ios-driver/src/main/kotlin/util/LocalSimulatorUtils.kt#L111-L125
 return boundedCommand('/usr/bin/open',['-a','/Applications/Xcode_26.2.app/Contents/Developer/Applications/Simulator.app','--args','-CurrentDeviceUDID',udid],onFailure,execute);
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function custodyCheck(condition,category){if(!condition)throw Object.assign(Error('iOS frame custody unavailable'),{frameCustodyFailure:category});}
function privateState(file,isDirectory=false,limit=8388608){const s=lstatSync(file);custodyCheck(!s.isSymbolicLink()&&realpathSync(file)===resolve(file),'PATH');custodyCheck(s.uid===(process.getuid?.()??s.uid),'OWNER');custodyCheck((s.mode&511)===(isDirectory?448:384),'PERMISSIONS');custodyCheck(isDirectory?s.isDirectory():s.isFile()&&s.nlink===1,'FILE_SHAPE');if(!isDirectory)custodyCheck(s.size>0&&s.size<=limit,'SIZE');return s;}
function identity(one,two){for(const key of ['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid','nlink'])assert.equal(one[key],two[key]);}
function directoryIdentity(file,state){const actual=privateState(file,true);assert.equal(actual.dev,state.dev);assert.equal(actual.ino,state.ino);}
function privateBytes(file,limit){const before=privateState(file,false,limit),fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);let backing;try{identity(before,fstatSync(fd));backing=Buffer.alloc(before.size+1);let size=0;while(size<backing.length){const count=readSync(fd,backing,size,backing.length-size,null);if(count===0)break;size+=count;}assert.equal(size,before.size);identity(before,fstatSync(fd));identity(before,privateState(file,false,limit));return Buffer.from(backing.subarray(0,size));}finally{backing?.fill(0);closeSync(fd);}}
function custody(root,context){const bytes=privateBytes(join(root,'preinput-ios-custody.json'),4096),v=JSON.parse(bytes);assert.deepEqual(v,{version:1,...context,device:'iPhone-17',runtime:'iOS-26-2',fresh:true});return sha(bytes);}
// Pinned cli-2.11.0 producers: TestDebugReporter/ArtifactsGenerator,
// DeviceArtifactFiles, BundleLayout and StepArtifactNaming. No arbitrary scan
// result is ever accepted as a screenshot, and no raw logs are read/uploaded.
function frameRoster(directory){
 const directories=new Set(['state','output','output/ios-frame-capability','output/ios-frame-capability/logs','output/ios-frame-capability/takeScreenshot','output/ios-frame-capability/screenshots','output/ios-frame-capability/screen-hierarchy']);
 const files=new Set(['flow.yaml','config.yaml','process.log','output/maestro.log','output/ios-frame-capability/commands.json','output/ios-frame-capability/manifest.json','output/ios-frame-capability/logs/maestro.log','output/ios-frame-capability/logs/device-simulator.log','output/ios-frame-capability/logs/device-xctest.log',frameRelative,'output/ios-frame-capability/screenshots/step-002-takeScreenshot.png','output/ios-frame-capability/screenshots/step-002-takeScreenshot.png.tmp','output/ios-frame-capability/screen-hierarchy/step-002-takeScreenshot.json']);
 const rows=[];let total=0,runners=0;
 const walk=parent=>{for(const name of readdirSync(parent)){assert.ok(rows.length<32);const file=join(parent,name),key=relative(directory,file).replaceAll('\\','/'),value=lstatSync(file);custodyCheck(!value.isSymbolicLink()&&realpathSync(file)===resolve(file),'PATH');custodyCheck(value.uid===(process.getuid?.()??value.uid),'OWNER');custodyCheck((value.mode&511)===(value.isDirectory()?448:384),'PERMISSIONS');
  if(value.isDirectory()){assert.ok(directories.has(key));rows.push({file,state:value,directory:true});walk(file);}else{custodyCheck(value.isFile()&&value.nlink===1,'FILE_SHAPE');if(/^output\/xctest_runner_\d{4}-\d{2}-\d{2}_\d{6}\.log$/.test(key)){assert.equal(++runners,1);}else assert.ok(files.has(key));const limit=key.endsWith('.png')||key.endsWith('.png.tmp')?8388608:key==='process.log'?262144:key.endsWith('.log')?2097152:65536;assert.ok(value.size>=0&&value.size<=limit);total+=value.size;assert.ok(total<=16777216);rows.push({file,state:value,directory:false});}
 }};walk(directory);return rows;
}
function cleanFrameProbe(directory,ownedDirectory,step){step('DIRECTORY_CUSTODY');directoryIdentity(directory,ownedDirectory);step('ROSTER');const rows=frameRoster(directory);for(const row of rows.filter(item=>!item.directory)){step('FILE_CUSTODY');identity(row.state,lstatSync(row.file));step('UNLINK');unlinkSync(row.file);}for(const row of rows.filter(item=>item.directory).reverse()){step('DIRECTORY_CUSTODY');directoryIdentity(row.file,row.state);step('RMDIR');rmdirSync(row.file);}step('DIRECTORY_CUSTODY');directoryIdentity(directory,ownedDirectory);step('RMDIR');rmdirSync(directory);step('VERIFY');assert.equal(existsSync(directory),false);}
export async function runIosFrameCapability({environment,head,root},{platform=process.platform,measure=measureIosSimulator,capture=captureIosFrame,openSimulator=openOwnedIosSimulator}={}){
 let stage='CONTEXT',failureStage=null,commandFailure='OTHER',pngFailure=null,cleanupFailure=null,directory,ownedDirectory,ready=false,cleanupVerified=true;
 const observe=value=>{if(IOS_FRAME_FAILURES.includes(value))commandFailure=value;};
 try{
  assert.equal(platform,'darwin');assert.equal(environment.CI,'true');assert.ok(['full','ios-driver'].includes(environment.SUBTRACK_NATIVE_PROOF_SCOPE));assert.equal(environment.SUBTRACK_PRIVATE_FIXTURE_CONFIG,undefined);assert.equal(process.umask()&63,63);
  const context=preinputCaptureContext(environment,head);assert.ok(context);assert.equal(root,join(environment.RUNNER_TEMP,'subtrack-native-proof','private'));stage='CUSTODY';privateState(root,true);const original=custody(root,context);
  writeFileSync(join(root,'ios-frame-capability-claim.json'),JSON.stringify({schema:'st253-ios-frame-capability-claim-v1',...context}),{flag:'wx',mode:384});
  stage='BEFORE';const before=measure(context.udid);stage='GUI';await openSimulator(context.udid,observe);
  stage='CUSTODY';directory=join(root,'ios-frame-capability');mkdirSync(directory,{mode:448});cleanupVerified=false;ownedDirectory=privateState(directory,true);
  const file=join(directory,frameRelative);assert.equal(existsSync(file),false);stage='CAPTURE';await capture(context.udid,file,observe,{environment});
  stage='PNG';directoryIdentity(directory,ownedDirectory);const png=privateBytes(file,8388608);try{custodyCheck(validPreinputPng(png),'PNG_FORMAT');}finally{png.fill(0);}
  stage='AFTER';assert.deepEqual(measure(context.udid),before);assert.equal(custody(root,context),original);ready=true;
 }catch(error){if(stage==='CAPTURE'&&['INPUT','OUTPUT'].includes(error?.frameStage))stage=error.frameStage;failureStage=stage;if(['PNG','OUTPUT'].includes(stage))pngFailure=['PATH','OWNER','PERMISSIONS','FILE_SHAPE','SIZE','PNG_FORMAT'].includes(error?.frameCustodyFailure)?error.frameCustodyFailure:'READ_OR_IDENTITY';/* No raw error values leave this fixture-free check. */}
 finally{
  if(ownedDirectory){let cleanupStep='DIRECTORY_CUSTODY';try{cleanFrameProbe(directory,ownedDirectory,value=>{cleanupStep=value;});cleanupVerified=true;}catch{cleanupFailure=cleanupStep;stage='CLEANUP';ready=false;cleanupVerified=false;}}
 }
 return Object.freeze({schema:'st253-ios-frame-capability-v1',ready:ready&&cleanupVerified,stage:ready&&cleanupVerified?'COMPLETE':stage,failureStage,commandFailure:['GUI','CAPTURE'].includes(failureStage)?commandFailure:null,pngFailure,cleanupFailure,cleanupVerified});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 void(async()=>{assert.equal(process.argv.length,2);const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),result=await runIosFrameCapability({environment:process.env,head,root:join(process.env.RUNNER_TEMP,'subtrack-native-proof','private')});console.log(JSON.stringify(result));if(!result.ready)process.exitCode=1;})().catch(()=>{console.log(JSON.stringify({schema:'st253-ios-frame-capability-v1',ready:false,stage:'CONTEXT',failureStage:'CONTEXT',commandFailure:null,pngFailure:null,cleanupFailure:null,cleanupVerified:false}));process.exitCode=1;});
}
