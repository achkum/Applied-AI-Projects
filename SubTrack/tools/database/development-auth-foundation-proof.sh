#!/usr/bin/env bash
# ST-233a. Local/CI owned fixture only. Never print client or Docker diagnostics.
set -euo pipefail
umask 077
shopt -s lastpipe
declare -A clients=() writers=()
registering=false interrupted=false sequence=0 client_log='' client_pid=''
monotonic() { python3 -c 'import time; print(int(time.monotonic()*1000))'; }
registry() {
  local pid
  private_file "$tmp/clients" || return 1
  : > "$tmp/clients"
  for pid in "${!clients[@]}"; do printf '%s %s\n' "$pid" "${clients[$pid]}" >> "$tmp/clients"; done
}
live_client() { [[ -n "${clients[$1]:-}" && " $(jobs -pr | tr '\n' ' ') " == *" $1 "* ]]; }
poll_client() {
  local deadline=$(( $(monotonic) + $2 ))
  while live_client "$1"; do [[ $(monotonic) -lt "$deadline" ]] || return 1; sleep .1; done
}
join_client() {
  local pid=$1 status=0
  [[ -n "${clients[$pid]:-}" ]] && poll_client "$pid" "${2:-25000}" || return 1
  wait "$pid" || status=$?
  [[ "$status" != 127 ]] || return 1
  unset 'clients[$pid]'
  registry || return 1
  [[ "$status" == 0 ]]
}
launch_client() {
  local user=$1 input=$2 app=$3
  [[ "$app" =~ ^st233b-(holder|waiter|observer|sync-[0-9]+)$ ]] || return 1
  private_file "$input" || { [[ -p "$input" && ! -L "$input" && $(stat -c %u "$input") == "$UID" && $(stat -c %a "$input") == 600 ]] || return 1; }
  client_log=$(mktemp "$tmp/client.XXXXXX")
  [[ -d "$tmp" && ! -L "$tmp" && $(stat -c %u "$tmp") == "$UID" && $(stat -c %a "$tmp") == 700 ]] && private_file "$client_log" && private_file "$tmp/clients" && custody || return 1
  registering=true
  (exec docker exec -i -e PGPASSFILE=/tmp/st233a.pgpass -e PGAPPNAME="$app" "$cid" psql -X -q -h 127.0.0.1 -U "$user" -d "$db" -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate < "$input" > "$client_log" 2>&1) &
  client_pid=$! clients[$!]=$app
  registry || interrupted=true
  registering=false
  [[ "$interrupted" == false ]] || return 1
}
close_writers() {
  local fd
  for fd in "${writers[@]}"; do exec {fd}>&-; done
  writers=()
}
observe_clients() {
  local query=$1 pattern=$2 deadline=$(( $(monotonic)+${3:-10000} ))
  private_file "$observer" || return 1
  while [[ $(monotonic) -lt "$deadline" ]]; do
    printf '%s\n' "$query" > "$observer"
    launch_client st233a_fixture_owner "$observer" st233b-observer && join_client "$client_pid" 2000 || return 1
    if grep -Eq "$pattern" "$client_log"; then return 0; fi
    live_client "$holder_pid" && { [[ -z "${waiter_pid:-}" ]] || live_client "$waiter_pid"; } || return 1
    sleep .1
  done
  return 1
}
terminate_clients() {
  local pid bad=false
  close_writers
  for pid in "${!clients[@]}"; do live_client "$pid" && kill -TERM "$pid" 2>/dev/null || true; done
  for pid in "${!clients[@]}"; do poll_client "$pid" 5000 || { live_client "$pid" && kill -KILL "$pid" 2>/dev/null || true; }; done
  # Even an exited docker client can leave a server psql: stop the owned fixture.
  terminate_container || return 1
  for pid in "${!clients[@]}"; do
    poll_client "$pid" 5000 || { bad=true; continue; }
    join_client "$pid" 1 || { [[ -z "${clients[$pid]:-}" ]] || bad=true; }
  done
  [[ "$bad" == false && ${#clients[@]} == 0 ]]
}
base=${RUNNER_TEMP:-/tmp}
record="$base/st233a-container"
receipt="$base/st233a-proof-receipt.txt"
image=mirror.gcr.io/library/postgres:16-alpine
db=st233a_development_auth_foundation_proof
source_head=$(git rev-parse HEAD)
phase=starting passed=false tmp='' cid='' marker='' name='' created=''
private_file() {
  [[ -f "$1" && ! -L "$1" && $(stat -c %u "$1") == "$UID" && $(stat -c %a "$1") == 600 ]]
}
custody() {
  private_file "$record" || { custody_diagnostic record; return 1; }
  local rcid rmarker rname rcreated extra actual
  read -r rcid rmarker rname rcreated extra < "$record" || { custody_diagnostic record; return 1; }
  [[ -z "$extra" && "$rcid" =~ ^[a-f0-9]{64}$ && "$rmarker" =~ ^[a-f0-9]{32}$ &&
     "$rname" == "st233a-$rmarker" && "$rcreated" =~ ^[0-9T:.Z-]+$ ]] || { custody_diagnostic record; return 1; }
  [[ "$rcid" == "$cid" && "$rmarker" == "$marker" && "$rname" == "$name" && "$rcreated" == "$created" ]] || { custody_diagnostic identity; return 1; }
  actual=$(docker inspect --format '{{json .}}' "$cid" 2>/dev/null) || { custody_diagnostic inspect-unavailable; return 1; }
  local diagnostic
  diagnostic=$(python3 -c "$(cat <<'PY'
import datetime, json, math, re, sys, time
def reject(reason):
    print(reason)
    sys.exit(1)
def object_at(parent, key):
    value = parent.get(key)
    if not isinstance(value, dict): reject('null-shape')
    return value
def collection(parent, key, kind):
    if key not in parent: reject('null-shape')
    value = parent[key]
    if value is None: return kind()
    if not isinstance(value, kind): reject('null-shape')
    return value
try:
    x = json.load(sys.stdin)
    if not isinstance(x, dict): reject('null-shape')
    cid, name, created, marker, head, image = sys.argv[1:]
    config, host, settings = (object_at(x, k) for k in ('Config', 'HostConfig', 'NetworkSettings'))
    labels = object_at(config, 'Labels')
    if (x.get('Id'), x.get('Name'), x.get('Created'), labels.get('subtrack.task'), labels.get('subtrack.head'), config.get('Image')) != (cid, '/'+name, created, 'ST-233a:'+marker, head, image): reject('identity')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z', created): reject('age')
    stamp = datetime.datetime.fromisoformat(created.replace('Z', '+00:00')).timestamp()
    age = time.time() - stamp
    if not math.isfinite(stamp) or not math.isfinite(age) or not -60 <= age <= 1800: reject('age')
    networks = object_at(settings, 'Networks')
    if host.get('NetworkMode') != 'none' or set(networks) != {'none'} or not isinstance(networks['none'], dict): reject('network')
    if collection(host, 'PortBindings', dict): reject('published-port')
    ports = collection(settings, 'Ports', dict)
    if any(v not in (None, []) for v in ports.values()): reject('published-port')
    mounts = collection(x, 'Mounts', list)
    if len(mounts) != 1 or not isinstance(mounts[0], dict) or (mounts[0].get('Type'), mounts[0].get('Destination')) != ('tmpfs', '/var/lib/postgresql/data'): reject('mount')
    if host.get('Privileged') is not False or collection(host, 'CapAdd', list) or collection(host, 'Devices', list) or host.get('PidMode') != '': reject('configuration')
except (ValueError, TypeError, KeyError, OverflowError, OSError):
    reject('parse')
PY
)" "$cid" "$name" "$created" "$marker" "$source_head" "$image" <<< "$actual" 2>/dev/null) || { custody_diagnostic "${diagnostic:-parse}"; return 1; }
}
custody_diagnostic() {
  case "$1" in record|identity|inspect-unavailable|null-shape|age|network|published-port|mount|configuration|parse) printf 'ST-233a custody: FAIL reason=%s\n' "$1" >&2 ;; *) printf 'ST-233a custody: FAIL reason=parse\n' >&2 ;; esac
}
cleanup_container() {
  if [[ ! -e "$record" && ! -L "$record" ]]; then
    [[ -z "$cid" ]] || return 1
    return 0
  fi
  [[ "${container_gone:-false}" == true ]] || terminate_container || return 1
  rm -- "$record" || return 1
  [[ ! -e "$record" && ! -L "$record" ]]
}
terminate_container() {
  custody || return 1
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || return 1
  local remaining
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}' 2>/dev/null) || return 1
  [[ -z "$remaining" ]] || return 1
  container_gone=true
}
cleanup_temp() {
  [[ -n "$tmp" && -d "$tmp" && ! -L "$tmp" && $(stat -c %u "$tmp") == "$UID" && $(stat -c %a "$tmp") == 700 ]] || return 1
  local root target
  root=$(cd -P -- "$base" && pwd -P) || return 1
  target=$(cd -P -- "$tmp" && pwd -P) || return 1
  [[ "$target" == "$root/st233a."* && "${target#"$root"/}" != */* ]] || return 1
  rm -rf -- "$target" || return 1
  [[ ! -e "$target" && ! -L "$target" ]]
}
finish() {
  local status=$? bad=false cleanup_result=removed
  trap - EXIT
  if [[ ${#clients[@]} != 0 ]]; then status=1; terminate_clients || bad=true; fi
  if [[ "$bad" == true || ${#clients[@]} != 0 ]]; then
    printf 'ST-233b lifecycle: FAIL recovery=retained\n' >&2
    [[ "$source_head" =~ ^[a-f0-9]{40}$ ]] && private_file "$receipt" && printf 'ST-233a foundation: FAIL source_head=%s phase=%s cleanup=failed\n' "$source_head" "$phase" >> "$receipt"
    exit 1
  fi
  if [[ -n "$tmp" && -e "$tmp/clients" ]]; then private_file "$tmp/clients" && [[ ! -s "$tmp/clients" ]] || exit 1; fi
  if cleanup_container; then cleanup_temp || bad=true; else bad=true; fi
  if [[ "$bad" == true ]]; then status=1; cleanup_result=failed; fi
  case "$phase" in starting|fixture|migration|foundation|actor|constraints|catalog|fence|peek|reserve|prune|pins|cleanup) ;; *) status=1; phase=starting ;; esac
  [[ "$source_head" =~ ^[a-f0-9]{40}$ ]] && private_file "$receipt" || exit 1
  if [[ "$status" == 0 && "$passed" == true && "$bad" == false ]]; then
    printf 'ST-233a foundation: PASS source_head=%s cases=PG16,SCRAM,roles,RLS,ACL,domains,immutability,business-isolation,dual-GUC-reset,private-fence,private-peek,private-bootstrap-reservation,private-expired-reservation-prune,postlock-clock,rollback,reconnect,bounded-clients fixture=removed secrets=destroyed\n' "$source_head" >> "$receipt"
  else
    status=1
    printf 'ST-233a foundation: FAIL source_head=%s phase=%s cleanup=%s\n' "$source_head" "$phase" "$cleanup_result" >> "$receipt"
  fi
  exit "$status"
}
if [[ "${1:-}" == --cleanup ]]; then
  # Recovery cannot infer exit of host clients from a container removal.
  for recovery in "$base"/st233a.*/clients; do
    [[ ! -e "$recovery" ]] || { private_file "$recovery" && [[ ! -s "$recovery" ]] || exit 1; }
  done
  if [[ ! -e "$record" && ! -L "$record" ]]; then exit 0; fi
  private_file "$record" || exit 1
  read -r cid marker name created extra < "$record"
  [[ -z "${extra:-}" ]] || exit 1
  cleanup_container; exit
fi
[[ $# == 0 && $(uname -s) == Linux ]] || exit 1
for var in DATABASE_URL DIRECT_URL PGHOST PGPORT PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGDATABASE PGOPTIONS DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH; do
  [[ ! -v "$var" ]] || { printf 'ST-233a inherited credentials rejected\n' >&2; exit 1; }
done
for command in docker openssl sha256sum git python3; do command -v "$command" >/dev/null || exit 1; done
[[ ! -e "$record" && ! -L "$record" && ! -L "$receipt" ]] || exit 1
tmp=$(mktemp -d "$base/st233a.XXXXXX")
: > "$tmp/clients"
private_file "$tmp/clients" || exit 1
trap finish EXIT
trap 'interrupted=true; [[ "$registering" == true ]] || exit 1' INT TERM
inputs=(apps/api/prisma/migrations/0001_canonical_schema/migration.sql apps/api/prisma/migrations/0002_privacy_constraints/migration.sql
  apps/api/prisma/development-auth/001-epoch-nonce-reservation.sql tools/database/development-auth-foundation-proof.sh
  tools/database/test-development-auth-foundation-proof.sh ../.github/workflows/subtrack-development-auth-foundation-proof.yml
  apps/api/prisma/development-auth/002-epoch-fence.sql apps/api/prisma/development-auth/003-nonce-binding-lookup.sql apps/api/prisma/development-auth/004-bootstrap-reservation.sql apps/api/prisma/development-auth/005-expired-reservation-prune.sql)
: > "$receipt"
for path in "${inputs[@]}"; do
  blob=$(git hash-object "$path")
  [[ "$blob" == $(git rev-parse "$source_head:$(git ls-files --full-name "$path")") ]] || exit 1
  printf '%s %s %s\n' "$path" "$blob" "$(sha256sum "$path" | cut -d ' ' -f1)" >> "$tmp/pins"
  printf 'ST-233a input=%s blob=%s sha256=%s\n' "$path" "$blob" "$(sha256sum "$path" | cut -d ' ' -f1)" >> "$receipt"
done
owner_pass=$(openssl rand -hex 24) actor_pass=$(openssl rand -hex 24) marker=$(openssl rand -hex 16)
name="st233a-$marker"
printf 'POSTGRES_USER=st233a_fixture_owner\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n' "$db" "$owner_pass" > "$tmp/container.env"
printf '127.0.0.1:5432:%s:st233a_fixture_owner:%s\n127.0.0.1:5432:%s:subtrack_dev_auth_login:%s\n' "$db" "$owner_pass" "$db" "$actor_pass" > "$tmp/pgpass"
private_file "$tmp/container.env" && private_file "$tmp/pgpass" || exit 1
phase=fixture
docker create --name "$name" --label "subtrack.task=ST-233a:$marker" --label "subtrack.head=$source_head" --network none \
  --mount type=tmpfs,destination=/var/lib/postgresql/data --env-file "$tmp/container.env" "$image" > "$tmp/cid" 2> "$tmp/create.log"
cid=$(cat "$tmp/cid")
[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || exit 1
created=$(docker inspect --format '{{.Created}}' "$cid" 2>/dev/null)
printf '%s %s %s %s\n' "$cid" "$marker" "$name" "$created" > "$record"
custody || exit 1
docker start "$cid" >/dev/null 2>&1
ready=false
for attempt in {1..60}; do
  if docker exec "$cid" pg_isready -U st233a_fixture_owner -d "$db" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
custody || exit 1
docker cp "$tmp/pgpass" "$cid:/tmp/st233a.pgpass" >/dev/null 2>&1
owner_pass='' actor_secret="$actor_pass" actor_pass=''
sql() {
  local input
  input=$(mktemp "$tmp/input.XXXXXX")
  private_file "$input" || return 1
  cat > "$input"
  sequence=$((sequence+1))
  launch_client "$1" "$input" "st233b-sync-$sequence" || return 1
  join_client "$client_pid"
}
owner() { sql st233a_fixture_owner; }
actor() { sql subtrack_dev_auth_login; }
assert_owner() { printf 'SELECT 1 / COALESCE((%s),false)::integer;\n' "$1" | owner; }
deny_actor() { if printf '%s\n' "$1" | actor; then return 1; fi; grep -q 'ERROR:  42501' "$client_log"; }
deny_executor() {
  if printf 'SET ROLE subtrack_auth_executor; %s\n' "$1" | owner; then return 1; fi
  grep -q "ERROR:  ${2:-42501}" "$client_log"
}
phase=migration
for path in "${inputs[@]:0:2}"; do owner < "$path" || exit 1; done
printf "REVOKE TEMPORARY, CREATE ON DATABASE %s FROM PUBLIC; CREATE TABLE public.st233a_fixture_control(task text, head text, marker text); REVOKE ALL ON public.st233a_fixture_control FROM PUBLIC; INSERT INTO public.st233a_fixture_control VALUES ('ST-233a','%s','%s');\n" "$db" "$source_head" "$marker" | owner
phase=foundation
for bad in head marker; do
  badhead="$source_head" badmarker="$marker"
  [[ "$bad" != head ]] || badhead=invalid
  [[ "$bad" != marker ]] || badmarker=invalid
  if { printf "SET st233a.head='%s'; SET st233a.marker='%s';\n" "$badhead" "$badmarker"; cat "${inputs[2]}"; } | owner; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='subtrack_auth') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='subtrack_auth_owner')"
done
{ printf "SET st233a.head='%s'; SET st233a.marker='%s';\n" "$source_head" "$marker"; cat "${inputs[2]}"; } | owner
printf "ALTER ROLE subtrack_dev_auth_login PASSWORD '%s';\n" "$actor_secret" | owner
actor_secret=''
assert_owner "(SELECT rolpassword LIKE 'SCRAM-SHA-256\$%%' FROM pg_catalog.pg_authid WHERE rolname='subtrack_dev_auth_login')"
phase=actor
printf "SELECT 1/(SESSION_USER='subtrack_dev_auth_login' AND CURRENT_USER=SESSION_USER)::integer;\n" | actor
for role in subtrack_dev_auth_login subtrack_runtime subtrack_identity_provisioner subtrack_auth_producer; do
  prefix=''; [[ "$role" == subtrack_dev_auth_login ]] || prefix="SET ROLE $role;"
  for probe in 'SELECT * FROM subtrack_auth.epoch' 'SELECT * FROM subtrack_auth.reservation' 'SELECT * FROM subtrack_auth.nonce' \
    'INSERT INTO subtrack_auth.epoch DEFAULT VALUES' 'INSERT INTO subtrack_auth.reservation DEFAULT VALUES' 'INSERT INTO subtrack_auth.nonce DEFAULT VALUES' \
    'UPDATE subtrack_auth.epoch SET watermark_ms=1' 'UPDATE subtrack_auth.reservation SET state='"'failed'" \
    'DELETE FROM subtrack_auth.reservation' 'DELETE FROM subtrack_auth.nonce' 'SET ROLE subtrack_auth_executor' 'SET ROLE subtrack_auth_owner' \
    'CREATE SCHEMA forbidden' 'CREATE TEMP TABLE forbidden(id int)' 'CREATE TYPE public.forbidden AS ENUM ('"'x'"')' \
    'CREATE TYPE subtrack_auth.forbidden AS ENUM ('"'x'"')' 'CREATE FUNCTION subtrack_auth.forbidden() RETURNS int LANGUAGE sql AS '"'SELECT 1'" \
    'CREATE FUNCTION public.forbidden() RETURNS int LANGUAGE sql AS '"'SELECT 1'" 'CREATE ROLE forbidden'; do
    deny_actor "$prefix $probe;" || exit 1
  done
done
deny_actor 'SELECT id FROM public.identity;' || exit 1
printf "INSERT INTO public.identity(id,external_id,auth_method,updated_at) VALUES ('00000000-0000-0000-0000-000000000001','st233a-a','MOCK',CURRENT_TIMESTAMP),('00000000-0000-0000-0000-000000000002','st233a-b','MOCK',CURRENT_TIMESTAMP);\n" | owner
cat > "$tmp/actor.sql" <<'SQL'
SET search_path=pg_catalog;
BEGIN; SET LOCAL ROLE subtrack_runtime;
SELECT pg_catalog.set_config('app.user_id','00000000-0000-0000-0000-000000000001',true), pg_catalog.set_config('app.current_user_id','00000000-0000-0000-0000-000000000001',true);
SELECT 1 / ((SELECT count(*) FROM public.identity)=1 AND NOT EXISTS(SELECT 1 FROM public.identity WHERE id='00000000-0000-0000-0000-000000000002'))::integer;
COMMIT;
RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path; SET search_path=pg_catalog;
SELECT 1/(SESSION_USER=CURRENT_USER AND pg_catalog.current_setting('search_path')='pg_catalog' AND COALESCE(pg_catalog.current_setting('app.user_id',true),'')='' AND COALESCE(pg_catalog.current_setting('app.current_user_id',true),'')='')::integer;
BEGIN; SET LOCAL ROLE subtrack_auth_producer; SET LOCAL search_path=public;
SELECT pg_catalog.set_config('app.user_id','st233a-fault',true),pg_catalog.set_config('app.current_user_id','st233a-fault',true);
ROLLBACK;
RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path; SET search_path=pg_catalog;
SELECT 1/(SESSION_USER=CURRENT_USER AND pg_catalog.current_setting('search_path')='pg_catalog' AND COALESCE(pg_catalog.current_setting('app.user_id',true),'')='' AND COALESCE(pg_catalog.current_setting('app.current_user_id',true),'')='')::integer;
BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL search_path=public;
SELECT pg_catalog.set_config('app.user_id','st233a-fault',true),pg_catalog.set_config('app.current_user_id','st233a-fault',true);
\set ON_ERROR_STOP off
SELECT 1/0;
\set ON_ERROR_STOP on
ROLLBACK;
RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path; SET search_path=pg_catalog;
SELECT 1/(SESSION_USER=CURRENT_USER AND pg_catalog.current_setting('search_path')='pg_catalog' AND COALESCE(pg_catalog.current_setting('app.user_id',true),'')='' AND COALESCE(pg_catalog.current_setting('app.current_user_id',true),'')='')::integer;
SQL
actor < "$tmp/actor.sql"
phase=constraints
printf "INSERT INTO subtrack_auth.epoch VALUES ('fixture',repeat('a',64),'https://st233a.invalid',0,'active');\n" | owner
nonce="INSERT INTO subtrack_auth.nonce VALUES (repeat('b',64),'web','https://st233a.invalid','chain',repeat('c',64),'fixture',0,300000,'session',NULL);"
reservation="INSERT INTO subtrack_auth.reservation VALUES (repeat('d',64),'operation','browser',repeat('a',64),repeat('b',64),repeat('e',64),'web','fixture',0,1,'pending');"
printf 'SET ROLE subtrack_auth_executor; %s %s UPDATE subtrack_auth.epoch SET watermark_ms=1; UPDATE subtrack_auth.reservation SET state='"'completed'"'; RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path;\n' "$nonce" "$reservation" | owner
nonce="${nonce/repeat(\'b\',64)/repeat(\'f\',64)}"
reservation_bad="${reservation/repeat(\'d\',64)/repeat(\'f\',64)}"
reservation_bad="${reservation_bad/repeat(\'e\',64)/repeat(\'f\',64)}"
for probe in "SELECT 'bad'::subtrack_auth.h" "SELECT repeat('A',64)::subtrack_auth.h" "SELECT (-1)::subtrack_auth.ms" "SELECT 9007199254740992::subtrack_auth.ms" \
  "${nonce/300000/299999}" "${nonce/300000/0}" \
  "${nonce/https:\/\/st233a.invalid/https:\/\/foreign.invalid}" "${nonce/\'session\'/\'wrong\'}" "${nonce/\'chain\'/\'\'}" "${nonce/\'web\'/\'mobile\'}" \
  "${reservation_bad/0,1/0,86400001}" "${reservation_bad/0,1/1,1}" "${reservation_bad/\'pending\'/\'wrong\'}" \
  "${reservation_bad/\'operation\'/\'\'}" "${reservation_bad/\'browser\'/\'\'}" "${reservation_bad/\'web\'/\'mobile\'}"; do
  deny_executor "$probe" 23514 || exit 1
done
deny_executor "${nonce/fixture/unknown}" 23503 || exit 1
deny_executor "${reservation_bad/fixture/unknown}" 23503 || exit 1
deny_executor "${nonce/repeat(\'f\',64)/NULL}" 23502 || exit 1
deny_executor "${reservation/\'operation\'/\'different\'}" 23505 || exit 1
deny_executor "${reservation/repeat(\'d\',64)/repeat(\'f\',64)}" 23505 || exit 1
deny_executor "${nonce/repeat(\'f\',64)/repeat(\'b\',64)}" 23505 || exit 1
# The trusted migration actor alone may insert epoch rows; require CHECK failures.
for probe in "INSERT INTO subtrack_auth.epoch VALUES ('',repeat('a',64),'https://st233a.invalid',0,'active')" \
  "INSERT INTO subtrack_auth.epoch VALUES ('bad-state',repeat('a',64),'https://st233a.invalid',0,'unknown')"; do
  if printf '%s;\n' "$probe" | owner; then exit 1; fi
  grep -q 'ERROR:  23514' "$client_log" || exit 1
done
# NULL checks use otherwise valid, fresh tuples, so uniqueness cannot mask them.
for table in epoch reservation nonce; do
  case "$table" in
    epoch) values=("'null-probe'" "repeat('a',64)" "'https://st233a.invalid'" 0 "'active'") ;;
    reservation) values=("repeat('f',64)" "'operation'" "'browser'" "repeat('a',64)" "repeat('b',64)" "repeat('f',64)" "'web'" "'fixture'" 0 1 "'pending'") ;;
    nonce) values=("repeat('f',64)" "'web'" "'https://st233a.invalid'" "'chain'" "repeat('c',64)" "'fixture'" 0 300000 "'session'") ;;
  esac
  for index in "${!values[@]}"; do
    tuple=("${values[@]}"); tuple[$index]=NULL
    joined=$(IFS=,; printf '%s' "${tuple[*]}")
    if [[ "$table" == epoch ]]; then
      if printf 'INSERT INTO subtrack_auth.epoch VALUES (%s);\n' "$joined" | owner; then exit 1; fi
      grep -q 'ERROR:  23502' "$client_log" || exit 1
    else
      [[ "$table" != nonce ]] || joined+=,NULL
      deny_executor "INSERT INTO subtrack_auth.$table VALUES ($joined);" 23502 || exit 1
    fi
  done
done
for table in epoch reservation nonce; do
  while read -r column; do
    [[ "$table.$column" == epoch.watermark_ms || "$table.$column" == reservation.state ]] && continue
    deny_executor "UPDATE subtrack_auth.$table SET $column=$column;" || exit 1
  done < <(case "$table" in epoch) printf '%s\n' id manifest_h origin watermark_ms state ;; reservation) printf '%s\n' key_h operation authority_kind authority_h request_h owner_h transport epoch issued_ms expires_ms state ;; nonce) printf '%s\n' nonce_h transport origin chain binding_h epoch issued_ms expires_ms purpose authority_h ;; esac)
done
phase=catalog
cat > "$tmp/catalog.sql" <<'SQL'
SELECT 1 / (count(*)=4 AND bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolinherit AND rolcanlogin=(rolname='subtrack_dev_auth_login')))::integer FROM pg_catalog.pg_roles WHERE rolname IN ('subtrack_auth_owner','subtrack_auth_executor','subtrack_auth_producer','subtrack_dev_auth_login');
SELECT 1 / (count(*)=3 AND bool_and(NOT admin_option AND NOT inherit_option AND set_option AND roleid IN ('subtrack_runtime'::regrole,'subtrack_identity_provisioner'::regrole,'subtrack_auth_producer'::regrole)))::integer FROM pg_catalog.pg_auth_members WHERE member='subtrack_dev_auth_login'::regrole;
SELECT 1 / (NOT EXISTS(WITH RECURSIVE members(id) AS (SELECT roleid FROM pg_catalog.pg_auth_members WHERE member='subtrack_dev_auth_login'::regrole UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN members p ON m.member=p.id) SELECT 1 FROM members WHERE id NOT IN ('subtrack_runtime'::regrole,'subtrack_identity_provisioner'::regrole,'subtrack_auth_producer'::regrole)))::integer;
SELECT 1 / (count(*)=3 AND bool_and(relowner='subtrack_auth_owner'::regrole AND relrowsecurity AND relforcerowsecurity))::integer FROM pg_catalog.pg_class WHERE relnamespace='subtrack_auth'::regnamespace AND relkind='r';
SELECT 1 / (count(*)=9 AND bool_and(polroles=ARRAY['subtrack_auth_executor'::regrole::oid] AND polpermissive))::integer FROM pg_catalog.pg_policy WHERE polrelid IN ('subtrack_auth.epoch'::regclass,'subtrack_auth.nonce'::regclass,'subtrack_auth.reservation'::regclass);
SELECT 1 / bool_and((c.relname,p.polname,p.polcmd) IN (('epoch','epoch_select','r'),('epoch','epoch_watermark','w'),('reservation','reservation_select','r'),('reservation','reservation_insert','a'),('reservation','reservation_delete','d'),('reservation','reservation_settle','w'),('nonce','nonce_select','r'),('nonce','nonce_insert','a'),('nonce','nonce_delete','d')) AND (CASE WHEN p.polcmd='a' THEN p.polqual IS NULL ELSE pg_catalog.pg_get_expr(p.polqual,p.polrelid)='true' END) AND (CASE WHEN p.polcmd IN ('a','w') THEN pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)='true' ELSE p.polwithcheck IS NULL END))::integer FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='subtrack_auth'::regnamespace;
SELECT 1 / (count(*)=2 AND bool_and(typowner='subtrack_auth_owner'::regrole))::integer FROM pg_catalog.pg_type WHERE typnamespace='subtrack_auth'::regnamespace AND typtype='d';
SELECT 1 / (count(*)=2 AND bool_and((typname,typbasetype) IN (('h','pg_catalog.text'::regtype),('ms','pg_catalog.int8'::regtype))))::integer FROM pg_catalog.pg_type WHERE typnamespace='subtrack_auth'::regnamespace AND typtype='d';
SELECT 1 / (nspowner='subtrack_auth_owner'::regrole)::integer FROM pg_catalog.pg_namespace WHERE nspname='subtrack_auth';
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace))::integer;
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='subtrack_auth'::regnamespace AND NOT t.tgisinternal))::integer;
SELECT 1 / (count(*)=26 AND bool_and(NOT atthasdef AND NOT attisdropped))::integer FROM pg_catalog.pg_attribute WHERE attrelid IN ('subtrack_auth.epoch'::regclass,'subtrack_auth.nonce'::regclass,'subtrack_auth.reservation'::regclass) AND attnum>0;
WITH expected(name,columns,types) AS (VALUES ('epoch',ARRAY['id','manifest_h','origin','watermark_ms','state'],ARRAY['text','subtrack_auth.h','text','subtrack_auth.ms','text']),('reservation',ARRAY['key_h','operation','authority_kind','authority_h','request_h','owner_h','transport','epoch','issued_ms','expires_ms','state'],ARRAY['subtrack_auth.h','text','text','subtrack_auth.h','subtrack_auth.h','subtrack_auth.h','text','text','subtrack_auth.ms','subtrack_auth.ms','text']),('nonce',ARRAY['nonce_h','transport','origin','chain','binding_h','epoch','issued_ms','expires_ms','purpose','authority_h'],ARRAY['subtrack_auth.h','text','text','text','subtrack_auth.h','text','subtrack_auth.ms','subtrack_auth.ms','text','subtrack_auth.h'])) SELECT 1 / (count(*)=3 AND bool_and(e.columns=(SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0) AND e.types=(SELECT array_agg(pg_catalog.format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0)))::integer FROM expected e JOIN pg_catalog.pg_class c ON c.relname=e.name AND c.relnamespace='subtrack_auth'::regnamespace;
SELECT 1 / bool_and(pg_catalog.has_column_privilege('subtrack_auth_executor',c.oid,a.attnum,'SELECT') AND pg_catalog.has_column_privilege('subtrack_auth_executor',c.oid,a.attnum,'INSERT')=(c.relname IN ('reservation','nonce')) AND pg_catalog.has_column_privilege('subtrack_auth_executor',c.oid,a.attnum,'UPDATE')=((c.relname,a.attname) IN (('epoch','watermark_ms'),('reservation','state'))) AND NOT pg_catalog.has_column_privilege('subtrack_auth_executor',c.oid,a.attnum,'REFERENCES'))::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='subtrack_auth'::regnamespace AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped;
SELECT 1 / bool_and(pg_catalog.has_table_privilege('subtrack_auth_executor',oid,'DELETE')=(relname IN ('reservation','nonce')) AND NOT pg_catalog.has_table_privilege('subtrack_auth_executor',oid,'UPDATE,TRUNCATE,REFERENCES,TRIGGER'))::integer FROM pg_catalog.pg_class WHERE relnamespace='subtrack_auth'::regnamespace AND relkind='r';
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid IN ('subtrack_auth.epoch'::regclass,'subtrack_auth.nonce'::regclass,'subtrack_auth.reservation'::regclass) AND attnum>0 AND NOT attisdropped AND NOT attnotnull AND NOT(attrelid='subtrack_auth.nonce'::regclass AND attname='authority_h')))::integer;
SELECT 1 / (count(*)=4 AND bool_and(NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(d.defaclacl) a WHERE a.grantee=0)))::integer FROM pg_catalog.pg_default_acl d WHERE defaclrole IN ('subtrack_auth_owner'::regrole,'subtrack_auth_executor'::regrole) AND defaclnamespace=0 AND defaclobjtype IN ('f','T');
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE c.relnamespace='subtrack_auth'::regnamespace AND a.grantee=0))::integer;
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE c.relnamespace='subtrack_auth'::regnamespace AND a.grantee NOT IN ('subtrack_auth_owner'::regrole,'subtrack_auth_executor'::regrole)) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid, LATERAL pg_catalog.aclexplode(a.attacl) x WHERE c.relnamespace='subtrack_auth'::regnamespace AND x.grantee NOT IN ('subtrack_auth_owner'::regrole,'subtrack_auth_executor'::regrole)))::integer;
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t, LATERAL pg_catalog.aclexplode(COALESCE(t.typacl,pg_catalog.acldefault('T',t.typowner))) a WHERE t.typnamespace='subtrack_auth'::regnamespace AND t.typtype='d' AND a.grantee=0))::integer;
SELECT 1 / (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n,LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE n.nspname='subtrack_auth' AND a.grantee=0))::integer;
SELECT 1 / (NOT pg_catalog.has_table_privilege('subtrack_identity_provisioner','public.identity','UPDATE,DELETE') AND NOT pg_catalog.has_column_privilege('subtrack_identity_provisioner','public.identity','email','SELECT') AND pg_catalog.has_column_privilege('subtrack_identity_provisioner','public.identity','id','SELECT') AND pg_catalog.has_column_privilege('subtrack_identity_provisioner','public.identity','external_id','SELECT') AND pg_catalog.has_table_privilege('subtrack_identity_provisioner','public.identity','INSERT'))::integer;
RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path;
SELECT 1/(CURRENT_USER=SESSION_USER AND COALESCE(pg_catalog.current_setting('app.user_id',true),'')='' AND COALESCE(pg_catalog.current_setting('app.current_user_id',true),'')='')::integer;
SQL
owner < "$tmp/catalog.sql"
# Capture exact accepted-001 constraint definitions before adding any functions.
printf "SELECT md5(string_agg(format('%%s:%%s:%%s:%%s:%%s',c.conname,c.contype,c.convalidated,c.condeferrable,pg_get_constraintdef(c.oid)),E'\\n' ORDER BY c.conname,c.oid)) FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::regnamespace;\n" | owner
constraints_pin=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log")
[[ "$constraints_pin" =~ ^[a-f0-9]{32}$ ]] || exit 1
phase=fence
for bad in head marker; do
  badhead="$source_head" badmarker="$marker"
  [[ "$bad" != head ]] || badhead=invalid
  [[ "$bad" != marker ]] || badmarker=invalid
  if { printf "SET st233a.head='%s'; SET st233a.marker='%s';\n" "$badhead" "$badmarker"; cat "${inputs[6]}"; } | owner; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace)"
done
{ printf "SET st233a.head='%s'; SET st233a.marker='%s';\n" "$source_head" "$marker"; cat "${inputs[6]}"; } | owner
cat > "$tmp/fence-catalog.sql" <<'SQL'
SELECT 1/(count(*)=1 AND bool_and(p.proname='fence' AND p.proowner='subtrack_auth_executor'::regrole AND p.prorettype='pg_catalog.bool'::regtype AND p.proargtypes=ARRAY[25::oid,'subtrack_auth.h'::regtype::oid,'subtrack_auth.ms'::regtype::oid]::oidvector AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')))::integer FROM pg_catalog.pg_proc p WHERE p.pronamespace='subtrack_auth'::regnamespace;
WITH actual AS (SELECT a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.oid='subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms)'::regprocedure), expected AS (SELECT 'subtrack_auth_executor'::regrole::oid grantor,r.role::regrole::oid grantee,'EXECUTE'::text privilege_type,false is_grantable FROM (VALUES ('subtrack_auth_executor'),('subtrack_runtime'),('subtrack_auth_producer')) r(role)), delta AS ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual)) SELECT 1/(NOT EXISTS(SELECT 1 FROM delta))::integer;
SELECT 1/(NOT pg_catalog.has_schema_privilege('subtrack_auth_executor','subtrack_auth','CREATE') AND NOT pg_catalog.has_function_privilege('subtrack_dev_auth_login','subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms)','EXECUTE') AND NOT pg_catalog.has_function_privilege('subtrack_identity_provisioner','subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms)','EXECUTE'))::integer;
SQL
owner < "$tmp/fence-catalog.sql"
deny_actor "SELECT subtrack_auth.fence('fixture',repeat('a',64)::subtrack_auth.h,0::subtrack_auth.ms);" || exit 1
deny_actor "SET ROLE subtrack_identity_provisioner; SELECT subtrack_auth.fence('fixture',repeat('a',64)::subtrack_auth.h,0::subtrack_auth.ms);" || exit 1
printf "INSERT INTO subtrack_auth.epoch VALUES ('retired',repeat('a',64),'https://st233a.invalid',0,'retired'),('regression',repeat('a',64),'https://st233a.invalid',9007199254740991,'active'),('parallel',repeat('a',64),'https://st233a.invalid',0,'active');\n" | owner
reset_sql="RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path; SET search_path=pg_catalog; SELECT 1/(SESSION_USER=CURRENT_USER AND pg_catalog.current_setting('search_path')='pg_catalog' AND COALESCE(pg_catalog.current_setting('app.user_id',true),'')='' AND COALESCE(pg_catalog.current_setting('app.current_user_id',true),'')='')::integer;"
for role in subtrack_runtime subtrack_auth_producer; do
  printf "SELECT watermark_ms FROM subtrack_auth.epoch WHERE id='fixture';\n" | owner
  before_ms=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log")
  [[ "$before_ms" =~ ^[0-9]+$ ]] || exit 1
  for args in "NULL,repeat('a',64),0" "'',repeat('a',64),0" "'fixture',NULL,0" "'fixture',repeat('a',64),NULL" "'absent',repeat('a',64),0" "'retired',repeat('a',64),0" "'fixture',repeat('b',64),0" "'fixture',repeat('a',64),9007199254740991" "'regression',repeat('a',64),0"; do
    printf 'BEGIN; SET LOCAL ROLE %s; SET LOCAL search_path=public; SELECT 1/(NOT subtrack_auth.fence(%s))::integer; COMMIT; %s\n' "$role" "$args" "$reset_sql" | actor
  done
  assert_owner "(SELECT watermark_ms=$before_ms FROM subtrack_auth.epoch WHERE id='fixture')"
  for invalid in "'fixture','bad',0" "'fixture',repeat('a',64),-1" "'fixture',repeat('a',64),9007199254740992"; do
    if printf 'BEGIN; SET LOCAL ROLE %s; SELECT subtrack_auth.fence(%s);\n' "$role" "$invalid" | actor; then exit 1; fi
    grep -q 'ERROR:  23514' "$client_log" || exit 1
  done
  if printf "BEGIN; SET LOCAL ROLE %s; SELECT subtrack_auth.fence('fixture',repeat('a',64),'overflow');\n" "$role" | actor; then exit 1; fi
  grep -q 'ERROR:  22P02' "$client_log" || exit 1
  printf 'BEGIN; SET LOCAL ROLE %s; SET LOCAL search_path=public; SELECT 1/subtrack_auth.fence('\''fixture'\'',repeat('\''a'\'',64),0)::integer; COMMIT; %s\n' "$role" "$reset_sql" | actor
  # A fresh SCRAM client reconnects to the SAME epoch; no fallback epoch.
  assert_owner "(SELECT watermark_ms>1 AND watermark_ms<=floor(extract(epoch FROM clock_timestamp())*1000) FROM subtrack_auth.epoch WHERE id='fixture')"
  printf 'BEGIN; SET LOCAL ROLE %s; SELECT 1/subtrack_auth.fence('\''fixture'\'',repeat('\''a'\'',64),0)::integer; COMMIT; %s\n' "$role" "$reset_sql" | actor
  printf 'BEGIN; SET LOCAL ROLE %s; SET LOCAL search_path=public; SET LOCAL app.user_id='\''fault'\''; SET LOCAL app.current_user_id='\''fault'\'';\n\\set ON_ERROR_STOP off\nSELECT subtrack_auth.fence('\''fixture'\'','\''invalid'\'',0);\n\\set ON_ERROR_STOP on\nROLLBACK; %s\n' "$role" "$reset_sql" | actor
done
assert_owner "(SELECT watermark_ms=0 FROM subtrack_auth.epoch WHERE id='retired') AND (SELECT watermark_ms=9007199254740991 FROM subtrack_auth.epoch WHERE id='regression')"
printf "SELECT 1/(floor(0::numeric*1000)=0 AND floor(9007199254740.991::numeric*1000)=9007199254740991 AND floor(9007199254740.992::numeric*1000)>9007199254740991)::integer;\n" | owner
# Holder and waiter get row locks ONLY inside the exact fence function.
for outcome in COMMIT ROLLBACK; do
  assert_owner "(SELECT watermark_ms=0 FROM subtrack_auth.epoch WHERE id='parallel')"
  fifo=$(mktemp -u "$tmp/holder.XXXXXX"); mkfifo -m 600 "$fifo"
  [[ -p "$fifo" && ! -L "$fifo" && $(stat -c %u "$fifo") == "$UID" && $(stat -c %a "$fifo") == 600 ]] || exit 1
  exec {writer}<>"$fifo"; writers[holder]=$writer
  launch_client subtrack_dev_auth_login "$fifo" st233b-holder
  holder_pid=$client_pid holder_log=$client_log
  printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; SELECT 1/subtrack_auth.fence('parallel',repeat('a',64),0)::integer;\n" >&"$writer"
  observer=$(mktemp "$tmp/observer.XXXXXX"); private_file "$observer" || exit 1
  waiter_pid=''
  observe_clients "SELECT count(*)=1 FROM pg_catalog.pg_stat_activity WHERE datname='$db' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';" '^ t *$' || exit 1
  printf "SELECT pid FROM pg_catalog.pg_stat_activity WHERE datname='%s' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';\n" "$db" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  holder_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log")
  [[ "$holder_backend" =~ ^[0-9]+$ ]] || exit 1
  waiter=$(mktemp "$tmp/waiter.XXXXXX"); private_file "$waiter" || exit 1
  printf "BEGIN; SET LOCAL ROLE subtrack_auth_producer; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; SELECT 1/subtrack_auth.fence('parallel',repeat('a',64),0)::integer; COMMIT; %s\n" "$reset_sql" > "$waiter"
  launch_client subtrack_dev_auth_login "$waiter" st233b-waiter
  waiter_pid=$client_pid waiter_log=$client_log
  observe_clients "SELECT w.pid FROM pg_catalog.pg_stat_activity h JOIN pg_catalog.pg_stat_activity w ON h.pid<>w.pid WHERE h.pid=$holder_backend AND h.datname='$db' AND w.datname=h.datname AND h.usename='subtrack_dev_auth_login' AND w.usename=h.usename AND h.application_name='st233b-holder' AND w.application_name='st233b-waiter' AND h.state='idle in transaction' AND w.wait_event_type='Lock' AND h.pid=ANY(pg_catalog.pg_blocking_pids(w.pid));" '^[ ]*[0-9]+[ ]*$' || exit 1
  waiter_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log")
  [[ "$waiter_backend" =~ ^[0-9]+$ && "$waiter_backend" != "$holder_backend" ]] || exit 1
  printf "SELECT 1/(count(*)=1)::integer FROM pg_catalog.pg_stat_activity h JOIN pg_catalog.pg_stat_activity w ON h.pid<>w.pid WHERE h.pid=%s AND w.pid=%s AND h.datname='%s' AND w.datname=h.datname AND h.usename='subtrack_dev_auth_login' AND w.usename=h.usename AND h.application_name='st233b-holder' AND w.application_name='st233b-waiter' AND h.state='idle in transaction' AND w.wait_event_type='Lock' AND h.pid=ANY(pg_catalog.pg_blocking_pids(w.pid));\n" "$holder_backend" "$waiter_backend" "$db" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  # Sample a lower bound AFTER observing the edge and BEFORE releasing the lock.
  printf "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint;\n" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  release_ms=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log" | tail -1)
  [[ "$release_ms" =~ ^[0-9]+$ ]] || exit 1
  printf '%s; %s\n\\q\n' "$outcome" "$reset_sql" >&"$writer"
  close_writers
  join_client "$holder_pid" 25000 && join_client "$waiter_pid" 25000 || exit 1
  ! grep -q 'ERROR:' "$holder_log" && ! grep -q 'ERROR:' "$waiter_log" || exit 1
  assert_owner "(SELECT watermark_ms >= $release_ms AND watermark_ms<=floor(extract(epoch FROM clock_timestamp())*1000) FROM subtrack_auth.epoch WHERE id='parallel')"
  printf "UPDATE subtrack_auth.epoch SET watermark_ms=0 WHERE id='parallel';\n" | owner
done
# A successful but rolled-back fence leaves the persisted watermark untouched.
printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT 1/subtrack_auth.fence('parallel',repeat('a',64),0)::integer; ROLLBACK; %s\n" "$reset_sql" | actor
assert_owner "(SELECT watermark_ms=0 FROM subtrack_auth.epoch WHERE id='parallel')"
phase=peek
peek_signature='subtrack_auth.peek(subtrack_auth.h,subtrack_auth.h,text,text,subtrack_auth.h,subtrack_auth.ms,text)'
for bad in head marker constraints; do
  badhead="$source_head" badmarker="$marker" badconstraints="$constraints_pin"
  case "$bad" in head) badhead=invalid ;; marker) badmarker=invalid ;; constraints) badconstraints=invalid ;; esac
  if { printf "SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$badhead" "$badmarker" "$badconstraints"; cat "${inputs[7]}"; } | owner; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "(SELECT count(*)=1 AND bool_and(proname='fence') FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace)"
done
# Exact parent-definition and ACL tampering must refuse before CREATE; rollback the fixture-only fault.
for fault in "ALTER FUNCTION subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms) SET search_path=public;" "GRANT EXECUTE ON FUNCTION subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms) TO PUBLIC;" "ALTER TABLE subtrack_auth.nonce DROP CONSTRAINT nonce_check;" "CREATE OR REPLACE FUNCTION subtrack_auth.fence(epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog AS 'BEGIN RETURN false; END';"; do
  { printf "BEGIN; %s SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$fault" "$source_head" "$marker" "$constraints_pin"; sed '/^BEGIN;$/d;/^COMMIT;$/d' "${inputs[7]}"; } > "$tmp/guard-fault.sql"
  if owner < "$tmp/guard-fault.sql"; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "(SELECT count(*)=1 AND bool_and(proname='fence') FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace)"
done
{ printf "SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$source_head" "$marker" "$constraints_pin"; cat "${inputs[7]}"; } | owner
assert_owner "(SELECT count(*)=2 FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace)"
cat > "$tmp/peek-catalog.sql" <<'SQL'
SELECT 1/(p.proowner='subtrack_auth_executor'::regrole AND p.prorettype='text'::regtype AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql'))::integer FROM pg_catalog.pg_proc p WHERE p.oid='subtrack_auth.peek(subtrack_auth.h,subtrack_auth.h,text,text,subtrack_auth.h,subtrack_auth.ms,text)'::regprocedure;
WITH actual AS (SELECT a.* FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.pronamespace='subtrack_auth'::regnamespace), expected AS (SELECT 'subtrack_auth_executor'::regrole::oid grantor,r.role::regrole::oid grantee,'EXECUTE'::text privilege_type,false is_grantable FROM (VALUES ('subtrack_auth_executor'),('subtrack_runtime'),('subtrack_auth_producer')) r(role) CROSS JOIN generate_series(1,2)), delta AS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) SELECT 1/(NOT EXISTS(SELECT 1 FROM delta))::integer;
SQL
owner < "$tmp/peek-catalog.sql"
peek_args="repeat('1',64),repeat('c',64),'https://st233a.invalid','fixture',repeat('a',64),0,'session'"
for prefix in '' 'SET ROLE subtrack_identity_provisioner;'; do deny_actor "$prefix SELECT subtrack_auth.peek($peek_args);" || exit 1; done
# Fresh actual rows; fixed digest values are synthetic fixtures, not session-cookie digest substitutes.
printf "INSERT INTO subtrack_auth.nonce SELECT repeat(i::text,64),'web','https://st233a.invalid','peek-chain-'||p,repeat('c',64),'fixture',t.ms,t.ms+300000,p,NULL FROM (VALUES (1,'session'),(2,'enroll_identifier'),(3,'otp_step_up')) v(i,p) CROSS JOIN (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000 ms) t;\n" | owner
positive_peek_sql() {
  printf "SELECT 1/COALESCE((subtrack_auth.peek(%s)='%s'),false)::integer;" "$1" "$2"
}
snapshot_private() {
  printf "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM subtrack_auth.epoch e),(SELECT jsonb_agg(to_jsonb(n) ORDER BY nonce_h) FROM subtrack_auth.nonce n),(SELECT jsonb_agg(to_jsonb(r) ORDER BY key_h) FROM subtrack_auth.reservation r))::text);\n" | owner
  snapshot=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log")
  [[ "$snapshot" =~ ^[a-f0-9]{32}$ ]]
}
snapshot_private; before_peek=$snapshot
# Real SQL NULL-return mutation, transaction-local and rolled back on the exact assertion error.
# Both positive paths use the identical generated assertion, not a NULL transcript/shell stub.
for role in subtrack_runtime subtrack_auth_producer; do
  {
    printf "BEGIN; CREATE OR REPLACE FUNCTION subtrack_auth.peek(nonce_h subtrack_auth.h,binding_h subtrack_auth.h,origin text,epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms,purpose text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE CALLED ON NULL INPUT SET search_path=pg_catalog AS 'BEGIN RETURN NULL; END'; SET LOCAL ROLE %s;\n" "$role"
    positive_peek_sql "$peek_args" 'peek-chain-session'
  } > "$tmp/peek-null-fault.sql"
  if owner < "$tmp/peek-null-fault.sql"; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "(SELECT md5(prosrc)='25e9a0516ed61e024d99e51cd83b2ee0' FROM pg_catalog.pg_proc WHERE oid='$peek_signature'::regprocedure)"
  owner < "$tmp/peek-catalog.sql"
  snapshot_private; [[ "$snapshot" == "$before_peek" ]] || exit 1
done
for role in subtrack_runtime subtrack_auth_producer; do
  for pair in '1 session' '2 enroll_identifier' '3 otp_step_up'; do
    read -r digit purpose <<< "$pair"
    # Independent SCRAM reconnects, commit and rollback, altered caller search_path and both GUCs.
    for outcome in COMMIT ROLLBACK; do
      printf "BEGIN; SET LOCAL ROLE %s; SET LOCAL search_path=public; SET LOCAL app.user_id='fault'; SET LOCAL app.current_user_id='fault'; %s %s; %s\n" "$role" "$(positive_peek_sql "repeat('$digit',64),repeat('c',64),'https://st233a.invalid','fixture',repeat('a',64),0,'$purpose'" "peek-chain-$purpose")" "$outcome" "$reset_sql" | actor
    done
  done
  values=("repeat('1',64)" "repeat('c',64)" "'https://st233a.invalid'" "'fixture'" "repeat('a',64)" 0 "'session'")
  for index in "${!values[@]}"; do
    tuple=("${values[@]}"); tuple[$index]=NULL; joined=$(IFS=,; printf '%s' "${tuple[*]}")
    printf 'BEGIN; SET LOCAL ROLE %s; SELECT 1/(subtrack_auth.peek(%s) IS NULL)::integer; COMMIT; %s\n' "$role" "$joined" "$reset_sql" | actor
  done
  for change in "0 repeat('9',64)" "1 repeat('d',64)" "2 'https://foreign.invalid'" "2 ''" "3 'absent'" "3 ''" "3 'retired'" "3 'regression'" "3 'parallel'" "4 repeat('b',64)" "5 9007199254740991" "6 'wrong'" "6 'otp_step_up'"; do
    index=${change%% *}; tuple=("${values[@]}"); tuple[$index]=${change#* }; joined=$(IFS=,; printf '%s' "${tuple[*]}")
    printf 'BEGIN; SET LOCAL ROLE %s; SET LOCAL search_path=public; SELECT 1/(subtrack_auth.peek(%s) IS NULL)::integer; COMMIT; %s\n' "$role" "$joined" "$reset_sql" | actor
  done
  for change in "0 'bad'" "1 'bad'" "4 'bad'" "5 -1" "5 9007199254740992" "5 'overflow'"; do
    index=${change%% *}; tuple=("${values[@]}"); tuple[$index]=${change#* }; joined=$(IFS=,; printf '%s' "${tuple[*]}")
    if printf 'BEGIN; SET LOCAL ROLE %s; SELECT subtrack_auth.peek(%s);\n' "$role" "$joined" | actor; then exit 1; fi
    expected=23514; [[ "$change" != "5 'overflow'" ]] || expected=22P02
    grep -q "ERROR:  $expected" "$client_log" || exit 1
  done
  printf 'BEGIN; SET LOCAL ROLE %s; SET LOCAL app.user_id='\''fault'\''; SET LOCAL app.current_user_id='\''fault'\'';\n\set ON_ERROR_STOP off\nSELECT subtrack_auth.peek('\''bad'\'',NULL,NULL,NULL,NULL,NULL,NULL);\n\set ON_ERROR_STOP on\nROLLBACK; %s\n' "$role" "$reset_sql" | actor
  snapshot_private; [[ "$snapshot" == "$before_peek" ]] || exit 1
done
# Future-issued and expired rows are refused without pruning or watermark mutation.
for offset in 10000 -400000; do
  printf "UPDATE subtrack_auth.nonce SET issued_ms=t.ms,expires_ms=t.ms+300000 FROM (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint+%s ms) t WHERE nonce_h=repeat('1',64);\n" "$offset" | owner
  snapshot_private; before_peek=$snapshot
  for role in subtrack_runtime subtrack_auth_producer; do printf 'BEGIN; SET LOCAL ROLE %s; SELECT 1/(subtrack_auth.peek(%s) IS NULL)::integer; COMMIT; %s\n' "$role" "$peek_args" "$reset_sql" | actor; done
  snapshot_private; [[ "$snapshot" == "$before_peek" ]] || exit 1
done
# Holder and waiter lock only through peek. Waiter admission must sample AFTER actual expiry.
for outcome in COMMIT ROLLBACK; do
  printf "INSERT INTO subtrack_auth.epoch VALUES ('peek-lock',repeat('a',64),'https://st233a.invalid',0,'active'); INSERT INTO subtrack_auth.nonce SELECT repeat('4',64),'web','https://st233a.invalid','peek-locked',repeat('c',64),'peek-lock',ms-300000,ms,'session',NULL FROM (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint+5000 ms) t;\n" | owner
  snapshot_private; before_peek=$snapshot
  fifo=$(mktemp -u "$tmp/holder.XXXXXX"); mkfifo -m 600 "$fifo"; exec {writer}<>"$fifo"; writers[holder]=$writer
  launch_client subtrack_dev_auth_login "$fifo" st233b-holder; holder_pid=$client_pid holder_log=$client_log
  printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; %s\n" "$(positive_peek_sql "repeat('4',64),repeat('c',64),'https://st233a.invalid','peek-lock',repeat('a',64),0,'session'" 'peek-locked')" >&"$writer"
  observer=$(mktemp "$tmp/observer.XXXXXX"); waiter_pid=''
  observe_clients "SELECT count(*)=1 FROM pg_catalog.pg_stat_activity WHERE datname='$db' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';" '^ t *$' || exit 1
  printf "SELECT pid FROM pg_catalog.pg_stat_activity WHERE datname='%s' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';\n" "$db" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  holder_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$holder_backend" =~ ^[0-9]+$ ]] || exit 1
  waiter=$(mktemp "$tmp/waiter.XXXXXX")
  printf "BEGIN; SET LOCAL ROLE subtrack_auth_producer; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; SELECT 1/(subtrack_auth.peek(repeat('4',64),repeat('c',64),'https://st233a.invalid','peek-lock',repeat('a',64),0,'session') IS NULL)::integer; COMMIT; %s\n" "$reset_sql" > "$waiter"
  launch_client subtrack_dev_auth_login "$waiter" st233b-waiter; waiter_pid=$client_pid waiter_log=$client_log
  observe_clients "SELECT w.pid FROM pg_catalog.pg_stat_activity h JOIN pg_catalog.pg_stat_activity w ON h.pid<>w.pid WHERE h.pid=$holder_backend AND h.datname='$db' AND w.datname=h.datname AND h.usename='subtrack_dev_auth_login' AND w.usename=h.usename AND h.application_name='st233b-holder' AND w.application_name='st233b-waiter' AND h.state='idle in transaction' AND w.wait_event_type='Lock' AND h.pid=ANY(pg_catalog.pg_blocking_pids(w.pid));" '^[ ]*[0-9]+[ ]*$' || exit 1
  waiter_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$waiter_backend" =~ ^[0-9]+$ && "$waiter_backend" != "$holder_backend" ]] || exit 1
  observe_clients "SELECT (SELECT floor(extract(epoch FROM clock_timestamp())*1000)>=expires_ms FROM subtrack_auth.nonce WHERE nonce_h=repeat('4',64)) AND EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity w WHERE w.pid=$waiter_backend AND w.wait_event_type='Lock' AND $holder_backend=ANY(pg_catalog.pg_blocking_pids(w.pid)));" '^ t *$' 10000 || exit 1
  printf '%s; %s\n\q\n' "$outcome" "$reset_sql" >&"$writer"; close_writers
  join_client "$holder_pid" 25000 && join_client "$waiter_pid" 25000 || exit 1
  ! grep -q 'ERROR:' "$holder_log" && ! grep -q 'ERROR:' "$waiter_log" || exit 1
  snapshot_private; [[ "$snapshot" == "$before_peek" ]] || exit 1
  printf "DELETE FROM subtrack_auth.nonce WHERE nonce_h=repeat('4',64); DELETE FROM subtrack_auth.epoch WHERE id='peek-lock';\n" | owner
done
phase=reserve
reserve_signature='subtrack_auth.reserve_bootstrap(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms,text,text,subtrack_auth.h,subtrack_auth.ms)'
for fault in "SET st233a.head='invalid';" "SET st233a.marker='invalid';" "SET st233c.constraints='invalid';" "ALTER FUNCTION $peek_signature SET search_path=public;" "GRANT EXECUTE ON FUNCTION $peek_signature TO PUBLIC;" "ALTER FUNCTION subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms) SET search_path=public;" "GRANT EXECUTE ON FUNCTION subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms) TO PUBLIC;" "ALTER TABLE subtrack_auth.reservation DROP CONSTRAINT reservation_check;" "CREATE OR REPLACE FUNCTION subtrack_auth.peek(nonce_h subtrack_auth.h,binding_h subtrack_auth.h,origin text,epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms,purpose text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog AS 'BEGIN RETURN NULL; END';" "ALTER DOMAIN subtrack_auth.h DROP CONSTRAINT h_check;" "GRANT SELECT ON subtrack_auth.reservation TO subtrack_runtime;" "GRANT subtrack_auth_executor TO subtrack_dev_auth_login;"; do
  { printf "BEGIN; SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s'; %s\n" "$source_head" "$marker" "$constraints_pin" "$fault"; sed '/^BEGIN;$/d;/^COMMIT;$/d' "${inputs[8]}"; } > "$tmp/reserve-guard.sql"
  if owner < "$tmp/reserve-guard.sql"; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "(SELECT count(*)=2 AND bool_and(proname IN ('fence','peek')) FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace)"
done
{ printf "SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$source_head" "$marker" "$constraints_pin"; cat "${inputs[8]}"; } | owner
cat > "$tmp/reserve-catalog.sql" <<'SQL'
SELECT 1/COALESCE((p.prokind='f' AND NOT p.proretset AND p.pronargs=9 AND p.pronargdefaults=0 AND p.proargnames=ARRAY['key_h','owner_h','authority_h','request_h','retention_ms','origin','epoch','manifest_h','observed_ms'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.proowner='subtrack_auth_executor'::regrole AND p.prorettype='int8'::regtype AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')),false)::integer FROM pg_catalog.pg_proc p WHERE p.oid='subtrack_auth.reserve_bootstrap(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms,text,text,subtrack_auth.h,subtrack_auth.ms)'::regprocedure;
WITH actual AS (SELECT a.* FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.oid='subtrack_auth.reserve_bootstrap(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms,text,text,subtrack_auth.h,subtrack_auth.ms)'::regprocedure), expected AS (SELECT 'subtrack_auth_executor'::regrole::oid grantor,r.role::regrole::oid grantee,'EXECUTE'::text privilege_type,false is_grantable FROM (VALUES ('subtrack_auth_executor'),('subtrack_runtime')) r(role)), delta AS ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual)) SELECT 1/(NOT EXISTS(SELECT 1 FROM delta))::integer;
SQL
owner < "$tmp/reserve-catalog.sql"
reserve_values=("repeat('5',64)" "repeat('6',64)" "repeat('7',64)" "repeat('8',64)" 86400000 "'https://st233a.invalid'" "'fixture'" "repeat('a',64)" 0)
reserve_args=$(IFS=,; printf '%s' "${reserve_values[*]}")
for prefix in '' 'SET ROLE subtrack_identity_provisioner;' 'SET ROLE subtrack_auth_producer;'; do deny_actor "$prefix SELECT subtrack_auth.reserve_bootstrap($reserve_args);" || exit 1; done
positive_reserve_sql() { printf "SELECT expiry AS reserved_expiry,1/COALESCE((expiry>0),false)::integer FROM (SELECT subtrack_auth.reserve_bootstrap(%s) expiry) admitted;" "$1"; }
returned_expiry() { sed -n '/^[ ]*[0-9][0-9]*[ ]*|[ ]*1[ ]*$/s/|.*//p' "$1" | tr -d ' '; }
snapshot_private; before_reserve=$snapshot
# A real transactional NULL-return mutation must fail the identical positive assertion.
{ printf "BEGIN; CREATE OR REPLACE FUNCTION subtrack_auth.reserve_bootstrap(key_h subtrack_auth.h,owner_h subtrack_auth.h,authority_h subtrack_auth.h,request_h subtrack_auth.h,retention_ms subtrack_auth.ms,origin text,epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE CALLED ON NULL INPUT SET search_path=pg_catalog AS 'BEGIN RETURN NULL; END'; SET LOCAL ROLE subtrack_runtime;\n"; positive_reserve_sql "$reserve_args"; } > "$tmp/reserve-null.sql"
if owner < "$tmp/reserve-null.sql"; then exit 1; fi
grep -q 'ERROR:  22012' "$client_log" || exit 1
owner < "$tmp/reserve-catalog.sql"; snapshot_private; [[ "$snapshot" == "$before_reserve" ]] || exit 1
for index in "${!reserve_values[@]}"; do
  tuple=("${reserve_values[@]}"); tuple[$index]=NULL; joined=$(IFS=,; printf '%s' "${tuple[*]}")
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT 1/(subtrack_auth.reserve_bootstrap(%s) IS NULL)::integer; COMMIT; %s\n' "$joined" "$reset_sql" | actor
done
for change in "4 0" "4 86400001" "5 'https://foreign.invalid'" "5 ''" "6 ''" "6 'absent'" "6 'retired'" "6 'regression'" "7 repeat('b',64)" "8 9007199254740991"; do
  index=${change%% *}; tuple=("${reserve_values[@]}"); tuple[$index]=${change#* }; joined=$(IFS=,; printf '%s' "${tuple[*]}")
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT 1/(subtrack_auth.reserve_bootstrap(%s) IS NULL)::integer; COMMIT; %s\n' "$joined" "$reset_sql" | actor
done
for change in "0 'bad'" "1 'bad'" "2 'bad'" "3 'bad'" "7 'bad'" "4 -1" "4 9007199254740992" "8 -1" "8 9007199254740992" "8 'overflow'"; do
  index=${change%% *}; tuple=("${reserve_values[@]}"); tuple[$index]=${change#* }; joined=$(IFS=,; printf '%s' "${tuple[*]}")
  if printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT subtrack_auth.reserve_bootstrap(%s);\n' "$joined" | actor; then exit 1; fi
  expected=23514; [[ "$change" != "8 'overflow'" ]] || expected=22P02
  grep -q "ERROR:  $expected" "$client_log" || exit 1
done
printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL app.user_id='fault'; SET LOCAL app.current_user_id='fault';\n\\set ON_ERROR_STOP off\nSELECT subtrack_auth.reserve_bootstrap('bad',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);\n\\set ON_ERROR_STOP on\nROLLBACK; %s\n" "$reset_sql" | actor
for isolation in 'REPEATABLE READ' SERIALIZABLE 'READ UNCOMMITTED'; do
  printf 'BEGIN ISOLATION LEVEL %s; SET LOCAL ROLE subtrack_runtime; SELECT 1/(subtrack_auth.reserve_bootstrap(%s) IS NULL)::integer; COMMIT; %s\n' "$isolation" "$reserve_args" "$reset_sql" | actor
done
snapshot_private; [[ "$snapshot" == "$before_reserve" ]] || exit 1
# Numeric boundary evidence, never a mocked maximum actual database clock.
printf 'SELECT 1/(9007199254740991::numeric+1>9007199254740991 AND 0::numeric+86400000=86400000)::integer;\n' | owner
printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL app.user_id='fault'; SET LOCAL app.current_user_id='fault'; %s ROLLBACK; %s\n" "$(positive_reserve_sql "$reserve_args")" "$reset_sql" | actor
snapshot_private; [[ "$snapshot" == "$before_reserve" ]] || exit 1
printf "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM subtrack_auth.epoch e),(SELECT jsonb_agg(to_jsonb(n) ORDER BY nonce_h) FROM subtrack_auth.nonce n))::text);\n" | owner
unmutated=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$unmutated" =~ ^[a-f0-9]{32}$ ]] || exit 1
printf 'BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL ROLE subtrack_runtime; SET LOCAL search_path=public; %s COMMIT; %s\n' "$(positive_reserve_sql "$reserve_args")" "$reset_sql" | actor
reserved_expiry=$(returned_expiry "$client_log"); [[ "$reserved_expiry" =~ ^[0-9]+$ ]] || exit 1
assert_owner "(SELECT expires_ms=$reserved_expiry FROM subtrack_auth.reservation WHERE key_h=repeat('5',64))"
printf "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM subtrack_auth.epoch e),(SELECT jsonb_agg(to_jsonb(n) ORDER BY nonce_h) FROM subtrack_auth.nonce n))::text);\n" | owner
after=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$after" == "$unmutated" ]] || exit 1
assert_owner "(SELECT operation='createV2BrowserNonce' AND authority_kind='browser-bootstrap-origin' AND authority_h=repeat('7',64) AND request_h=repeat('8',64) AND owner_h=repeat('6',64) AND transport='web' AND epoch='fixture' AND state='pending' AND expires_ms-issued_ms=86400000 AND issued_ms<=floor(extract(epoch FROM clock_timestamp())*1000) FROM subtrack_auth.reservation WHERE key_h=repeat('5',64))"
for state in pending completed failed; do
 for expired in false true; do
  # Reset each fixture iteration so both live and expired variants are actual.
  printf "UPDATE subtrack_auth.reservation SET state='%s',issued_ms=t.ms,expires_ms=t.ms+86400000 FROM (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint ms) t WHERE key_h=repeat('5',64);\n" "$state" | owner
  [[ "$expired" == false ]] || printf "UPDATE subtrack_auth.reservation SET issued_ms=0,expires_ms=1 WHERE key_h=repeat('5',64);\n" | owner
  for operation in createV2BrowserNonce refreshV2Session; do
   printf "UPDATE subtrack_auth.reservation SET operation='%s' WHERE key_h=repeat('5',64);\n" "$operation" | owner
   snapshot_private; duplicate_snapshot=$snapshot
   for change in same owner epoch key; do
    tuple=("${reserve_values[@]}"); case "$change" in owner) tuple[1]="repeat('9',64)" ;; epoch) tuple[6]="'parallel'" ;; key) tuple[0]="repeat('9',64)" ;; esac
    joined=$(IFS=,; printf '%s' "${tuple[*]}")
    printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT 1/(subtrack_auth.reserve_bootstrap(%s) IS NULL)::integer; COMMIT; %s\n' "$joined" "$reset_sql" | actor
   done
   snapshot_private; [[ "$snapshot" == "$duplicate_snapshot" ]] || exit 1
  done
 done
done
printf "DELETE FROM subtrack_auth.reservation; INSERT INTO subtrack_auth.epoch VALUES ('reserve-a',repeat('a',64),'https://st233a.invalid',0,'active'),('reserve-b',repeat('a',64),'https://st233a.invalid',0,'active');\n" | owner
# Real same-key and cross-epoch capacity actors share the reviewed function locks.
for scenario in same capacity; do
 for outcome in COMMIT ROLLBACK; do
  printf 'DELETE FROM subtrack_auth.reservation;\n' | owner
  if [[ "$scenario" == capacity ]]; then printf "INSERT INTO subtrack_auth.reservation SELECT md5('key-'||i)||md5('key-'||i),'retained','other',repeat('7',64),repeat('8',64),md5('owner-'||i)||md5('owner-'||i),'web','fixture',0,1,'failed' FROM generate_series(1,9999) i;\n" | owner; fi
  printf "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM subtrack_auth.epoch e),(SELECT jsonb_agg(to_jsonb(n) ORDER BY nonce_h) FROM subtrack_auth.nonce n))::text);\n" | owner
  unchanged=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$unchanged" =~ ^[a-f0-9]{32}$ ]] || exit 1
  printf "SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY key_h),'[]'::jsonb)::text) FROM subtrack_auth.reservation r;\n" | owner
  retained=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$retained" =~ ^[a-f0-9]{32}$ ]] || exit 1
  holder_args="repeat('5',64),repeat('6',64),repeat('7',64),repeat('8',64),1,'https://st233a.invalid','reserve-a',repeat('a',64),0"
  waiter_args="repeat('9',64),repeat('0',64),repeat('7',64),repeat('8',64),86400000,'https://st233a.invalid','reserve-b',repeat('a',64),0"
  [[ "$scenario" != same ]] || waiter_args="repeat('5',64),repeat('0',64),repeat('7',64),repeat('8',64),86400000,'https://st233a.invalid','reserve-b',repeat('a',64),0"
  fifo=$(mktemp -u "$tmp/holder.XXXXXX"); mkfifo -m 600 "$fifo"; exec {writer}<>"$fifo"; writers[holder]=$writer
  launch_client subtrack_dev_auth_login "$fifo" st233b-holder; holder_pid=$client_pid holder_log=$client_log
  printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; %s\n" "$(positive_reserve_sql "$holder_args")" >&"$writer"
  observer=$(mktemp "$tmp/observer.XXXXXX"); waiter_pid=''
  observe_clients "SELECT count(*)=1 FROM pg_catalog.pg_stat_activity WHERE datname='$db' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';" '^ t *$' || exit 1
  printf "SELECT pid FROM pg_catalog.pg_stat_activity WHERE datname='%s' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';\n" "$db" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  holder_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$holder_backend" =~ ^[0-9]+$ ]] || exit 1
  waiter=$(mktemp "$tmp/waiter.XXXXXX"); assertion="$(positive_reserve_sql "$waiter_args")"
  [[ "$outcome" != COMMIT ]] || assertion="SELECT 1/(subtrack_auth.reserve_bootstrap($waiter_args) IS NULL)::integer;"
  printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; %s COMMIT; %s\n" "$assertion" "$reset_sql" > "$waiter"
  launch_client subtrack_dev_auth_login "$waiter" st233b-waiter; waiter_pid=$client_pid waiter_log=$client_log
  observe_clients "SELECT w.pid FROM pg_catalog.pg_stat_activity h JOIN pg_catalog.pg_stat_activity w ON h.pid<>w.pid WHERE h.pid=$holder_backend AND h.datname='$db' AND w.datname=h.datname AND h.usename='subtrack_dev_auth_login' AND w.usename=h.usename AND h.application_name='st233b-holder' AND w.application_name='st233b-waiter' AND h.state='idle in transaction' AND w.wait_event_type='Lock' AND w.wait_event='advisory' AND h.pid=ANY(pg_catalog.pg_blocking_pids(w.pid));" '^[ ]*[0-9]+[ ]*$' || exit 1
  waiter_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$waiter_backend" =~ ^[0-9]+$ && "$waiter_backend" != "$holder_backend" ]] || exit 1
  printf "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint;\n" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  release_ms=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log" | tail -1); [[ "$release_ms" =~ ^[0-9]+$ ]] || exit 1
  printf '%s; %s\n\q\n' "$outcome" "$reset_sql" >&"$writer"; close_writers
  join_client "$holder_pid" 25000 && join_client "$waiter_pid" 25000 || exit 1
  ! grep -q 'ERROR:' "$holder_log" && ! grep -q 'ERROR:' "$waiter_log" || exit 1
  holder_expiry=$(returned_expiry "$holder_log"); [[ "$holder_expiry" =~ ^[0-9]+$ ]] || exit 1
  if [[ "$outcome" == COMMIT ]]; then assert_owner "(SELECT expires_ms=$holder_expiry FROM subtrack_auth.reservation WHERE owner_h=repeat('6',64))"
  else waiter_expiry=$(returned_expiry "$waiter_log"); [[ "$waiter_expiry" =~ ^[0-9]+$ ]] || exit 1; assert_owner "(SELECT expires_ms=$waiter_expiry FROM subtrack_auth.reservation WHERE owner_h=repeat('0',64))"; fi
  printf "SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY key_h),'[]'::jsonb)::text) FROM subtrack_auth.reservation r WHERE owner_h NOT IN (repeat('6',64),repeat('0',64));\n" | owner
  after=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$after" == "$retained" ]] || exit 1
  expected=1; [[ "$scenario" != capacity ]] || expected=10000
  assert_owner "(SELECT count(*)=$expected FROM subtrack_auth.reservation) AND (SELECT count(*)=1 FROM subtrack_auth.reservation WHERE key_h=repeat('5',64) OR key_h=repeat('9',64))"
  if [[ "$outcome" == COMMIT ]]; then assert_owner "EXISTS(SELECT 1 FROM subtrack_auth.reservation WHERE key_h=repeat('5',64) AND owner_h=repeat('6',64) AND state='pending' AND epoch='reserve-a' AND expires_ms-issued_ms=1) AND NOT EXISTS(SELECT 1 FROM subtrack_auth.reservation WHERE owner_h=repeat('0',64))"
  else assert_owner "NOT EXISTS(SELECT 1 FROM subtrack_auth.reservation WHERE owner_h=repeat('6',64)) AND EXISTS(SELECT 1 FROM subtrack_auth.reservation WHERE owner_h=repeat('0',64) AND state='pending' AND epoch='reserve-b' AND issued_ms>=$release_ms AND expires_ms-issued_ms=86400000)"; fi
  printf "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM subtrack_auth.epoch e),(SELECT jsonb_agg(to_jsonb(n) ORDER BY nonce_h) FROM subtrack_auth.nonce n))::text);\n" | owner
  after=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$after" == "$unchanged" ]] || exit 1
 done
done
phase=prune
prune_signature='subtrack_auth.prune_reservations(text,subtrack_auth.h,subtrack_auth.ms)'
prune_args="'fixture',repeat('a',64),0"
positive_prune_sql() { printf 'SELECT 1/COALESCE(subtrack_auth.prune_reservations(%s),false)::integer;' "$1"; }
# Snapshot EVERY canonical business table, nonce and epoch; reservations are the sole delta.
snapshot_unpruned() {
  printf "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM subtrack_auth.epoch e),(SELECT jsonb_agg(to_jsonb(n) ORDER BY nonce_h) FROM subtrack_auth.nonce n),(SELECT string_agg(pg_catalog.query_to_xml(format('SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %%I.%%I t',n.nspname,c.relname),false,true,'')::text,E'\\n' ORDER BY c.relname) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'))::text);\n" | owner
  unpruned=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$unpruned" =~ ^[a-f0-9]{32}$ ]]
}
snapshot_private; before_prune=$snapshot
snapshot_unpruned; unpruned_baseline=$unpruned
# All three accepted function guards plus schema/role/constraint/ACL/head guards abort atomically.
for fault in "SET st233a.head='invalid';" "SET st233a.marker='invalid';" "SET st233c.constraints='invalid';" "ALTER FUNCTION $reserve_signature SET search_path=public;" "GRANT EXECUTE ON FUNCTION $reserve_signature TO PUBLIC;" "ALTER FUNCTION $peek_signature SET search_path=public;" "GRANT EXECUTE ON FUNCTION $peek_signature TO PUBLIC;" "ALTER FUNCTION subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms) SET search_path=public;" "GRANT EXECUTE ON FUNCTION subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms) TO PUBLIC;" "ALTER TABLE subtrack_auth.reservation DROP CONSTRAINT reservation_check;" "ALTER DOMAIN subtrack_auth.h DROP CONSTRAINT h_check;" "GRANT DELETE ON subtrack_auth.reservation TO subtrack_runtime;" "GRANT subtrack_auth_executor TO subtrack_dev_auth_login;"; do
  { printf "BEGIN; SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s'; %s\n" "$source_head" "$marker" "$constraints_pin" "$fault"; sed '/^BEGIN;$/d;/^COMMIT;$/d' "${inputs[9]}"; } > "$tmp/prune-guard.sql"
  if owner < "$tmp/prune-guard.sql"; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  assert_owner "(SELECT count(*)=3 AND bool_and(proname IN ('fence','peek','reserve_bootstrap')) FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace)"
  snapshot_private; [[ "$snapshot" == "$before_prune" ]] || exit 1
 done
for name in fence peek reserve_bootstrap; do
  case "$name" in fence) declaration='epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms'; returns=boolean ;; peek) declaration='nonce_h subtrack_auth.h,binding_h subtrack_auth.h,origin text,epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms,purpose text'; returns=text ;; reserve_bootstrap) declaration='key_h subtrack_auth.h,owner_h subtrack_auth.h,authority_h subtrack_auth.h,request_h subtrack_auth.h,retention_ms subtrack_auth.ms,origin text,epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms'; returns=bigint ;; esac
  { printf "BEGIN; SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s'; CREATE OR REPLACE FUNCTION subtrack_auth.%s(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE CALLED ON NULL INPUT SET search_path=pg_catalog AS 'BEGIN RETURN NULL; END';\n" "$source_head" "$marker" "$constraints_pin" "$name" "$declaration" "$returns"; sed '/^BEGIN;$/d;/^COMMIT;$/d' "${inputs[9]}"; } > "$tmp/prune-body-guard.sql"
  if owner < "$tmp/prune-body-guard.sql"; then exit 1; fi
  grep -q 'ERROR:  22012' "$client_log" || exit 1
  snapshot_private; [[ "$snapshot" == "$before_prune" ]] || exit 1
 done
{ printf "SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$source_head" "$marker" "$constraints_pin"; cat "${inputs[9]}"; } | owner
cat > "$tmp/prune-catalog.sql" <<'SQL'
SELECT 1/COALESCE((p.prokind='f' AND NOT p.proretset AND p.pronargs=3 AND p.pronargdefaults=0 AND p.proargnames=ARRAY['epoch','manifest_h','observed_ms'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.proowner='subtrack_auth_executor'::regrole AND p.prorettype='bool'::regtype AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') AND md5(p.prosrc)='58f0b2de33474881c5e782826800745e'),false)::integer FROM pg_catalog.pg_proc p WHERE p.oid='subtrack_auth.prune_reservations(text,subtrack_auth.h,subtrack_auth.ms)'::regprocedure;
WITH actual AS (SELECT a.* FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.oid='subtrack_auth.prune_reservations(text,subtrack_auth.h,subtrack_auth.ms)'::regprocedure), expected AS (SELECT 'subtrack_auth_executor'::regrole::oid grantor,r.role::regrole::oid grantee,'EXECUTE'::text privilege_type,false is_grantable FROM (VALUES ('subtrack_auth_executor'),('subtrack_runtime')) r(role)), delta AS ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual)) SELECT 1/(NOT EXISTS(SELECT 1 FROM delta))::integer;
SELECT 1/(count(*)=4)::integer FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::regnamespace;
SQL
owner < "$tmp/prune-catalog.sql"
for prefix in '' 'SET ROLE subtrack_identity_provisioner;' 'SET ROLE subtrack_auth_producer;'; do deny_actor "$prefix SELECT subtrack_auth.prune_reservations($prune_args);" || exit 1; done
# Real NULL-return fault hits the SAME positive assertion; all state and body/ACL roll back.
{ printf "BEGIN; CREATE OR REPLACE FUNCTION subtrack_auth.prune_reservations(epoch text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE CALLED ON NULL INPUT SET search_path=pg_catalog AS 'BEGIN RETURN NULL; END'; SET LOCAL ROLE subtrack_runtime;\n"; positive_prune_sql "$prune_args"; } > "$tmp/prune-null.sql"
if owner < "$tmp/prune-null.sql"; then exit 1; fi
grep -q 'ERROR:  22012' "$client_log" || exit 1
owner < "$tmp/prune-catalog.sql"; snapshot_private; [[ "$snapshot" == "$before_prune" ]] || exit 1
for args in "NULL,repeat('a',64),0" "'fixture',NULL,0" "'fixture',repeat('a',64),NULL" "'',repeat('a',64),0" "'absent',repeat('a',64),0" "'retired',repeat('a',64),0" "'regression',repeat('a',64),0" "'fixture',repeat('b',64),0" "'fixture',repeat('a',64),9007199254740991"; do
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT 1/COALESCE(NOT subtrack_auth.prune_reservations(%s),false)::integer; COMMIT; %s\n' "$args" "$reset_sql" | actor
 done
for args in "'fixture','bad',0" "'fixture',repeat('a',64),-1" "'fixture',repeat('a',64),9007199254740992" "'fixture',repeat('a',64),'overflow'"; do
  if printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT subtrack_auth.prune_reservations(%s);\n' "$args" | actor; then exit 1; fi
  expected=23514; [[ "$args" != *overflow* ]] || expected=22P02
  grep -q "ERROR:  $expected" "$client_log" || exit 1
 done
printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL app.user_id='fault'; SET LOCAL app.current_user_id='fault';\n\\set ON_ERROR_STOP off\nSELECT subtrack_auth.prune_reservations('fixture','bad',0);\n\\set ON_ERROR_STOP on\nROLLBACK; %s\n" "$reset_sql" | actor
for isolation in 'REPEATABLE READ' SERIALIZABLE 'READ UNCOMMITTED'; do
  printf 'BEGIN ISOLATION LEVEL %s; SET LOCAL ROLE subtrack_runtime; SELECT 1/COALESCE(NOT subtrack_auth.prune_reservations(%s),false)::integer; COMMIT; %s\n' "$isolation" "$prune_args" "$reset_sql" | actor
 done
# Existing schema forbids foreign Origin; trusted transactional corruption tests body refusal.
printf "BEGIN; ALTER TABLE subtrack_auth.epoch DROP CONSTRAINT epoch_origin_check; UPDATE subtrack_auth.epoch SET origin='https://foreign.invalid' WHERE id='reserve-b'; SET LOCAL ROLE subtrack_runtime; SELECT 1/COALESCE(NOT subtrack_auth.prune_reservations('reserve-b',repeat('a',64),0),false)::integer; ROLLBACK; %s\n" "$reset_sql" | owner
snapshot_private; [[ "$snapshot" == "$before_prune" ]] || exit 1
# All states/operations/owners/epochs: retired epoch is eligible, live rows survive byte-for-byte.
printf "DELETE FROM subtrack_auth.reservation; INSERT INTO subtrack_auth.reservation SELECT md5('prune-key-'||i)||md5('prune-key-'||i),CASE WHEN i%%2=0 THEN 'refreshV2Session' ELSE 'createV2BrowserNonce' END,'other',repeat('7',64),repeat('8',64),md5('prune-owner-'||i)||md5('prune-owner-'||i),'web',CASE WHEN i%%3=0 THEN 'retired' WHEN i%%3=1 THEN 'fixture' ELSE 'reserve-b' END,CASE WHEN i<=6 THEN 0 ELSE t.ms END,CASE WHEN i<=6 THEN 1 ELSE t.ms+86400000 END,(ARRAY['pending','completed','failed'])[1+(i%%3)] FROM generate_series(1,12) i CROSS JOIN (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint ms) t;\n" | owner
printf "SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY key_h)::text) FROM subtrack_auth.reservation r WHERE issued_ms>0;\n" | owner
live_pin=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log")
snapshot_private; rollback_pin=$snapshot
printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s ROLLBACK; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
snapshot_private; [[ "$snapshot" == "$rollback_pin" ]] || exit 1
printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL search_path=public; SET LOCAL app.user_id='"'fault'"'; SET LOCAL app.current_user_id='"'fault'"'; %s COMMIT; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
assert_owner "(SELECT count(*)=6 AND bool_and(issued_ms>0) FROM subtrack_auth.reservation)"
printf "SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY key_h)::text) FROM subtrack_auth.reservation r;\n" | owner
after=$(sed -n '/^[ ]*[a-f0-9]\{32\}[ ]*$/s/ //gp' "$client_log"); [[ "$after" == "$live_pin" ]] || exit 1
snapshot_private; zero_pin=$snapshot
printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s COMMIT; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
snapshot_private; [[ "$snapshot" == "$zero_pin" ]] || exit 1
# Deliberate fixture-owner overcapacity only: deterministic first10000 then remaining expired row.
printf "DELETE FROM subtrack_auth.reservation; INSERT INTO subtrack_auth.reservation SELECT md5('bound-key-'||i)||md5('bound-key-'||i),'other','other',repeat('7',64),repeat('8',64),md5('bound-owner-'||i)||md5('bound-owner-'||i),'web','retired',0,1,'failed' FROM generate_series(1,10001) i; SELECT key_h FROM subtrack_auth.reservation ORDER BY expires_ms DESC,key_h DESC LIMIT 1;\n" | owner
remaining_key=$(sed -n '/^[ ]*[a-f0-9]\{64\}[ ]*$/s/ //gp' "$client_log"); [[ "$remaining_key" =~ ^[a-f0-9]{64}$ ]] || exit 1
printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s COMMIT; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
assert_owner "(SELECT count(*)=1 AND bool_and(key_h='$remaining_key') FROM subtrack_auth.reservation)"
printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s COMMIT; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
assert_owner "NOT EXISTS(SELECT 1 FROM subtrack_auth.reservation)"
printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s COMMIT; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
# Independent global key and owner reuse, never only an identical tuple success.
for reuse in key owner; do
  printf "DELETE FROM subtrack_auth.reservation; INSERT INTO subtrack_auth.reservation VALUES (repeat('5',64),'other','other',repeat('7',64),repeat('8',64),repeat('6',64),'web','retired',0,1,'completed');\n" | owner
  tuple=("${reserve_values[@]}"); [[ "$reuse" != key ]] || tuple[1]="repeat('0',64)"; [[ "$reuse" != owner ]] || tuple[0]="repeat('9',64)"; joined=$(IFS=,; printf '%s' "${tuple[*]}")
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SELECT 1/(subtrack_auth.reserve_bootstrap(%s) IS NULL)::integer; COMMIT; %s\n' "$joined" "$reset_sql" | actor
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s COMMIT; %s\n' "$(positive_prune_sql "$prune_args")" "$reset_sql" | actor
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; %s COMMIT; %s\n' "$(positive_reserve_sql "$joined")" "$reset_sql" | actor
  assert_owner "(SELECT count(*)=1 AND bool_and(state='pending' AND epoch='fixture') FROM subtrack_auth.reservation)"
 done
snapshot_unpruned; [[ "$unpruned" == "$unpruned_baseline" ]] || exit 1
# Both serial orders, distinct epochs and actual advisory wait, COMMIT and ROLLBACK.
for direction in prune-first reserve-first; do
 for outcome in COMMIT ROLLBACK; do
  printf 'DELETE FROM subtrack_auth.reservation;\n' | owner
  snapshot_unpruned; race_immutable=$unpruned
  if [[ "$direction" == prune-first ]]; then
    printf "INSERT INTO subtrack_auth.reservation SELECT md5('cap-key-'||i)||md5('cap-key-'||i),'other','other',repeat('7',64),repeat('8',64),md5('cap-owner-'||i)||md5('cap-owner-'||i),'web','retired',0,1,'failed' FROM generate_series(1,10000) i;\n" | owner
    holder_assertion="$(positive_prune_sql "'reserve-a',repeat('a',64),0")"
    waiter_args="repeat('9',64),repeat('0',64),repeat('7',64),repeat('8',64),86400000,'https://st233a.invalid','reserve-b',repeat('a',64),0"
    waiter_assertion="$(positive_reserve_sql "$waiter_args")"; [[ "$outcome" != ROLLBACK ]] || waiter_assertion="SELECT 1/(subtrack_auth.reserve_bootstrap($waiter_args) IS NULL)::integer;"
  else
    # Eligibility will become true WHILE waiting; no caller-controlled/mocked DB clock.
    printf "INSERT INTO subtrack_auth.reservation SELECT repeat('1',64),'other','other',repeat('7',64),repeat('8',64),repeat('2',64),'web','retired',t.ms,t.ms+5000,'completed' FROM (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint ms) t; SELECT expires_ms FROM subtrack_auth.reservation;\n" | owner
    target_expiry=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$target_expiry" =~ ^[0-9]+$ ]] || exit 1
    holder_assertion="$(positive_reserve_sql "repeat('5',64),repeat('6',64),repeat('7',64),repeat('8',64),1,'https://st233a.invalid','reserve-a',repeat('a',64),0")"
    waiter_assertion="$(positive_prune_sql "'reserve-b',repeat('a',64),0")"
  fi
  fifo=$(mktemp -u "$tmp/holder.XXXXXX"); mkfifo -m 600 "$fifo"; exec {writer}<>"$fifo"; writers[holder]=$writer
  launch_client subtrack_dev_auth_login "$fifo" st233b-holder; holder_pid=$client_pid holder_log=$client_log
  printf "BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='20s'; %s\n" "$holder_assertion" >&"$writer"
  observer=$(mktemp "$tmp/observer.XXXXXX"); waiter_pid=''
  observe_clients "SELECT count(*)=1 FROM pg_catalog.pg_stat_activity WHERE datname='$db' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';" '^ t *$' || exit 1
  printf "SELECT pid FROM pg_catalog.pg_stat_activity WHERE datname='%s' AND usename='subtrack_dev_auth_login' AND application_name='st233b-holder' AND state='idle in transaction';\n" "$db" > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  holder_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$holder_backend" =~ ^[0-9]+$ ]] || exit 1
  [[ "$direction" != reserve-first ]] || assert_owner "floor(extract(epoch FROM clock_timestamp())*1000)<$target_expiry"
  waiter=$(mktemp "$tmp/waiter.XXXXXX")
  printf 'BEGIN; SET LOCAL ROLE subtrack_runtime; SET LOCAL lock_timeout='"'15s'"'; SET LOCAL statement_timeout='"'20s'"'; %s COMMIT; %s\n' "$waiter_assertion" "$reset_sql" > "$waiter"
  launch_client subtrack_dev_auth_login "$waiter" st233b-waiter; waiter_pid=$client_pid waiter_log=$client_log
  observe_clients "SELECT w.pid FROM pg_catalog.pg_stat_activity h JOIN pg_catalog.pg_stat_activity w ON h.pid<>w.pid WHERE h.pid=$holder_backend AND h.datname='$db' AND w.datname=h.datname AND h.usename='subtrack_dev_auth_login' AND w.usename=h.usename AND h.application_name='st233b-holder' AND w.application_name='st233b-waiter' AND h.state='idle in transaction' AND w.wait_event_type='Lock' AND w.wait_event='advisory' AND h.pid=ANY(pg_catalog.pg_blocking_pids(w.pid));" '^[ ]*[0-9]+[ ]*$' || exit 1
  waiter_backend=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log"); [[ "$waiter_backend" =~ ^[0-9]+$ && "$waiter_backend" != "$holder_backend" ]] || exit 1
  if [[ "$direction" == reserve-first ]]; then
    assert_owner "floor(extract(epoch FROM clock_timestamp())*1000)<$target_expiry"
    observe_clients "SELECT floor(extract(epoch FROM clock_timestamp())*1000)>=$target_expiry;" '^ t *$' || exit 1
  fi
  printf 'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint;\n' > "$observer"
  launch_client st233a_fixture_owner "$observer" st233b-observer; join_client "$client_pid" 2000 || exit 1
  release_ms=$(sed -n '/^[ ]*[0-9][0-9]*[ ]*$/s/ //gp' "$client_log" | tail -1); [[ "$release_ms" =~ ^[0-9]+$ ]] || exit 1
  printf '%s; %s\n\q\n' "$outcome" "$reset_sql" >&"$writer"; close_writers
  join_client "$holder_pid" 25000 && join_client "$waiter_pid" 25000 || exit 1
  ! grep -q 'ERROR:' "$holder_log" && ! grep -q 'ERROR:' "$waiter_log" || exit 1
  if [[ "$direction" == reserve-first ]]; then
    [[ "$release_ms" -ge "$target_expiry" ]] || exit 1
    assert_owner "NOT EXISTS(SELECT 1 FROM subtrack_auth.reservation)"
  elif [[ "$outcome" == COMMIT ]]; then
    expiry=$(returned_expiry "$waiter_log"); [[ "$expiry" =~ ^[0-9]+$ ]] || exit 1
    assert_owner "(SELECT count(*)=1 AND bool_and(owner_h=repeat('0',64) AND issued_ms>=$release_ms AND expires_ms=$expiry) FROM subtrack_auth.reservation)"
  else
    assert_owner "(SELECT count(*)=10000 AND bool_and(epoch='retired' AND expires_ms=1 AND state='failed') FROM subtrack_auth.reservation)"
  fi
  snapshot_unpruned; [[ "$unpruned" == "$race_immutable" ]] || exit 1
 done
 done
owner < "$tmp/prune-catalog.sql"
snapshot_unpruned; [[ "$unpruned" == "$unpruned_baseline" ]] || exit 1
for role in subtrack_dev_auth_login subtrack_runtime subtrack_identity_provisioner subtrack_auth_producer; do
  assert_owner "NOT pg_catalog.has_database_privilege('$role','$db','CREATE,TEMP') AND NOT pg_catalog.has_schema_privilege('$role','subtrack_auth','CREATE') AND NOT pg_catalog.has_schema_privilege('$role','public','CREATE')"
  for table in epoch reservation nonce; do
    assert_owner "NOT pg_catalog.has_table_privilege('$role','subtrack_auth.$table','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='subtrack_auth.$table'::regclass AND attnum>0 AND NOT attisdropped AND pg_catalog.has_column_privilege('$role',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES'))"
  done
done
printf "SET ROLE subtrack_auth_executor; DELETE FROM subtrack_auth.nonce; DELETE FROM subtrack_auth.reservation; RESET ROLE; RESET app.user_id; RESET app.current_user_id; RESET search_path; SELECT 1/(CURRENT_USER=SESSION_USER)::integer;\n" | owner
phase=pins
[[ $(git rev-parse HEAD) == "$source_head" ]] || exit 1
while read -r path blob bytes; do [[ $(git hash-object "$path") == "$blob" && $(sha256sum "$path" | cut -d ' ' -f1) == "$bytes" ]] || exit 1; done < "$tmp/pins"
passed=true
