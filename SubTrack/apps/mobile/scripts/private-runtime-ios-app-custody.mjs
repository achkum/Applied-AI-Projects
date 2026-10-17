import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {constants,lstatSync,realpathSync,openSync,closeSync,fstatSync,readSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import process from 'node:process';

export const IOS_APP_CHECKS=Object.freeze(['UDID','BOOT_QUERY','BOOT_MATCH','CONTAINER_QUERY','CONTAINER_PATH','PLIST_FILE','PLIST_SIZE','PLIST_READ','PLIST_HASH','MAIN_FILE','MAIN_SIZE','MAIN_READ','MAIN_HASH','DEBUG_ROSTER','DEBUG_FILE','DEBUG_SIZE','DEBUG_READ','DEBUG_HASH']);
export function validIosAppContainer(value,udid){
 if(typeof value!=='string'||typeof udid!=='string'||! /^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(udid)||/[\r\n\0]/.test(value))return false;
 // Pinned Maestro clearState copies/reinstalls the same app under a timestamped
 // filename. Bundle bytes, rather than that filename, establish code identity.
 // https://raw.githubusercontent.com/mobile-dev-inc/Maestro/cli-2.11.0/maestro-ios-driver/src/main/kotlin/util/LocalSimulatorUtils.kt
 return new RegExp(`^/Users/[A-Za-z0-9][A-Za-z0-9._-]*/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Bundle/Application/[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}/(?:SubTrack|se\\.subtrack\\.app-[1-9][0-9]{12})\\.app$`).test(value);
}
function fileState(file){const value=lstatSync(file);assert.ok(value.isFile()&&!value.isSymbolicLink());assert.equal(realpathSync(file),resolve(file));if(typeof process.getuid==='function')assert.equal(value.uid,process.getuid());return value;}
function sameState(left,right){for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(left[key],right[key]);}
function hash(file,state){const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW),bytes=Buffer.alloc(65536),digest=createHash('sha256');let count=0;try{sameState(fstatSync(fd),state);for(;;){const size=readSync(fd,bytes,0,bytes.length,null);if(size===0)break;count+=size;assert.ok(count<=state.size);digest.update(bytes.subarray(0,size));}assert.equal(count,state.size);sameState(fstatSync(fd),state);sameState(fileState(file),state);return digest.digest('hex');}finally{bytes.fill(0);closeSync(fd);}}
export function verifyIosAppFiles(built,installed,onCheck=()=>{},onSize=()=>{}){
 for(const directory of [built,installed]){const s=lstatSync(directory);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal(realpathSync(directory),resolve(directory));}
 const check=value=>{assert.ok(IOS_APP_CHECKS.includes(value));onCheck(value);};
 const verify=(name,role,limit)=>{check(`${role}_FILE`);const one=fileState(join(installed,name)),two=fileState(join(built,name));check(`${role}_SIZE`);onSize(role,one.size,two.size);assert.ok(one.size>0&&one.size<=limit&&two.size===one.size);check(`${role}_READ`);const actual=hash(join(installed,name),one),expected=hash(join(built,name),two);check(`${role}_HASH`);assert.equal(actual,expected);};
 verify('Info.plist','PLIST',67108864);verify('SubTrack','MAIN',67108864);
 check('DEBUG_ROSTER');const roster=directory=>readdirSync(directory).filter(name=>name.endsWith('.debug.dylib')).sort(),expected=roster(built),actual=roster(installed);assert.deepEqual(actual,expected);assert.ok(expected.length===0||expected.length===1&&expected[0]==='SubTrack.debug.dylib');
 // Xcode may place the actual Swift app code in this separate library. Stream
 // its complete bytes with bounded memory; the existing main/plist caps remain.
 if(expected.length===1)verify('SubTrack.debug.dylib','DEBUG',536870912);
 return true;
}
