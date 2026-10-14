#!/usr/bin/env bash
# Manual parent publisher only. No signer secrets, paid artifact store or VPS work.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^(apk|tools)$ ]] || exit 2
[[ "$(uname -s)" == Linux && "${CI:-}" == true && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch ]]
[[ "${GITHUB_REPOSITORY:-}" == achkum/Applied-AI-Projects && "${GITHUB_REF:-}" == refs/heads/st/native-synthetic-bank ]]
[[ "${ST250_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ && "$ST250_SOURCE_HEAD" == "${GITHUB_SHA:-}" && "${ST250_FREE_DRAFT_CONFIRMED:-}" == true ]]
if [[ "$1" == tools ]];then [[ "${SUBTRACK_SANDBOX_RUNTIME_ENABLED:-false}" == false && -z "${SUBTRACK_SANDBOX_VERSION_CODE:-}" ]];fi
publish_token="${GITHUB_TOKEN:?}"
unset GITHUB_TOKEN GH_TOKEN
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
[[ "$(git -C "$root" rev-parse HEAD)" == "$ST250_SOURCE_HEAD" ]]
base="$(cd "${RUNNER_TEMP:?}" && pwd -P)"
private="$(mktemp -d "$base/st250-android-transfer.XXXXXXXX")"
chmod 700 "$private"
image=''
stage=PREPARE
cleanup() {
  [[ "$private" == "$base"/st250-android-transfer.* && -d "$private" && ! -L "$private" && "$(realpath -e "$private")" == "$private" ]] || return 1
  if [[ -e "$private/probe.cid" ]]; then
    [[ -f "$private/probe.cid" && ! -L "$private/probe.cid" ]] || return 1
    probe="$(cat "$private/probe.cid")"; [[ "$probe" =~ ^[a-f0-9]{64}$ ]] || return 1
    [[ "$(docker inspect --format '{{index .Config.Labels "se.subtrack.android.custody"}}' "$probe")" == "$private" ]] || return 1
    docker rm -f "$probe" > /dev/null 2>&1 || return 1
    ! docker inspect "$probe" > /dev/null 2>&1 || return 1
    rm -- "$private/probe.cid"
  fi
  if [[ -n "$image" ]]; then
    [[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
    [[ "$(docker image inspect --format '{{index .Config.Labels "se.subtrack.android.run"}}' "$image")" == "${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" ]] || return 1
    docker image rm "$image" > "$private/image-remove.log" 2>&1 || return 1
    ! docker image inspect "$image" > /dev/null 2>&1 || return 1
    image=''
  fi
  rm -rf -- "$private"
  [[ ! -e "$private" ]]
}
finish() {
  status=$?; trap - EXIT
  unset publish_token
  if ! cleanup; then status=1; fi
  if (( status != 0 )); then printf 'ST250_ANDROID_DELIVERY_FAILURE stage=%s\n' "$stage" >&2; fi
  exit "$status"
}
trap finish EXIT
export ST250_RETAIN_DIR="$private"
if [[ "$1" == apk ]]; then
  env -u GITHUB_TOKEN -u GH_TOKEN bash "$root/tools/sandbox/build-android.sh" retained-release
  payload="$private/subtrack-sandbox-unsigned-$ST250_SOURCE_HEAD.apk"
else
  stage=TOOLS_INPUT
  # Public source-qualified official Linux build-tools archive; all context is fresh.
  pins="$(node "$root/tools/sandbox/android-transfer-receipt.mjs" pins)"
  jdk="$(printf '%s' "$pins" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).jdk));')"
  sdk_sha="$(printf '%s' "$pins" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).sdkSha256));')"
  mkdir -m 700 "$private/context"
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 300 --max-filesize 63737259 --output "$private/sdk.zip" https://dl.google.com/android/repository/build-tools_r36_linux.zip
  [[ "$(stat -c '%s' "$private/sdk.zip")" == 63737259 && "$(sha256sum "$private/sdk.zip" | cut -d' ' -f1)" == "$sdk_sha" ]]
  # Official fixed archive is checksum-qualified before extracting executable bytes.
  unzip -q "$private/sdk.zip" -d "$private/context/sdk"
  mkdir -p "$private/context/android-build-tools"
  mv -- "$private/context/sdk/android-16" "$private/context/android-build-tools/36.0.0"
  rmdir "$private/context/sdk"
  cp -- "$root/infra/sandbox/Dockerfile.android-signing" "$private/context/Dockerfile"
  stage=TOOLS_BUILD
  timeout 600 docker build --platform linux/amd64 --build-arg "SANDBOX_JDK17_IMAGE=$jdk" --label "se.subtrack.android.source=$ST250_SOURCE_HEAD" --label "se.subtrack.android.run=${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" --iidfile "$private/image.id" "$private/context" > "$private/tools-build.log" 2>&1
  image="$(cat "$private/image.id")"
  [[ "$image" =~ ^sha256:[a-f0-9]{64}$ && "$(docker image inspect --format '{{.Config.User}}' "$image")" == 996:996 ]]
  # Qualified one-shot probe has no secrets/socket/network and verifies actual UID/tools.
  docker run --name "st250-android-tools-probe-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" --cidfile "$private/probe.cid" --label "se.subtrack.android.custody=$private" --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 0.5 --pids-limit 32 --tmpfs /tmp:rw,nosuid,nodev,size=16m --user 996:996 --env 'JAVA_TOOL_OPTIONS=-Xmx128m -XX:ActiveProcessorCount=1' --entrypoint /bin/sh "$image" -ec 'test "$(id -u):$(id -g)" = 996:996; java -version 2>&1 | grep -Eq "version \"17\."; keytool -help >/dev/null 2>&1; /opt/android/build-tools/36.0.0/apksigner version >/dev/null; test -x /opt/android/build-tools/36.0.0/zipalign; sha256sum /opt/android/build-tools/36.0.0/lib/apksigner.jar /opt/android/build-tools/36.0.0/zipalign' > "$private/tool-probe.log" 2>&1
  probe="$(cat "$private/probe.cid")"; [[ "$probe" =~ ^[a-f0-9]{64}$ ]]
  docker rm "$probe" > /dev/null
  ! docker inspect "$probe" > /dev/null 2>&1
  rm -- "$private/probe.cid"
  stage=TOOLS_ARCHIVE
  timeout 600 docker save --platform linux/amd64 "$image" 2> "$private/save.log" | head -c 2147483649 > "$private/tools.tar"
  [[ "$(stat -c '%s' "$private/tools.tar")" -le 2147483648 ]]
  payload="$private/subtrack-sandbox-signing-tools-$ST250_SOURCE_HEAD.tar.gz"
  timeout 600 gzip -c "$private/tools.tar" | head -c 1073741825 > "$payload"
  [[ "$(stat -c '%s' "$payload")" -le 1073741824 ]]
  # Construct measured tools tuple; publisher later supplies authenticated run/default head.
  node --input-type=module - "$root" "$private" "$image" "$jdk" "$sdk_sha" "$ST250_SOURCE_HEAD" <<'NODE'
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
const [root,dir,image,base,sdk,sourceHead]=process.argv.slice(2),runId=`${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const probe=fs.readFileSync(path.join(dir,'tool-probe.log'),'utf8').trim().split('\n');
const jar=probe.find(l=>l.endsWith('  /opt/android/build-tools/36.0.0/lib/apksigner.jar'))?.slice(0,64),zip=probe.find(l=>l.endsWith('  /opt/android/build-tools/36.0.0/zipalign'))?.slice(0,64);
const archive=path.join(dir,`subtrack-sandbox-signing-tools-${sourceHead}.tar.gz`),raw=path.join(dir,'tools.tar');
fs.writeFileSync(path.join(dir,'candidate.json'),JSON.stringify({schema:'st250-android-tools-manifest-v1',sourceHead,runId,defaultTargetHead:sourceHead,draftTag:`st250-android-tools-stage-${sourceHead}-${runId}`,imageId:image,baseImage:base,dockerfileSha256:sha(path.join(root,'infra/sandbox/Dockerfile.android-signing')),sdkArchiveSha256:sdk,apksignerJarSha256:jar,zipalignSha256:zip,archiveSha256:sha(archive),rawTarSha256:sha(raw),archiveBytes:fs.statSync(archive).size,rawTarBytes:fs.statSync(raw).size,runtimeUid:996,runtimeGid:996,buildToolsVersion:'36.0.0',toolsQualified:true}),{flag:'wx',mode:0o600});
NODE
  node "$root/tools/sandbox/android-transfer-receipt.mjs" inspect-tools-tar "$private/tools.tar" "$private/candidate.json"
  rm -- "$private/tools.tar" "$private/sdk.zip"
  rm -rf -- "$private/context"
  docker image rm "$image" > "$private/image-remove.log" 2>&1
  ! docker image inspect "$image" > /dev/null 2>&1
  image=''
fi
stage=UPLOAD
GITHUB_TOKEN="$publish_token" node "$root/tools/sandbox/android-transfer-receipt.mjs" publish "$1" "$payload" "$private/candidate.json" "$private/final.json"
unset publish_token
final="$(cat "$private/final.json")"
stage=CLEANUP
cleanup
trap - EXIT
printf '%s' "$final" | node "$root/tools/sandbox/android-transfer-receipt.mjs" close-transfer "$1"
