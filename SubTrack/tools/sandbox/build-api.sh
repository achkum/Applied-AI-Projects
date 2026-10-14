#!/usr/bin/env bash
# Isolated packaging qualification only: no publication, provider or database.
set -euo pipefail
umask 077
stage=SETUP
owned=""
image_id=""
label=""
receipt=""
qualified=false
base='node:22.18.0-bookworm-slim@sha256:0d130e2ee18e88e1561375276daced6bff032539200173f2daf48c2e33f38ff5'

cleanup() {
  local status=$? clean=true cid path
  trap - EXIT INT TERM
  set +e
  if [[ -n "$owned" ]]; then
    for path in "$owned"/*.cid; do
      [[ -f "$path" ]] || continue
      cid=$(cat "$path")
      if [[ ! "$cid" =~ ^[a-f0-9]{64}$ ]] || ! docker container inspect "$cid" > "$owned/cleanup-inspect.json" 2>> "$owned/private.log"; then clean=false; continue; fi
      if ! node - "$owned/cleanup-inspect.json" "$label" "$cid" <<'NODE'
const fs=require('node:fs');const [path,label,id]=process.argv.slice(2);try{const v=JSON.parse(fs.readFileSync(path));if(v.length!==1||v[0].Id!==id||v[0].Config.Labels['org.subtrack.sandbox-build']!==label)process.exit(1);}catch{process.exit(1);}
NODE
      then clean=false; continue; fi
      docker rm --force "$cid" >> "$owned/private.log" 2>&1 || clean=false
      if ! docker container ls --all --no-trunc --format '{{.ID}}' > "$owned/remaining-containers" 2>> "$owned/private.log"; then clean=false
      elif grep -Fxq -- "$cid" "$owned/remaining-containers"; then clean=false; fi
    done
    if [[ -f "$owned/image.iid" ]]; then
      image_id=$(cat "$owned/image.iid")
      if [[ ! "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || ! docker image inspect "$image_id" > "$owned/cleanup-image.json" 2>> "$owned/private.log"; then clean=false
      elif node - "$owned/cleanup-image.json" "$label" "$image_id" <<'NODE'
const fs=require('node:fs');const [path,label,id]=process.argv.slice(2);try{const v=JSON.parse(fs.readFileSync(path));if(v.length!==1||v[0].Id!==id||v[0].Config.Labels['org.subtrack.sandbox-build']!==label)process.exit(1);}catch{process.exit(1);}
NODE
      then
        docker image rm "$image_id" >> "$owned/private.log" 2>&1 || clean=false
        if ! docker image ls --no-trunc --quiet > "$owned/remaining-images" 2>> "$owned/private.log"; then clean=false
        elif grep -Fxq -- "$image_id" "$owned/remaining-images"; then clean=false; fi
      else clean=false; fi
    fi
    if [[ "$status" -eq 0 && "$qualified" == true && "$clean" == true ]]; then
      node - "$owned/probe.json" "$receipt" "$SANDBOX_SOURCE_HEAD" "$base" "$image_id" "$dockerfile_hash" <<'NODE'
const fs=require('node:fs');const [probe,out,head,base,image,dockerfile]=process.argv.slice(2);try{const p=JSON.parse(fs.readFileSync(probe));const hex=/^[a-f0-9]{64}$/;if(Object.keys(p).sort().join(',')!=='businessSha256,compiledEntrypointSha256,foundationSha256,nodeVersion'||p.nodeVersion!=='v22.18.0'||!hex.test(p.businessSha256)||!hex.test(p.foundationSha256)||!hex.test(p.compiledEntrypointSha256)||!/^[a-f0-9]{40}$/.test(head)||!hex.test(dockerfile)||!/^sha256:[a-f0-9]{64}$/.test(image))process.exit(1);const v={schema:'st250-api-image-v1',sourceHead:head,baseImage:base,imageId:image,dockerfileSha256:dockerfile,...p,checks:{actualImageBuilt:true,nonrootConfigured:true,disabledPublication:true,readOnlyImports:true,defaultStartupFailClosed:true},cleanupConfirmed:true};fs.writeFileSync(out,JSON.stringify(v)+'\n',{flag:'wx',mode:0o600});}catch{process.exit(1);}
NODE
      [[ $? -eq 0 ]] || clean=false
    fi
    # owned is an exact mktemp-created directory under the validated runner root.
    rm -rf -- "$owned" || clean=false
    [[ ! -e "$owned" ]] || clean=false
  fi
  if [[ "$clean" != true || "$status" -ne 0 || "$qualified" != true ]]; then
    [[ -z "$receipt" || ! -f "$receipt" ]] || rm -- "$receipt"
    [[ "$clean" == true ]] || stage=CLEANUP
    printf 'Sandbox image preparation failed: %s\n' "$stage" >&2
    exit 1
  fi
  printf 'Sandbox image preparation qualified; no deployment performed.\n'
}
trap cleanup EXIT
trap 'exit 1' INT TERM

[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux && "${RUNNER_ARCH:-}" == X64 ]]
[[ "${SANDBOX_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ && "${SANDBOX_BUILD_RUN:-}" =~ ^[0-9]+-[0-9]+$ ]]
[[ -d "${RUNNER_TEMP:-}" && ! -L "$RUNNER_TEMP" && -d "${GITHUB_WORKSPACE:-}" ]]
runner_root=$(realpath -- "$RUNNER_TEMP")
[[ "${SANDBOX_BUILD_RECEIPT:-}" == "$runner_root/st250-api-image.json" && ! -e "$SANDBOX_BUILD_RECEIPT" && ! -L "$SANDBOX_BUILD_RECEIPT" ]]
receipt=$SANDBOX_BUILD_RECEIPT
cd -- "$GITHUB_WORKSPACE/SubTrack"
[[ "$(git rev-parse HEAD)" == "$SANDBOX_SOURCE_HEAD" && -f infra/sandbox/Dockerfile.api && -f apps/api/src/sandbox/main.ts ]]
command -v docker >/dev/null
command -v node >/dev/null
owned=$(mktemp -d "$runner_root/st250-image.XXXXXXXX")
label="st250-image-$SANDBOX_BUILD_RUN"
dockerfile_hash=$(sha256sum infra/sandbox/Dockerfile.api | cut -d' ' -f1)
stage=BUILD
# A private log cannot grow without bound; build never receives runtime secrets.
(ulimit -f 8192; timeout --kill-after=15s 1200s env DOCKER_BUILDKIT=1 docker build --platform linux/amd64 --file infra/sandbox/Dockerfile.api --build-arg "SANDBOX_NODE_IMAGE=$base" --label "org.subtrack.sandbox-build=$label" --iidfile "$owned/image.iid" . > "$owned/private.log" 2>&1)
image_id=$(cat "$owned/image.iid")
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]
stage=INSPECTION
docker image inspect "$image_id" > "$owned/image.json" 2>> "$owned/private.log"
node - "$owned/image.json" "$image_id" "$label" <<'NODE'
const fs=require('node:fs');const [path,id,label]=process.argv.slice(2);try{const a=JSON.parse(fs.readFileSync(path));if(a.length!==1)process.exit(1);const v=a[0],c=v.Config,e=new Set(c.Env);if(v.Id!==id||v.Os!=='linux'||v.Architecture!=='amd64'||c.User!=='1000:1000'||c.Labels['org.subtrack.sandbox-build']!==label||JSON.stringify(c.Cmd)!==JSON.stringify(['node','apps/api/dist/sandbox/main.js'])||!e.has('NODE_ENV=production')||!e.has('SUBTRACK_RUNTIME=sandbox')||!e.has('SANDBOX_STARTUP_ENABLED=false')||!e.has('SANDBOX_PUBLICATION_ENABLED=false'))process.exit(1);}catch{process.exit(1);}
NODE
limits=(--network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 384m --cpus 1 --label "org.subtrack.sandbox-build=$label")
probe=$(cat <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'),{createRequire}=require('node:module');const req=createRequire('/workspace/apps/api/dist/sandbox/main.js');if(process.getuid()!==1000||process.getgid()!==1000||process.version!=='v22.18.0')process.exit(1);try{fs.writeFileSync('/workspace/apps/api/dist/sandbox/main.js','',{flag:'a'});process.exit(1);}catch(e){if(e.code!=='EROFS')process.exit(1);}req('pg');const wire=req('@subtrack/contracts/sandbox-mobile');wire.parseSandboxBootstrap({transport:'sandbox-mobile',locale:'en'});req('/workspace/apps/api/dist/sandbox/main.js');const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');process.stdout.write(JSON.stringify({nodeVersion:process.version,compiledEntrypointSha256:hash('/workspace/apps/api/dist/sandbox/main.js'),foundationSha256:hash('/workspace/apps/api/prisma/sandbox/001-sandbox-foundation.sql'),businessSha256:hash('/workspace/apps/api/prisma/sandbox/002-sandbox-mobile-business.sql')}));
NODE
)
stage=RUNTIME
docker create "${limits[@]}" --cidfile "$owned/probe.cid" --entrypoint node "$image_id" -e "$probe" > /dev/null 2>> "$owned/private.log"
timeout --kill-after=5s 30s docker start --attach "$(cat "$owned/probe.cid")" > "$owned/probe.json" 2> "$owned/probe.stderr"
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$(cat "$owned/probe.cid")" 2>> "$owned/private.log")" == 0 ]]
[[ ! -s "$owned/probe.stderr" ]]
node - "$owned/probe.json" apps/api/prisma/sandbox/001-sandbox-foundation.sql apps/api/prisma/sandbox/002-sandbox-mobile-business.sql <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');try{const [p,a,b]=process.argv.slice(2),v=JSON.parse(fs.readFileSync(p));const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(v.foundationSha256!==hash(a)||v.businessSha256!==hash(b))process.exit(1);}catch{process.exit(1);}
NODE
docker create "${limits[@]}" --cidfile "$owned/default.cid" "$image_id" > /dev/null 2>> "$owned/private.log"
timeout --kill-after=5s 30s docker start --attach "$(cat "$owned/default.cid")" > "$owned/default.stdout" 2> "$owned/default.stderr" || true
[[ "$(docker inspect --format '{{.State.Running}}' "$(cat "$owned/default.cid")" 2>> "$owned/private.log")" == false ]]
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$(cat "$owned/default.cid")" 2>> "$owned/private.log")" == 1 && ! -s "$owned/default.stdout" ]]
node - "$owned/default.stderr" <<'NODE'
const fs=require('node:fs');if(fs.readFileSync(process.argv[2],'utf8')!=='Sandbox startup unavailable\n')process.exit(1);
NODE
qualified=true
