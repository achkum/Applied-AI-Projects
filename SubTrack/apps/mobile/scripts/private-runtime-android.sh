#!/usr/bin/env bash
set -euo pipefail
phase="${1:?sdk, avd, boot or cleanup}"
proof_private="${RUNNER_TEMP:?}/subtrack-native-proof/private"
mkdir -p "$proof_private"
chmod 700 "$proof_private"
sdk_bin="${ANDROID_HOME:?}/cmdline-tools/latest/bin"
adb_bin="$ANDROID_HOME/platform-tools/adb"
emulator_bin="${SUBTRACK_PRIVATE_EMULATOR_BIN:-$ANDROID_HOME/emulator/emulator}"
serial=emulator-5554
phase_start=$SECONDS
diagnostic() { printf 'ST244_ANDROID phase=%s event=%s elapsed_seconds=%s\n' "$phase" "$1" "$((SECONDS-phase_start))"; }
fail() {
  diagnostic "$1"
  if [[ "$phase" == boot && -f "$proof_private/emulator.log" ]]; then
    # Only fixed categories leave private logs; no arbitrary tool text or paths.
    if grep -Eiq 'Could not load the Qt platform plugin|no Qt platform plugin could be initialized' "$proof_private/emulator.log"; then diagnostic emulator-qt-plugin-failure;
    elif grep -Eiq 'KVM.*(not available|not installed|permission denied)|requires hardware acceleration' "$proof_private/emulator.log"; then diagnostic emulator-acceleration-unavailable;
    elif grep -Eiq 'Unknown AVD name|Cannot find AVD system path' "$proof_private/emulator.log"; then diagnostic emulator-avd-unavailable;
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

diagnostic started
case "$phase" in
  sdk)
    [[ -x "$sdk_bin/sdkmanager" ]] || fail sdkmanager-unavailable
    [[ -x "$sdk_bin/avdmanager" ]] || fail avdmanager-unavailable
    [[ -x "$adb_bin" ]] || fail adb-unavailable
    [[ -x "$emulator_bin" ]] || fail emulator-unavailable
    printf '%s\n' "$ANDROID_HOME/platform-tools" >> "${GITHUB_PATH:?}"
    if timeout --signal=TERM --kill-after=15s 600s "$sdk_bin/sdkmanager" \
      'system-images;android-34;google_apis;x86_64' 'platforms;android-34' 'build-tools;34.0.0' \
      </dev/null > "$proof_private/sdk-install.log" 2>&1; then diagnostic sdk-installed;
    else
      code=$?
      if [[ "$code" == 124 || "$code" == 137 ]]; then fail sdk-install-deadline; fi
      if grep -Eiq 'licenses?.*(not accepted|not been accepted)|license.*not.*accepted' "$proof_private/sdk-install.log"; then fail sdk-license-unaccepted; fi
      fail "sdk-install-exit-$code"
    fi
    ;;
  avd)
    [[ -x "$sdk_bin/avdmanager" ]] || fail avd-tool-unavailable
    if printf 'no\n' | timeout --signal=TERM --kill-after=10s 60s "$sdk_bin/avdmanager" \
      create avd --name subtrack-proof --package 'system-images;android-34;google_apis;x86_64' --device pixel_6 \
      > "$proof_private/avd-create.log" 2>&1; then diagnostic avd-created;
    else fail avd-create-failed-or-deadline; fi
    ;;
  boot)
    [[ -x "$adb_bin" && -x "$emulator_bin" ]] || fail boot-tool-unavailable
    if [[ -f "$proof_private/emulator.pid" ]]; then fail duplicate-emulator-launch; fi
    timeout --signal=TERM --kill-after=5s 15s "$adb_bin" start-server > "$proof_private/adb-start.log" 2>&1 || fail adb-start-failed-or-deadline
    "$emulator_bin" -avd subtrack-proof -port 5554 -no-window -no-audio -no-boot-anim \
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
      if [[ "$completed" == 1 ]]; then diagnostic boot-completed; boot_success=true; exit 0; fi
      diagnostic waiting-for-boot
      sleep 5
    done
    fail android-boot-deadline
    ;;
  cleanup) stop_owned_emulator ;;
  *) fail invalid-phase ;;
esac
