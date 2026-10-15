import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,URL} from 'node:url';

const driverUrl=new URL('./private-runtime-device.mjs',import.meta.url);
const source=readFileSync(driverUrl,'utf8');
const block=source.split('async function main() {')[1]?.split('  const repo =')[0];
assert.ok(block?.includes('const installedNativeVersion'));
assert.equal(block.split('fileURLToPath(import.meta.url)').length,2);
// Execute the driver's real pre-fixture block; inject only its module URL and
// installed-package reader, so the test never creates a fixture or device.
const preconditions=Function('assert','process','resolve','dirname','fileURLToPath','join','createRequire','driverUrl',
  block.replace('fileURLToPath(import.meta.url)','fileURLToPath(driverUrl)')+'\nreturn installedNativeVersion;');
const pinned=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).dependencies['react-native'];
function run(platform,version,environment='development',requested=[]){
 return preconditions(assert,{env:{NODE_ENV:environment},argv:['node','driver',platform]},resolve,dirname,fileURLToPath,join,
  packagePath=>{assert.equal(packagePath,fileURLToPath(new URL('../package.json',import.meta.url)));return name=>{requested.push(name);assert.equal(name,'react-native/package.json');return {version};};},driverUrl);
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
