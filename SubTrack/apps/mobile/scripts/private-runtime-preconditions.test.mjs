import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {maestroDevicePrefix} from './private-runtime-maestro-device.mjs';

const driverUrl=new URL('./private-runtime-device.mjs',import.meta.url);
const source=readFileSync(driverUrl,'utf8');
const block=source.split('async function main() {')[1]?.split('  const repo =')[0];
assert.ok(block?.includes('const installedNativeVersion'));
assert.equal(block.split('fileURLToPath(import.meta.url)').length,2);
// Execute the driver's real pre-fixture block; inject only its module URL and
// installed-package reader, so the test never creates a fixture or device.
const preconditions=Function('assert','process','resolve','dirname','fileURLToPath','join','createRequire','driverUrl','maestroDevicePrefix',
  block.replace('fileURLToPath(import.meta.url)','fileURLToPath(driverUrl)')+'\nreturn installedNativeVersion;');
const pinned=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).dependencies['react-native'];
function run(platform,version,environment='development',requested=[]){
 return preconditions(assert,{env:{NODE_ENV:environment,SUBTRACK_SIMULATOR_UDID:'123E4567-E89B-42D3-A456-426614174000'},argv:['node','driver',platform]},resolve,dirname,fileURLToPath,join,
  packagePath=>{assert.equal(packagePath,fileURLToPath(new URL('../package.json',import.meta.url)));return name=>{requested.push(name);assert.equal(name,'react-native/package.json');return {version};};},driverUrl,maestroDevicePrefix);
}
test('actual native preconditions accept both installed platforms at the locked app version',()=>{
 for(const platform of ['android','ios']){const requested=[];assert.equal(run(platform,pinned,'development',requested),pinned);assert.deepEqual(requested,['react-native/package.json']);}
});
test('actual native preconditions reject the stale version and unreviewed installed versions',()=>{
 for(const platform of ['android','ios'])for(const version of ['0.74.5','0.81.4','0.82.0',undefined])assert.throws(()=>run(platform,version),{code:'ERR_ASSERTION'});
});
test('actual NODE_ENV and platform guards fail before package loading or fixture setup',()=>{
 for(const environment of ['production','test',undefined]){const requested=[];const env=environment===undefined?'':environment;assert.throws(()=>run('android',pinned,env,requested),{code:'ERR_ASSERTION'});assert.deepEqual(requested,[]);}
 for(const platform of ['web','unknown',undefined]){const requested=[];assert.throws(()=>run(platform,pinned,'development',requested),{code:'ERR_ASSERTION'});assert.deepEqual(requested,[]);}
});

test('successful artifact records the actual installed locked Expo version after SDK maintenance',()=>{
 const expression=source.match(/^\s+expo: (.+),$/m)?.[1];assert.ok(expression);
 const app=fileURLToPath(new URL('../',import.meta.url));
 const actual=Function('readFileSync','join','app',`return (${expression});`)(readFileSync,join,app);
 const locked=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).dependencies.expo;
 assert.equal(actual,locked);assert.equal(actual,'54.0.37');
});
