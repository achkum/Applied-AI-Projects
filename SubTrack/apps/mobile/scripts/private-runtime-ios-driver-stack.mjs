import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {spawn} from 'node:child_process';
import {constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,realpathSync,writeSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import process from 'node:process';
import {setTimeout,clearTimeout} from 'node:timers';

const LIMIT=262144,UNKNOWN='UNKNOWN',BUDGET=5000;
const uuid=/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
export const IOS_DRIVER_STACK_STAGES=Object.freeze(['ANDROID_DISCOVERY','IOS_INVENTORY','SESSION_LOCK','XCTEST_INSTALL','XCTEST_STATUS','HIERARCHY',UNKNOWN]);
export const IOS_DRIVER_STACK_CHECKS=Object.freeze(['CONTEXT','JDK','CUSTODY','IDENTITY_BEFORE','THREAD_PRINT','IDENTITY_AFTER','CLASSIFICATION','COMPLETE']);

// Source-only stage evidence from cli-2.11.0, never a readiness decision:
// maestro-client/.../maestro/device/DeviceService.kt (including Android discovery before iOS)
// maestro-ios-driver/.../util/LocalSimulatorUtils.kt, xcuitest/installer/LocalXCTestInstaller.kt
// maestro-cli/.../maestro/cli/db/KeyValueStore.kt and session/SessionStore.kt
// https://github.com/mobile-dev-inc/Maestro/tree/cli-2.11.0
// https://docs.oracle.com/en/java/javase/17/docs/specs/man/jcmd.html (Thread.print only)
// Actual authenticated archive5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a
// bin/maestro SHA25678c82065869bbabf4659e52284defd346de897d58675c6ba1dc7c70c12aed07f:
// CLASSPATH=$APP_HOME/lib/*; default JVM arg only --enable-native-access=ALL-UNNAMED.
export function iosDriverStackStage(bytes,pid){
 try{
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=LIMIT);
  const text=bytes.toString('utf8');assert.equal(Buffer.from(text).equals(bytes),true);assert.equal(text.includes('\0'),false);
  const lines=text.replaceAll('\r\n','\n').split('\n');assert.equal(lines[0],`${pid}:`);
  assert.ok(lines.some(line=>/^Full thread dump OpenJDK .*17(?:\.| )/.test(line)));
  assert.ok(/^JNI global refs: \d+(?:, weak refs: \d+)?\s*$/.test(lines.findLast(line=>line.trim())));
  const starts=lines.flatMap((line,index)=>/^"main" #\d+ .*\btid=0x[0-9a-f]+\b.*\bnid=0x[0-9a-f]+\b/.test(line)?[index]:[]);assert.equal(starts.length,1);
  const start=starts[0],tail=lines.slice(start+1),end=tail.findIndex(line=>line.startsWith('"')||line.startsWith('JNI global refs:'));
  assert.ok(end>=0);const block=tail.slice(0,end),state=block.filter(line=>/^\s+java\.lang\.Thread\.State: /.test(line));assert.equal(state.length,1);
  assert.match(state[0],/^\s+java\.lang\.Thread\.State: (?:RUNNABLE|BLOCKED \(on object monitor\)|(?:TIMED_)?WAITING \((?:parking|on object monitor|sleeping)\))\s*$/);
  const frames=[];
  for(const line of block){
   if(!line.trim()||/^\s+java\.lang\.Thread\.State: /.test(line)||/^\s+- (?:locked|waiting to lock|waiting on|parking to wait for) <0x[0-9a-f]+> \(a [\w.$]+\)\s*$/.test(line))continue;
   const frame=line.match(/^\s+at (?:(?:[a-z][a-z0-9.]*)(?:@[\w.+-]+)?\/)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\([^()\r\n]{1,180}\)\s*$/);assert.ok(frame);frames.push(frame[1]);
  }
  assert.ok(frames.length>0&&frames.length<=512);
  const has=pattern=>frames.some(frame=>pattern.test(frame));
  assert.ok(has(/^maestro\.cli\.(?:command\.PrintHierarchyCommand\.run|session\.MaestroSessionManager\.newSession)$/));
  const processWait=has(/^(?:java\.lang\.ProcessImpl\.waitFor|java\.io\.(?:FileInputStream|BufferedInputStream|InputStream|InputStreamReader)\.read(?:Bytes|AllBytes|NBytes|0|1)?|java\.lang\.Process\$PipeInputStream\.read)$/);
  const socketWait=has(/^(?:sun\.nio\.ch\.(?:Net\.poll|NioSocketImpl\.(?:park|read|implRead))|java\.net\.SocketInputStream\.socketRead0)$/);
  const stages=[];
  if(processWait&&has(/^maestro\.device\.DeviceService\.(?:fetchAndroidAvdInfo|listAndroidDevices)$/))stages.push('ANDROID_DISCOVERY');
  if(processWait&&has(/^util\.LocalSimulatorUtils\.list$/)&&has(/^maestro\.device\.DeviceService\.listIOSDevices$/))stages.push('IOS_INVENTORY');
  if((has(/^sun\.nio\.ch\.(?:FileDispatcherImpl\.lock0|FileChannelImpl\.lock)$/)&&has(/^maestro\.cli\.db\.KeyValueStore\.(?:withFileLock|get|set|keys)$/))||(/BLOCKED/.test(state[0])&&has(/^maestro\.cli\.session\.SessionStore\.(?:hasActiveSessionForDevice|activeSessions|activeSessionsForDevice)$/)))stages.push('SESSION_LOCK');
  if(has(/^xcuitest\.installer\.LocalXCTestInstaller\.startXCTestRunner$/)&&(has(/^xcuitest\.installer\.IOSBuildProductsExtractor\.(?:extract|writeBuildProducts|extractZipToApp)$/)||(processWait&&has(/^util\.XCRunnerCLIUtils\.runXcTestWithoutBuild$/))))stages.push('XCTEST_INSTALL');
  if(socketWait&&has(/^xcuitest\.installer\.LocalXCTestInstaller\.xcTestDriverStatusCheck$/))stages.push('XCTEST_STATUS');
  if(has(/^maestro\.drivers\.IOSDriver\.(?:viewHierarchy|contentDescriptor)$/)&&has(/^ios\.xctest\.XCTestIOSDevice\.viewHierarchy$/))stages.push('HIERARCHY');
  return stages.length===1?stages[0]:UNKNOWN;
 }catch{return UNKNOWN;}
}

function aborted(signal){if(signal?.aborted)throw Error('Probe unavailable');}
function raceAbort(work,signal){
 return new Promise((resolveResult,reject)=>{
  const stop=()=>reject(Error('Probe unavailable'));signal.addEventListener('abort',stop,{once:true});
  if(signal.aborted){stop();return;}
  Promise.resolve(work).then(resolveResult,reject).finally(()=>signal.removeEventListener('abort',stop));
 });
}
/** Child commands are read-only, separately owned, bounded and never stream to the job console. */
export function runIosStackCommand(file,args,{signal,maxBytes},{spawnCommand=spawn,kill=process.kill,platform=process.platform,parentPid=process.pid}={}){
 return new Promise((resolveResult,reject)=>{
  let child,ownedPid=null,ended=false,invalid=false,size=0;const output=[];
  const finish=(error,value)=>{if(ended)return;ended=true;signal.removeEventListener('abort',stop);if(error)reject(Error('Probe command unavailable'));else resolveResult(value);};
  const stop=()=>{invalid=true;if(ownedPid!==null)try{kill(platform==='win32'?ownedPid:-ownedPid,'SIGKILL');}catch{ /* Failure never grants evidence; an unreaped helper must not hold the runner open. */ }child?.stdout.destroy();child?.stderr.destroy();child?.unref();finish(true);};
  if(signal.aborted){finish(true);return;}
  try{child=spawnCommand(file,args,{stdio:['ignore','pipe','pipe'],detached:platform!=='win32',windowsHide:true});}catch{finish(true);return;}
  signal.addEventListener('abort',stop,{once:true});
  child.once('spawn',()=>{const value=child.pid;if(!Number.isSafeInteger(value)||value<=1||value===parentPid){stop();return;}ownedPid=value;if(signal.aborted)stop();});
  const consume=(chunk,stdout)=>{if(ended)return;size+=chunk.length;if(size>maxBytes){stop();return;}if(stdout)output.push(Buffer.from(chunk));};
  child.stdout.on('data',chunk=>consume(chunk,true));child.stderr.on('data',chunk=>consume(chunk,false));child.once('error',stop);
  child.once('exit',()=>{ownedPid=null;});
  child.once('close',(code,termination)=>{finish(invalid||code!==0||termination!==null,Buffer.concat(output));});
 });
}
function readBounded(file,maximum){const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=fstatSync(fd);assert.ok(before.isFile()&&before.size>0&&before.size<=maximum);const value=readFileSync(fd),after=fstatSync(fd);for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);assert.equal(value.length,before.size);return value;}finally{closeSync(fd);}}
function ownedDirectory(path,uid){const stat=lstatSync(path);assert.equal(stat.isSymbolicLink(),false);assert.equal(stat.isDirectory(),true);assert.equal(stat.uid,uid);assert.equal(stat.mode&511,448);assert.equal(realpathSync(path),resolve(path));return stat;}
function snapshotIdentity(metadata,command,{pid,parentPid,uid,java,classpath,udid}){
 const text=metadata.toString('utf8'),argv=command.toString('utf8').trim();assert.equal(Buffer.from(text).equals(metadata),true);assert.equal(Buffer.from(command.toString('utf8')).equals(command),true);
 const match=text.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\/[^\r\n]+)\s*$/);assert.ok(match);
 assert.deepEqual(match.slice(1,5).map(Number),[pid,parentPid,pid,uid]);assert.equal(realpathSync(match[6].trim()),java);
 assert.ok(argv.length>0&&argv.length<=32768&&!/[\r\n\0]/.test(argv));const tokens=argv.split(/\s+/);assert.equal(realpathSync(tokens[0]),java);
 const main=tokens.indexOf('maestro.cli.AppKt');assert.ok(main>1&&main===tokens.lastIndexOf('maestro.cli.AppKt'));
 assert.deepEqual(tokens.slice(main+1),['--device',udid,'--platform','ios','--verbose','hierarchy']);
 assert.deepEqual(tokens.slice(1,main),['--enable-native-access=ALL-UNNAMED','-classpath',classpath]);
 return {start:match[5].replace(/\s+/g,' '),java,argv};
}

/** One caller-scheduled sample; failures return a closed category and never grant readiness or capture. */
export async function sampleOwnedIosDriver({pid,parentPid,environment,signal,logFile,onCheck},{command=runIosStackCommand,platform=process.platform,uid=typeof process.getuid==='function'?process.getuid():null,schedule=setTimeout,cancel=clearTimeout}={}){
 let fd=null,timer;const controller=new globalThis.AbortController(),stop=()=>controller.abort();
 const check=name=>{if(typeof onCheck==='function')onCheck(name);};
 try{
  check('CONTEXT');assert.ok(onCheck===undefined||typeof onCheck==='function');
  assert.equal(platform,'darwin');assert.ok(Number.isSafeInteger(pid)&&pid>1&&Number.isSafeInteger(parentPid)&&parentPid>1&&pid!==parentPid);assert.ok(Number.isSafeInteger(uid)&&uid>=0);assert.ok(signal instanceof globalThis.AbortSignal);aborted(signal);
  assert.equal(environment.CI,'true');assert.equal(environment.SUBTRACK_PRIVATE_DEVICE_PROOF,'true');assert.equal(Object.hasOwn(environment,'SUBTRACK_PRIVATE_FIXTURE_CONFIG'),false);assert.match(environment.SUBTRACK_SIMULATOR_UDID,uuid);
  check('JDK');
  assert.ok(isAbsolute(environment.JAVA_HOME)&&isAbsolute(environment.RUNNER_TEMP)&&!/[\s\0]/.test(environment.JAVA_HOME)&&!/[\s\0]/.test(environment.RUNNER_TEMP));
  const javaHome=realpathSync(environment.JAVA_HOME),java=realpathSync(join(javaHome,'bin','java')),jcmd=realpathSync(join(javaHome,'bin','jcmd'));assert.equal(dirname(java),join(javaHome,'bin'));assert.equal(dirname(jcmd),join(javaHome,'bin'));
  for(const file of [java,jcmd]){const stat=lstatSync(file);assert.ok(stat.isFile()&&(stat.mode&73)!==0);}
  const release=readBounded(join(javaHome,'release'),65536).toString('utf8');assert.match(release,/(?:^|\n)JAVA_VERSION="17\.\d+\.\d+(?:[.+_-][0-9A-Za-z.+_-]+)?"(?:\r?\n|$)/);
  check('CUSTODY');const directory=dirname(resolve(logFile));assert.equal(basename(logFile),'thread-stack.log');assert.equal(basename(directory),'ios-driver-preflight');const dir=ownedDirectory(directory,uid);
  fd=openSync(logFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,384);const file=fstatSync(fd);assert.equal(file.uid,uid);assert.equal(file.mode&511,384);assert.equal(file.isFile(),true);assert.equal(file.nlink,1);
  signal.addEventListener('abort',stop,{once:true});timer=schedule(stop,BUDGET);if(signal.aborted)stop();
  const options={signal:controller.signal},call=async(file,args,maxBytes)=>{aborted(controller.signal);const result=await raceAbort(command(file,args,{...options,maxBytes}),controller.signal);assert.ok(Buffer.isBuffer(result)&&result.length>0&&result.length<=maxBytes);aborted(controller.signal);return result;};
  const identity={pid,parentPid,uid,java,classpath:join(environment.RUNNER_TEMP,'subtrack-native-tools','maestro','lib','*'),udid:environment.SUBTRACK_SIMULATOR_UDID};
  const inspect=async()=>snapshotIdentity(await call('/bin/ps',['-ww','-p',String(pid),'-o','pid=,ppid=,pgid=,uid=,lstart=,comm='],4096),await call('/bin/ps',['-ww','-p',String(pid),'-o','command='],32768),identity);
  check('IDENTITY_BEFORE');const before=await inspect();check('THREAD_PRINT');const bytes=await call(jcmd,[String(pid),'Thread.print'],LIMIT);check('IDENTITY_AFTER');const after=await inspect();assert.deepEqual(after,before);
  const current=ownedDirectory(directory,uid);assert.equal(current.dev,dir.dev);assert.equal(current.ino,dir.ino);const pathStat=lstatSync(logFile),opened=fstatSync(fd);assert.equal(pathStat.isSymbolicLink(),false);for(const key of ['dev','ino','uid','mode','nlink'])assert.equal(pathStat[key],opened[key]);assert.equal(opened.nlink,1);assert.equal(opened.size,0);aborted(controller.signal);
  let offset=0;while(offset<bytes.length){const count=writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(count>0);offset+=count;}assert.equal(fstatSync(fd).size,bytes.length);
  check('CLASSIFICATION');const stage=iosDriverStackStage(bytes,pid);if(stage!==UNKNOWN)check('COMPLETE');return stage;
 }catch{return UNKNOWN;}finally{if(timer!==undefined)cancel(timer);signal?.removeEventListener?.('abort',stop);controller.abort();if(fd!==null)closeSync(fd);}
}
