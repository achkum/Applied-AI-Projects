#!/usr/bin/env bash
# Real unsigned Release preparation only; no signer/private CA/artifact publication.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^(prepare|unsigned-release|retained-release|verify-signed)$ ]] || exit 2
[[ "$(uname -s)" == Linux && "${CI:-}" == true ]]
[[ "${SUBTRACK_APP_VARIANT:-}" == sandbox && "${SUBTRACK_SANDBOX_HTTPS_ORIGIN:-}" == https://198.44.116.159 ]]
for name in SUBTRACK_PRIVATE_DEVICE_PROOF SUBTRACK_PRIVATE_CA_CERT SUBTRACK_PRIVATE_FIXTURE_CONFIG EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL; do
  if printenv "$name" >/dev/null 2>&1; then printf 'Private proof environment rejected\n' >&2; exit 1; fi
done
active="${SUBTRACK_SANDBOX_RUNTIME_ENABLED:-false}"
case "$active" in
 false) [[ -z "${SUBTRACK_SANDBOX_VERSION_CODE:-}" ]]; unset SUBTRACK_SANDBOX_VERSION_CODE;;
 true) [[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/st/native-synthetic-bank && "${GITHUB_REPOSITORY:-}" == achkum/Applied-AI-Projects && "${ST250_DELIVERY_MODE:-}" =~ ^(unsigned-apk|verify-signed)$ ]]; [[ "${SUBTRACK_SANDBOX_VERSION_CODE:-}" =~ ^[1-9][0-9]{0,9}$ ]]; (( SUBTRACK_SANDBOX_VERSION_CODE <= 2147483647 ));;
 *) exit 2;;
esac
export SUBTRACK_SANDBOX_RUNTIME_ENABLED="$active"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
app="$root/apps/mobile"
cd "$app"
[[ "$(java -version 2>&1 | head -1)" =~ \"17\. ]]
if [[ "$1" == verify-signed ]]; then
  [[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/st/native-synthetic-bank && "${GITHUB_REPOSITORY:-}" == achkum/Applied-AI-Projects ]]
  [[ "${ST250_VERIFICATION_TOOLING_HEAD:-}" =~ ^[a-f0-9]{40}$ && "$ST250_VERIFICATION_TOOLING_HEAD" == "${GITHUB_SHA:-}" && "$(git -C "$root" rev-parse HEAD)" == "$ST250_VERIFICATION_TOOLING_HEAD" ]]
  [[ "${ST250_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ && "$(git -C "$root" rev-parse --verify "$ST250_SOURCE_HEAD^{commit}")" == "$ST250_SOURCE_HEAD" ]]
  [[ "${ST250_SIGNED_RETURN_RELEASE_ID:-}" =~ ^[1-9][0-9]*$ && "${ST250_SIGNER_CERTIFICATE_SHA256:-}" =~ ^[a-f0-9]{64}$ ]]
  base="$(cd "${RUNNER_TEMP:?}" && pwd -P)"; private="$(mktemp -d "$base/st250-android-return.XXXXXXXX")"; chmod 700 "$private"
  return_cleanup() {
    [[ "$private" == "$base"/st250-android-return.* && -d "$private" && ! -L "$private" && "$(realpath -e "$private")" == "$private" ]] || return 1
    rm -rf -- "$private"; [[ ! -e "$private" ]]
  }
  return_finish() { status=$?; trap - EXIT; return_cleanup || status=1; if (( status != 0 )); then printf 'ST250_ANDROID_SIGNED_RETURN_FAILURE\n' >&2; fi; exit "$status"; }
  trap return_finish EXIT
  (set -C; printf '%s' "${ST250_UNSIGNED_TRANSFER_RECEIPT:?}" > "$private/input-receipt.json")
  # Bind historical build inputs before the unchanged authenticated signed receiver.
  node --input-type=module - "$root" "$private/input-receipt.json" <<'NODE'
import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=process.argv[2];
const {canonical,validateTransfer,validateManifest,digest}=await import(pathToFileURL(`${root}/tools/sandbox/android-transfer-receipt.mjs`).href);
// ST250_SIGNED_SOURCE_BINDING_BEGIN
function verificationAuthority(env,git,receiptBytes){
 const fail=()=>{throw Error('ST250_ANDROID_VERIFICATION_AUTHORITY_UNAVAILABLE');};
 const source=env.ST250_SOURCE_HEAD,tooling=env.ST250_VERIFICATION_TOOLING_HEAD;
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REPOSITORY!=='achkum/Applied-AI-Projects'||env.GITHUB_REF!=='refs/heads/st/native-synthetic-bank'||env.ST250_DELIVERY_MODE!=='verify-signed'||!/^[a-f0-9]{40}$/.test(source??'')||!/^[a-f0-9]{40}$/.test(tooling??'')||tooling!==env.GITHUB_SHA||git(['rev-parse','HEAD']).toString('utf8').trim()!==tooling||git(['rev-parse','--verify',`${source}^{commit}`]).toString('utf8').trim()!==source)fail();
 const receipt=canonical(receiptBytes,v=>validateTransfer(v,'apk'));if(receipt.sourceHead!==source)fail();
 const hashes={buildScriptSha256:digest(git(['show',`${source}:SubTrack/tools/sandbox/build-android.sh`])),receiptModuleSha256:digest(git(['show',`${source}:SubTrack/tools/sandbox/android-release-receipt.mjs`]))};
 return {receipt,hashes};
}
function verificationManifest(env,authority,bytes){
 const fail=()=>{throw Error('ST250_ANDROID_VERIFICATION_AUTHORITY_UNAVAILABLE');};
 const {receipt,hashes}=authority,manifest=canonical(bytes,v=>validateManifest(v,'apk'));
 if(digest(bytes)!==receipt.manifestSha256||bytes.length!==receipt.manifestBytes||manifest.schema!==receipt.manifestSchema)fail();
 for(const key of ['sourceHead','runId','defaultTargetHead','draftTag','unsignedSha256','bytes','applicationId'])if(manifest[key]!==receipt[key])fail();
 for(const key of ['buildScriptSha256','receiptModuleSha256'])if(manifest[key]!==hashes[key])fail();
 if(!['true','false'].includes(env.SUBTRACK_SANDBOX_RUNTIME_ENABLED)||manifest.runtimeEnabled!==(env.SUBTRACK_SANDBOX_RUNTIME_ENABLED==='true')||(manifest.runtimeEnabled?String(manifest.versionCode)!==env.SUBTRACK_SANDBOX_VERSION_CODE:!!env.SUBTRACK_SANDBOX_VERSION_CODE))fail();
 return manifest;
}
// ST250_SIGNED_SOURCE_BINDING_END
try {
 const git=args=>{const result=spawnSync('git',['-C',root,...args],{encoding:null,timeout:10000,maxBuffer:1048576});if(result.status!==0)throw Error('unavailable');return result.stdout;};
 const authority=verificationAuthority(process.env,git,readFileSync(process.argv[3]));
 // Only bounded manifest metadata is prefetched; unsigned/signed APK custody stays with receive-signed.
 const result=spawnSync('gh',['api',`repos/achkum/Applied-AI-Projects/releases/assets/${authority.receipt.manifestAssetId}`,'--header','Accept: application/octet-stream'],{encoding:null,timeout:60000,maxBuffer:16384,env:{...process.env,GH_TOKEN:process.env.GITHUB_TOKEN}});
 if(result.status!==0)throw Error('unavailable');verificationManifest(process.env,authority,result.stdout);
}catch{process.stderr.write('ST250_ANDROID_VERIFICATION_AUTHORITY_UNAVAILABLE\n');process.exitCode=1;}
NODE
  node "$root/tools/sandbox/android-transfer-receipt.mjs" receive-signed "$private/input-receipt.json" "$ST250_SIGNED_RETURN_RELEASE_ID" "$ST250_SIGNER_CERTIFICATE_SHA256" "$private"
  tools="${ANDROID_HOME:?}/build-tools/36.0.0"
  [[ -x "$tools/apksigner" && -x "$tools/zipalign" && -x "$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer" ]]
  "$tools/apksigner" verify --verbose --print-certs "$private/signed.apk" > "$private/signature.log" 2>&1
  "$tools/zipalign" -c -P 16 4 "$private/signed.apk" > "$private/alignment.log" 2>&1
  "$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer" manifest print "$private/signed.apk" > "$private/manifest.xml" 2> "$private/manifest.log"
  unzip -p "$private/signed.apk" assets/index.android.bundle > "$private/signed.hbc"
  unzip -p "$private/unsigned.apk" assets/index.android.bundle > "$private/unsigned.hbc"
  unzip -Z1 "$private/signed.apk" > "$private/members.txt"
  [[ "$(stat -c '%s' "$private/members.txt")" -le 1048576 ]]
  if grep -Eq 'private.runtime|network_security_config' "$private/members.txt"; then exit 1; fi
  node "$root/tools/sandbox/android-release-receipt.mjs" inspect-signed "$private/manifest.xml" "$private/signed.hbc" "$private/unsigned.hbc" "$private/unsigned.apk" "$private/signed.apk" "$private/signature.log" 0 0 "$ST250_SIGNER_CERTIFICATE_SHA256" "$private/manifest.json" > "$private/pending.json"
  pending="$(cat "$private/pending.json")"
  return_cleanup; trap - EXIT
  printf '%s' "$pending" | node --input-type=module -e 'import{pathToFileURL}from "node:url";const{validateReceipt}=await import(pathToFileURL(process.argv[2]).href);let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(validateReceipt({...JSON.parse(s),cleanup:"REMOVED"},true)));' st250-signed-receipt-import "$root/tools/sandbox/android-release-receipt.mjs"
  exit 0
fi
# Embedded Expo app.config is authoritative only without update/dev-launcher overrides.
node - <<'NODE'
for(const name of ['expo-updates','expo-dev-launcher']){let found=false;try{require.resolve(name);found=true;}catch(error){if(error.code!=='MODULE_NOT_FOUND')process.exit(1);}if(found)process.exit(1);}
NODE
node scripts/private-runtime-preflight.mjs
node scripts/sandbox-app-config-test.mjs
node node_modules/expo/bin/cli install --check
if [[ "$1" == prepare ]]; then printf 'ST250_ANDROID_PREPARATION_PASS signing=unavailable runtime=disabled\n'; exit 0; fi
[[ ! -e android && "${ST250_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ ]]
[[ "$(git -C "$root" rev-parse HEAD)" == "$ST250_SOURCE_HEAD" ]]
base="$(cd "${RUNNER_TEMP:?}" && pwd -P)"
if [[ "$1" == retained-release ]]; then
  retained="${ST250_RETAIN_DIR:?}"
  [[ "$retained" == "$base"/st250-android-transfer.* && -d "$retained" && ! -L "$retained" && "$(realpath -e "$retained")" == "$retained" ]]
  [[ "$(stat -c '%a:%u' "$retained")" == "700:$(id -u)" && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/st/native-synthetic-bank ]]
  [[ "${GITHUB_REPOSITORY:-}" == achkum/Applied-AI-Projects && "${GITHUB_SHA:-}" == "$ST250_SOURCE_HEAD" && -z "${GITHUB_TOKEN:-}" && -z "${GH_TOKEN:-}" ]]
  [[ ! -e "$retained/subtrack-sandbox-unsigned-$ST250_SOURCE_HEAD.apk" && ! -e "$retained/candidate.json" ]]
fi
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
unzip -Z1 "$private/aligned.apk" > "$private/members.txt"
[[ "$(stat -c '%s' "$private/members.txt")" -le 1048576 ]]
if grep -Eq '^META-INF/.*\.(RSA|DSA|EC|SF)$|private.runtime|network_security_config' "$private/members.txt"; then exit 1; fi
signature_exit=0
"$tools/apksigner" verify --verbose "$private/aligned.apk" > "$private/signature.log" 2>&1 || signature_exit=$?
stage=RECEIPT
node "$root/tools/sandbox/android-release-receipt.mjs" inspect "$private/manifest.xml" "$private/bundle.hbc" "$private/aligned.apk" "$private/signature.log" "$signature_exit" "$ST250_SOURCE_HEAD" > "$private/pending.json"
# APK transfer/upload is deliberately disabled pending artifact zero-spend/custody review.
pending="$(cat "$private/pending.json")"
if [[ "$1" == retained-release ]]; then
  cp --no-clobber -- "$private/aligned.apk" "$retained/subtrack-sandbox-unsigned-$ST250_SOURCE_HEAD.apk"
  chmod 600 "$retained/subtrack-sandbox-unsigned-$ST250_SOURCE_HEAD.apk"
  [[ "$(sha256sum "$private/aligned.apk" | cut -d' ' -f1)" == "$(sha256sum "$retained/subtrack-sandbox-unsigned-$ST250_SOURCE_HEAD.apk" | cut -d' ' -f1)" ]]
  (set -o noclobber; printf '%s' "$pending" > "$retained/candidate.json")
  cleanup
  trap - EXIT
  printf 'ST250_ANDROID_PARENT_RETENTION_PASS runtime=%s cleanup=parent-pending\n' "$active"
  exit 0
fi
stage=CLEANUP
cleanup
trap - EXIT
# Validate fixed scalar receipt from stdin after actual owned cleanup, without retaining APK.
printf '%s' "$pending" | node --input-type=module -e 'import{pathToFileURL}from "node:url";const{validateReceipt}=await import(pathToFileURL(process.argv[2]).href);let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(validateReceipt({...JSON.parse(s),cleanup:"REMOVED"})));' st250-receipt-import "$root/tools/sandbox/android-release-receipt.mjs"
