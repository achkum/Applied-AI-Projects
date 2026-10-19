#!/usr/bin/env bash
# Sandbox-only unsigned build preparation. No signing, upload, account or public activation.
set -euo pipefail
umask 077
[[ $# == 1 ]] || { printf 'Usage: build-ios.sh prepare|unsigned-archive\n' >&2; exit 2; }
case "$1" in prepare|unsigned-archive) ;; *) printf 'Signing/upload/publication unavailable in this source phase\n' >&2; exit 2;; esac
[[ "$(uname -s)" == Darwin ]]
[[ "${CI:-}" == true ]]
[[ "${SUBTRACK_APP_VARIANT:-}" == sandbox ]]
[[ "${SUBTRACK_SANDBOX_HTTPS_ORIGIN:-}" == https://198.44.116.159 ]]
for name in SUBTRACK_PRIVATE_DEVICE_PROOF SUBTRACK_PRIVATE_CA_CERT SUBTRACK_PRIVATE_FIXTURE_CONFIG EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL; do
  if printenv "$name" >/dev/null 2>&1; then printf 'Private proof environment rejected\n' >&2; exit 1; fi
done
export DEVELOPER_DIR=/Applications/Xcode_26.2.app/Contents/Developer
[[ -d "$DEVELOPER_DIR" && "$(xcodebuild -version | head -1)" == 'Xcode 26.2' ]]
[[ "$(xcrun --sdk iphoneos --show-sdk-version)" =~ ^26\.2(\.[0-9]+)?$ ]]
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
app="$root/apps/mobile"
cd "$app"
source_head="$(git rev-parse HEAD)"
[[ "$source_head" =~ ^[a-f0-9]{40}$ ]]
node scripts/private-runtime-preflight.mjs
node scripts/sandbox-app-config-test.mjs
node --test scripts/sandbox-ios-build-intent-test.mjs
node node_modules/expo/bin/cli install --check
# Read the actual public Expo configuration, rather than assuming a disabled caller.
ios_intent="$(node scripts/sandbox-ios-build-intent.mjs)"
[[ "$ios_intent" =~ ^(enabled|disabled)\ ([1-9][0-9]*)$ ]]
runtime_intent="${BASH_REMATCH[1]}"; build_number="${BASH_REMATCH[2]}"
if [[ "$1" == prepare ]]; then printf 'ST250_IOS_TOOLCHAIN_PREPARATION_PASS Xcode=26.2 signing=unavailable runtime_intent=%s runtime_qualification=not-performed build_number=%s installable_ipa=false\n' "$runtime_intent" "$build_number"; exit 0; fi
base="$(cd "${RUNNER_TEMP:?}" && pwd -P)"
build_root="$(mktemp -d "$base/st250-ios.XXXXXXXX")"
[[ "$build_root" == "$base"/st250-ios.* && ! -L "$build_root" ]]
chmod 700 "$build_root"
# Refuse to overwrite any native checkout; prebuild is a fresh disposable runner action.
[[ ! -e ios ]]
node node_modules/expo/bin/cli prebuild --platform ios --no-install > "$build_root/prebuild-private.log" 2>&1
[[ -d ios ]]
export RCT_NEW_ARCH_ENABLED=0
(cd ios && pod install) > "$build_root/pods-private.log" 2>&1
[[ -d ios/SubTrackSandbox.xcworkspace ]]
xcodebuild -workspace ios/SubTrackSandbox.xcworkspace -scheme SubTrackSandbox -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -jobs 2 \
  -derivedDataPath "$build_root/derived" -archivePath "$build_root/SubTrackSandbox.xcarchive" \
  CODE_SIGNING_ALLOWED=NO archive > "$build_root/build-private.log" 2>&1
bundle="$build_root/SubTrackSandbox.xcarchive/Products/Applications/SubTrackSandbox.app"
[[ -d "$bundle" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$bundle/Info.plist")" == se.subtrack.app.sandbox ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$bundle/Info.plist")" == "$build_number" ]]
[[ "$(git rev-parse HEAD)" == "$source_head" ]]
node scripts/sandbox-ios-archive-payload.mjs "$bundle" "$runtime_intent" "$build_number" "$source_head" > "$build_root/payload-receipt.json"
[[ -s "$build_root/payload-receipt.json" && ! -L "$build_root/payload-receipt.json" ]]
printf 'ST250_IOS_UNSIGNED_ARCHIVE_PASS Xcode=26.2 signing=unavailable upload=not-performed runtime_intent=%s runtime_qualification=not-performed build_number=%s installable_ipa=false\n' "$runtime_intent" "$build_number"
