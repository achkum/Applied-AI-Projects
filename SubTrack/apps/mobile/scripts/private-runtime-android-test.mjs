import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'subtrack-android-phase-'));
const sdk = join(root, 'sdk');
const runner = join(root, 'runner');
const bash = process.env.SUBTRACK_TEST_BASH ?? 'bash';
const script = fileURLToPath(
  new URL('./private-runtime-android.sh', import.meta.url),
);
const normalized = (value) => value.replaceAll('\\', '/');
function executable(file, text) {
  writeFileSync(file, `#!/usr/bin/env bash\n${text}\n`, { mode: 0o700 });
}
try {
  for (const directory of [
    'cmdline-tools/latest/bin',
    'platform-tools',
    'emulator',
  ])
    mkdirSync(join(sdk, directory), { recursive: true });
  mkdirSync(runner);
  executable(join(sdk, 'cmdline-tools/latest/bin/avdmanager'), 'exit 0');
  executable(join(sdk, 'platform-tools/adb'), 'exit 0');
  executable(join(sdk, 'emulator/emulator'), 'exit 0');
  const sdkmanager = join(sdk, 'cmdline-tools/latest/bin/sdkmanager');
  const env = {
    ...process.env,
    ANDROID_HOME: normalized(sdk),
    RUNNER_TEMP: normalized(runner),
    GITHUB_PATH: normalized(join(root, 'path')),
    GITHUB_ENV: normalized(join(root, 'env')),
  };
  function sdkPhase(extraEnv = {}) {
    return spawnSync(bash, [normalized(script), 'sdk'], {
      env: { ...env, ...extraEnv },
      encoding: 'utf8',
      timeout: 10000,
    });
  }
  executable(
    sdkmanager,
    '[[ "$#" == 4 && "$1" == "system-images;android-34;google_apis;x86_64" && "$2" == "platforms;android-36" && "$3" == "build-tools;36.0.0" && "$4" == "ndk;27.1.12297006" ]] || exit 40\nif read -r unexpected; then exit 41; fi\nmkdir -p "$ANDROID_HOME/ndk/27.1.12297006"\nprintf "Pkg.Revision = 27.1.12297006\\n" > "$ANDROID_HOME/ndk/27.1.12297006/source.properties"\nprintf private-tool-canary\nexit 0',
  );
  const provision = readFileSync(sdkmanager, 'utf8').replace('printf private-tool-canary', `
mkdir -p "$ANDROID_HOME/system-images/android-34/google_apis/x86_64" "$ANDROID_HOME/platforms/android-36" "$ANDROID_HOME/build-tools/36.0.0" "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin"
printf 'AndroidVersion.ApiLevel = 34\\n' > "$ANDROID_HOME/system-images/android-34/google_apis/x86_64/source.properties"
printf 'AndroidVersion.ApiLevel = 36\\n' > "$ANDROID_HOME/platforms/android-36/source.properties"
printf 'Pkg.Revision = 36.0.0\\n' > "$ANDROID_HOME/build-tools/36.0.0/source.properties"
touch "$ANDROID_HOME/system-images/android-34/google_apis/x86_64/system.img" "$ANDROID_HOME/platforms/android-36/android.jar"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$ANDROID_HOME/build-tools/36.0.0/aapt2"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"
chmod 700 "$ANDROID_HOME/build-tools/36.0.0/aapt2" "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"
printf private-tool-canary`);
  writeFileSync(sdkmanager, provision);
  const positive = sdkPhase();
  assert.equal(positive.status, 0);
  assert.match(positive.stdout, /event=sdk-installed/);
  assert.match(
    readFileSync(join(root, 'env'), 'utf8'),
    /ANDROID_AVD_HOME=.*subtrack-native-proof\/avd/,
  );
  assert.equal(positive.stdout.includes('private-tool-canary'), false);
  assert.match(
    readFileSync(
      join(runner, 'subtrack-native-proof/private/sdk-install.log'),
      'utf8',
    ),
    /private-tool-canary/,
  );
  executable(sdkmanager, 'exit 42');
  const warm = sdkPhase();
  assert.equal(warm.status, 0);
  assert.match(warm.stdout, /event=sdk-reused/);
  // A corrupt cached package must return to the installer rather than pass.
  const platformMetadata = join(sdk, 'platforms/android-36/source.properties');
  writeFileSync(platformMetadata, 'AndroidVersion.ApiLevel = 35');
  const corrupt = sdkPhase();assert.equal(corrupt.status,1);assert.match(corrupt.stdout,/event=sdk-install-exit-42/);
  writeFileSync(platformMetadata, 'AndroidVersion.ApiLevel = 36');
  // Successful installer still refuses incomplete cached package content.
  rmSync(join(sdk, 'platforms/android-36/android.jar'));
  executable(sdkmanager, 'exit 0');
  const incomplete = sdkPhase();
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stdout, /event=sdk-package-incomplete/);
  writeFileSync(join(sdk, 'platforms/android-36/android.jar'), 'fixture');
  const revision = join(sdk, 'ndk/27.1.12297006/source.properties');
  executable(sdkmanager, 'exit 0');
  rmSync(revision);
  const missingNdk = sdkPhase();
  assert.equal(missingNdk.status, 1);
  assert.match(missingNdk.stdout, /event=sdk-ndk-revision-missing/);
  for (const content of ['Pkg.Revision = 26.2.11394342', 'Pkg.Revision = 27.1.12297006-private-canary', 'arbitrary-private-canary']) {
    writeFileSync(revision, content);
    const mismatch = sdkPhase();
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stdout, /event=sdk-ndk-revision-mismatch/);
    assert.equal(mismatch.stdout.includes('private-canary'), false);
  }
  executable(sdkmanager, 'printf private-failure-canary >&2\nexit 23');
  const failed = sdkPhase();
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /event=sdk-install-exit-23/);
  assert.equal(failed.stdout.includes('private-failure-canary'), false);
  executable(sdkmanager, 'printf "License not accepted" >&2\nexit 1');
  const license = sdkPhase();
  assert.equal(license.status, 1);
  assert.match(license.stdout, /event=sdk-license-unaccepted/);
  // Execute the actual helper with a failing SDK child. Tool output stays in
  // its existing private file; only fixed signatures and the original exit
  // status leave it. No category installs, retries or changes package versions.
  for (const [message, category] of [
    ['javax.net.ssl.SSLHandshakeException: PKIX path building failed', 'sdk-tls-unavailable'],
    ['No space left on device', 'sdk-storage-unavailable'],
    ['java.nio.file.AccessDeniedException: private path', 'sdk-permission-denied'],
    ['Server returned HTTP response code: 503 for URL: https://private.invalid', 'sdk-http-unavailable'],
    ['java.net.SocketTimeoutException: Read timed out', 'sdk-network-unavailable'],
    ['java.net.UnknownHostException: private.invalid', 'sdk-network-unavailable'],
    ['java.util.zip.ZipException: zip END header not found', 'sdk-archive-invalid'],
    ['Warning: Failed to find package system-images;android-34;google_apis;x86_64', 'sdk-package-unavailable'],
    ['Warning: Failed to download any source lists!', 'sdk-repository-unavailable'],
    ['arbitrary unrecognized failure', 'sdk-no-known-error-signature'],
    ['license unknown network archive disk permission words', 'sdk-no-known-error-signature'],
  ]) {
    const invocation = join(root, 'sdk-category-invocations');
    executable(sdkmanager, `printf 'called\\n' >> '${normalized(invocation)}'\nprintf '%s\\n' '${message} PRIVATE_SDK_CANARY' >&2\nexit 1`);
    writeFileSync(invocation, '');
    const classified = sdkPhase();
    assert.equal(classified.status, 1);
    assert.match(classified.stdout, /event=sdk-install-exit-1/);
    assert.ok(classified.stdout.includes(`event=${category} `));
    assert.equal(readFileSync(invocation, 'utf8'), 'called\n');
    assert.ok(readFileSync(join(runner, 'subtrack-native-proof/private/sdk-install.log'), 'utf8').includes('PRIVATE_SDK_CANARY'));
    for (const output of [classified.stdout, classified.stderr]) {
      assert.ok(!output.includes('PRIVATE_SDK_CANARY'));
      assert.ok(!output.includes('private.invalid'));
      assert.ok(!output.includes('private path'));
    }
    assert.ok(!classified.stdout.includes('event=sdk-installed'));
  }
  // Original deadline/license handling wins before the new signature matcher.
  for (const code of [124, 137]) {
    executable(sdkmanager, `printf 'SSLHandshakeException PRIVATE_SDK_CANARY' >&2\nexit ${code}`);
    const deadline = sdkPhase();assert.equal(deadline.status, 1);assert.match(deadline.stdout, /event=sdk-install-deadline/);assert.ok(!deadline.stdout.includes('event=sdk-tls-unavailable'));assert.ok(!deadline.stdout.includes('PRIVATE_SDK_CANARY'));
  }
  assert.match(readFileSync(script, 'utf8'), /timeout --signal=TERM --kill-after=15s 600s/);
  const missingEmulator = sdkPhase({
    SUBTRACK_PRIVATE_EMULATOR_BIN: normalized(join(root, 'missing-emulator')),
  });
  assert.equal(missingEmulator.status, 1);
  assert.match(missingEmulator.stdout, /event=emulator-unavailable/);
  executable(
    join(sdk, 'cmdline-tools/latest/bin/avdmanager'),
    '[[ "$ANDROID_SDK_ROOT" == "$ANDROID_HOME" ]] || exit 42\n[[ "$ANDROID_AVD_HOME" == "$RUNNER_TEMP/subtrack-native-proof/avd" ]] || exit 43\n[[ "$5" == "--path" && "$6" == "$ANDROID_AVD_HOME/subtrack-proof.avd" ]] || exit 44\nmkdir -p "$6"\nprintf "path=%s\\n" "$6" > "$ANDROID_AVD_HOME/subtrack-proof.ini"\nprintf fixture > "$6/config.ini"',
  );
  const avd = spawnSync(bash, [normalized(script), 'avd'], {
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(avd.status, 0);
  assert.match(avd.stdout, /event=avd-created/);
  const repeatedAvd = spawnSync(bash,[normalized(script),'avd'],{env,encoding:'utf8',timeout:10000});
  assert.equal(repeatedAvd.status,1);assert.match(repeatedAvd.stdout,/event=avd-already-present/);
  const source=readFileSync(script,'utf8');
  assert.ok(source.indexOf('android_custody begin')<source.indexOf('create avd --name'));
  assert.ok(source.indexOf('android_custody created')>source.indexOf('avd-path-mismatch'));
  assert.ok(source.includes('android_custody boot || fail boot-custody-unavailable; diagnostic boot-completed; boot_success=true'));
  assert.ok(source.includes("androidAvdStage(process.argv[4],context,process.argv[3],process.env,value=>{stage=value;})"));
  assert.ok(source.includes('umask 077'));

  const ciRejected = spawnSync(bash, [normalized(script), 'clear-app'], {
    env: { ...env, CI: 'false', SUBTRACK_PRIVATE_DEVICE_PROOF: 'true' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.notEqual(ciRejected.status, 0);
  assert.match(ciRejected.stdout, /event=disposable-ci-required/);
  const unowned = spawnSync(bash, [normalized(script), 'clear-app'], {
    env: { ...env, CI: 'true', SUBTRACK_PRIVATE_DEVICE_PROOF: 'true' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.notEqual(unowned.status, 0);
  assert.match(unowned.stdout, /event=owned-emulator-required/);
  if (process.platform === 'linux') {
    // Real disposable child custody plus fake adb; never touches a device.
    const fakeAdb = join(sdk, 'platform-tools/adb');
    executable(
      fakeAdb,
      '[[ "$1" == -s && "$2" == emulator-5554 && "$3" == shell ]] || exit 41\nif [[ "$4" == getprop && "$5" == ro.kernel.qemu ]]; then printf "%s\\n" "${FAKE_QEMU:-1}"; elif [[ "$4" == pm && "$5" == clear && "$6" == se.subtrack.app ]]; then printf "%s\\n" "${FAKE_CLEAR-Success}"; else exit 42; fi',
    );
    const custodyScript =
      'sleep 30 & owned=$!; trap \'kill "$owned" 2>/dev/null || true\' EXIT; private="$RUNNER_TEMP/subtrack-native-proof/private"; printf "%s" "$owned" > "$private/emulator.pid"; value="$(cat "/proc/$owned/stat")"; read -ra fields <<< "${value##*) }"; printf "%s" "${fields[19]}" > "$private/emulator.start"; bash "$1" "$2"';
    const runOwned = (phase, extra = {}) =>
      spawnSync(
        bash,
        ['-c', custodyScript, 'test', normalized(script), phase],
        {
          env: {
            ...env,
            CI: 'true',
            SUBTRACK_PRIVATE_DEVICE_PROOF: 'true',
            ...extra,
          },
          encoding: 'utf8',
          timeout: 10000,
        },
      );
    const guarded = runOwned('owned-device');
    assert.equal(guarded.status, 0);
    assert.match(guarded.stdout, /event=owned-device-verified/);
    const cleared = runOwned('clear-app');
    assert.equal(cleared.status, 0);
    assert.match(cleared.stdout, /event=cold-app-cleared/);
    const notEmulator = runOwned('clear-app', { FAKE_QEMU: '0' });
    assert.notEqual(notEmulator.status, 0);
    assert.match(notEmulator.stdout, /event=owned-device-not-emulator/);
    for (const value of ['', 'Failure private-tool-canary']) {
      const failedClear = runOwned('clear-app', { FAKE_CLEAR: value });
      assert.notEqual(failedClear.status, 0);
      assert.match(failedClear.stdout, /event=app-clear-success-required/);
      assert.ok(!failedClear.stdout.includes('private-tool-canary'));
    }
  }
  console.log(
    'Android SDK phase: checked tool paths, exact packages, closed stdin, child failure and sanitized diagnostics PASS',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
