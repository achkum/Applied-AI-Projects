#!/usr/bin/env bash
# Exact owned namespace only; no import, SSH, account, image build or destructive recovery.
set -euo pipefail
umask 077
[[ $# == 1 && "$1" =~ ^(validate|preflight|initialize|bootstrap|upgrade|activate|resume)$ ]] || exit 2
mode="$1";root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
namespace=/home/openclaw/subtrack-sandbox;runtime="$namespace/runtime"
compose=(docker compose --project-name subtrack-sandbox --file "$root/infra/sandbox/compose.yaml")
configure_android_download() {
  [[ "${ST250_ANDROID_DOWNLOAD_PUBLICATION:-false}" =~ ^(true|false)$ ]] || return 1
  if [[ "${ST250_ANDROID_DOWNLOAD_PUBLICATION:-false}" == true ]]; then
    local fields
    fields="$(node "$root/tools/sandbox/image-import-binding.cjs" android-env "$root" "$namespace/staging/$ST250_TRANSFER_RUN")" || return 1
    mapfile -t android_fields <<< "$fields"
    [[ ${#android_fields[@]} == 2 && "${android_fields[0]}" =~ ^[1-9][0-9]*$ && "${android_fields[1]}" =~ ^[a-f0-9]{64}$ ]] || return 1
    export SANDBOX_ANDROID_VERSION_CODE="${android_fields[0]}" SANDBOX_ANDROID_SIGNED_SHA256="${android_fields[1]}"
    compose+=(--file "$root/infra/sandbox/compose.android-download.yaml")
  fi
}

stage=VERIFY;started=false
# BEGIN STATIC CONTRACT
initializer_limits() {
  initialization=(--network none --read-only --user 0:0 --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --security-opt no-new-privileges --memory 256m --cpus 0.5 --pids-limit 32 --tmpfs /tmp:size=8m)
}
empty_runtime() {
  [[ ! -e "$runtime" && ! -L "$runtime" && ! -e "$namespace/secrets" && ! -L "$namespace/secrets" ]]
}
# END STATIC CONTRACT
owned_container() {
  local cid="$1"
  [[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
  local namespace_label source_label image service reference expected
  namespace_label="$(docker inspect --format '{{index .Config.Labels "org.subtrack.sandbox.namespace"}}' "$cid")" || return 1
  [[ "$namespace_label" == st250-runtime-v1 ]] || return 1
  source_label="$(docker inspect --format '{{index .Config.Labels "org.subtrack.sandbox.source"}}' "$cid")" || return 1
  [[ "$source_label" == "$ST250_SOURCE_HEAD" ]] || return 1
  image="$(docker inspect --format '{{.Image}}' "$cid")" || return 1
  service="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$cid")" || return 1
  case "$service" in
   api-live|bootstrap) service=api;reference="$SANDBOX_API_IMAGE";;
   database) reference="$SANDBOX_POSTGRES_IMAGE";;
   gateway-live|gateway-prepared) service=gateway;reference="$SANDBOX_CADDY_IMAGE";;
   '<no value>'|'') service="$(docker inspect --format '{{index .Config.Labels "org.subtrack.sandbox.service"}}' "$cid")" || return 1;[[ "$service" == api ]] || return 1;reference="$SANDBOX_API_IMAGE";;
   *) return 1;;
  esac
  expected="$(ST250_IDENTITY_SERVICE="$service" node "$root/tools/sandbox/image-import-binding.cjs" container-id "$root" "$namespace/staging/$ST250_TRANSFER_RUN")" || return 1
  [[ "$expected" =~ ^sha256:[a-f0-9]{64}$ && "$image" == "$expected" && "$(docker inspect --format '{{.Config.Image}}' "$cid")" == "$reference" ]] || return 1
}
owned_upgrade_database() {
 local cid="$1" old_head old_image old_reference
 [[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
 old_head="$(cat "$runtime/source-head")"
 old_image="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(v.services.database.containerImageId)' "$runtime/image-import-binding.json")"
 old_reference="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(v.services.database.requestedImage)' "$runtime/image-import-binding.json")"
 [[ "$(docker inspect --format '{{index .Config.Labels "org.subtrack.sandbox.namespace"}}' "$cid")" == st250-runtime-v1 ]]
 [[ "$(docker inspect --format '{{index .Config.Labels "org.subtrack.sandbox.source"}}' "$cid")" == "$old_head" ]]
 [[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$cid")" == database ]]
 [[ "$(docker inspect --format '{{.Image}}' "$cid")" == "$old_image" && "$(docker inspect --format '{{.Config.Image}}' "$cid")" == "$old_reference" ]]
}
capture_new() {
  local ids cid
  ids="$(docker ps --all --no-trunc --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1 --filter "label=org.subtrack.sandbox.source=$ST250_SOURCE_HEAD" --format '{{.ID}}')" || return 1
  while IFS= read -r cid;do [[ -z "$cid" ]] && continue;owned_container "$cid" || return 1
    if ! grep -Fxq "$cid" "$runtime/before.ids";then printf '%s\n' "$cid" >> "$runtime/new.ids";fi
  done <<< "$ids"
}
failure() {
  trap - ERR INT TERM
  set +e
  if [[ "$started" == true ]];then
    capture_new >/dev/null 2>&1
    if [[ -f "$runtime/operation.cid" && ! -L "$runtime/operation.cid" ]];then cat "$runtime/operation.cid" >> "$runtime/new.ids";printf '\n' >> "$runtime/new.ids";fi
    if [[ -f "$runtime/new.ids" ]];then
      local cid;while IFS= read -r cid;do [[ -z "$cid" ]] && continue
        if owned_container "$cid" >/dev/null 2>&1;then docker stop --time 10 "$cid" >/dev/null 2>&1;fi
      done < "$runtime/new.ids"
    fi
  fi
  printf 'ST250_DEPLOYMENT_UNAVAILABLE stage=%s\n' "$stage" >&2;exit 1
}
trap failure ERR
trap 'stage=CANCELLED;failure' INT TERM
if [[ "$mode" == validate || "$mode" == preflight ]];then bash "$root/tools/sandbox/verify.sh" "$mode";exit 0;fi
bash "$root/tools/sandbox/verify.sh" staging
configure_android_download
[[ ! -e "$runtime/operation.cid" && ! -L "$runtime/operation.cid" ]]
if [[ "$mode" == upgrade ]];then
 stage=UPGRADE_PREFLIGHT
 if [[ -e "$runtime/upgrade-receipt.json" || -L "$runtime/upgrade-receipt.json" ]];then
  node "$root/tools/sandbox/image-import-binding.cjs" recover-upgrade "$root" "$namespace/staging/$ST250_TRANSFER_RUN" >/dev/null
  bash "$root/tools/sandbox/verify.sh" runtime
  printf 'ST250_DATABASE_UPGRADE_RECOVERED data=preserved endpoint=not-qualified\n';exit 0
 fi
 bash "$root/tools/sandbox/verify.sh" upgrade-preflight
 upgrade_intent_sha="$(node "$root/tools/sandbox/image-import-binding.cjs" prepare-upgrade "$root" "$namespace/staging/$ST250_TRANSFER_RUN")"
 [[ "$upgrade_intent_sha" =~ ^[a-f0-9]{64}$ ]]
 [[ -f "$runtime/bootstrap-complete" && ! -L "$runtime/bootstrap-complete" && "$(stat -c %u "$runtime/bootstrap-complete")" == 996 && "$(stat -c %a "$runtime/bootstrap-complete")" == 600 && "$(stat -c %s "$runtime/bootstrap-complete")" -le 256 ]]
 [[ "$(cat "$runtime/bootstrap-complete")" == "$(cat "$runtime/source-head")" ]]
 [[ ! -e "$runtime/upgrade-receipt.json" && ! -L "$runtime/upgrade-receipt.json" && ! -e "$runtime/upgrade-receipt.json.next" && ! -L "$runtime/upgrade-receipt.json.next" ]]
 if [[ -e "$runtime/upgrade-private.log" || -L "$runtime/upgrade-private.log" ]];then [[ -f "$runtime/upgrade-private.log" && ! -L "$runtime/upgrade-private.log" && "$(realpath -e "$runtime/upgrade-private.log")" == "$runtime/upgrade-private.log" && "$(stat -c %u "$runtime/upgrade-private.log")" == 996 && "$(stat -c %a "$runtime/upgrade-private.log")" == 600 ]];fi
 running_services="$(docker ps --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1 --format '{{.Label "com.docker.compose.service"}}')"
 while IFS= read -r service;do [[ -z "$service" || "$service" == database ]];done <<< "$running_services"
 live="$("${compose[@]}" --profile sandbox-live ps --status running --quiet api-live gateway-live)"
 [[ -z "$live" ]]
 database_was_running="$("${compose[@]}" --profile sandbox-bootstrap ps --status running --quiet database)"
 [[ -z "$database_was_running" || "$database_was_running" =~ ^[a-f0-9]{64}$ ]]
 if [[ -n "$database_was_running" ]];then owned_upgrade_database "$database_was_running";stop_database=false;else stop_database=true;fi
 docker ps --all --no-trunc --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1 --format '{{.ID}}' > "$runtime/before.ids"
 : > "$runtime/new.ids";started=true
 if [[ "$stop_database" == true ]];then
  stage=UPGRADE_DATABASE_START
  "${compose[@]}" --profile sandbox-bootstrap up --detach --no-build --wait --wait-timeout 90 database > "$runtime/upgrade-private.log" 2>&1
  capture_new
  database_was_running="$("${compose[@]}" --profile sandbox-bootstrap ps --status running --quiet database)"
  [[ "$database_was_running" =~ ^[a-f0-9]{64}$ ]];owned_container "$database_was_running"
 fi
 stage=UPGRADE_APPLY
 docker create --cidfile "$runtime/operation.cid" --network subtrack-sandbox-database --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 384m --cpus 0.75 --tmpfs /tmp:size=16m,uid=1000,gid=1000 \
  --label org.subtrack.sandbox.namespace=st250-runtime-v1 --label "org.subtrack.sandbox.source=$ST250_SOURCE_HEAD" --label org.subtrack.sandbox.service=api --label com.docker.compose.project=subtrack-sandbox --label com.docker.compose.service=bootstrap \
  --mount "type=bind,src=$namespace/secrets/database-runtime,dst=/run/secrets/database_runtime,readonly" --mount "type=bind,src=$namespace/secrets/api-auth-material,dst=/run/secrets/api_auth_material,readonly" --mount "type=bind,src=$namespace/secrets/database-bootstrap-loader,dst=/run/secrets/database_bootstrap_loader,readonly" \
  --mount "type=bind,src=$root/tools/sandbox/bootstrap.cjs,dst=/opt/subtrack/bootstrap.cjs,readonly" \
  --env NODE_ENV=production --env SUBTRACK_RUNTIME=sandbox --env SANDBOX_STARTUP_ENABLED=true --env SANDBOX_PUBLICATION_ENABLED=true --env SANDBOX_DATABASE_HOST=database --env SANDBOX_DATABASE_NAME=subtrack_sandbox --env SANDBOX_DATABASE_ROLE=subtrack_sandbox_runtime --env SANDBOX_POOL_MAX=4 --env SANDBOX_DATABASE_CREDENTIAL_FILE=/run/secrets/database_runtime --env SANDBOX_AUTH_MATERIAL_FILE=/run/secrets/api_auth_material --env PORT=4000 \
  --entrypoint node "$SANDBOX_API_IMAGE" /opt/subtrack/bootstrap.cjs upgrade >/dev/null
 cid="$(cat "$runtime/operation.cid")";owned_container "$cid";capture_new
 timeout --kill-after=10s 120s docker start --attach "$cid" > "$runtime/upgrade-private.log" 2>&1
 [[ "$(docker inspect --format '{{.State.ExitCode}}' "$cid")" == 0 && "$(docker inspect --format '{{.State.Running}}' "$cid")" == false ]]
 docker rm "$cid" >/dev/null;rm -- "$runtime/operation.cid"
 stage=UPGRADE_RECEIPT
 node "$root/tools/sandbox/image-import-binding.cjs" seal-upgrade "$root" "$namespace/staging/$ST250_TRANSFER_RUN" >/dev/null
 bash "$root/tools/sandbox/verify.sh" runtime
 if [[ "$stop_database" == true ]];then docker stop --time 30 "$database_was_running" >/dev/null;[[ "$(docker inspect --format '{{.State.Running}}' "$database_was_running")" == false ]];fi
 printf 'ST250_DATABASE_UPGRADE_QUALIFIED source=%s apiImage=%s sessions=preserved\n' "$ST250_SOURCE_HEAD" "$SANDBOX_API_IMAGE";exit 0
fi
if [[ "$mode" == initialize ]];then
 stage=INITIALIZE;empty_runtime
 [[ -z "$(docker ps --all --quiet --filter label=com.docker.compose.project=subtrack-sandbox)" ]]
 [[ -z "$(docker ps --all --quiet --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1)" ]]
 for suffix in database-data certificate-data gateway-config;do
  [[ -z "$(docker volume ls --quiet --filter "name=^subtrack-sandbox-$suffix$")" ]]
 done
 for suffix in database ingress edge;do [[ -z "$(docker network ls --quiet --filter "name=^subtrack-sandbox-$suffix$")" ]];done
 ! ss -ltnH '( sport = :80 or sport = :443 or sport = :4000 or sport = :5432 )' | grep -q .
 mkdir -m0700 -- "$runtime" "$namespace/secrets"
 printf '%s\n' "$ST250_SOURCE_HEAD" > "$runtime/source-head";printf '%s\n' "$SANDBOX_API_IMAGE" > "$runtime/image-id"
 node "$root/tools/sandbox/image-import-binding.cjs" retain-runtime "$root" "$namespace/staging/$ST250_TRANSFER_RUN"
 : > "$runtime/before.ids";: > "$runtime/new.ids";started=true
 initializer_limits
 docker create "${initialization[@]}" --cidfile "$runtime/operation.cid" --label org.subtrack.sandbox.namespace=st250-runtime-v1 --label "org.subtrack.sandbox.source=$ST250_SOURCE_HEAD" --label org.subtrack.sandbox.service=api \
  --mount "type=bind,src=$namespace/secrets,dst=/sandbox-secrets" --mount "type=bind,src=$root/tools/sandbox/bootstrap.cjs,dst=/opt/subtrack/bootstrap.cjs,readonly" \
  --env SUBTRACK_SANDBOX_INITIALIZATION=owned-empty-secrets-v1 --entrypoint node "$SANDBOX_API_IMAGE" /opt/subtrack/bootstrap.cjs generate >/dev/null
 cid="$(cat "$runtime/operation.cid")";owned_container "$cid"
 timeout --kill-after=5s 30s docker start --attach "$cid" > "$runtime/initialize-private.log" 2>&1
 [[ "$(docker inspect --format '{{.State.ExitCode}}' "$cid")" == 0 && "$(docker inspect --format '{{.State.Running}}' "$cid")" == false ]]
 docker rm "$cid" >/dev/null;rm -- "$runtime/operation.cid"
 generation="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
 (set -o noclobber;printf '%s\n' "$generation" > "$runtime/volume-generation")
 for pair in database-data:999 certificate-data:1000 gateway-config:1000;do
  suffix="${pair%:*}";uid="${pair#*:}";volume="subtrack-sandbox-$suffix"
  [[ "$(docker volume create --driver local --label org.subtrack.sandbox.namespace=st250-runtime-v1 --label com.docker.compose.project=subtrack-sandbox --label "com.docker.compose.volume=$suffix" --label "org.subtrack.sandbox.source=$ST250_SOURCE_HEAD" --label "org.subtrack.sandbox.run=$ST250_TRANSFER_RUN" --label "org.subtrack.sandbox.generation=$generation" "$volume")" == "$volume" ]]
  (set -o noclobber;docker volume inspect "$volume" > "$runtime/volume-$suffix.json")
  node - "$runtime/volume-$suffix.json" "$suffix" "$ST250_SOURCE_HEAD" "$ST250_TRANSFER_RUN" "$generation" <<'NODE'
const fs=require('node:fs');try{const[file,role,head,run,generation]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(file,'utf8')),name='subtrack-sandbox-'+role,labels={'org.subtrack.sandbox.namespace':'st250-runtime-v1','com.docker.compose.project':'subtrack-sandbox','com.docker.compose.volume':role,'org.subtrack.sandbox.source':head,'org.subtrack.sandbox.run':run,'org.subtrack.sandbox.generation':generation};if(a.length!==1)throw Error();const x=a[0];if(x.Name!==name||x.Driver!=='local'||x.Scope!=='local'||typeof x.CreatedAt!=='string'||!Number.isFinite(Date.parse(x.CreatedAt))||x.Mountpoint!=='/var/lib/docker/volumes/'+name+'/_data'||Object.keys(x.Options??{}).length||JSON.stringify(Object.entries(x.Labels??{}).sort())!==JSON.stringify(Object.entries(labels).sort()))throw Error();}catch{process.exit(1);}
NODE
  docker create "${initialization[@]}" --cidfile "$runtime/operation.cid" --label org.subtrack.sandbox.namespace=st250-runtime-v1 --label "org.subtrack.sandbox.source=$ST250_SOURCE_HEAD" --label org.subtrack.sandbox.service=api \
   --mount "type=volume,src=$volume,dst=/owned" --entrypoint node "$SANDBOX_API_IMAGE" -e 'const fs=require("node:fs"),uid=Number(process.argv[1]);if(![999,1000].includes(uid)||!fs.lstatSync("/owned").isDirectory()||fs.realpathSync("/owned")!=="/owned"||fs.readdirSync("/owned").length)process.exit(1);fs.chmodSync("/owned",0o700);fs.chownSync("/owned",uid,uid);const s=fs.statSync("/owned");if(s.uid!==uid||s.gid!==uid||(s.mode&0o777)!==0o700)process.exit(1);' "$uid" >/dev/null
  cid="$(cat "$runtime/operation.cid")";owned_container "$cid"
  timeout --kill-after=5s 30s docker start --attach "$cid" >> "$runtime/initialize-private.log" 2>&1
  [[ "$(docker inspect --format '{{.State.ExitCode}}' "$cid")" == 0 ]]
  docker rm "$cid" >/dev/null;rm -- "$runtime/operation.cid"
 done
 bash "$root/tools/sandbox/verify.sh" runtime
 printf 'ST250_INITIALIZED data=preserved endpoint=not-started\n';exit 0
fi
bash "$root/tools/sandbox/verify.sh" runtime
for name in before.ids new.ids bootstrap-private.log live-private.log;do
 if [[ -e "$runtime/$name" || -L "$runtime/$name" ]];then [[ -f "$runtime/$name" && ! -L "$runtime/$name" && "$(realpath -e "$runtime/$name")" == "$runtime/$name" && "$(stat -c %u "$runtime/$name")" == 996 && "$(stat -c %a "$runtime/$name")" == 600 ]];fi
done
# BEGIN LAST QUALIFIED RECEIPT
# Retain the last qualified proof through activation/readback and any failure.
# Its old tooling metadata stays honest until the successful final atomic write.
if [[ -e "$runtime/deployment-receipt.json" || -L "$runtime/deployment-receipt.json" ]];then
 [[ -f "$runtime/deployment-receipt.json" && ! -L "$runtime/deployment-receipt.json" && "$(stat -c %u "$runtime/deployment-receipt.json")" == 996 && "$(stat -c %a "$runtime/deployment-receipt.json")" == 600 ]]
fi
# END LAST QUALIFIED RECEIPT
docker ps --all --no-trunc --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1 --format '{{.ID}}' > "$runtime/before.ids"
: > "$runtime/new.ids";started=true
if [[ "$mode" == bootstrap ]];then
 stage=BOOTSTRAP
 [[ ! -e "$runtime/bootstrap-complete" && ! -L "$runtime/bootstrap-complete" ]]
 [[ -z "$(docker ps --quiet --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1)" ]]
 "${compose[@]}" --profile sandbox-bootstrap up --detach --no-build --wait --wait-timeout 90 database > "$runtime/bootstrap-private.log" 2>&1
 capture_new
 "${compose[@]}" --profile sandbox-bootstrap create --no-build bootstrap >> "$runtime/bootstrap-private.log" 2>&1
 capture_new
 cid="$("${compose[@]}" --profile sandbox-bootstrap ps --all --quiet bootstrap)";owned_container "$cid"
 timeout --kill-after=10s 120s docker start --attach "$cid" >> "$runtime/bootstrap-private.log" 2>&1
 [[ "$(docker inspect --format '{{.State.ExitCode}}' "$cid")" == 0 && "$(docker inspect --format '{{.State.Running}}' "$cid")" == false ]]
 docker rm "$cid" >/dev/null
 database_id="$("${compose[@]}" --profile sandbox-bootstrap ps --all --quiet database)";owned_container "$database_id"
 docker stop --time 30 "$database_id" >/dev/null
 [[ "$(docker inspect --format '{{.State.Running}}' "$database_id")" == false ]]
 (set -o noclobber;printf '%s\n' "$ST250_SOURCE_HEAD" > "$runtime/bootstrap-complete")
 printf 'ST250_BOOTSTRAP_QUALIFIED ordinaryStartup=verified endpoint=not-started\n';exit 0
fi
stage=ACTIVATE
[[ -f "$runtime/bootstrap-complete" && ! -L "$runtime/bootstrap-complete" && "$(stat -c %u "$runtime/bootstrap-complete")" == 996 && "$(stat -c %a "$runtime/bootstrap-complete")" == 600 && "$(stat -c %s "$runtime/bootstrap-complete")" -le 256 ]]
[[ "$(cat "$runtime/bootstrap-complete")" == "$ST250_SOURCE_HEAD" ]]
existing="$("${compose[@]}" --profile sandbox-live ps --status running --quiet)"
if [[ -n "$existing" ]];then
 [[ "$mode" == resume ]]
 bash "$root/tools/sandbox/verify.sh" live
else
 ! ss -ltnH '( sport = :80 or sport = :443 or sport = :4000 or sport = :5432 )' | grep -q .
 "${compose[@]}" --profile sandbox-live up --detach --no-build > "$runtime/live-private.log" 2>&1
 capture_new
 bash "$root/tools/sandbox/verify.sh" live
fi
# Trusted certificate chain/IP hostname verification, with no private CA or insecure fallback.
for attempt in {1..30};do
 status="$(curl --proto '=https' --tlsv1.2 --max-time 10 --silent --output /dev/null --write-out '%{http_code}' https://198.44.116.159/v2/sandbox/mobile/business)" || status=''
 [[ "$status" == 404 ]] && break;sleep 2
done
[[ "$status" == 404 ]]
stage=READBACK
api_id="$("${compose[@]}" --profile sandbox-live ps --all --quiet api-live)";owned_container "$api_id"
api_container_image="$(ST250_IDENTITY_SERVICE=api node "$root/tools/sandbox/image-import-binding.cjs" container-id "$root" "$namespace/staging/$ST250_TRANSFER_RUN")"
timeout --kill-after=10s 90s node - "$api_id" "$api_container_image" <<'NODE'
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const[id,image]=process.argv.slice(2),origin='https://198.44.116.159';
// BEGIN READBACK DIAGNOSTICS
let step='INPUT',predicate='IDENTITY';
const steps=new Set(['INPUT','BOOTSTRAP','PROFILE','MODE','MANUAL','OWNER_READ','DISTINCT_OWNERS','FOREIGN_STATUS','INSPECT','RESTART','RESTART_READY','RESUME','RESTART_READBACK','REFRESH','REFRESH_READBACK','LOGOUT','LOGOUT_READBACK','LOGOUT_RESUME']);
const predicates=new Set(['IDENTITY','FETCH','BODY_BOUND','CACHE_CONTROL','JSON','HTTP_STATUS','VALUE','CAPABILITY','OWNER_DISTINCT','CONTAINER_COUNT','IMAGE','NAMESPACE','SOURCE','SERVICE','PROCESS','READY','ITEM_COUNT','ITEM_ID','AMOUNT']);
const mark=(next,check='VALUE')=>{step=next;predicate=check;};
const diagnostic=()=>`ST250_HTTPS_READBACK_DIAGNOSTIC step=${steps.has(step)?step:'INPUT'} predicate=${predicates.has(predicate)?predicate:'VALUE'}`;
// END READBACK DIAGNOSTICS
async function call(route,body,authorization,key){const headers={};if(authorization)headers.Authorization=authorization;if(key)headers['Idempotency-Key']=key;if(body!==undefined)headers['Content-Type']='application/json';predicate='FETCH';const r=await fetch(origin+'/v2/sandbox/mobile/'+route,{method:'POST',headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});predicate='BODY_BOUND';const reader=r.body?.getReader();let size=0,parts=[];if(reader)for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error();}parts.push(Buffer.from(value));}predicate='CACHE_CONTROL';assert.equal(r.headers.get('cache-control'),'no-store');const text=Buffer.concat(parts).toString('utf8');predicate='JSON';const value=text?JSON.parse(text):undefined;predicate='VALUE';return{status:r.status,value};}
const checked=(r,status)=>{predicate='HTTP_STATUS';assert.equal(r.status,status);predicate='VALUE';return r.value;};
const business=(a,operation,body={},key)=>call('business',{operation,body},'Bearer '+a.accessToken,key);
(async()=>{assert.match(id,/^[a-f0-9]{64}$/);const actors=[],ids=[];const form={customName:'Fictional sandbox qualification',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'12990',nextChargeDate:null};
 for(let i=0;i<2;i++){mark('BOOTSTRAP');actors[i]=checked(await call('bootstrap',{transport:'sandbox-mobile',locale:'en'},undefined,crypto.randomUUID()),201);predicate='CAPABILITY';assert.equal(typeof actors[i].installationCapability,'string');mark('PROFILE');checked(await business(actors[i],'profile',{displayName:'Fictional sandbox qualification'}),200);mark('MODE');checked(await business(actors[i],'mode',{mode:'just-me'}),200);mark('MANUAL');ids[i]=checked(await business(actors[i],'manual',form,crypto.randomUUID()),201).id;mark('OWNER_READ');const initialPage=checked(await business(actors[i],'owner-read'),200);predicate='ITEM_COUNT';assert.equal(initialPage.items.length,1);}
 mark('DISTINCT_OWNERS','OWNER_DISTINCT');assert.notEqual(actors[0].installationCapability,actors[1].installationCapability);assert.notEqual(ids[0],ids[1]);
 for(let i=0;i<2;i++){mark('FOREIGN_STATUS');checked(await business(actors[i],'status',{id:ids[1-i],status:'PAUSED'}),404);}
 mark('INSPECT','PROCESS');const inspected=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',timeout:10000,maxBuffer:65536}));predicate='CONTAINER_COUNT';assert.equal(inspected.length,1);predicate='IMAGE';assert.equal(inspected[0].Image,image);predicate='NAMESPACE';assert.equal(inspected[0].Config.Labels['org.subtrack.sandbox.namespace'],'st250-runtime-v1');predicate='SOURCE';assert.equal(inspected[0].Config.Labels['org.subtrack.sandbox.source'],process.env.ST250_SOURCE_HEAD);predicate='SERVICE';assert.equal(inspected[0].Config.Labels['com.docker.compose.service'],'api-live');
 mark('RESTART','PROCESS');execFileSync('docker',['restart','--time','10',id],{stdio:'ignore',timeout:20000});
 // Only side-effect-free readback is retried while the restarted API warms up.
 mark('RESTART_READY');let ready=false;for(let n=0;n<20;n++){try{const r=await business(actors[0],'owner-read');if(r.status===200){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,300));}predicate='READY';assert.equal(ready,true);
 for(let i=0;i<2;i++){mark('RESUME');const resumed=checked(await call('resume',{transport:'sandbox-mobile'},'SandboxCapability '+actors[i].installationCapability,crypto.randomUUID()),201);actors[i]={...resumed,installationCapability:actors[i].installationCapability};mark('RESTART_READBACK');const page=checked(await business(actors[i],'owner-read'),200);predicate='ITEM_COUNT';assert.equal(page.items.length,1);predicate='ITEM_ID';assert.equal(page.items[0].id,ids[i]);predicate='AMOUNT';assert.equal(page.items[0].expectedAmountMinor,'12990');}
 mark('REFRESH');actors[0]={...checked(await call('refresh',undefined,'SandboxRefresh '+actors[0].refreshToken,crypto.randomUUID()),200),installationCapability:actors[0].installationCapability};mark('REFRESH_READBACK');checked(await business(actors[0],'owner-read'),200);
 for(const actor of actors){mark('LOGOUT');checked(await call('logout',{transport:'sandbox-mobile'},'Bearer '+actor.accessToken),204);mark('LOGOUT_READBACK');checked(await business(actor,'owner-read'),401);mark('LOGOUT_RESUME');checked(await call('resume',{transport:'sandbox-mobile'},'SandboxCapability '+actor.installationCapability,crypto.randomUUID()),401);}
 process.stdout.write('ST250_HTTPS_READBACK_QUALIFIED owners=2 restart=true isolation=true refresh=true logout=true\n');
})().catch(()=>{process.stderr.write(diagnostic()+'\n');process.stderr.write('ST250_DEPLOYMENT_UNAVAILABLE stage=HTTPS_READBACK\n');process.exitCode=1;});
NODE
if [[ "${ST250_ANDROID_DOWNLOAD_PUBLICATION:-false}" == true ]]; then
 stage=ANDROID_HOSTING
 timeout --kill-after=10s 90s node - "$root" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{const root=process.argv[2],m=require(root+'/tools/sandbox/image-import-binding.cjs'),v=m.validateAndroidDownload(JSON.parse(fs.readFileSync(root+'/runtime/android-download-binding.json','utf8'))),origin='https://198.44.116.159';
 const request=route=>fetch(origin+route,{redirect:'error',signal:AbortSignal.timeout(10000)});
 const binary=await request('/download/subtrack-sandbox.apk');if(binary.status!==200||binary.headers.get('cache-control')!=='no-store'||binary.headers.get('x-content-type-options')!=='nosniff'||binary.headers.get('content-type')!=='application/vnd.android.package-archive'||binary.headers.get('content-disposition')!=='attachment; filename="subtrack-sandbox.apk"')throw Error();const hash=crypto.createHash('sha256');let bytes=0;for await(const chunk of binary.body){bytes+=chunk.length;if(bytes>v.bytes)throw Error();hash.update(chunk);}if(bytes!==v.bytes||hash.digest('hex')!==v.signedSha256)throw Error();
 const page=await request('/');if(page.status!==200||page.headers.get('cache-control')!=='no-store'||page.headers.get('content-type')!=='text/html; charset=utf-8')throw Error();let text='',size=0;for await(const chunk of page.body){size+=chunk.length;if(size>65536)throw Error();text+=Buffer.from(chunk).toString('utf8');}if(!text.includes('lang="sv"')||!text.includes('/download/subtrack-sandbox.apk')||!text.includes('iOS testing is pending')||!text.includes('Version code: '+v.versionCode)||!text.includes(v.signedSha256))throw Error();
 process.stdout.write('ST250_ANDROID_DOWNLOAD_HOSTING_QUALIFIED tls=trusted bytes=matched installed=pending\n');
})().catch(()=>{process.stderr.write('ST250_DEPLOYMENT_UNAVAILABLE stage=ANDROID_HOSTING\n');process.exitCode=1;});
NODE
fi
node - "$runtime/deployment-receipt.json" "$ST250_SOURCE_HEAD" "$SANDBOX_API_IMAGE" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');try{const[file,head,image]=process.argv.slice(2),bindingBytes=fs.readFileSync(file.replace(/deployment-receipt\.json$/,'image-import-binding.json')),binding=JSON.parse(bindingBytes);if(!/^[a-f0-9]{40}$/.test(head)||!/^sha256:[a-f0-9]{64}$/.test(image)||binding.artifactSourceHead!==head||binding.importedImageId!==image)throw Error();const receipt={schema:'st250-deployment-v2',sourceHead:head,toolingSourceHead:binding.toolingSourceHead,sourceCustodySha256:binding.sourceCustodySha256,historicalSourceCustodySha256:binding.historicalSourceCustodySha256,apiExportedConfigId:binding.exportedConfigId,apiImageId:image,imageImportBindingSha256:crypto.createHash('sha256').update(bindingBytes).digest('hex'),serviceImageCustody:binding.services,host:'198.44.116.159',tlsVerified:true,ownerIsolationVerified:true,restartReadbackVerified:true,refreshLogoutVerified:true,resourceGraphVerified:true,androidInstalled:false,iosInstalled:false,qualification:'synthetic-only',dataPolicy:'retained'};const temp=file+'.next';let fd,created=false;try{if(fs.existsSync(file)){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==996||(s.mode&0o777)!==0o600)throw Error();}fd=fs.openSync(temp,'wx',0o600);created=true;fs.writeFileSync(fd,JSON.stringify(receipt)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;if(fs.existsSync(file)){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==996||(s.mode&0o777)!==0o600)throw Error();}fs.renameSync(temp,file);created=false;}finally{if(fd!==undefined)fs.closeSync(fd);if(created)fs.unlinkSync(temp);}}catch{process.stderr.write('ST250_DEPLOYMENT_UNAVAILABLE stage=RECEIPT\n');process.exitCode=1;}
NODE
printf 'ST250_BACKEND_QUALIFIED source=%s apiImage=%s tls=trusted readback=verified native=pending\n' "$ST250_SOURCE_HEAD" "$SANDBOX_API_IMAGE"
