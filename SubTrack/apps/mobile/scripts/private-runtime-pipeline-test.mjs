import assert from 'node:assert/strict';
import console from 'node:console';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import process from 'node:process';
import {createRequire} from 'node:module';
import {URL} from 'node:url';
import {dirname,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

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
}
// Native v2 may reuse public libraries across wrapper-only edits, but never
// across OS/architecture, dependency lock or application-output policy changes.
const dependencyNamespace="subtrack-android-gradle-v2-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('SubTrack/pnpm-lock.yaml', 'SubTrack/apps/mobile/scripts/private-runtime-gradle-cache.init.gradle') }}-";
assert.equal(cacheSteps[0].with.key,dependencyNamespace+"${{ hashFiles('SubTrack/apps/mobile/scripts/private-runtime-build.sh') }}");
assert.deepEqual(cacheSteps[0].with['restore-keys'].trim().split('\n'),[dependencyNamespace]);
assert.equal(cacheSteps[1].with['restore-keys'],undefined);
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
const iosTiming=build.split('# ST253_IOS_BUILD_TIMING_BEGIN')[1]?.split('# ST253_IOS_BUILD_TIMING_END')[0];
assert.ok(iosTiming);assert.ok(iosTiming.includes('pod install --verbose'));assert.ok(iosTiming.includes('-showBuildTimingSummary build'));
assert.ok(iosTiming.includes('-destination "id=${SUBTRACK_SIMULATOR_UDID:?}"'));assert.ok(iosTiming.includes('CODE_SIGNING_ALLOWED=NO'));
assert.equal((build.match(/timed_ios_build_phase ios-pods install_ios_pods/g)??[]).length,1);assert.equal((build.match(/timed_ios_build_phase ios-compile compile_ios_app/g)??[]).length,1);
const timingRoot=mkdtempSync(join(tmpdir(),'st253-ios-timing-')),bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
try{
  mkdirSync(join(timingRoot,'private'));
  for(const [phase,status]of [['ios-pods',0],['ios-compile',17]]){
    const result=spawnSync(bash,['-c',`set -eu; proof_root="$ST253_TIMING_ROOT"; ${iosTiming}\nprivate_command(){ printf 'private-canary stdout\\n'; printf 'private-canary stderr\\n' >&2; return ${status}; }; timed_ios_build_phase ${phase} private_command; printf 'following-command\\n'`],{encoding:'utf8',env:{...process.env,ST253_TIMING_ROOT:timingRoot.replaceAll('\\','/')}});
    assert.equal(result.status,status);assert.match(result.stdout,new RegExp(`^ST253_IOS_BUILD_TIMING phase=${phase} elapsed_seconds=[0-9]+ exit_code=${status}\\n${status===0?'following-command\\n':''}$`));assert.equal(result.stderr,'');assert.ok(!result.stdout.includes('private-canary'));assert.ok(readFileSync(join(timingRoot,'private',phase==='ios-pods'?'pods.log':'build.log'),'utf8').includes('private-canary stderr'));
  }
  const denied=spawnSync(bash,['-c',`set -eu; proof_root="$ST253_TIMING_ROOT"; ${iosTiming}\ntimed_ios_build_phase foreign printf private-canary`],{encoding:'utf8',env:{...process.env,ST253_TIMING_ROOT:timingRoot.replaceAll('\\','/')}});assert.equal(denied.status,2);assert.equal(denied.stdout,'');
  mkdirSync(join(timingRoot,'ios'));
  const commandProof=spawnSync(bash,['-c',`set -eu; proof_root="$ST253_TIMING_ROOT"; SUBTRACK_SIMULATOR_UDID=123E4567-E89B-42D3-A456-426614174000; ${iosTiming}\npod(){ printf 'arg=%s\\n' "$@"; }; xcodebuild(){ printf 'arg=%s\\n' "$@"; }; timed_ios_build_phase ios-pods install_ios_pods; timed_ios_build_phase ios-compile compile_ios_app`],{cwd:timingRoot,encoding:'utf8',env:{...process.env,ST253_TIMING_ROOT:timingRoot.replaceAll('\\','/')}});
  assert.equal(commandProof.status,0);assert.equal(commandProof.stderr,'');assert.equal(readFileSync(join(timingRoot,'private/pods.log'),'utf8'),'arg=install\narg=--verbose\n');
  const compileArgs=readFileSync(join(timingRoot,'private/build.log'),'utf8').trim().split('\n').map(line=>line.slice(4));assert.deepEqual(compileArgs.slice(0,10),['-workspace','ios/SubTrack.xcworkspace','-scheme','SubTrack','-configuration','Debug','-sdk','iphonesimulator','-destination','id=123E4567-E89B-42D3-A456-426614174000']);assert.equal(compileArgs[10],'-derivedDataPath');assert.ok(compileArgs[11].endsWith('/private/derived'));assert.deepEqual(compileArgs.slice(12),['CODE_SIGNING_ALLOWED=NO','-showBuildTimingSummary','build']);assert.ok(!commandProof.stdout.includes('arg='));
}finally{rmSync(timingRoot,{recursive:true,force:true});}
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
