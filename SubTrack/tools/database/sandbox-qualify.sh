#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true && "${ST250_DISPOSABLE:-}" == hosted-owned-pg16 ]]
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)";cd "$root"
base="$(cd "$RUNNER_TEMP" && pwd -P)";work="$(mktemp -d "$base/st250-XXXXXXXX")"
image=docker.io/library/postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
head="$(git rev-parse HEAD)";marker="ST250:$(basename "$work"):$head";cid='';network='';mounted=0;mapped=0
out="$base/st250-sandbox-postgresql-receipt.json";[[ ! -e "$out" && ! -L "$out" ]]
cleanup(){
 local code=$?;trap - EXIT INT TERM
 set +e
 local receipt='';if (( code==0 ));then receipt="$(cat "$work/candidate.json" 2>/dev/null)" || code=1;fi
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
 if [[ -n "$cid" ]];then
  if [[ "$(docker inspect --format '{{index .Config.Labels "subtrack.custody"}}' "$cid" 2>/dev/null)" == "$marker" && "$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null)" == "$image" ]];then
   docker rm -f "$cid" > /dev/null 2>&1 || code=1
   local remaining;remaining="$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}' 2>/dev/null)" || code=1
   [[ -z "$remaining" ]] || code=1
  else code=1;fi
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
  ST250_CLOSED_CANDIDATE="$receipt" node - "$root" "$out" <<'NODE'
const fs=require('node:fs'),path=require('node:path');const [root,out]=process.argv.slice(2);const {sandboxReceipt}=require(path.join(root,'tools/database/sandbox-qualification-receipt.cjs'));try{const measured=JSON.parse(process.env.ST250_CLOSED_CANDIDATE);if(measured.cleanupConfirmed!==false)throw Error('cleanup');const receipt=sandboxReceipt({...measured,cleanupConfirmed:true});fs.writeFileSync(out,JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});}catch{process.stderr.write('ST250_SANDBOX_PG_FAILURE phase=RECEIPT\n');process.exitCode=1;}
NODE
  [[ $? -eq 0 ]] || code=1
 else printf 'ST250_SANDBOX_PG_FAILURE phase=CLEANUP_OR_RUNTIME\n' >&2;fi
 exit "$code"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
# Fresh hosted runner only: refuse prior custody, a DB listener, API listener or hostname alias.
[[ ! -e /run/secrets/database_runtime && ! -L /run/secrets/database_runtime && ! -e /run/secrets/api_auth_material && ! -L /run/secrets/api_auth_material ]]
! getent hosts database >/dev/null
! ss -ltnH '( sport = :5432 or sport = :4000 )' | grep -q .
node tools/database/sandbox-qualification.cjs setup "$work" > "$work/setup-private.log" 2>&1
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
cid="$(docker create --network "$network" --label "subtrack.custody=$marker" -p127.0.0.1:5432:5432 --pids-limit=128 --memory=512m --cpus=2 --tmpfs /var/lib/postgresql/data --env-file "$work/pg.env" "$image" 2> "$work/docker-private.log")"
[[ "$cid" =~ ^[a-f0-9]{64}$ ]]
docker start "$cid" > /dev/null 2>> "$work/docker-private.log"
for _ in {1..60};do if docker exec "$cid" pg_isready -h127.0.0.1 -Usubtrack_sandbox_bootstrap -dsubtrack_sandbox >/dev/null 2>&1;then break;fi;sleep 1;done
docker exec "$cid" pg_isready -h127.0.0.1 -Usubtrack_sandbox_bootstrap -dsubtrack_sandbox >/dev/null 2>&1
# Only this harness loads DDL; actual main never does so.
if ! timeout --signal=TERM --kill-after=10s 180s node tools/database/sandbox-qualification.cjs run "$work" > "$work/runtime-private.log" 2>&1;then
 grep -E '^ST250_SANDBOX_PG_FAILURE phase=(SETUP|LOAD|CATALOG|START|BOOTSTRAP|BUSINESS|RESTART|ISOLATION|REFRESH|WIRE|LOGOUT|CLOSE)$' "$work/runtime-private.log" >&2 || true
 exit 1
fi