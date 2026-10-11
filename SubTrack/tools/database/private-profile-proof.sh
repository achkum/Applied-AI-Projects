#!/usr/bin/env bash
# Disposable private browser/PG integration. All diagnostics and secret material remain in owned TEMP.
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$root"
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
work="$(mktemp -d "$base/st237-profile.XXXXXXXX")"
[[ "$work" == "$base"/st237-profile.* && ! -L "$work" ]] || exit 1
exec 3>&1 4>&2
exec >"$work/internal.log" 2>&1
phase=SOURCE
cid='' network='' server_pid='' browser_pid='' complete=0
marker="$(openssl rand -hex 16)"
name="st237-profile-$marker"
image=mirror.gcr.io/library/postgres:16-alpine
head="${ST237_EXPECTED_HEAD:-}"
db=st237_private_https_profile
stop_group() {
  local pid="$1" i
  [[ -n "$pid" ]] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true
  for ((i=0;i<50;i++)); do kill -0 -- "-$pid" 2>/dev/null || break; sleep .1; done
  kill -0 -- "-$pid" 2>/dev/null && kill -KILL -- "-$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  ! kill -0 -- "-$pid" 2>/dev/null
}
custody() {
  [[ "$cid" =~ ^[a-f0-9]{64}$ && "$network" =~ ^[a-f0-9]{64}$ ]] || return 1
  docker inspect "$cid" | python3 -c '
import json,sys
x=json.load(sys.stdin)[0]; cid,name,marker,head,image,net=sys.argv[1:]
c=x["Config"]; h=x["HostConfig"]
assert x["Id"]==cid and x["Name"]=="/"+name
assert c["Image"]==image and c["Labels"]["subtrack.task"]=="ST-237:"+marker and c["Labels"]["subtrack.head"]==head
assert h["NetworkMode"]==net and not h["Privileged"] and not h["CapAdd"] and not h["Devices"]
assert h["PidsLimit"]==128 and h["Memory"]==536870912
assert set(h["PortBindings"])=={"5432/tcp"}
assert all(p["HostIp"]=="127.0.0.1" for p in h["PortBindings"]["5432/tcp"])
assert set(h["Tmpfs"])=={"/var/lib/postgresql/data"}
assert all(m["Type"]=="tmpfs" and m["Destination"]=="/var/lib/postgresql/data" and m["RW"] is True for m in x["Mounts"])
' "$cid" "$name" "$marker" "$head" "$image" "$network" || return 1
  docker network inspect "$network" | python3 -c '
import json,sys
x=json.load(sys.stdin)[0]; ident,marker,head,cid=sys.argv[1:]
assert x["Id"]==ident and x["Internal"] is True and x["Driver"]=="bridge"
assert x["Labels"]["subtrack.task"]=="ST-237:"+marker and x["Labels"]["subtrack.head"]==head
assert set(x["Containers"]).issubset({cid})
' "$network" "$marker" "$head" "$cid"
}
cleanup() {
  local code=$? ok=1
  trap - EXIT INT TERM
  stop_group "$browser_pid" || ok=0
  stop_group "$server_pid" || ok=0
  if [[ -n "$cid" ]]; then
    if custody; then docker rm -f "$cid" >/dev/null 2>&1 || ok=0; else ok=0; fi
    docker inspect "$cid" >/dev/null 2>&1 && ok=0 || true
  fi
  if [[ -n "$network" ]]; then
    if docker network inspect "$network" | python3 -c 'import json,sys;x=json.load(sys.stdin)[0];assert x["Id"]==sys.argv[1] and x["Internal"] is True and x["Labels"]["subtrack.task"]=="ST-237:"+sys.argv[2] and x["Labels"]["subtrack.head"]==sys.argv[3] and not x["Containers"]' "$network" "$marker" "$head"; then
      docker network rm "$network" >/dev/null 2>&1 || ok=0
    else ok=0; fi
    docker network inspect "$network" >/dev/null 2>&1 && ok=0 || true
  fi
  if [[ "$work" == "$base"/st237-profile.* && -d "$work" && ! -L "$work" ]]; then rm -rf -- "$work" || ok=0; else ok=0; fi
  [[ ! -e "$work" && ! -L "$work" ]] || ok=0
  if (( code==0 && complete==1 && ok==1 )); then
    printf 'PASS ST237_PRIVATE_PG_TLS_SECRET_CUSTODY\nPROOF PASS head=%s cleanup=removed\n' "$head" >&3
    exit 0
  fi
  printf 'FAIL ST237_PRIVATE_PROFILE phase=%s cleanup=%s\n' "$phase" "$([[ "$ok" == 1 ]] && printf removed || printf failed)" >&4
  exit 1
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ "$head" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" == "$head" ]]
[[ "${ST237_BROWSER_LOCALE:-}" =~ ^(sv|en)$ && "${ST237_BROWSER_THEME:-}" =~ ^(light|dark)$ ]]
printf 'INPUT head=%s\n' "$head" >&3
while IFS= read -r rel; do
  [[ -f "$rel" && ! -L "$rel" ]]
  full="$(git ls-files --full-name "$rel")"
  blob="$(git rev-parse "$head:$full")"
  [[ "$(git hash-object "$rel")" == "$blob" ]]
  digest="$(sha256sum "$rel")"; digest="${digest%% *}"
  printf 'INPUT file=%s blob=%s sha256=%s\n' "$full" "$blob" "$digest" >&3
done < <(git ls-files apps/api/src/auth apps/api/src/profile apps/api/prisma apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/test/private-profile.integration.ts apps/api/test/profile-business-catalog.ts apps/api/test/profile-business-schema.integration.ts apps/api/test/clean-migration-rls.integration.ts apps/web/private-https-server.mjs apps/web/app apps/web/lib apps/web/components apps/web/middleware.ts apps/web/next.config.ts apps/web/package.json apps/web/tsconfig.json apps/web/test/private-profile-browser.mjs packages/contracts packages/i18n packages/ui packages/ui-tokens pnpm-lock.yaml tools/database/private-profile-proof.sh tools/database/clean-migration-proof.sh ../.github/workflows/subtrack-private-https-profile-proof.yml)
phase=FIXTURE
owner_pass="$(openssl rand -hex 24)" actor_pass="$(openssl rand -hex 24)"
printf 'POSTGRES_USER=st233a_fixture_owner\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n' "$db" "$owner_pass" > "$work/pg.env"
printf '127.0.0.1:5432:%s:st233a_fixture_owner:%s\n' "$db" "$owner_pass" > "$work/pgpass"
network="$(docker network create --internal --label "subtrack.task=ST-237:$marker" --label "subtrack.head=$head" "$name")"
[[ "$network" =~ ^[a-f0-9]{64}$ ]]
docker create --name "$name" --label "subtrack.task=ST-237:$marker" --label "subtrack.head=$head" \
  --network "$network" -p 127.0.0.1::5432 --pids-limit 128 --memory 512m --cpus 2 \
  --tmpfs /var/lib/postgresql/data --env-file "$work/pg.env" "$image" > "$work/cid"
cid="$(cat "$work/cid")"; custody
docker start "$cid" >/dev/null
for _ in {1..60}; do docker exec "$cid" pg_isready -h 127.0.0.1 -U st233a_fixture_owner -d "$db" >/dev/null && break; sleep 1; done
docker exec "$cid" pg_isready -h 127.0.0.1 -U st233a_fixture_owner -d "$db" >/dev/null
custody
docker cp "$work/pgpass" "$cid:/tmp/st237.pgpass" >/dev/null
owner() { timeout 25s docker exec -i -e PGPASSFILE=/tmp/st237.pgpass "$cid" psql -X -q -A -t -h 127.0.0.1 -U st233a_fixture_owner -d "$db" -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate; }
phase=INSTALL
owner < apps/api/prisma/migrations/0001_canonical_schema/migration.sql
owner < apps/api/prisma/migrations/0002_privacy_constraints/migration.sql
printf "REVOKE TEMPORARY,CREATE ON DATABASE %s FROM PUBLIC; CREATE TABLE public.st233a_fixture_control(task text,head text,marker text); REVOKE ALL ON public.st233a_fixture_control FROM PUBLIC; INSERT INTO public.st233a_fixture_control VALUES ('ST-233a','%s','%s');\n" "$db" "$head" "$marker" | owner
{ printf "SET st233a.head='%s'; SET st233a.marker='%s';\n" "$head" "$marker"; cat apps/api/prisma/development-auth/001-epoch-nonce-reservation.sql; } | owner
constraints_pin="$(printf "SELECT md5(string_agg(format('%%s:%%s:%%s:%%s:%%s',c.conname,c.contype,c.convalidated,c.condeferrable,pg_get_constraintdef(c.oid)),E'\\n' ORDER BY c.conname,c.oid)) FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::regnamespace;\n" | owner)"
[[ "$constraints_pin" =~ ^[a-f0-9]{32}$ ]]
for sql in apps/api/prisma/development-auth/{002,003,004,005,006,007,008,009,010}-*.sql; do
  { printf "SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$head" "$marker" "$constraints_pin"; cat "$sql"; } | owner
done
printf "ALTER ROLE subtrack_dev_auth_login PASSWORD '%s';\n" "$actor_pass" | owner
export NODE_ENV=development ST237_PRIVATE_CONFIG="$work/auth.json"
node - "$ST237_PRIVATE_CONFIG" "$work/seed.sql" <<'NODE'
const fs=require('node:fs');
const epoch=require('./apps/api/dist/auth/private-auth-epoch.js').provisionPrivateAuthEpoch(process.argv[2]);
if(!/^[a-f0-9]{64}$/.test(epoch.manifestHash)) process.exit(1);
fs.writeFileSync(process.argv[3],`INSERT INTO subtrack_auth.epoch VALUES ('st237_private_https_v1','${epoch.manifestHash}','https://localhost:3443',0,'active');\n`,{mode:0o600});
NODE
owner < "$work/seed.sql"
port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$cid")"
[[ "$port" =~ ^[0-9]+$ && "$port" -gt 0 && "$port" -lt 65536 ]]
export ST237_PG_PORT="$port" ST237_PG_PASSWORD="$actor_pass"
phase=CERTIFICATE
mkdir -m 700 "$work/trusted"
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 1 -subj '/CN=ST237 task CA' -keyout "$work/ca.key" -out "$work/ca.crt" >/dev/null 2>&1
openssl req -new -newkey rsa:3072 -sha256 -nodes -subj '/CN=localhost' -keyout "$work/leaf.key" -out "$work/leaf.csr" >/dev/null 2>&1
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n' > "$work/leaf.ext"
openssl x509 -req -in "$work/leaf.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" -CAcreateserial -out "$work/leaf.crt" -days 1 -sha256 -extfile "$work/leaf.ext" >/dev/null 2>&1
cat "$work/leaf.crt" "$work/ca.crt" > "$work/chain.crt"
openssl verify -CAfile "$work/ca.crt" -verify_hostname localhost "$work/leaf.crt" >/dev/null
certutil -N --empty-password -d "sql:$work/trusted" >/dev/null
certutil -A -d "sql:$work/trusted" -n ST237-task-CA -t 'C,,' -i "$work/ca.crt" >/dev/null
export ST237_LEAF_KEY="$work/leaf.key" ST237_LEAF_CHAIN="$work/chain.crt" ST237_TRUSTED_PROFILE="$work/trusted"
phase=SERVER
setsid node apps/web/private-https-server.mjs > "$work/server.log" 2>&1 & server_pid=$!
for _ in {1..150}; do
  grep -qx 'ST237_PRIVATE_HTTPS_READY' "$work/server.log" && break
  kill -0 "$server_pid" 2>/dev/null || exit 1
  sleep .2
done
grep -qx 'ST237_PRIVATE_HTTPS_READY' "$work/server.log"
phase=BROWSER
setsid env -u ST237_PG_PASSWORD -u ST237_PRIVATE_CONFIG -u ST237_LEAF_KEY -u ST237_LEAF_CHAIN \
  node apps/web/test/private-profile-browser.mjs > "$work/browser.log" 2>&1 & browser_pid=$!
for ((i=0;i<2400;i++)); do kill -0 "$browser_pid" 2>/dev/null || break; sleep .1; done
kill -0 "$browser_pid" 2>/dev/null && exit 1
if ! wait "$browser_pid"; then
  grep -E '^FAIL ST237_BROWSER_PROFILE phase=(LAUNCH|IDENTIFIER|OTP|SIMULATOR|PROFILE|AUTHORITY_NEGATIVES|RELOAD)$' "$work/browser.log" >&3 || true
  exit 1
fi
grep -qx "PASS ST237_BROWSER_ENROLLMENT_PROFILE locale=$ST237_BROWSER_LOCALE theme=$ST237_BROWSER_THEME" "$work/browser.log"
for line in ST237_BROWSER_CURRENT_AUTHORITY_NEGATIVES ST237_BROWSER_RELOAD_STOP; do grep -qx "PASS $line" "$work/browser.log"; done
grep '^PASS ST237_BROWSER_' "$work/browser.log" >&3
phase=DATABASE
printf "SELECT 1/(count(*)=1 AND bool_and(display_name='Private Proof' AND profile_complete AND default_currency='SEK' AND language='%s' AND theme='%s'))::integer FROM public.identity_profile;\n" "$ST237_BROWSER_LOCALE" "$ST237_BROWSER_THEME" | owner
printf 'PASS ST237_BROWSER_PROFILE_ACTUAL_PERSISTENCE\n' >&3
phase=CATALOG_RLS
node -e 'const p=require("node:path");const r=require("node:module").createRequire(p.resolve("apps/api/package.json"));const vite=r.resolve("vite");const es=r(require.resolve("esbuild",{paths:[vite]}));if(es.version!=="0.28.2"||r("pg/package.json").version!=="8.23.1")process.exit(1);es.buildSync({entryPoints:[process.argv[1]],outfile:process.argv[2],bundle:true,packages:"external",platform:"node",format:"cjs",nodePaths:[p.resolve("apps/api/node_modules")],logLevel:"silent"})' apps/api/test/private-profile.integration.ts "$work/pg-proof.cjs"
if ! NODE_PATH="$root/apps/api/node_modules" ST237_OWNER_PASSWORD="$owner_pass" timeout 45s node "$work/pg-proof.cjs" > "$work/pg-proof.log" 2>&1; then
  grep -E '^FAIL ST237_PRIVATE_PG phase=(CONFIG|CATALOG|OWNER_RLS)$' "$work/pg-proof.log" >&3 || true
  exit 1
fi
for line in ST237_ACTUAL_ORDINARY_QUALIFIED_CATALOG_EQUIVALENCE ST237_PRIVATE_PROFILE_SECOND_OWNER_DUAL_GUC_ROLLBACK_POOL_RESET; do
  grep -qx "PASS $line" "$work/pg-proof.log"
  printf 'PASS %s\n' "$line" >&3
done
phase=CUSTODY
custody
complete=1
