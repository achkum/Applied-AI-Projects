#!/usr/bin/env bash
# Real unsigned Release preparation only; no signer/private CA/artifact publication.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^(prepare|unsigned-release)$ ]] || exit 2
[[ "$(uname -s)" == Linux && "${CI:-}" == true ]]
[[ "${SUBTRACK_APP_VARIANT:-}" == sandbox && "${SUBTRACK_SANDBOX_HTTPS_ORIGIN:-}" == https://198.44.116.159 ]]
for name in SUBTRACK_PRIVATE_DEVICE_PROOF SUBTRACK_PRIVATE_CA_CERT SUBTRACK_PRIVATE_FIXTURE_CONFIG EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL; do
  if printenv "$name" >/dev/null 2>&1; then printf 'Private proof environment rejected\n' >&2; exit 1; fi
done
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
app="$root/apps/mobile"
cd "$app"
[[ "$(java -version 2>&1 | head -1)" =~ \"17\. ]]
node scripts/private-runtime-preflight.mjs
node scripts/sandbox-app-config-test.mjs
node node_modules/expo/bin/cli install --check
if [[ "$1" == prepare ]]; then printf 'ST250_ANDROID_PREPARATION_PASS signing=unavailable runtime=disabled\n'; exit 0; fi
[[ ! -e android && "${ST250_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ ]]
[[ "$(git -C "$root" rev-parse HEAD)" == "$ST250_SOURCE_HEAD" ]]
base="$(cd "${RUNNER_TEMP:?}" && pwd -P)"
private="$(mktemp -d "$base/st250-android.XXXXXXXX")"
[[ "$private" == "$base"/st250-android.* && ! -L "$private" ]]
chmod 700 "$private"
cleanup() {
  [[ "$private" == "$base"/st250-android.* && ! -L "$private" ]] || return 1
  if [[ -e "$app/android" || -L "$app/android" ]]; then
    [[ -d "$app/android" && ! -L "$app/android" && "$(realpath -e "$app/android")" == "$app/android" ]] || return 1
    rm -rf -- "$app/android"
    [[ ! -e "$app/android" ]] || return 1
  fi
  rm -rf -- "$private"
  [[ ! -e "$private" ]]
}
stage=PREBUILD
failure_cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then printf 'ST250_ANDROID_FAILURE stage=%s\n' "$stage" >&2; fi
  cleanup >/dev/null 2>&1 || true
  exit "$status"
}
trap failure_cleanup EXIT
node node_modules/expo/bin/cli prebuild --platform android --no-install > "$private/prebuild.log" 2>&1
stage=TEMPLATE
node "$root/tools/sandbox/android-release-receipt.mjs" template android/app/build.gradle
[[ "$(grep -c '^newArchEnabled=false$' android/gradle.properties)" == 1 ]]
stage=TOOLS
tools="${ANDROID_HOME:?}/build-tools/36.0.0"
[[ -x "$tools/apksigner" && -x "$tools/zipalign" ]]
[[ -x "$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer" ]]
stage=GRADLE
if (cd android && ./gradlew :app:assembleRelease --no-daemon --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m') > "$private/build.log" 2>&1; then :
else
  node "$root/tools/sandbox/android-release-receipt.mjs" build-diagnostic "$private/build.log" >&2 || true
  exit 1
fi
stage=APK
apk=android/app/build/outputs/apk/release/app-release-unsigned.apk
[[ -f "$apk" && ! -L "$apk" ]]
stage=ALIGN
"$tools/zipalign" -P 16 -f 4 "$apk" "$private/aligned.apk" > "$private/alignment.log" 2>&1
"$tools/zipalign" -c -P 16 4 "$private/aligned.apk" >> "$private/alignment.log" 2>&1
stage=MANIFEST
"$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer" manifest print "$private/aligned.apk" > "$private/manifest.xml" 2> "$private/manifest.log"
stage=BUNDLE
unzip -p "$private/aligned.apk" assets/index.android.bundle > "$private/bundle.hbc"
stage=SIGNATURE
if unzip -Z1 "$private/aligned.apk" | grep -Eq '^META-INF/.*\.(RSA|DSA|EC|SF)$|private.runtime|network_security_config'; then exit 1; fi
signature_exit=0
"$tools/apksigner" verify --verbose "$private/aligned.apk" > "$private/signature.log" 2>&1 || signature_exit=$?
stage=RECEIPT
node "$root/tools/sandbox/android-release-receipt.mjs" inspect "$private/manifest.xml" "$private/bundle.hbc" "$private/aligned.apk" "$private/signature.log" "$signature_exit" "$ST250_SOURCE_HEAD" > "$private/pending.json"
# APK transfer/upload is deliberately disabled pending artifact zero-spend/custody review.
pending="$(cat "$private/pending.json")"
stage=CLEANUP
cleanup
trap - EXIT
# Validate fixed scalar receipt from stdin after actual owned cleanup, without retaining APK.
printf '%s' "$pending" | node --input-type=module -e 'import{pathToFileURL}from "node:url";const{validateReceipt}=await import(pathToFileURL(process.argv[2]).href);let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(validateReceipt({...JSON.parse(s),cleanup:"REMOVED"})));' st250-receipt-import "$root/tools/sandbox/android-release-receipt.mjs"
