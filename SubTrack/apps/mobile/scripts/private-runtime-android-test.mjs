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
  };
  function sdkPhase() {
    return spawnSync(bash, [normalized(script), 'sdk'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    });
  }
  executable(
    sdkmanager,
    '[[ "$#" == 3 && "$1" == "system-images;android-34;google_apis;x86_64" && "$2" == "platforms;android-34" && "$3" == "build-tools;34.0.0" ]] || exit 40\nif read -r unexpected; then exit 41; fi\nprintf private-tool-canary\nexit 0',
  );
  const positive = sdkPhase();
  assert.equal(positive.status, 0);
  assert.match(positive.stdout, /event=sdk-installed/);
  assert.equal(positive.stdout.includes('private-tool-canary'), false);
  assert.match(
    readFileSync(
      join(runner, 'subtrack-native-proof/private/sdk-install.log'),
      'utf8',
    ),
    /private-tool-canary/,
  );
  executable(sdkmanager, 'printf private-failure-canary >&2\nexit 23');
  const failed = sdkPhase();
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /event=sdk-install-exit-23/);
  assert.equal(failed.stdout.includes('private-failure-canary'), false);
  executable(sdkmanager, 'printf "License not accepted" >&2\nexit 1');
  const license = sdkPhase();
  assert.equal(license.status, 1);
  assert.match(license.stdout, /event=sdk-license-unaccepted/);
  console.log(
    'Android SDK phase: checked tool paths, exact packages, closed stdin, child failure and sanitized diagnostics PASS',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
