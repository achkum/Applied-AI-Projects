#!/usr/bin/env bash
# Direct OS conductor only. Keys stay in a dedicated UID996 sandbox namespace.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^(validate|import-tools|preflight|initialize|restore-probe|backup-accept|sign)$ ]] || exit 2
mode="$1"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
if [[ "$mode" == validate ]]; then
  node --check "$root/tools/sandbox/android-release-receipt.mjs"
  node --check "$root/tools/sandbox/android-transfer-receipt.mjs"
  printf 'ST250_ANDROID_SIGNER_SOURCE_VALID keys=not-accessed\n'; exit 0
fi
[[ "$(uname -s)" == Linux && "$(id -u):$(id -g)" == 996:987 && "$root" == /home/openclaw/subtrack-sandbox ]]
command -v node >/dev/null
[[ "${SSH_CONNECTION:-}" =~ [[:space:]]198\.44\.116\.159[[:space:]][0-9]+$ ]]
[[ "${ST250_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ && "${ST250_SIGNING_TOOLING_HEAD:-}" =~ ^[a-f0-9]{40}$ && "${ST250_ANDROID_TOOLS_RUN:-}" =~ ^[1-9][0-9]*-[1-9][0-9]*$ && "${ST250_ANDROID_APK_RUN:-}" =~ ^[1-9][0-9]*-[1-9][0-9]*$ ]]
for current in /home /home/openclaw "$root" "$root/staging"; do
  [[ -d "$current" && ! -L "$current" && "$(realpath -e "$current")" == "$current" ]]
done
for pair in "sign-android.sh:${ST250_SIGN_SOURCE_SHA256:?}" "android-release-receipt.mjs:${ST250_RECEIPT_SOURCE_SHA256:?}" "android-transfer-receipt.mjs:${ST250_TRANSFER_SOURCE_SHA256:?}" "image-import-binding.cjs:${ST250_IMPORT_SOURCE_SHA256:?}"; do
  file="${pair%%:*}"; expected="${pair#*:}"
  [[ "$expected" =~ ^[a-f0-9]{64}$ && -f "$root/tools/sandbox/$file" && ! -L "$root/tools/sandbox/$file" ]]
  [[ "$(sha256sum "$root/tools/sandbox/$file" | cut -d' ' -f1)" == "$expected" ]]
done
tools="$root/staging/android-tools/$ST250_ANDROID_TOOLS_RUN"
apkdir="$root/staging/android/$ST250_ANDROID_APK_RUN"
for dir in "$tools" "$apkdir"; do
  [[ -d "$dir" && ! -L "$dir" && "$(realpath -e "$dir")" == "$dir" && "$(stat -c '%a:%u:%g' "$dir")" == 700:996:987 ]]
done
image="${SANDBOX_ANDROID_SIGNING_IMAGE:?}"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$(awk '/MemAvailable:/{print $2}' /proc/meminfo)" -ge 1310720 ]]
node --input-type=module - "$root/tools/sandbox/android-transfer-receipt.mjs" "$tools" "$apkdir" "$image" "$ST250_SOURCE_HEAD" <<'NODE'
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const [module,tools,apk,image,head]=process.argv.slice(2),m=await import(pathToFileURL(module));
for(const [dir,kind]of[[tools,'tools'],[apk,'apk']]){const mb=m.readRegular(path.join(dir,'manifest.json'),16384),v=m.canonical(mb,x=>m.validateManifest(x,kind)),r=m.canonical(m.readRegular(path.join(dir,'receipt.json'),16384),x=>m.validateTransfer(x,kind));if(v.sourceHead!==head||v.runId!==path.basename(dir)||(kind==='tools'&&v.imageId!==image))throw Error('custody');if(kind==='tools')await m.toolsCustody(dir);else m.bind(v,r,m.readRegular(path.join(dir,'unsigned.apk'),200*1024*1024),mb,kind);}
NODE
keydir="$root/android-signing"
private="$(mktemp -d "$root/staging/st250-android-sign.XXXXXXXX")"; chmod 700 "$private"
key_lock=false
loaded_image=''
keep_import=false
import_lock=false
stage=PREFLIGHT
cleanup() {
  [[ "$private" == "$root"/staging/st250-android-sign.* && -d "$private" && ! -L "$private" && "$(realpath -e "$private")" == "$private" ]] || return 1
  if [[ "$import_lock" == true && "$keep_import" != true && -z "$loaded_image" && -f "$private/load.log" ]]; then
    candidate="$(node -e 'try{const fs=require("fs");if(fs.statSync(process.argv[2]).size>16384)throw 0;process.stdout.write(require(process.argv[1]).loadIdentity(fs.readFileSync(process.argv[2],"utf8")))}catch{}' "$root/tools/sandbox/image-import-binding.cjs" "$private/load.log")"
    if [[ "$candidate" =~ ^sha256:[a-f0-9]{64}$ ]] && ! grep -Fxq "$candidate" "$private/images-before.txt"; then loaded_image="$candidate"; fi
  fi
  for cidfile in "$private"/*.cid; do
    [[ -e "$cidfile" ]] || continue
    [[ -f "$cidfile" && ! -L "$cidfile" ]] || return 1
    cid="$(cat "$cidfile")"; [[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
    [[ "$(docker inspect --format '{{index .Config.Labels "se.subtrack.android.custody"}}' "$cid")" == "$private" ]] || return 1
    docker rm -f "$cid" > /dev/null 2>&1 || return 1
    ! docker inspect "$cid" > /dev/null 2>&1 || return 1
  done
  if [[ -n "$loaded_image" && "$keep_import" != true ]]; then
    [[ "$(docker image inspect --format '{{index .Config.Labels "se.subtrack.android.source"}}' "$loaded_image")" == "$ST250_SOURCE_HEAD" && "$(docker image inspect --format '{{index .Config.Labels "se.subtrack.android.run"}}' "$loaded_image")" == "$ST250_ANDROID_TOOLS_RUN" ]] || return 1
    docker image rm "$loaded_image" > /dev/null 2>&1 || return 1
    docker image ls --no-trunc --quiet > "$private/images-after.txt" || return 1
    ! grep -Fxq "$loaded_image" "$private/images-after.txt" || return 1
    loaded_image=''
  fi
  if [[ "$key_lock" == true ]]; then
    [[ -d "$keydir/.operation.lock" && ! -L "$keydir/.operation.lock" && "$(stat -c '%a:%u:%g' "$keydir/.operation.lock")" == 700:996:987 ]] || return 1
    rmdir "$keydir/.operation.lock" || return 1
    [[ ! -e "$keydir/.operation.lock" ]] || return 1
    key_lock=false
  fi
  if [[ "$import_lock" == true ]]; then
    [[ -d "$tools/.import.lock" && ! -L "$tools/.import.lock" && "$(stat -c '%a:%u:%g' "$tools/.import.lock")" == 700:996:987 ]] || return 1
    rmdir "$tools/.import.lock" || return 1
    [[ ! -e "$tools/.import.lock" ]] || return 1
    import_lock=false
  fi
  rm -rf -- "$private"; [[ ! -e "$private" ]]
}
finish() { status=$?; trap - EXIT INT TERM; cleanup || status=1; if (( status != 0 )); then printf 'ST250_ANDROID_SIGNING_FAILURE stage=%s\n' "$stage" >&2; fi; exit "$status"; }
trap finish EXIT
trap 'exit 1' INT TERM
if [[ "$mode" == import-tools ]]; then
  stage=IMPORT
  ! docker image inspect "$image" > /dev/null 2>&1
  raw_bytes="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1])).rawTarBytes))' "$tools/manifest.json")"
  [[ "$raw_bytes" =~ ^[1-9][0-9]*$ && "$raw_bytes" -le 2147483648 ]]
  [[ "$(df -Pk "$root/staging" | awk 'NR==2{print $4}')" -ge $(((raw_bytes + 1023) / 1024 + 262144)) ]]
  [[ ! -e "$tools/import-binding.json" && ! -L "$tools/import-binding.json" ]]
  mkdir -m 700 "$tools/.import.lock"; import_lock=true
  node "$root/tools/sandbox/android-transfer-receipt.mjs" tools-stage-archive "$tools" "$private/tools.tar"
  docker image ls --no-trunc --quiet > "$private/images-before.txt"
  timeout 300 docker load --input "$private/tools.tar" > "$private/load.log" 2>&1
  image="$(node -e 'try{const fs=require("fs");if(fs.statSync(process.argv[2]).size>16384)throw 0;process.stdout.write(require(process.argv[1]).loadIdentity(fs.readFileSync(process.argv[2],"utf8")))}catch{process.exitCode=1}' "$root/tools/sandbox/image-import-binding.cjs" "$private/load.log")"
  [[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] && ! grep -Fxq "$image" "$private/images-before.txt"
  loaded_image="$image"
  docker image inspect "$image" --format '{{json .}}' > "$private/import-inspect.json"
  node "$root/tools/sandbox/android-transfer-receipt.mjs" tools-import-bind "$tools" "$private/tools.tar" "$private/load.log" "$private/import-inspect.json" "$ST250_SIGNING_TOOLING_HEAD" "$tools/import-binding.json"
  [[ "$(stat -c '%a:%u:%g' "$tools/import-binding.json")" == 600:996:987 ]]
  keep_import=true
  cleanup; trap - EXIT; printf 'ST250_ANDROID_TOOLS_IMPORTED\n'; exit 0
fi
[[ -f "$tools/import-binding.json" && ! -L "$tools/import-binding.json" && "$(stat -c '%a:%u:%g' "$tools/import-binding.json")" == 600:996:987 ]]
image="$(node "$root/tools/sandbox/android-transfer-receipt.mjs" tools-import-id "$tools" "$ST250_SIGNING_TOOLING_HEAD" "$tools/import-binding.json")"
docker image inspect "$image" --format '{{json .}}' > "$private/import-inspect.json"
[[ "$(node "$root/tools/sandbox/android-transfer-receipt.mjs" tools-import-reference "$tools" "$ST250_SIGNING_TOOLING_HEAD" "$private/import-inspect.json" "$tools/import-binding.json")" == "$image" ]]
command_container() {
  local label="$1"; shift
  timeout 120 docker run --cidfile "$private/$label.cid" --label "se.subtrack.android.custody=$private" --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 0.5 --pids-limit 32 --tmpfs /tmp:rw,nosuid,nodev,size=16m --user 996:996 --env 'JAVA_TOOL_OPTIONS=-Xmx128m -XX:ActiveProcessorCount=1' "$@"
}
[[ "$(docker image inspect --format '{{json .Config.Entrypoint}}' "$image")" == '["/opt/android/build-tools/36.0.0/apksigner"]' ]]
command_container tools-probe --entrypoint /bin/sh "$image" -ec 'test "$(id -u):$(id -g)" = 996:996; java -version 2>&1 | grep -Eq "version \"17\."; keytool -help >/dev/null 2>&1; /opt/android/build-tools/36.0.0/apksigner version >/dev/null; test -x /opt/android/build-tools/36.0.0/zipalign; sha256sum /opt/android/build-tools/36.0.0/lib/apksigner.jar /opt/android/build-tools/36.0.0/zipalign' > "$private/tools-probe.log" 2>&1
node --input-type=module - "$tools/manifest.json" "$private/tools-probe.log" <<'NODE'
import fs from 'node:fs';const[m,p]=process.argv.slice(2),v=JSON.parse(fs.readFileSync(m)),lines=fs.readFileSync(p,'utf8').split('\n');
for(const[key,name]of[['apksignerJarSha256','lib/apksigner.jar'],['zipalignSha256','zipalign']])if(!lines.includes(`${v[key]}  /opt/android/build-tools/36.0.0/${name}`))throw Error('tools bytes');
NODE
check_keydir() {
  [[ -d "$keydir" && ! -L "$keydir" && "$(realpath -e "$keydir")" == "$keydir" && "$(stat -c '%a:%u:%g' "$keydir")" == 700:996:987 ]]
  for file in sandbox-signing.p12 password identity.json; do
    [[ -f "$keydir/$file" && ! -L "$keydir/$file" && "$(stat -c '%a:%u:%g' "$keydir/$file")" == 600:996:987 && "$(stat -c '%s' "$keydir/$file")" -le 65536 ]]
  done
  node "$root/tools/sandbox/android-transfer-receipt.mjs" validate-identity "$keydir/identity.json"
}
if [[ "$mode" == preflight ]]; then
  if [[ -e "$keydir" || -L "$keydir" ]]; then check_keydir; fi
  cleanup; trap - EXIT; printf 'ST250_ANDROID_SIGNING_PREFLIGHT_PASS\n'; exit 0
fi
if [[ "$mode" == initialize ]]; then
  stage=INITIALIZE
  [[ ! -e "$keydir" && ! -L "$keydir" ]]; mkdir -m 700 "$keydir"
  command_container initialize --mount "type=bind,src=$keydir,dst=/key" --entrypoint /bin/sh "$image" -ec 'umask 077; test ! -e /key/password; test ! -e /key/sandbox-signing.p12; (set -C; od -An -N32 -tx1 /dev/urandom | tr -d " \n" > /key/password); test "$(wc -c < /key/password)" = 64; printf "\n" >> /key/password; keytool -genkeypair -alias subtrack-sandbox -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname "CN=SubTrack Sandbox,O=Sandbox,C=SE" -storetype PKCS12 -keystore /key/sandbox-signing.p12 -storepass:file /key/password -keypass:file /key/password; keytool -exportcert -alias subtrack-sandbox -keystore /key/sandbox-signing.p12 -storepass:file /key/password -file /key/certificate.der' > "$private/initialize.log" 2>&1
  # Fresh container-created key files retain UID996; use the measured host group
  # for persistent custody without changing the container's UID996:GID996.
  for file in sandbox-signing.p12 password; do
    [[ -f "$keydir/$file" && ! -L "$keydir/$file" && "$(stat -c '%a:%u:%g' "$keydir/$file")" == 600:996:996 ]]
    chgrp -- 987 "$keydir/$file"
    [[ "$(stat -c '%a:%u:%g' "$keydir/$file")" == 600:996:987 ]]
  done
  cert="$(sha256sum "$keydir/certificate.der" | cut -d' ' -f1)"; [[ "$cert" =~ ^[a-f0-9]{64}$ ]]
  node --input-type=module - "$keydir/identity.json" "$cert" "$image" "$ST250_SOURCE_HEAD" <<'NODE'
import fs from 'node:fs';const[file,cert,image,head]=process.argv.slice(2);fs.writeFileSync(file,JSON.stringify({schema:'st250-android-signer-identity-v1',signerCertificateSha256:cert,imageId:image,sourceHead:head,alias:'subtrack-sandbox',storeType:'PKCS12',keyAlgorithm:'RSA3072',generation:1}),{flag:'wx',mode:0o600});
NODE
  rm -- "$keydir/certificate.der"; check_keydir
  cleanup; trap - EXIT; printf 'ST250_ANDROID_SIGNER_INITIALIZED certificate=%s backup=pending\n' "$cert"; exit 0
fi
check_keydir
mkdir -m 700 "$keydir/.operation.lock"; key_lock=true
cert="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).signerCertificateSha256)' "$keydir/identity.json")"; [[ "$cert" =~ ^[a-f0-9]{64}$ ]]
run_sign() {
  local inputkeys="$1"
  mkdir -m 700 "$private/out"
  command_container sign --mount "type=bind,src=$inputkeys/sandbox-signing.p12,dst=/key/sandbox-signing.p12,readonly" --mount "type=bind,src=$inputkeys/password,dst=/key/password,readonly" --mount "type=bind,src=$apkdir/unsigned.apk,dst=/in/unsigned.apk,readonly" --mount "type=bind,src=$private/out,dst=/out" --entrypoint /bin/sh "$image" -ec 'keytool -J-Duser.language=en -J-Duser.country=US -list -keystore /key/sandbox-signing.p12 -storepass:file /key/password | grep -Eq "Your keystore contains 1 entry"; /opt/android/build-tools/36.0.0/zipalign -c -P 16 4 /in/unsigned.apk; test ! -e /out/signed.apk; /opt/android/build-tools/36.0.0/apksigner sign --ks /key/sandbox-signing.p12 --ks-type PKCS12 --ks-key-alias subtrack-sandbox --ks-pass file:/key/password --v4-signing-enabled false --out /out/signed.apk /in/unsigned.apk; /opt/android/build-tools/36.0.0/zipalign -c -P 16 4 /out/signed.apk; /opt/android/build-tools/36.0.0/apksigner verify --verbose --print-certs /out/signed.apk; keytool -exportcert -alias subtrack-sandbox -keystore /key/sandbox-signing.p12 -storepass:file /key/password -file /out/certificate.der' > "$private/signature.log" 2>&1
  [[ "$(sha256sum "$private/out/certificate.der" | cut -d' ' -f1)" == "$cert" ]]
  [[ "$(grep -Ec '^Number of signers: 1$' "$private/signature.log")" == 1 && "$(grep -Ec '^Signer #1 certificate SHA-256 digest: ' "$private/signature.log")" == 1 ]]
  printed="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$private/signature.log" | tr '[:upper:]' '[:lower:]')"
  [[ "$printed" == "$cert" && "$(grep -Ec '^Signer #[2-9]' "$private/signature.log")" == 0 && ! -e "$private/out/signed.apk.idsig" ]]
}
if [[ "$mode" == restore-probe ]]; then
  stage=RESTORE
  [[ "${ST250_RESTORE_ID:-}" =~ ^[a-f0-9]{32}$ ]]
  recovered="$root/staging/android-restore/$ST250_RESTORE_ID"
  [[ -d "$recovered" && ! -L "$recovered" && "$(realpath -e "$recovered")" == "$recovered" && "$(stat -c '%a:%u:%g' "$recovered")" == 700:996:987 ]]
  for file in sandbox-signing.p12 password; do [[ -f "$recovered/$file" && ! -L "$recovered/$file" && "$(stat -c '%a:%u:%g' "$recovered/$file")" == 600:996:987 ]]; done
  run_sign "$recovered"
  rm -- "$recovered/sandbox-signing.p12" "$recovered/password"; rmdir "$recovered"; [[ ! -e "$recovered" ]]
  restore_hash="$(sha256sum "$private/out/signed.apk" | cut -d' ' -f1)"
  cleanup; trap - EXIT
  (set -C; printf '%s:%s\n' "$cert" "$restore_hash" > "$keydir/restore-$ST250_RESTORE_ID.done")
  chmod 600 "$keydir/restore-$ST250_RESTORE_ID.done"
  printf 'ST250_ANDROID_RESTORE_PROBE_PASS certificate=%s\n' "$cert"; exit 0
fi
if [[ "$mode" == backup-accept ]]; then
  stage=BACKUP_ACCEPT
  [[ "${ST250_RESTORE_ID:-}" =~ ^[a-f0-9]{32}$ && "${ST250_BACKUP_CIPHERTEXT_SHA256:-}" =~ ^[a-f0-9]{64}$ && "${ST250_BACKUP_CIPHERTEXT_BYTES:-}" =~ ^[1-9][0-9]*$ && "$ST250_BACKUP_CIPHERTEXT_BYTES" -le 131072 ]]
  marker="$keydir/restore-$ST250_RESTORE_ID.done"; [[ -f "$marker" && ! -L "$marker" && "$(stat -c '%a:%u:%g' "$marker")" == 600:996:987 ]]
  [[ "$(cut -d: -f1 "$marker")" == "$cert" && ! -e "$keydir/backup-binding.json" ]]
  node --input-type=module - "$keydir/backup-binding.json" "$cert" "$ST250_BACKUP_CIPHERTEXT_SHA256" "$ST250_BACKUP_CIPHERTEXT_BYTES" <<'NODE'
import fs from 'node:fs';const[file,cert,hash,bytes]=process.argv.slice(2);fs.writeFileSync(file,JSON.stringify({schema:'st250-android-signer-backup-v1',signerCertificateSha256:cert,ciphertextSha256:hash,ciphertextBytes:Number(bytes),protection:'windows-dpapi-current-user',backupGeneration:1,decryptVerified:true,signingRestoreVerified:true,temporaryCustodyRemoved:true,backupConfirmed:true}),{flag:'wx',mode:0o600});
NODE
  rm -- "$marker"; cleanup; trap - EXIT; printf 'ST250_ANDROID_BACKUP_ACCEPTED certificate=%s\n' "$cert"; exit 0
fi
stage=SIGN
[[ "${ST250_BACKUP_CIPHERTEXT_SHA256:-}" =~ ^[a-f0-9]{64}$ && -f "$keydir/backup-binding.json" && ! -L "$keydir/backup-binding.json" && "$(stat -c '%a:%u:%g' "$keydir/backup-binding.json")" == 600:996:987 ]]
node --input-type=module - "$root/tools/sandbox/android-transfer-receipt.mjs" "$keydir/backup-binding.json" "$cert" "$ST250_BACKUP_CIPHERTEXT_SHA256" <<'NODE'
import fs from 'node:fs';import{pathToFileURL}from'node:url';const[module,file,cert,hash]=process.argv.slice(2),m=await import(pathToFileURL(module)),v=m.canonical(fs.readFileSync(file),m.validateBackupBinding);if(v.signerCertificateSha256!==cert||v.ciphertextSha256!==hash)throw Error('backup binding');
NODE
history="$keydir/signed-history.json"
if [[ -e "$history" || -L "$history" ]]; then [[ -f "$history" && ! -L "$history" && "$(stat -c '%a:%u:%g' "$history")" == 600:996:987 ]]; fi
node --input-type=module - "$root/tools/sandbox/android-transfer-receipt.mjs" "$apkdir/manifest.json" "$cert" "$history" <<'NODE'
import fs from'node:fs';import{pathToFileURL}from'node:url';const[module,file,cert,history]=process.argv.slice(2),m=await import(pathToFileURL(module));m.assertSignedUpdate(m.canonical(fs.readFileSync(file),v=>m.validateManifest(v,'apk')),cert,fs.existsSync(history)?JSON.parse(fs.readFileSync(history)):null);
NODE
run_sign "$keydir"
destination="$root/staging/android-signed/$ST250_ANDROID_APK_RUN"; [[ ! -e "$destination" && ! -L "$destination" ]]
mkdir -p -m 700 "$root/staging/android-signed"; [[ ! -L "$root/staging/android-signed" ]]; mkdir -m 700 "$destination"
cp --no-clobber "$private/out/signed.apk" "$destination/signed.apk"; chmod 600 "$destination/signed.apk"
[[ "$(sha256sum "$destination/signed.apk" | cut -d' ' -f1)" == "$(sha256sum "$private/out/signed.apk" | cut -d' ' -f1)" ]]
node --input-type=module - "$destination/pending.json" "$ST250_SOURCE_HEAD" "$cert" "$destination/signed.apk" "$apkdir/unsigned.apk" "$apkdir/manifest.json" "$root/tools/sandbox/android-transfer-receipt.mjs" <<'NODE'
import fs from 'node:fs';import crypto from 'node:crypto';import{pathToFileURL}from'node:url';const[file,head,cert,signed,unsigned,manifest,module]=process.argv.slice(2),wire=await import(pathToFileURL(module)),m=wire.canonical(fs.readFileSync(manifest),v=>wire.validateManifest(v,'apk')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),active=m.runtimeEnabled===true,p={schema:active?'st250-android-signed-pending-v2':'st250-android-signed-pending-v1',sourceHead:head,signerCertificateSha256:cert,unsignedSha256:sha(unsigned),signedSha256:sha(signed),bytes:fs.statSync(signed).size,runtimeEnabled:active,...(active?{embeddedConfigSha256:m.embeddedConfigSha256,hermesSha256:m.hermesSha256}:{})};wire.validateSignedPending(p,m,cert,fs.readFileSync(signed),fs.readFileSync(unsigned));fs.writeFileSync(file,JSON.stringify(p),{flag:'wx',mode:0o600});
NODE
next_history="$keydir/.signed-history-$ST250_ANDROID_APK_RUN.next"
node --input-type=module - "$next_history" "$cert" "$apkdir/manifest.json" "$destination/pending.json" "$ST250_ANDROID_APK_RUN" <<'NODE'
import fs from'node:fs';const[file,cert,manifest,pending,run]=process.argv.slice(2),m=JSON.parse(fs.readFileSync(manifest)),p=JSON.parse(fs.readFileSync(pending));fs.writeFileSync(file,JSON.stringify({schema:m.runtimeEnabled===true?'st250-android-signed-history-v2':'st250-android-signed-history-v1',signerCertificateSha256:cert,versionCode:m.versionCode,sourceHead:m.sourceHead,unsignedSha256:m.unsignedSha256,signedSha256:p.signedSha256,apkRun:run,runtimeEnabled:m.runtimeEnabled,...(m.runtimeEnabled?{embeddedConfigSha256:m.embeddedConfigSha256,hermesSha256:m.hermesSha256}:{})}),{flag:'wx',mode:0o600});
NODE
mv -- "$next_history" "$history"
cleanup; trap - EXIT
printf 'ST250_ANDROID_SIGNED_RETURN_READY manifest=unverified runtime=measured cleanup=receiver-pending\n'
