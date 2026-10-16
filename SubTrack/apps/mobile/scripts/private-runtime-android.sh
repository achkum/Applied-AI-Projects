#!/usr/bin/env bash
set -euo pipefail
umask 077
phase="${1:?sdk, avd, boot, owned-device, clear-app or cleanup}"
proof_private="${RUNNER_TEMP:?}/subtrack-native-proof/private"
mkdir -p "$proof_private"
chmod 700 "$proof_private"
sdk_bin="${ANDROID_HOME:?}/cmdline-tools/latest/bin"
adb_bin="$ANDROID_HOME/platform-tools/adb"
emulator_bin="${SUBTRACK_PRIVATE_EMULATOR_BIN:-$ANDROID_HOME/emulator/emulator}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$RUNNER_TEMP/subtrack-native-proof/avd"
export ANDROID_EMULATOR_HOME="$RUNNER_TEMP/subtrack-native-proof/emulator-home"
mkdir -p "$ANDROID_AVD_HOME" "$ANDROID_EMULATOR_HOME"
chmod 700 "$ANDROID_AVD_HOME" "$ANDROID_EMULATOR_HOME"
avd_data="$ANDROID_AVD_HOME/subtrack-proof.avd"
system_images="$ANDROID_HOME/system-images/android-34/google_apis/x86_64"
serial=emulator-5554
phase_start=$SECONDS
diagnostic() { printf 'ST244_ANDROID phase=%s event=%s elapsed_seconds=%s\n' "$phase" "$1" "$((SECONDS-phase_start))"; }
fail() {
  diagnostic "$1"
  if [[ "$phase" == boot && -f "$proof_private/emulator.log" ]]; then
    # Only fixed categories leave private logs; no arbitrary tool text or paths.
    if grep -Eiq 'Could not load the Qt platform plugin|no Qt platform plugin could be initialized' "$proof_private/emulator.log"; then diagnostic emulator-qt-plugin-failure;
    elif grep -Eiq 'KVM.*(not available|not installed|permission denied)|requires hardware acceleration' "$proof_private/emulator.log"; then diagnostic emulator-acceleration-unavailable;
    elif grep -Eiq 'Unknown AVD name' "$proof_private/emulator.log"; then diagnostic emulator-avd-name-unavailable;
    elif grep -Eiq 'Cannot find AVD system path' "$proof_private/emulator.log"; then diagnostic emulator-sdk-system-path-unavailable;
    elif grep -Eiq 'Not enough (disk space|space)|No space left on device' "$proof_private/emulator.log"; then diagnostic emulator-storage-unavailable;
    else diagnostic emulator-no-known-error-signature; fi
  fi
  exit 1
}
command -v timeout >/dev/null || fail timeout-tool-unavailable

process_start() {
  [[ -r "/proc/$1/stat" ]] || return 1
  local proc_stat proc_fields
  proc_stat="$(cat "/proc/$1/stat" 2>/dev/null)" || return 1
  read -ra proc_fields <<< "${proc_stat##*) }"
  ((${#proc_fields[@]} >= 20)) || return 1
  [[ "${proc_fields[0]}" != Z ]] || return 1
  printf '%s' "${proc_fields[19]}"
}
owned_emulator_alive() {
  [[ -f "$proof_private/emulator.pid" && -f "$proof_private/emulator.start" ]] || return 1
  emulator_pid="$(cat "$proof_private/emulator.pid")"
  [[ "$emulator_pid" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$emulator_pid" 2>/dev/null || return 1
  [[ "$(process_start "$emulator_pid")" == "$(cat "$proof_private/emulator.start")" ]]
}
stop_owned_emulator() {
  if owned_emulator_alive; then
    kill -TERM "$emulator_pid" 2>/dev/null || true
    for attempt in $(seq 1 20); do
      owned_emulator_alive || break
      sleep 1
    done
    if owned_emulator_alive; then kill -KILL "$emulator_pid"; fi
    diagnostic owned-emulator-stopped
  else diagnostic no-live-owned-emulator; fi
}

# Diagnostic custody is produced around successful creation/boot, never inferred from a flag.
android_custody() {
  [[ "${ST253_ANDROID_CAPTURE_ENABLED:-}" == true ]] || return 0
  local helper
  helper="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/private-runtime-maestro-metadata.mjs"
  NODE_ENV=development node --input-type=module - "$helper" "$1" "$proof_private" 2> "$proof_private/android-custody-$1.log" <<'NODE'
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const {androidCaptureContext,androidAvdStage}=await import(pathToFileURL(process.argv[2]).href);
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const context=androidCaptureContext(process.env,head);
let stage='CONTEXT';
try{if(!context)throw Error();androidAvdStage(process.argv[4],context,process.argv[3],process.env,value=>{stage=value;});}
catch{if(['CONTEXT','CREATION','AVD_HOME','AVD_RECEIPTS','AVD_INTENT','AVD_DATA','AVD_INDEX','AVD_CONFIG','AVD_SCHEMA','AVD_INTENT_BINDING','AVD_DATA_BINDING','AVD_INDEX_BINDING','AVD_CONFIG_BINDING','AVD_PATH','PROCESS','EXECUTABLE','ARGUMENTS','ADB','RECEIPT'].includes(stage))console.log(`ST244_ANDROID custody_check=${stage}`);process.exitCode=1;}
NODE
}
diagnostic started
# Cache hits are only a hint: validate each pinned package before reuse.
sdk_packages_ready() {
  [[ -f "$system_images/source.properties" && -f "$ANDROID_HOME/platforms/android-36/source.properties" && -f "$ANDROID_HOME/build-tools/36.0.0/source.properties" && -f "$ANDROID_HOME/ndk/27.1.12297006/source.properties" ]] || return 1
  grep -Eq '^AndroidVersion\.ApiLevel[[:space:]]*=[[:space:]]*34[[:space:]]*$' "$system_images/source.properties" || return 1
  grep -Eq '^AndroidVersion\.ApiLevel[[:space:]]*=[[:space:]]*36[[:space:]]*$' "$ANDROID_HOME/platforms/android-36/source.properties" || return 1
  grep -Eq '^Pkg\.Revision[[:space:]]*=[[:space:]]*36\.0\.0[[:space:]]*$' "$ANDROID_HOME/build-tools/36.0.0/source.properties" || return 1
  grep -Eq '^Pkg\.Revision[[:space:]]*=[[:space:]]*27\.1\.12297006[[:space:]]*$' "$ANDROID_HOME/ndk/27.1.12297006/source.properties" || return 1
  [[ -f "$system_images/system.img" && -f "$ANDROID_HOME/platforms/android-36/android.jar" && -x "$ANDROID_HOME/build-tools/36.0.0/aapt2" && -x "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/clang" ]]
}

case "$phase" in
  sdk)
    [[ -x "$sdk_bin/sdkmanager" ]] || fail sdkmanager-unavailable
    [[ -x "$sdk_bin/avdmanager" ]] || fail avdmanager-unavailable
    [[ -x "$adb_bin" ]] || fail adb-unavailable
    [[ -x "$emulator_bin" ]] || fail emulator-unavailable
    printf '%s\n' "$ANDROID_HOME/platform-tools" >> "${GITHUB_PATH:?}"
    printf 'ANDROID_SDK_ROOT=%s\nANDROID_AVD_HOME=%s\nANDROID_EMULATOR_HOME=%s\n' "$ANDROID_SDK_ROOT" "$ANDROID_AVD_HOME" "$ANDROID_EMULATOR_HOME" >> "${GITHUB_ENV:?}"
    if sdk_packages_ready; then
      diagnostic sdk-reused
    elif timeout --signal=TERM --kill-after=15s 600s "$sdk_bin/sdkmanager" \
      'system-images;android-34;google_apis;x86_64' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006' \
      </dev/null > "$proof_private/sdk-install.log" 2>&1; then
      [[ -f "$ANDROID_HOME/ndk/27.1.12297006/source.properties" ]] || fail sdk-ndk-revision-missing
      grep -Eq '^Pkg\.Revision[[:space:]]*=[[:space:]]*27\.1\.12297006[[:space:]]*$' "$ANDROID_HOME/ndk/27.1.12297006/source.properties" || fail sdk-ndk-revision-mismatch
      sdk_packages_ready || fail sdk-package-incomplete
      diagnostic sdk-installed
    else
      code=$?
      if [[ "$code" == 124 || "$code" == 137 ]]; then fail sdk-install-deadline; fi
      if grep -Eiq 'licenses?.*(not accepted|not been accepted)|license.*not.*accepted' "$proof_private/sdk-install.log"; then fail sdk-license-unaccepted; fi
      fail "sdk-install-exit-$code"
    fi
    ;;
  avd)
    [[ -x "$sdk_bin/avdmanager" ]] || fail avd-tool-unavailable
    [[ ! -e "$avd_data" && ! -L "$avd_data" && ! -e "$ANDROID_AVD_HOME/subtrack-proof.ini" && ! -L "$ANDROID_AVD_HOME/subtrack-proof.ini" ]] || fail avd-already-present
    android_custody begin || diagnostic avd-custody-unavailable
    if printf 'no\n' | timeout --signal=TERM --kill-after=10s 60s "$sdk_bin/avdmanager" \
      create avd --name subtrack-proof --path "$avd_data" --package 'system-images;android-34;google_apis;x86_64' --device pixel_6 \
      > "$proof_private/avd-create.log" 2>&1; then diagnostic avd-created;
    else fail avd-create-failed-or-deadline; fi
    [[ -f "$ANDROID_AVD_HOME/subtrack-proof.ini" && -f "$avd_data/config.ini" ]] || fail avd-index-or-config-missing
    grep -Fqx "path=$avd_data" "$ANDROID_AVD_HOME/subtrack-proof.ini" || fail avd-path-mismatch
    android_custody created || diagnostic avd-custody-unavailable
    ;;
  boot)
    [[ -x "$adb_bin" && -x "$emulator_bin" ]] || fail boot-tool-unavailable
    [[ -f "$ANDROID_AVD_HOME/subtrack-proof.ini" && -f "$avd_data/config.ini" ]] || fail boot-avd-config-missing
    [[ -f "$system_images/system.img" ]] || fail boot-sdk-system-image-missing
    if [[ -f "$proof_private/emulator.pid" ]]; then fail duplicate-emulator-launch; fi
    timeout --signal=TERM --kill-after=5s 15s "$adb_bin" start-server > "$proof_private/adb-start.log" 2>&1 || fail adb-start-failed-or-deadline
    "$emulator_bin" -avd subtrack-proof -sysdir "$system_images" -port 5554 -no-window -no-audio -no-boot-anim \
      -no-snapshot -gpu swiftshader_indirect > "$proof_private/emulator.log" 2>&1 &
    emulator_pid=$!
    printf '%s' "$emulator_pid" > "$proof_private/emulator.pid"
    process_start "$emulator_pid" > "$proof_private/emulator.start" || fail emulator-exited-at-launch
    boot_success=false
    trap 'if [[ "$boot_success" != true ]]; then stop_owned_emulator; fi' EXIT
    trap 'exit 130' INT TERM
    device_ready=false
    device_start=$SECONDS
    while ((SECONDS-device_start < 180)); do
      owned_emulator_alive || fail emulator-exited-before-adb
      if [[ "$(timeout --signal=TERM --kill-after=2s 5s "$adb_bin" -s "$serial" get-state 2>/dev/null || true)" == device ]]; then device_ready=true; break; fi
      diagnostic waiting-for-adb
      sleep 5
    done
    [[ "$device_ready" == true ]] || fail adb-device-deadline
    diagnostic adb-connected
    boot_start=$SECONDS
    while ((SECONDS-boot_start < 240)); do
      owned_emulator_alive || fail emulator-exited-before-boot
      completed="$(timeout --signal=TERM --kill-after=2s 5s "$adb_bin" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
      if [[ "$completed" == 1 ]]; then android_custody boot || fail boot-custody-unavailable; diagnostic boot-completed; boot_success=true; exit 0; fi
      diagnostic waiting-for-boot
      sleep 5
    done
    fail android-boot-deadline
    ;;
  owned-device|clear-app)
    [[ "${CI:-}" == true && "${SUBTRACK_PRIVATE_DEVICE_PROOF:-}" == true ]] || fail disposable-ci-required
    owned_emulator_alive || fail owned-emulator-required
    [[ "$(timeout --signal=TERM --kill-after=2s 5s "$adb_bin" -s "$serial" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r' || true)" == 1 ]] || fail owned-device-not-emulator
    if [[ "$phase" == clear-app ]]; then
      timeout --signal=TERM --kill-after=5s 15s "$adb_bin" -s "$serial" shell pm clear se.subtrack.app > "$proof_private/cold-app-clear.log" 2>&1 || fail app-clear-failed-or-deadline
      [[ "$(tr -d '\r\n' < "$proof_private/cold-app-clear.log")" == Success ]] || fail app-clear-success-required
      diagnostic cold-app-cleared
    else diagnostic owned-device-verified; fi
    ;;
  cleanup) stop_owned_emulator ;;
  *) fail invalid-phase ;;
esac
