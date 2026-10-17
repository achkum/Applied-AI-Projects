import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const requireMobile=createRequire(new URL('../../apps/mobile/package.json',import.meta.url));
const yaml=createRequire(requireMobile.resolve('expo/package.json'))('yaml');
const workflow=yaml.parse(read('../../../.github/workflows/subtrack-sandbox-android-build.yml'));
test('release cache contains only public dependencies/library tasks and never application/signing material',()=>{
 const expected=['~/.gradle/caches/modules-2','~/.gradle/caches/*/transforms','~/.gradle/caches/transforms-*','~/.gradle/caches/build-cache-*','~/.gradle/wrapper'];
 for(const name of ['unsigned-android','private-delivery']){
  const steps=workflow.jobs[name].steps,restore=steps.find(s=>s.id==='release_gradle_cache'),save=steps.find(s=>s.name==='Persist public Android Release library cache');
  assert.match(restore.uses,/^actions\/cache\/restore@0057852bfaa89a56745cba8c7296529d2fc39830$/);assert.match(save.uses,/^actions\/cache\/save@0057852bfaa89a56745cba8c7296529d2fc39830$/);
  for(const step of [restore,save]){assert.deepEqual(step.with.path.trim().split('\n'),expected);assert.equal(step.with['restore-keys'],undefined);}
  assert.equal(save.with.key,'${{ steps.release_gradle_cache.outputs.cache-primary-key }}');assert.match(save.if,/success\(\)/);assert.match(save.if,/cache-hit != 'true'/);
  assert.ok(steps.indexOf(restore)<steps.findIndex(s=>s.name?.includes(name==='unsigned-android'?'Actual unsigned Release':'Free private draft custody')));assert.ok(steps.indexOf(save)>steps.indexOf(restore));
  if(name==='private-delivery'){assert.equal(restore.if,"inputs.delivery_mode == 'unsigned-apk'");assert.ok(save.if.includes("inputs.delivery_mode == 'unsigned-apk'"));}
 }
 const build=read('./build-android.sh'),exclude=read('../../apps/mobile/scripts/private-runtime-gradle-cache.init.gradle');
 assert.ok(build.includes(':app:assembleRelease --no-daemon --build-cache --init-script ../scripts/private-runtime-gradle-cache.init.gradle'));
 assert.ok(exclude.includes("withId('com.android.application')"));assert.ok(exclude.includes("doNotCacheIf('SubTrack application outputs remain runner-local') { true }"));
 assert.equal(workflow.jobs['signed-return-verification'].steps.filter(s=>s.uses?.startsWith('actions/cache/')).length,0);
});
test('new proof commits cancel obsolete runs while actual signing/delivery custody remains uncancellable',()=>{
 const native=yaml.parse(read('../../../.github/workflows/subtrack-native-device-proof.yml'));
 assert.equal(native.concurrency.group,'subtrack-native-device-${{ github.event.pull_request.number || github.ref }}');assert.equal(native.concurrency['cancel-in-progress'],true);
 assert.ok(workflow.concurrency.group.includes('github.run_id'));assert.ok(workflow.concurrency['cancel-in-progress'].includes("inputs.delivery_mode != 'none'"));
});

test('PR policy is honestly named and actual Release compilation happens once in retained delivery',()=>{
 const policy=workflow.jobs['android-release-policy'];assert.equal(policy.if,"github.event_name == 'pull_request'");assert.ok(policy.name.includes('policy'));assert.ok(policy.steps.some(s=>s.run?.includes('android-release-receipt.test.mjs')));assert.ok(!policy.steps.some(s=>s.run?.includes('sdkmanager')||s.run?.includes('assembleRelease')));
 assert.equal(workflow.jobs['unsigned-android'].if,"github.event_name != 'pull_request' && inputs.delivery_mode == 'none'");
 const delivery=workflow.jobs['private-delivery'];assert.ok(delivery.if.includes("inputs.delivery_mode == 'unsigned-apk'"));assert.ok(delivery.steps.some(s=>s.run?.includes('draft-android.sh apk')));
 assert.ok(read('./build-android.sh').includes(':app:assembleRelease'));
});
