import assert from 'node:assert/strict';
import console from 'node:console';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {URL} from 'node:url';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const mobileRequire = createRequire(new URL('../package.json', import.meta.url));
const yaml = createRequire(mobileRequire.resolve('expo/package.json'))('yaml');
const workflow = yaml.parse(read('../../../../.github/workflows/subtrack-native-device-proof.yml'));
const steps = workflow.jobs['installed-native'].steps;
const step = name => {const found=steps.find(item=>item.name===name);assert.ok(found,name);return found;};
const cacheSteps = steps.filter(item => item.uses?.startsWith('actions/cache/'));
assert.equal(cacheSteps.length,2);
for(const item of cacheSteps){
  assert.match(item.uses,/@0057852bfaa89a56745cba8c7296529d2fc39830$/);
  assert.ok(item.if.includes("matrix.platform == 'android'"));
  assert.equal(item.with['restore-keys'],undefined);
}
const gradlePaths = ['~/.gradle/caches/modules-2','~/.gradle/caches/*/transforms','~/.gradle/caches/transforms-*','~/.gradle/caches/build-cache-*','~/.gradle/wrapper'];
for(const [restore,save,paths] of [[cacheSteps[0],cacheSteps[1],gradlePaths]]){
  assert.match(restore.uses,/cache\/restore@/);assert.match(save.uses,/cache\/save@/);
  assert.deepEqual(restore.with.path.trim().split('\n'),paths);
  assert.deepEqual(save.with.path.trim().split('\n'),paths);
  assert.equal(save.with.key, '${{ steps.'+restore.id+'.outputs.cache-primary-key }}');
}
assert.ok(cacheSteps.every(item=>!item.with.path.includes('/android/sdk')));
for(const path of ['SubTrack/pnpm-lock.yaml','SubTrack/apps/mobile/scripts/private-runtime-build.sh','SubTrack/apps/mobile/scripts/private-runtime-gradle-cache.init.gradle'])assert.ok(cacheSteps[0].with.key.includes(path));
assert.ok(step('Save public Android Gradle inputs and library tasks').if.includes('always()'));
assert.ok(step('Save public Android Gradle inputs and library tasks').run.includes("state.phase==='metro'&&state.exitCode===0"));
assert.ok(cacheSteps[1].if.includes("env.SUBTRACK_ANDROID_GRADLE_CACHE_READY == 'true'"));
assert.ok(steps.indexOf(step('Installed workflow, API restart, same database row and logout'))<steps.indexOf(cacheSteps[1]));
assert.equal(step('Sanitized native evidence only').if,"success() && needs.select-proof.outputs.scope != 'ios-driver'");
const build=read('./private-runtime-build.sh');
assert.ok(build.includes('./gradlew :app:assembleDebug --no-daemon'));
assert.ok(build.includes('--build-cache --init-script ../scripts/private-runtime-gradle-cache.init.gradle'));
// Inspect the actual pinned Expo template and exact invoked command, not a mocked builder.
const expoTemplate=execFileSync('tar',['-xOf',join(dirname(mobileRequire.resolve('expo/package.json')),'template.tgz'),'package/android/gradle.properties'],{encoding:'utf8',maxBuffer:65536});
assert.equal(mobileRequire('expo/package.json').version,'54.0.37');
assert.match(expoTemplate,/^reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64$/m);
assert.ok(expoTemplate.includes('./gradlew <task> -PreactNativeArchitectures=x86_64'));
const nativeCommand=build.slice(build.indexOf('(cd android && ./gradlew '),build.indexOf(') > "$proof_root/private/build.log"')).replace(/\\\r?\n\s*/g,' ').replace(/\s+/g,' ').trim();
assert.equal(nativeCommand,"(cd android && ./gradlew :app:assembleDebug --no-daemon --stacktrace --max-workers=2 --build-cache --init-script ../scripts/private-runtime-gradle-cache.init.gradle -PreactNativeArchitectures=x86_64 '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m'");
assert.equal((build.match(/-PreactNativeArchitectures=/g)??[]).length,1);
const device=read('./private-runtime-android.sh');
assert.ok(device.includes("create avd --name subtrack-proof --path \"$avd_data\" --package 'system-images;android-34;google_apis;x86_64' --device pixel_6"));
// A command-line debug override must never narrow the separate signed handset release.
const release=read('../../../tools/sandbox/build-android.sh');
assert.ok(release.includes("./gradlew :app:assembleRelease --no-daemon --build-cache --init-script ../scripts/private-runtime-gradle-cache.init.gradle --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m'"));
assert.doesNotMatch(release,/reactNativeArchitectures|abiFilters/);

assert.ok(build.indexOf(':app:assembleDebug')<build.indexOf('adb -s emulator-5554 install -r'));
assert.ok(build.indexOf('install -r')<build.indexOf('clear-app'));
const policy=read('./private-runtime-gradle-cache.init.gradle');
assert.ok(policy.includes("plugins.withId('com.android.application')"));
assert.ok(policy.includes('tasks.configureEach'));
assert.ok(policy.includes("outputs.doNotCacheIf('SubTrack application outputs remain runner-local') { true }"));
const versions=read('../node_modules/react-native/gradle/libs.versions.toml');
for(const line of ['compileSdk = "36"','buildTools = "36.0.0"','ndkVersion = "27.1.12297006"'])assert.ok(versions.includes(line));
assert.deepEqual(workflow.permissions,{contents:'read'});
console.log('Android pipeline cache boundary, locked toolchain and retained compile/install/proof gates PASS');
