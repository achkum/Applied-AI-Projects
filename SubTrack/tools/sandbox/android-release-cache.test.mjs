import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const requireMobile=createRequire(new URL('../../apps/mobile/package.json',import.meta.url));
const yaml=createRequire(requireMobile.resolve('expo/package.json'))('yaml');
const workflow=yaml.parse(read('../../../.github/workflows/subtrack-sandbox-android-build.yml'));
test('recovery-only changes select lightweight policy and both protocol suites also guard private delivery',()=>{
 const filters=workflow.on.pull_request.paths;
 for(const changed of ['SubTrack/tools/sandbox/android-local-signing-reservation.mjs','SubTrack/tools/sandbox/android-local-signing-receipt.test.mjs','SubTrack/tools/sandbox/sign-android-local-recovery.ps1']){
  assert.ok(filters.some(pattern=>pattern.endsWith('*')?changed.startsWith(pattern.slice(0,-1)):pattern===changed));
 }
 const suites=['tools/sandbox/android-local-signing-reservation.test.mjs','tools/sandbox/android-local-signing-receipt.test.mjs'];
 const policy=workflow.jobs['android-release-policy'],delivery=workflow.jobs['private-delivery'];
 for(const suite of suites){assert.ok(policy.steps.some(step=>step.run?.includes(suite)));assert.ok(delivery.steps.some(step=>step.name==='Focused Android custody contracts'&&step.run.includes(suite)));}
 assert.ok(delivery.steps.findIndex(step=>step.name==='Focused Android custody contracts')<delivery.steps.findIndex(step=>step.name==='Free private draft custody and observed cleanup'));
 assert.ok(!policy.steps.some(step=>step.run?.includes('sdkmanager')||step.run?.includes('assembleRelease')));
});

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
 const group=(github,inputs={})=>native.concurrency.group.replace(/\$\{\{\s*(.*?)\s*\}\}/g,(_match,expression)=>Function('github','inputs','format',`return (${expression});`)(github,inputs,(template,...values)=>template.replace(/\{(\d+)\}/g,(_m,index)=>String(values[Number(index)]))));
 const manual={event_name:'workflow_dispatch',event:{pull_request:{}},ref:'refs/heads/codex/ios-startup-fixes',sha:'a'.repeat(40)},pr={event_name:'pull_request',event:{pull_request:{number:304}},ref:'refs/pull/304/merge'};
 assert.equal(group(manual,{platform:'android'}),'subtrack-native-device-refs/heads/codex/ios-startup-fixes-android');
 assert.equal(group(manual,{platform:'ios'}),'subtrack-native-device-refs/heads/codex/ios-startup-fixes-ios');
 assert.equal(new Set(['android','ios','all'].map(platform=>group(manual,{platform}))).size,3);
 assert.equal(group({...manual,sha:'b'.repeat(40)},{platform:'ios'}),group(manual,{platform:'ios'}));
 assert.notEqual(group({...manual,ref:'refs/heads/other'},{platform:'ios'}),group(manual,{platform:'ios'}));
 assert.equal(group(pr,{platform:'ios'}),'subtrack-native-device-304');assert.equal(group(pr,{platform:'android'}),group(pr,{platform:'ios'}));
 assert.notEqual(group({...pr,event:{pull_request:{number:305}}}),group(pr));assert.equal(native.concurrency['cancel-in-progress'],true);
 assert.ok(workflow.concurrency.group.includes('github.run_id'));assert.ok(workflow.concurrency['cancel-in-progress'].includes("inputs.delivery_mode != 'none'"));
});

test('native cache restores across wrapper edits only inside identical OS architecture dependency and exclusion policy',()=>{
 const native=yaml.parse(read('../../../.github/workflows/subtrack-native-device-proof.yml')),steps=native.jobs['installed-native'].steps,restore=steps.find(step=>step.id==='android_gradle_cache'),save=steps.find(step=>step.name==='Persist verified public Android Gradle cache'),gate=steps.find(step=>step.name==='Save public Android Gradle inputs and library tasks');
 const lock='SubTrack/pnpm-lock.yaml',policy='SubTrack/apps/mobile/scripts/private-runtime-gradle-cache.init.gradle',wrapper='SubTrack/apps/mobile/scripts/private-runtime-build.sh',files={[lock]:'locked dependencies',[policy]:'all app task outputs excluded',[wrapper]:'Android and iOS wrapper'};
 const render=(template,contents=files,runner={os:'Linux',arch:'X64'})=>template.replace(/\$\{\{\s*(.*?)\s*\}\}/g,(_match,expression)=>Function('runner','hashFiles',`return (${expression});`)(runner,(...names)=>{const hash=createHash('sha256');for(const name of names){assert.equal(typeof contents[name],'string','unknown or broadened cache input');hash.update(createHash('sha256').update(contents[name]).digest());}return hash.digest('hex');}));
 const prefixes=restore.with['restore-keys'].trim().split('\n');assert.equal(prefixes.length,1);const primary=render(restore.with.key),prefix=render(prefixes[0]);assert.match(primary,/^subtrack-android-gradle-v2-Linux-X64-[a-f0-9]{64}-[a-f0-9]{64}$/);assert.match(prefix,/^subtrack-android-gradle-v2-Linux-X64-[a-f0-9]{64}-$/);assert.ok(primary.startsWith(prefix));
 const nextWrapper={...files,[wrapper]:'new iOS timing instrumentation'};assert.notEqual(render(restore.with.key,nextWrapper),primary);assert.equal(render(prefixes[0],nextWrapper),prefix);assert.ok(primary.startsWith(render(prefixes[0],nextWrapper)));
 for(const name of [lock,policy]){const changed={...files,[name]:'changed '+files[name]};assert.notEqual(render(prefixes[0],changed),prefix);assert.ok(!primary.startsWith(render(prefixes[0],changed)));}
 for(const runner of [{os:'Windows',arch:'X64'},{os:'Linux',arch:'ARM64'}])assert.ok(!primary.startsWith(render(prefixes[0],files,runner)));
 const paths=['~/.gradle/caches/modules-2','~/.gradle/caches/*/transforms','~/.gradle/caches/transforms-*','~/.gradle/caches/build-cache-*','~/.gradle/wrapper'];for(const step of [restore,save])assert.deepEqual(step.with.path.trim().split('\n'),paths);
 assert.equal(save.with.key,'${{ steps.android_gradle_cache.outputs.cache-primary-key }}');assert.equal(gate.if,"always() && matrix.platform == 'android' && steps.installed_proof.outcome != 'skipped' && steps.android_gradle_cache.outcome == 'success' && steps.android_gradle_cache.outputs.cache-hit != 'true'");assert.ok(gate.run.includes("state.phase==='metro'&&state.exitCode===0"));assert.equal(save.if,"always() && matrix.platform == 'android' && env.SUBTRACK_ANDROID_GRADLE_CACHE_READY == 'true'");
 assert.ok(read('../../apps/mobile/scripts/private-runtime-gradle-cache.init.gradle').includes("doNotCacheIf('SubTrack application outputs remain runner-local') { true }"));
});

test('PR policy is honestly named and actual Release compilation happens once in retained delivery',()=>{
 const policy=workflow.jobs['android-release-policy'];assert.equal(policy.if,"github.event_name == 'pull_request'");assert.ok(policy.name.includes('policy'));assert.ok(policy.steps.some(s=>s.run?.includes('android-release-receipt.test.mjs')));assert.ok(!policy.steps.some(s=>s.run?.includes('sdkmanager')||s.run?.includes('assembleRelease')));
 assert.equal(workflow.jobs['unsigned-android'].if,"github.event_name != 'pull_request' && inputs.delivery_mode == 'none'");
 const delivery=workflow.jobs['private-delivery'];assert.ok(delivery.if.includes("inputs.delivery_mode == 'unsigned-apk'"));assert.ok(delivery.steps.some(s=>s.run?.includes('draft-android.sh apk')));
 assert.ok(read('./build-android.sh').includes(':app:assembleRelease'));
});
