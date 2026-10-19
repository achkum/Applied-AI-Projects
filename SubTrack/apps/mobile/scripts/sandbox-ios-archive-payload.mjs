import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants,lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import process from 'node:process';
import {sandboxIosBuildIntent} from './sandbox-ios-build-intent.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function identity(before,after){for(const key of ['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key]);}
function state(file,directory=false){
 const s=lstatSync(file);assert.equal(s.isSymbolicLink(),false);assert.equal(realpathSync(file),resolve(file));assert.equal(directory?s.isDirectory():s.isFile()&&s.nlink===1,true);assert.equal(s.mode&0o022,0);
 if(typeof process.getuid==='function')assert.equal(s.uid,process.getuid());return s;
}
function read(file,maximum){
 const before=state(file);assert.ok(before.size>0&&before.size<=maximum);const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);let backing;
 try{identity(before,fstatSync(fd));backing=Buffer.alloc(before.size+1);let at=0;while(at<backing.length){const n=readSync(fd,backing,at,backing.length-at,null);if(n===0)break;at+=n;}assert.equal(at,before.size);identity(before,fstatSync(fd));identity(before,state(file));return Buffer.from(backing.subarray(0,at));}finally{backing?.fill(0);closeSync(fd);}
}
function convertInfo(bytes){return execFileSync('/usr/bin/plutil',['-convert','json','-o','-','-'],{input:bytes,encoding:'utf8',timeout:15000,killSignal:'SIGKILL',maxBuffer:262144,stdio:['pipe','pipe','pipe']});}

/** Checks unsigned build output; no signing or installed runtime qualification. */
export function verifySandboxIosArchivePayload({bundle,sourceHead,runtimeIntent,buildNumber},{readInfo=convertInfo}={}){
 assert.equal(resolve(bundle),bundle);assert.equal(bundle.endsWith('/SubTrackSandbox.app')||bundle.endsWith('\\SubTrackSandbox.app'),true);assert.match(sourceHead,/^[a-f0-9]{40}$/);assert.ok(['enabled','disabled'].includes(runtimeIntent));assert.match(buildNumber,/^[1-9][0-9]*$/);assert.ok(Number.isSafeInteger(Number(buildNumber))&&Number(buildNumber)<=2147483647);
 const directory=state(bundle,true),resources=join(bundle,'EXConstants.bundle'),resourceState=state(resources,true),files=[];let info,configBytes,hermes,executable;
 const payload=(file,maximum)=>{const before=state(file),bytes=read(file,maximum);identity(before,state(file));files.push({file,before});return bytes;};
 try{
  info=payload(join(bundle,'Info.plist'),262144);configBytes=payload(join(resources,'app.config'),262144);hermes=payload(join(bundle,'main.jsbundle'),134217728);
  const converted=readInfo(info);assert.equal(typeof converted,'string');assert.ok(Buffer.byteLength(converted)<=262144);const plist=JSON.parse(converted);
  assert.equal(plist.CFBundleIdentifier,'se.subtrack.app.sandbox');assert.equal(plist.CFBundleVersion,buildNumber);assert.equal(plist.CFBundlePackageType,'APPL');assert.equal(plist.DTPlatformName,'iphoneos');assert.deepEqual(plist.CFBundleSupportedPlatforms,['iPhoneOS']);assert.equal(plist.CFBundleExecutable,'SubTrackSandbox');
  const text=configBytes.toString('utf8');assert.equal(Buffer.from(text).equals(configBytes),true);const config=JSON.parse(text);assert.equal(JSON.stringify(config),text);assert.deepEqual(sandboxIosBuildIntent(config),{runtimeIntent,buildNumber});assert.equal(config.android?.package,'se.subtrack.app.sandbox');
  assert.equal((config.plugins??[]).some(plugin=>(typeof plugin==='string'?plugin:plugin[0])==='./plugins/private-runtime-ca.cjs'),false);
  assert.ok(hermes.length>=8&&hermes.subarray(0,8).equals(Buffer.from('c61fbc03c103191f','hex')));
  executable=payload(join(bundle,plist.CFBundleExecutable),268435456);assert.ok(executable.length>=32&&executable.subarray(0,4).equals(Buffer.from('cffaedfe','hex'))&&executable.readUInt32LE(4)===0x0100000c&&executable.readUInt32LE(12)===2);
  for(const file of files)identity(file.before,state(file.file));
  identity(directory,state(bundle,true));identity(resourceState,state(resources,true));
  return Object.freeze({schema:'st253-ios-unsigned-payload-v1',sourceHead,bundleIdentifier:plist.CFBundleIdentifier,buildNumber,runtimeIntent,infoPlistSha256:digest(info),embeddedConfigSha256:digest(configBytes),hermesSha256:digest(hermes),executableSha256:digest(executable),signing:'not-performed',runtimeQualification:'not-performed',installableIpa:false,publicationEnabled:false});
 }finally{info?.fill(0);configBytes?.fill(0);hermes?.fill(0);executable?.fill(0);}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{assert.equal(process.platform,'darwin');assert.equal(process.argv.length,6);const [, ,bundle,runtimeIntent,buildNumber,sourceHead]=process.argv;assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),encoding:'utf8',timeout:10000,maxBuffer:128}).trim(),sourceHead);process.stdout.write(JSON.stringify(verifySandboxIosArchivePayload({bundle,sourceHead,runtimeIntent,buildNumber}))+'\n');}
 catch{process.stderr.write('Sandbox iOS archive payload unavailable\n');process.exitCode=1;}
}
