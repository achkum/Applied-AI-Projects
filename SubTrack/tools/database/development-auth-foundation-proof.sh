#!/usr/bin/env bash
# ST-233a. Local/CI owned fixture only. Never print client or Docker diagnostics.
set -euo pipefail
umask 077
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
  private_file "$record" || return 1
  local rcid rmarker rname rcreated extra actual
  read -r rcid rmarker rname rcreated extra < "$record" || return 1
  [[ -z "$extra" && "$rcid" =~ ^[a-f0-9]{64}$ && "$rmarker" =~ ^[a-f0-9]{32}$ &&
     "$rname" == "st233a-$rmarker" && "$rcreated" =~ ^[0-9T:.Z-]+$ ]] || return 1
  [[ "$rcid" == "$cid" && "$rmarker" == "$marker" && "$rname" == "$name" && "$rcreated" == "$created" ]] || return 1
  actual=$(docker inspect --format '{{.Id}}|{{.Name}}|{{.Created}}|{{index .Config.Labels "subtrack.task"}}|{{index .Config.Labels "subtrack.head"}}|{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{len .HostConfig.PortBindings}}|{{len .NetworkSettings.Networks}}|{{len .Mounts}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{.HostConfig.Privileged}}|{{len .HostConfig.CapAdd}}|{{len .HostConfig.Devices}}|{{.HostConfig.PidMode}}' "$cid" 2>/dev/null) || return 1
  [[ "$actual" == "$cid|/$name|$created|ST-233a:$marker|$source_head|$image|none|0|1|1|tmpfs:/var/lib/postgresql/data|false|0|0|" ]]
}
cleanup_container() {
  if [[ ! -e "$record" && ! -L "$record" ]]; then
    [[ -z "$cid" ]] || return 1
    return 0
  fi
  custody || return 1
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || return 1
  local remaining
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}' 2>/dev/null) || return 1
  [[ -z "$remaining" ]] || return 1
  rm -- "$record" || return 1
  [[ ! -e "$record" && ! -L "$record" ]]
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
  local status=$? bad=false
  trap - EXIT
  cleanup_container || bad=true
  cleanup_temp || bad=true
  if [[ "$bad" == true ]]; then status=1; phase=cleanup; fi
  case "$phase" in starting|fixture|migration|foundation|actor|constraints|catalog|pins|cleanup) ;; *) status=1; phase=starting ;; esac
  if [[ "$status" == 0 && "$passed" == true && "$bad" == false ]]; then
    printf 'ST-233a foundation: PASS source_head=%s cases=PG16,SCRAM,roles,RLS,ACL,domains,immutability,business-isolation,dual-GUC-reset fixture=removed secrets=destroyed\n' "$source_head" >> "$receipt"
  else
    status=1
    printf 'ST-233a foundation: FAIL source_head=%s phase=%s\n' "$source_head" "$phase" > "$receipt"
  fi
  exit "$status"
}
if [[ "${1:-}" == --cleanup ]]; then
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
trap finish EXIT
trap 'exit 1' INT TERM
inputs=(apps/api/prisma/migrations/0001_canonical_schema/migration.sql apps/api/prisma/migrations/0002_privacy_constraints/migration.sql
  apps/api/prisma/development-auth/001-epoch-nonce-reservation.sql tools/database/development-auth-foundation-proof.sh
  tools/database/test-development-auth-foundation-proof.sh ../.github/workflows/subtrack-development-auth-foundation-proof.yml)
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
  : > "$tmp/client.log"
  custody || return 1
  docker exec -i -e PGPASSFILE=/tmp/st233a.pgpass "$cid" psql -X -q -h 127.0.0.1 -U "$1" -d "$db" -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate > "$tmp/client.log" 2>&1
}
owner() { sql st233a_fixture_owner; }
actor() { sql subtrack_dev_auth_login; }
assert_owner() { printf 'SELECT 1 / COALESCE((%s),false)::integer;\n' "$1" | owner; }
deny_actor() { if printf '%s\n' "$1" | actor; then return 1; fi; grep -q 'ERROR:  42501' "$tmp/client.log"; }
deny_executor() {
  if printf 'SET ROLE subtrack_auth_executor; %s\n' "$1" | owner; then return 1; fi
  grep -q "ERROR:  ${2:-42501}" "$tmp/client.log"
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
  grep -q 'ERROR:  22012' "$tmp/client.log" || exit 1
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
  grep -q 'ERROR:  23514' "$tmp/client.log" || exit 1
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
      grep -q 'ERROR:  23502' "$tmp/client.log" || exit 1
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
