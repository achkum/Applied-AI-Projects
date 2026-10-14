#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true && "${ST250_DISPOSABLE:-}" == hosted-owned-pg16 ]]
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)";cd "$root"
base="$(cd "$RUNNER_TEMP" && pwd -P)";work="$(mktemp -d "$base/st250-XXXXXXXX")"
image=docker.io/library/postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
head="$(git rev-parse HEAD)";marker="ST250:$(basename "$work"):$head";cid='';network='';mounted=0;mapped=0
variant="${ST250_QUALIFICATION_VARIANT:-host-v1}";[[ "$variant" == host-v1 || "$variant" == image-v2 ]]
api_image='';extract_id='';image_label="st250-image-${GITHUB_RUN_ID:-}-${GITHUB_RUN_ATTEMPT:-}"
out="$base/st250-sandbox-postgresql-receipt.json"
if [[ "$variant" == image-v2 ]];then out="$base/st250-sandbox-image-postgresql-receipt.json";fi
cleanup(){
 local code=$?;trap - EXIT INT TERM
 set +e
 local receipt='';if (( code==0 ));then receipt="$(cat "$work/candidate.json" 2>/dev/null)" || code=1;fi
 local handoff_json='';if [[ "$variant" == image-v2 && "$code" -eq 0 ]];then handoff_json="$(cat "$work/image-handoff.json" 2>/dev/null)" || code=1;fi
 if [[ -f "$work/child.pid" ]];then
  local pid;pid="$(cat "$work/child.pid")";[[ "$pid" =~ ^[0-9]+$ ]] || code=1
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null;then
   local -a args;mapfile -d '' -t args < "/proc/$pid/cmdline" || code=1
   if [[ "${args[1]:-}" == "$root/apps/api/dist/sandbox/main.js" ]];then
    kill -TERM "$pid" 2>/dev/null || code=1
    for _ in {1..50};do kill -0 "$pid" 2>/dev/null || break;sleep 0.1;done
    if kill -0 "$pid" 2>/dev/null;then code=1;fi
   else code=1;fi
  fi
 fi
 if [[ "$variant" == image-v2 ]];then
  if [[ -z "$api_image" && -f "$work/image.iid" ]];then api_image="$(cat "$work/image.iid")";fi
  if [[ -n "$api_image" && ! "$api_image" =~ ^sha256:[a-f0-9]{64}$ ]];then code=1;api_image='';fi
  local -a ids=()
  local id cidfile;for cidfile in "$work/extract.cid" "$work/api-1.cid" "$work/api-2.cid";do if [[ -f "$cidfile" && ! -L "$cidfile" ]];then id="$(cat "$cidfile")";ids+=("$id");elif [[ -e "$cidfile" || -L "$cidfile" ]];then code=1;fi;done
  for id in "${ids[@]}";do
   [[ "$id" =~ ^[a-f0-9]{64}$ ]] || { code=1;continue; }
   local live;live="$(docker container ls --all --no-trunc --filter "id=$id" --format '{{.ID}}' 2>/dev/null)" || { code=1;continue; }
   if [[ -n "$live" ]];then
    if [[ "$live" == "$id" && "$(docker inspect --format '{{index .Config.Labels "subtrack.custody"}}' "$id" 2>/dev/null)" == "$marker" && "$(docker inspect --format '{{.Image}}' "$id" 2>/dev/null)" == "$api_image" ]];then docker rm -f "$id" >/dev/null 2>&1 || code=1;else code=1;fi
   fi
   live="$(docker container ls --all --no-trunc --filter "id=$id" --format '{{.ID}}' 2>/dev/null)" || code=1
   [[ -z "$live" ]] || code=1
  done
 fi
 if [[ -n "$cid" ]];then
  if [[ "$(docker inspect --format '{{index .Config.Labels "subtrack.custody"}}' "$cid" 2>/dev/null)" == "$marker" && "$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null)" == "$image" ]];then
   docker rm -f "$cid" > /dev/null 2>&1 || code=1
   local remaining;remaining="$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}' 2>/dev/null)" || code=1
   [[ -z "$remaining" ]] || code=1
  else code=1;fi
 fi
 if [[ "$variant" == image-v2 && -n "$api_image" ]];then
  local remaining_image;remaining_image="$(docker image ls --no-trunc --quiet 2>/dev/null)" || code=1
  if grep -Fxq -- "$api_image" <<< "$remaining_image";then
   if [[ "$(docker image inspect --format '{{.Id}}' "$api_image" 2>/dev/null)" == "$api_image" && "$(docker image inspect --format '{{index .Config.Labels "org.subtrack.sandbox-build"}}' "$api_image" 2>/dev/null)" == "$image_label" ]];then docker image rm "$api_image" >/dev/null 2>&1 || code=1;else code=1;fi
  fi
  remaining_image="$(docker image ls --no-trunc --quiet 2>/dev/null)" || code=1
  if grep -Fxq -- "$api_image" <<< "$remaining_image";then code=1;fi
 fi
 if [[ -n "$network" ]];then
  if [[ "$(docker network inspect --format '{{index .Labels "subtrack.custody"}}' "$network" 2>/dev/null)" == "$marker" ]];then
   docker network rm "$network" >/dev/null 2>&1 || code=1
   local remaining_network;remaining_network="$(docker network ls --no-trunc --filter "id=$network" --format '{{.ID}}' 2>/dev/null)" || code=1
   [[ -z "$remaining_network" ]] || code=1
  else code=1;fi
 fi
 if (( mounted==1 ));then
  for name in database_runtime api_auth_material;do
   if ! sudo cmp -s "$work/$name" "/run/secrets/$name";then code=1;else sudo rm -- "/run/secrets/$name" || code=1;fi
   [[ ! -e "/run/secrets/$name" && ! -L "/run/secrets/$name" ]] || code=1
  done
 fi
 if (( mapped==1 ));then
  if sudo cmp -s /etc/hosts "$work/hosts.expected";then sudo cp "$work/hosts.before" /etc/hosts || code=1;else code=1;fi
  sudo cmp -s /etc/hosts "$work/hosts.before" || code=1
 fi
 rm -rf -- "$work" || code=1
 [[ ! -e "$work" && ! -L "$work" ]] || code=1
 if (( code==0 ));then
  ST250_CLOSED_CANDIDATE="$receipt" ST250_CLOSED_HANDOFF="$handoff_json" node - "$root" "$out" "$variant" <<'NODE'
const fs=require('node:fs'),path=require('node:path');const [root,out,variant]=process.argv.slice(2);const {sandboxReceipt,sandboxImageReceipt}=require(path.join(root,'tools/database/sandbox-qualification-receipt.cjs'));try{const measured=JSON.parse(process.env.ST250_CLOSED_CANDIDATE);if(measured.cleanupConfirmed!==false)throw Error('cleanup');const receipt=variant==='image-v2'?sandboxImageReceipt({...measured,cleanupConfirmed:true,checks:{...measured.checks,imageCustodyRemoved:true}},JSON.parse(process.env.ST250_CLOSED_HANDOFF)):sandboxReceipt({...measured,cleanupConfirmed:true});fs.writeFileSync(out,JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});}catch{process.stderr.write('ST250_SANDBOX_PG_FAILURE phase=RECEIPT\n');process.exitCode=1;}
NODE
  [[ $? -eq 0 ]] || code=1
 else printf 'ST250_SANDBOX_PG_FAILURE phase=CLEANUP_OR_RUNTIME\n' >&2;fi
 exit "$code"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
[[ ! -e "$out" && ! -L "$out" ]]
# Fresh hosted runner only: refuse prior custody, a DB listener, API listener or hostname alias.
[[ ! -e /run/secrets/database_runtime && ! -L /run/secrets/database_runtime && ! -e /run/secrets/api_auth_material && ! -L /run/secrets/api_auth_material ]]
! getent hosts database >/dev/null
! ss -ltnH '( sport = :5432 or sport = :4000 )' | grep -q .
node tools/database/sandbox-qualification.cjs setup "$work" > "$work/setup-private.log" 2>&1
if [[ "$variant" == image-v2 ]];then
 [[ "${ST250_SOURCE_HEAD:-}" == "$head" && "${ST250_RUN_ID:-}" =~ ^[0-9]+-[0-9]+$ && "$ST250_RUN_ID" == "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" ]]
 SANDBOX_BUILD_MODE=parent-owned-image SANDBOX_IMAGE_PARENT="$work" SANDBOX_IMAGE_MARKER="$marker" SANDBOX_SOURCE_HEAD="$head" SANDBOX_BUILD_RUN="$ST250_RUN_ID" SANDBOX_BUILD_RECEIPT='' bash tools/sandbox/build-api.sh > "$work/image-build-private.log" 2>&1
 api_image="$(cat "$work/image.iid")";[[ "$api_image" =~ ^sha256:[a-f0-9]{64}$ ]]
 docker create --cidfile "$work/extract.cid" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --label "subtrack.custody=$marker" "$api_image" >/dev/null 2> "$work/extract-private.log"
 extract_id="$(cat "$work/extract.cid")";[[ "$extract_id" =~ ^[a-f0-9]{64}$ ]]
 mkdir -p "$work/image/apps/api/dist/sandbox" "$work/image/apps/api/prisma/sandbox" "$work/image-secrets"
 docker cp "$extract_id:/workspace/apps/api/dist/sandbox/." "$work/image/apps/api/dist/sandbox" >/dev/null 2>> "$work/extract-private.log"
 for name in 001-sandbox-foundation.sql 002-sandbox-mobile-business.sql;do docker cp "$extract_id:/workspace/apps/api/prisma/sandbox/$name" "$work/image/apps/api/prisma/sandbox/$name" >/dev/null 2>> "$work/extract-private.log";done
 [[ "$(realpath "$work/image")" == "$work/image" && -z "$(find "$work/image" -type l -print -quit)" ]]
 sudo chown -R "$(id -u):$(id -g)" "$work/image"
 for name in database_runtime api_auth_material;do
  sudo install -m0600 -o1000 -g1000 "$work/$name" "$work/image-secrets/$name"
  sudo cmp -s "$work/$name" "$work/image-secrets/$name"
 done
fi
sudo mkdir -p /run/secrets
sudo install -m0600 -o "$(id -u)" -g "$(id -g)" "$work/database_runtime" /run/secrets/database_runtime
mounted=1
sudo install -m0600 -o "$(id -u)" -g "$(id -g)" "$work/api_auth_material" /run/secrets/api_auth_material
sudo cat /etc/hosts > "$work/hosts.before"
cat "$work/hosts.before" > "$work/hosts.expected"
printf '\n127.0.0.1 database # %s\n' "$marker" >> "$work/hosts.expected"
sudo cp "$work/hosts.expected" /etc/hosts;mapped=1
network_name="$(basename "$work")-network"
[[ "$network_name" =~ ^st250-[A-Za-z0-9]{8}-network$ ]]
network="$(docker network create --internal --label "subtrack.custody=$marker" "$network_name" 2> "$work/docker-private.log")"
[[ "$network" =~ ^[a-f0-9]{64}$ ]]
cid="$(docker create --network "$network" --network-alias database --label "subtrack.custody=$marker" -p127.0.0.1:5432:5432 --pids-limit=128 --memory=512m --cpus=2 --tmpfs /var/lib/postgresql/data --env-file "$work/pg.env" "$image" 2> "$work/docker-private.log")"
[[ "$cid" =~ ^[a-f0-9]{64}$ ]]
docker start "$cid" > /dev/null 2>> "$work/docker-private.log"
for _ in {1..60};do if docker exec "$cid" pg_isready -h127.0.0.1 -Usubtrack_sandbox_bootstrap -dsubtrack_sandbox >/dev/null 2>&1;then break;fi;sleep 1;done
docker exec "$cid" pg_isready -h127.0.0.1 -Usubtrack_sandbox_bootstrap -dsubtrack_sandbox >/dev/null 2>&1
# Only this harness loads DDL; actual main never does so.
run_mode=run;if [[ "$variant" == image-v2 ]];then run_mode=run-image;fi
if ! ST250_PG_NETWORK="$network" ST250_IMAGE_MARKER="$marker" timeout --signal=TERM --kill-after=10s 180s node tools/database/sandbox-qualification.cjs "$run_mode" "$work" > "$work/runtime-private.log" 2>&1;then
 grep -E '^ST250_SANDBOX_PG_FAILURE phase=(SETUP|LOAD|CATALOG|START|BOOTSTRAP|BUSINESS|RESTART|ISOLATION|REFRESH|WIRE|LOGOUT|CLOSE)$' "$work/runtime-private.log" >&2 || true
 exit 1
fi
