#!/usr/bin/env bash
set -euo pipefail
platform="${1:?android or ios}"
[[ "$platform" == android || "$platform" == ios ]]
[[ "${SUBTRACK_PRIVATE_DEVICE_PROOF:-}" == true ]]
[[ -f "${SUBTRACK_PRIVATE_CA_CERT:?}" ]]
[[ "${EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL:?}" == https://localhost:3443 ]]
proof_root="${RUNNER_TEMP:?}/subtrack-native-proof"
mkdir -p "$proof_root/private" "$proof_root/public"
chmod 700 "$proof_root/private"
build_phase=prebuild
set_build_phase() { build_phase="$1"; printf '{"phase":"%s","exitCode":0}\n' "$build_phase" > "$proof_root/private/build-phase.json"; }
trap 'build_exit=$?; printf "{\"phase\":\"%s\",\"exitCode\":%s}\n" "$build_phase" "$build_exit" > "$proof_root/private/build-phase.json"' EXIT
trap 'exit 130' INT TERM
set_build_phase prebuild
pnpm exec expo prebuild --platform "$platform" --no-install > "$proof_root/private/prebuild.log" 2>&1
if [[ "$platform" == android ]]; then
  # SDK51 template's pluginManagement bare lookup fails under existing isolated
  # pnpm. Match its already-scoped final includeBuild; no dependency/SDK change.
  node --input-type=module -e "import {readFileSync,writeFileSync} from 'node:fs'; import {scopeGradlePluginResolution} from './scripts/private-runtime-native-resolve.mjs'; const file='android/settings.gradle'; writeFileSync(file,scopeGradlePluginResolution(readFileSync(file,'utf8')));"
  set_build_phase android-compile
  # C9 JetifyTransform exhausted the template's 2GiB heap. Bound concurrency
  # while allocating 4GiB for this hosted debug compile; transforms/ABIs intact.
  (cd android && ./gradlew :app:assembleDebug --no-daemon --stacktrace --max-workers=2 \
    '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m') > "$proof_root/private/build.log" 2>&1
  set_build_phase android-install
  bash scripts/private-runtime-android.sh owned-device > "$proof_root/private/owned-device.log" 2>&1
  adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk > "$proof_root/private/install.log" 2>&1
  # Fresh disposable app state is established BEFORE restoring debug Metro prefs.
  bash scripts/private-runtime-android.sh clear-app > "$proof_root/private/cold-start.log" 2>&1
  set_build_phase android-loopback
  adb -s emulator-5554 reverse tcp:3443 tcp:3443
  adb -s emulator-5554 reverse tcp:8081 tcp:8081
  # Force the debug packager through adb reverse, never emulator host alias/public LAN.
  adb -s emulator-5554 shell run-as se.subtrack.app mkdir -p shared_prefs
  printf '%s' '<map><string name="debug_http_host">localhost:8081</string></map>' | \
    adb -s emulator-5554 shell "run-as se.subtrack.app sh -c 'cat > shared_prefs/se.subtrack.app_preferences.xml'"
else
  # Expo SDK51 officially maps to Xcode15.4. Never upgrade silently.
  set_build_phase ios-toolchain
  [[ -d /Applications/Xcode_15.4.app ]]
  [[ "$(xcodebuild -version | head -1)" == 'Xcode 15.4' ]]
  set_build_phase ios-pods
  (cd ios && pod install --verbose) > "$proof_root/private/pods.log" 2>&1
  set_build_phase ios-compile
  xcodebuild -workspace ios/SubTrack.xcworkspace -scheme SubTrack -configuration Debug \
    -sdk iphonesimulator -destination "id=${SUBTRACK_SIMULATOR_UDID:?}" \
    -derivedDataPath "$proof_root/private/derived" CODE_SIGNING_ALLOWED=NO \
    build > "$proof_root/private/build.log" 2>&1
  set_build_phase ios-install
  xcrun simctl install "$SUBTRACK_SIMULATOR_UDID" "$proof_root/private/derived/Build/Products/Debug-iphonesimulator/SubTrack.app"
  set_build_phase ios-ca-trust
  xcrun simctl keychain "$SUBTRACK_SIMULATOR_UDID" add-root-cert "$SUBTRACK_PRIVATE_CA_CERT"
fi
# Loopback Metro serves only this debug build. No tunnel or cloud bundling.
set_build_phase metro
NODE_OPTIONS="${NODE_OPTIONS:-} --import=$PWD/scripts/private-runtime-loopback.mjs" \
  pnpm exec expo start --localhost --port 8081 > "$proof_root/private/metro.log" 2>&1 &
printf '%s' "$!" > "$proof_root/private/metro.pid"
for attempt in $(seq 1 90); do
  if curl --fail --silent http://localhost:8081/status | grep -q packager-status:running; then exit 0; fi
  sleep 2
done
exit 1
