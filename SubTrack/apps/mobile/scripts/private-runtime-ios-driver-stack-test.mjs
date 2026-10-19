import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import process from 'node:process';
import test,{mock} from 'node:test';
import {setTimeout,clearTimeout} from 'node:timers';
import {IOS_DRIVER_STACK_CHECKS,IOS_DRIVER_STACK_STAGES,iosDriverStackStage,runIosStackCommand,sampleOwnedIosDriver} from './private-runtime-ios-driver-stack.mjs';

const pid=24680,parentPid=12345,uid=501,udid='123E4567-E89B-42D3-A456-426614174000';
const parent='maestro.cli.command.PrintHierarchyCommand.run';
const stages={
 ANDROID_DISCOVERY:['java.lang.ProcessImpl.waitFor','maestro.device.DeviceService.fetchAndroidAvdInfo'],
 IOS_INVENTORY:['java.io.InputStream.readNBytes','util.LocalSimulatorUtils.list','maestro.device.DeviceService.listIOSDevices'],
 SESSION_LOCK:['sun.nio.ch.FileDispatcherImpl.lock0','maestro.cli.db.KeyValueStore.withFileLock'],
 XCTEST_INSTALL:['xcuitest.installer.IOSBuildProductsExtractor.extract','xcuitest.installer.LocalXCTestInstaller.startXCTestRunner'],
 XCTEST_STATUS:['sun.nio.ch.NioSocketImpl.park','xcuitest.installer.LocalXCTestInstaller.xcTestDriverStatusCheck'],
 HIERARCHY:['ios.xctest.XCTestIOSDevice.viewHierarchy','maestro.drivers.IOSDriver.viewHierarchy'],
};
function dump(frames=stages.ANDROID_DISCOVERY){return Buffer.from(`${pid}:\n2026-10-18 12:00:00\nFull thread dump OpenJDK 64-Bit Server VM (17.0.18+8 mixed mode, sharing):\n\n"main" #1 prio=5 os_prio=31 cpu=1.00ms elapsed=120.00s tid=0x123abc nid=0x1 runnable [0xabc]\n   java.lang.Thread.State: RUNNABLE\n${[...frames,parent].map(frame=>`\tat ${frame}(Owned.kt:1)`).join('\n')}\n\n"Reference Handler" #2 daemon prio=10 tid=0x123aaa nid=0x2 waiting on condition\n   java.lang.Thread.State: RUNNABLE\n\tat private.canary.Thread.await(Owned.java:1)\n\nJNI global refs: 5, weak refs: 0\n`);}

test('only exact main-thread tagged method pairs produce the six finite stage categories',()=>{
 assert.deepEqual(IOS_DRIVER_STACK_STAGES,[...Object.keys(stages),'UNKNOWN']);
 for(const [stage,frames]of Object.entries(stages))assert.equal(iosDriverStackStage(dump(frames),pid),stage);
 const modules=dump().toString().replace('at java.lang.ProcessImpl.waitFor','at java.base@17.0.18/java.lang.ProcessImpl.waitFor');assert.equal(iosDriverStackStage(Buffer.from(modules),pid),'ANDROID_DISCOVERY');
 const blocked=dump(['maestro.cli.session.SessionStore.hasActiveSessionForDevice']).toString().replace('State: RUNNABLE','State: BLOCKED (on object monitor)');assert.equal(iosDriverStackStage(Buffer.from(blocked),pid),'SESSION_LOCK');
 assert.equal(iosDriverStackStage(dump(['java.lang.ProcessImpl.waitFor','util.XCRunnerCLIUtils.runXcTestWithoutBuild','xcuitest.installer.LocalXCTestInstaller.startXCTestRunner']),pid),'XCTEST_INSTALL');
});
test('truncated, malformed, foreign, ambiguous or background-only stack evidence yields UNKNOWN without returning text',()=>{
 const raw=dump(),text=raw.toString();
 for(const value of [Buffer.alloc(0),Buffer.alloc(262145),Buffer.from([255]),Buffer.from(text.replace(`${pid}:`,'999:')),Buffer.from(text.replace('JNI global refs: 5, weak refs: 0','')),Buffer.from(text.replace('State: RUNNABLE','State: PRIVATE_CANARY')),Buffer.from(text.replace('"main" #1','"other" #1')),Buffer.from(text.replace(parent,'private.canary.run')),Buffer.from(text.replace('at java.lang.ProcessImpl.waitFor(Owned.kt:1)','PRIVATE_CANARY')),Buffer.from(text.replace('2026-10-18','\0')),dump(['java.lang.ProcessImpl.waitFor']),dump([...stages.IOS_INVENTORY,...stages.ANDROID_DISCOVERY]),dump(['kotlinx.coroutines.BlockingCoroutine.joinBlocking','maestro.drivers.IOSDriver.viewHierarchy'])])assert.equal(iosDriverStackStage(value,pid),'UNKNOWN');
 const background=text.replace('maestro.device.DeviceService.fetchAndroidAvdInfo','private.canary.run').replace('at private.canary.Thread.await','at maestro.device.DeviceService.fetchAndroidAvdInfo');assert.equal(iosDriverStackStage(Buffer.from(background),pid),'UNKNOWN');
 assert.equal(iosDriverStackStage(Buffer.from(text.replace('"Reference Handler" #2','"main" #2')),pid),'UNKNOWN');
});
async function fixture(action){
 const directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'subtrack-stack-')),root=join(directory,'ios-driver-preflight'),javaHome=join(directory,'jdk'),java=join(javaHome,'bin','java'),jcmd=join(javaHome,'bin','jcmd');
 fs.mkdirSync(root,{mode:448});fs.mkdirSync(join(javaHome,'bin'),{recursive:true});for(const file of [java,jcmd])fs.writeFileSync(file,'opaque tool',{mode:493});fs.writeFileSync(join(javaHome,'release'),'JAVA_VERSION="17.0.18"\n');
 const originalRealpath=fs.realpathSync,originalLstat=fs.lstatSync,originalFstat=fs.fstatSync;
 mock.method(fs,'realpathSync',(file,...args)=>file==='/verified/java'?originalRealpath(java):originalRealpath(file,...args));
 mock.method(fs,'lstatSync',(file,...args)=>{const stat=originalLstat(file,...args);return Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{uid,mode:(stat.mode&~511)|(stat.isDirectory()?448:basename(String(file))==='thread-stack.log'?384:493)});});
 mock.method(fs,'fstatSync',(file,...args)=>{const stat=originalFstat(file,...args);return Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{uid,mode:(stat.mode&~511)|384});});syncBuiltinESMExports();
 const environment={CI:'true',SUBTRACK_PRIVATE_DEVICE_PROOF:'true',JAVA_HOME:javaHome,RUNNER_TEMP:directory,SUBTRACK_SIMULATOR_UDID:udid};
 const logFile=join(root,'thread-stack.log'),calls=[],timers=[],cancelled=[];
 const metadata=()=>Buffer.from(`${pid} ${parentPid} ${pid} ${uid} Sun Oct 18 12:00:00 2026 /verified/java\n`);
 const argv=()=>Buffer.from(`${java} --enable-native-access=ALL-UNNAMED -classpath ${join(directory,'subtrack-native-tools','maestro','lib','*')} maestro.cli.AppKt --device ${udid} --platform ios --verbose hierarchy\n`);
 const command=async(file,args,options)=>{calls.push({file,args,...options});if(file===jcmd)return dump();return args.at(-1)==='command='?argv():metadata();};
 const controller=new globalThis.AbortController(),input={pid,parentPid,environment,signal:controller.signal,logFile},port={platform:'darwin',uid,command,schedule:(fn,delay)=>{assert.equal(delay,5000);timers.push(fn);return timers.length;},cancel:value=>cancelled.push(value)};
 try{await action({directory,root,java,jcmd,environment,logFile,calls,timers,cancelled,metadata,argv,controller,input,port,originalLstat});}
 finally{mock.restoreAll();syncBuiltinESMExports();fs.rmSync(directory,{recursive:true,force:true});}
}
test('actual probe attaches once only to the exact live owned AppKt JVM and preserves a private bounded stack',()=>fixture(async f=>{
 assert.equal(await sampleOwnedIosDriver(f.input,f.port),'ANDROID_DISCOVERY');assert.equal(f.calls.length,5);assert.deepEqual(f.calls[2].args,[String(pid),'Thread.print']);assert.equal(f.calls[2].file,f.jcmd);assert.equal(f.calls[2].maxBytes,262144);assert.ok(f.calls.every(call=>call.signal instanceof globalThis.AbortSignal&&call.signal.aborted));assert.deepEqual(f.cancelled,[1]);assert.deepEqual(fs.readFileSync(f.logFile),dump());
 assert.equal(await sampleOwnedIosDriver(f.input,f.port),'UNKNOWN');assert.equal(f.calls.length,5);
}));
test('no target search or attach occurs for foreign parent, UID, process group, Java helper, classpath or device arguments',async()=>{
 for(const variant of ['pid','parent','pgid','uid','comm','main','device','extra','classpath','jvm-option','invalid-utf8'])await fixture(async f=>{
  const original=f.port.command;f.port.command=async(file,args,options)=>{if(file===f.jcmd)assert.fail('No foreign attach');const value=await original(file,args,options);let text=value.toString();if(args.at(-1)==='command='){
   if(variant==='main')text=text.replace('maestro.cli.AppKt','JvmVersion');if(variant==='device')text=text.replace(udid,'FOREIGN');if(variant==='extra')text+=' --private-canary';if(variant==='classpath')text=text.replace('subtrack-native-tools','foreign-tools');if(variant==='jvm-option')text=text.replace('--enable-native-access=ALL-UNNAMED','-javaagent:foreign');
  }else{if(['pid','parent','pgid','uid'].includes(variant)){const index=['pid','parent','pgid','uid'].indexOf(variant),fields=text.split(' ');fields[index]='999';text=fields.join(' ');}if(variant==='comm')text=text.replace('/verified/java','/missing/java');if(variant==='invalid-utf8')return Buffer.from([255]);}return Buffer.from(text);};
  assert.equal(await sampleOwnedIosDriver(f.input,f.port),'UNKNOWN');assert.equal(f.calls.some(call=>call.file===f.jcmd),false);
 });
});
test('identity replacement during or after attach withholds the stage even when the raw stack has a known pair',async()=>{
 for(const variant of ['start','argv','uid','group','empty','oversize','invalid-stack'])await fixture(async f=>{
  const original=f.port.command;let call=0;f.port.command=async(file,args,options)=>{const value=await original(file,args,options);call++;if(file===f.jcmd){if(variant==='empty')return Buffer.alloc(0);if(variant==='oversize')return Buffer.alloc(262145);if(variant==='invalid-stack')return Buffer.from('PRIVATE_CANARY');}let text=value.toString();if(call===4){if(variant==='start')text=text.replace('12:00:00','12:00:01');if(variant==='uid')text=text.replace(` ${uid} `,' 999 ');if(variant==='group')text=text.replace(`${pid} ${uid}`,`999 ${uid}`);}if(call===5&&variant==='argv')text=text.replace('--enable-native-access=ALL-UNNAMED','');return Buffer.from(text);};
  assert.equal(await sampleOwnedIosDriver(f.input,f.port),'UNKNOWN');assert.ok(fs.statSync(f.logFile).size<=262144);
 });
});
test('an early exit abort or the independent five-second budget settles even when a command port never resolves',async()=>{
 for(const variant of ['caller-abort','budget','synchronous-budget','custody-abort'])await fixture(async f=>{
  if(variant==='custody-abort')f.input.onCheck=check=>{if(check==='CUSTODY')f.controller.abort();};
  f.port.command=()=>{if(variant==='synchronous-budget')f.timers[0]();return new Promise(()=>{});};const pending=sampleOwnedIosDriver(f.input,f.port);await Promise.resolve();if(variant==='caller-abort')f.controller.abort();if(variant==='budget')f.timers[0]();assert.equal(await pending,'UNKNOWN');assert.deepEqual(f.cancelled,[1]);assert.equal(fs.statSync(f.logFile).size,0);
 });
});
test('default OS UID lookup remains fail-closed when absent and supports the same owned UID when present',()=>fixture(async f=>{
 const prior=Object.getOwnPropertyDescriptor(process,'getuid');
 try{
  Object.defineProperty(process,'getuid',{value:()=>uid,configurable:true});assert.equal(await sampleOwnedIosDriver(f.input,{...f.port,uid:undefined}),'ANDROID_DISCOVERY');
  delete process.getuid;assert.equal(await sampleOwnedIosDriver(f.input,{...f.port,uid:undefined}),'UNKNOWN');assert.equal(f.calls.length,5);
 }finally{if(prior)Object.defineProperty(process,'getuid',prior);else delete process.getuid;}
}));
test('platform, native context, fixed path, JDK17, cancellation and private directory fences fail before any command',async()=>{
 for(const variant of ['platform','fixture','context','missing-java','jdk-version','path','directory','pre-aborted','pid','parent'])await fixture(async f=>{
  if(variant==='platform')f.port.platform='win32';if(variant==='fixture')f.environment.SUBTRACK_PRIVATE_FIXTURE_CONFIG='';if(variant==='context')f.environment.CI='false';if(variant==='missing-java')f.environment.JAVA_HOME=join(f.directory,'missing');if(variant==='jdk-version')fs.writeFileSync(join(f.environment.JAVA_HOME,'release'),'JAVA_VERSION="21.0.8"\n');if(variant==='path')f.input.logFile=join(f.root,'other.log');if(variant==='directory')f.input.logFile=join(f.directory,'thread-stack.log');if(variant==='pre-aborted')f.controller.abort();if(variant==='pid')f.input.pid=0;if(variant==='parent')f.input.parentPid=pid;
  assert.equal(await sampleOwnedIosDriver(f.input,f.port),'UNKNOWN');assert.equal(f.calls.length,0);
 });
});
test('optional progress reports only finite check names and COMPLETE never hides unknown or timed-out evidence',async()=>{
 for(const variant of ['known','context','identity','classification','budget','callback-error'])await fixture(async f=>{
  const checks=[];f.input.onCheck=value=>{checks.push(value);if(variant==='callback-error')throw Error('PRIVATE_CALLBACK_CANARY');};
  if(variant==='context')f.environment.CI='false';
  const original=f.port.command;f.port.command=async(file,args,options)=>{const bytes=await original(file,args,options);if(variant==='identity'&&file==='/bin/ps')return Buffer.from('PRIVATE_IDENTITY_CANARY');if(variant==='classification'&&file===f.jcmd)return Buffer.from('PRIVATE_STACK_CANARY');if(variant==='budget'&&file===f.jcmd){f.timers[0]();return new Promise(()=>{});}return bytes;};
  assert.equal(await sampleOwnedIosDriver(f.input,f.port),variant==='known'?'ANDROID_DISCOVERY':'UNKNOWN');assert.ok(checks.every(value=>IOS_DRIVER_STACK_CHECKS.includes(value)));assert.equal(checks.includes('COMPLETE'),variant==='known');
  assert.equal(checks.at(-1),{known:'COMPLETE',context:'CONTEXT',identity:'IDENTITY_BEFORE',classification:'CLASSIFICATION',budget:'THREAD_PRINT','callback-error':'CONTEXT'}[variant]);assert.equal(JSON.stringify(checks).includes('CANARY'),false);
 });
});
test('real opaque command port enforces output bounds and abort without disclosing stderr or retaining an unbounded wait',async()=>{
 const controller=new globalThis.AbortController();assert.deepEqual(await runIosStackCommand(process.execPath,['-e',"process.stderr.write('PRIVATE_CANARY');process.stdout.write('bounded')"],{signal:controller.signal,maxBytes:64}),Buffer.from('bounded'));
 await assert.rejects(runIosStackCommand(process.execPath,['-e','process.stdout.write(Buffer.alloc(1024))'],{signal:controller.signal,maxBytes:64}));
 const abort=new globalThis.AbortController(),timer=setTimeout(()=>abort.abort(),100);try{await assert.rejects(runIosStackCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:abort.signal,maxBytes:64}));}finally{clearTimeout(timer);}
 await assert.rejects(runIosStackCommand('missing-private-stack-command',[],{signal:controller.signal,maxBytes:64}));
});
test('helper cleanup signals only its spawned owned group and unrefs unreaped or failed-to-kill children',async()=>{
 for(const variant of ['kill-fails','posix','windows','bad-pid','parent-pid','before-spawn','late-data','pre-aborted','spawn-throws']){
  const controller=new globalThis.AbortController(),child=new EventEmitter(),signals=[];let unrefs=0,destroyed=0;
  child.pid=variant==='bad-pid'?0:variant==='parent-pid'?parentPid:pid;child.stdout=new EventEmitter();child.stderr=new EventEmitter();for(const stream of [child.stdout,child.stderr])stream.destroy=()=>{destroyed++;};child.unref=()=>{unrefs++;};
  if(variant==='pre-aborted')controller.abort();
  const spawnCommand=(_file,_args,options)=>{assert.equal(options.detached,variant!=='windows');if(variant==='spawn-throws')throw Error('PRIVATE_SPAWN_CANARY');return child;};
  const promise=runIosStackCommand('/fixed/public/tool',[],{signal:controller.signal,maxBytes:64},{spawnCommand,kill:(value,signal)=>{signals.push([value,signal]);if(variant==='kill-fails')throw Error('PRIVATE_KILL_CANARY');},platform:variant==='windows'?'win32':'darwin',parentPid});
  if(!['pre-aborted','spawn-throws'].includes(variant)){
   if(variant==='before-spawn')controller.abort();child.emit('spawn');controller.abort();if(variant==='late-data')child.stdout.emit('data',Buffer.from('PRIVATE_AFTER_ABORT_CANARY'));
  }
  await assert.rejects(promise,/Probe command unavailable/);
  if(['pre-aborted','spawn-throws','bad-pid','parent-pid'].includes(variant))assert.equal(signals.length,0);else assert.deepEqual(signals,[[variant==='windows'?pid:-pid,'SIGKILL']]);
  if(!['pre-aborted','spawn-throws'].includes(variant)){assert.ok(unrefs>=1);assert.ok(destroyed>=2);}
 }
});
