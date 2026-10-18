import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync,realpathSync,openSync,ftruncateSync,closeSync,unlinkSync,lstatSync} from 'node:fs';
import process from 'node:process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validIosAppContainer,verifyIosAppFiles,IOS_APP_CHECKS} from './private-runtime-ios-app-custody.mjs';
const udid='123E4567-E89B-42D3-A456-426614174000',prefix=`/Users/runner/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Bundle/Application/123E4567-E89B-42D3-A456-426614174001/`;
test('measured app container permits original and pinned clearState copy names only on the owned simulator',()=>{
 for(const name of ['SubTrack.app','se.subtrack.app-1792267200000.app'])assert.equal(validIosAppContainer(prefix+name,udid),true);
 for(const value of [null,{},prefix+'other.app',prefix+'se.subtrack.app.sandbox-1792267200000.app',prefix+'se.subtrack.app-1.app',prefix+'se.subtrack.app-0179226720000.app',prefix+'../SubTrack.app',prefix+'SubTrack.app/extra',prefix+'SubTrack.app\n',prefix.replace('/runner/','/../')+'SubTrack.app',prefix.replace(udid,'123E4567-E89B-42D3-A456-426614174002')+'SubTrack.app'])assert.equal(validIosAppContainer(value,udid),false);
 assert.equal(validIosAppContainer(prefix+'SubTrack.app','foreign'),false);
});
function fixture(action){const root=mkdtempSync(join(realpathSync(tmpdir()),'st253-ios-app-')),built=join(root,'SubTrack.app'),installed=join(root,'se.subtrack.app-1792267200000.app');mkdirSync(built);mkdirSync(installed);for(const file of ['Info.plist','SubTrack']){writeFileSync(join(built,file),'source-owned-'+file);copyFileSync(join(built,file),join(installed,file));}try{action({built,installed});}finally{rmSync(root,{recursive:true,force:true});}}
test('real files retain exact plist/main identity after a legitimate clearState directory rename',()=>fixture(({built,installed})=>{const checks=[];assert.equal(verifyIosAppFiles(built,installed,value=>checks.push(value)),true);assert.ok(checks.includes('MAIN_HASH'));assert.equal(Object.isFrozen(IOS_APP_CHECKS),true);}));
test('POSIX owner identity rejects foreign code while the Windows test port remains usable',()=>fixture(({built,installed})=>{
 const descriptor=Object.getOwnPropertyDescriptor(process,'getuid'),uid=lstatSync(join(built,'SubTrack')).uid;
 try{Object.defineProperty(process,'getuid',{configurable:true,value:()=>uid});assert.equal(verifyIosAppFiles(built,installed),true);Object.defineProperty(process,'getuid',{configurable:true,value:()=>uid+1});assert.throws(()=>verifyIosAppFiles(built,installed));Object.defineProperty(process,'getuid',{configurable:true,value:undefined});assert.equal(verifyIosAppFiles(built,installed),true);}finally{if(descriptor)Object.defineProperty(process,'getuid',descriptor);else delete process.getuid;}
}));
test('changed equal-length code or plist and old oversize/empty main limits still withhold',()=>{
 for(const name of ['Info.plist','SubTrack'])fixture(({built,installed})=>{const original='source-owned-'+name;writeFileSync(join(installed,name),'X'+original.slice(1));assert.throws(()=>verifyIosAppFiles(built,installed));});
 for(const size of [0,67108865])fixture(({built,installed})=>{for(const folder of [built,installed]){const fd=openSync(join(folder,'SubTrack'),'w');ftruncateSync(fd,size);closeSync(fd);}let observed;assert.throws(()=>verifyIosAppFiles(built,installed,()=>{},(role,one,two)=>{if(role==='MAIN')observed=[one,two];}));assert.deepEqual(observed,[size,size]);});
});
test('optional Xcode debug library is completely bound and foreign, missing, changed or oversized code fails',()=>fixture(({built,installed})=>{
 const name='SubTrack.debug.dylib';for(const folder of [built,installed])writeFileSync(join(folder,name),'actual-app-code');assert.equal(verifyIosAppFiles(built,installed),true);
 writeFileSync(join(installed,name),'changed-app-code');assert.throws(()=>verifyIosAppFiles(built,installed));unlinkSync(join(installed,name));assert.throws(()=>verifyIosAppFiles(built,installed));copyFileSync(join(built,name),join(installed,name));
 for(const folder of [built,installed])writeFileSync(join(folder,'Foreign.debug.dylib'),'unknown');assert.throws(()=>verifyIosAppFiles(built,installed));for(const folder of [built,installed])unlinkSync(join(folder,'Foreign.debug.dylib'));
 for(const folder of [built,installed]){const fd=openSync(join(folder,name),'w');ftruncateSync(fd,536870913);closeSync(fd);}assert.throws(()=>verifyIosAppFiles(built,installed));
}));
