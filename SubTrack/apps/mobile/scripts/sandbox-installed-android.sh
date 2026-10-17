#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true && "${GITHUB_REPOSITORY:-}" == achkum/Applied-AI-Projects && "${GITHUB_REF:-}" == refs/heads/st/native-synthetic-bank ]]
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
cd "$root"
case "${1:-}" in
 setup)
  private="${RUNNER_TEMP:?}/subtrack-native-proof/private"
  mkdir -p "$private";chmod 700 "$private"
  [[ -x "${ANDROID_HOME:?}/cmdline-tools/latest/bin/sdkmanager" && -x "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" && -x "$ANDROID_HOME/platform-tools/adb" ]]
  if ! ldconfig -p | grep -q 'libpulse.so.0';then
   sudo timeout --signal=TERM --kill-after=15s 180s apt-get update -qq > "$private/pulse-install.log" 2>&1
   sudo timeout --signal=TERM --kill-after=15s 120s apt-get install -y --no-install-recommends libpulse0 >> "$private/pulse-install.log" 2>&1
  fi
  # Installation/inspection only: no platform compilation, NDK, Gradle, Metro or application dependency install.
  timeout --signal=TERM --kill-after=15s 600s "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" 'system-images;android-34;google_apis;x86_64' 'build-tools;36.0.0' </dev/null > "$private/sdk-installed-apk.log" 2>&1
  grep -Eq '^AndroidVersion\.ApiLevel[[:space:]]*=[[:space:]]*34[[:space:]]*$' "$ANDROID_HOME/system-images/android-34/google_apis/x86_64/source.properties"
  grep -Eq '^Pkg\.Revision[[:space:]]*=[[:space:]]*36\.0\.0[[:space:]]*$' "$ANDROID_HOME/build-tools/36.0.0/source.properties"
  [[ -f "$ANDROID_HOME/system-images/android-34/google_apis/x86_64/system.img" && -x "$ANDROID_HOME/build-tools/36.0.0/apksigner" ]]
  printf '%s\n' "$ANDROID_HOME/platform-tools" >> "${GITHUB_PATH:?}"
  printf 'ANDROID_SDK_ROOT=%s\nANDROID_AVD_HOME=%s/subtrack-native-proof/avd\nANDROID_EMULATOR_HOME=%s/subtrack-native-proof/emulator-home\n' "$ANDROID_HOME" "$RUNNER_TEMP" "$RUNNER_TEMP" >> "${GITHUB_ENV:?}"
  bash apps/mobile/scripts/private-runtime-tools.sh
  bash apps/mobile/scripts/private-runtime-emulator.sh
  ;;
 boot)
  bash apps/mobile/scripts/private-runtime-android.sh avd
  sudo setfacl -m "u:$(id -un):rw" /dev/kvm
  bash apps/mobile/scripts/private-runtime-android.sh boot
  ;;
 cleanup)
  bash apps/mobile/scripts/private-runtime-android.sh cleanup
  node apps/mobile/scripts/sandbox-installed-android.mjs cleanup
  # Original emulator logs/AVD belong exclusively to this fresh hosted run.
  target="${RUNNER_TEMP:?}/subtrack-native-proof"
  if [[ -e "$target" ]];then [[ ! -L "$target" && "$(realpath -e "$target")" == "$(realpath -e "$RUNNER_TEMP")/subtrack-native-proof" ]];rm -rf -- "$target";fi
  # Maestro's default diagnostics are also private; never upload their contents.
  if [[ -d "$HOME/.maestro/tests" && ! -L "$HOME/.maestro/tests" ]];then
   [[ "$(realpath -e "$HOME/.maestro/tests")" == "$(realpath -e "$HOME")/.maestro/tests" ]];rm -rf -- "$HOME/.maestro/tests"
  fi
  ;;
 *) exit 1;;
esac
