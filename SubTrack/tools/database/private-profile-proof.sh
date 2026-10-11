#!/usr/bin/env bash
# Disposable private browser/PG integration. All diagnostics and secret material remain in owned TEMP.
set -euo pipefail
[[ "$#" == 2 && "$1" == --case && "$2" =~ ^(profile|partial-terminal|subscriptions|empty|uncertainty)$ ]] || exit 1
proof_case="$2"
export ST237_BROWSER_CASE="$proof_case"
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$root"
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
work="$(mktemp -d "$base/st237-profile.XXXXXXXX")"
[[ "$work" == "$base"/st237-profile.* && ! -L "$work" ]] || exit 1
exec 3>&1 4>&2
exec >"$work/internal.log" 2>&1
phase=SOURCE step=unavailable
cid='' network='' server_pid='' browser_pid='' complete=0
marker="$(openssl rand -hex 16)"
name="st237-profile-$marker"
image=mirror.gcr.io/library/postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
head="${ST237_EXPECTED_HEAD:-}"
db=st237_private_https_profile
source_inputs="$work/source-inputs"
source_digest() {
  while IFS= read -r rel; do
    [[ -f "$rel" && ! -L "$rel" ]] || return 1
    full="$(git ls-files --full-name "$rel")"
    blob="$(git rev-parse "$head:$full")"
    [[ "$(git hash-object "$rel")" == "$blob" ]] || return 1
    digest="$(sha256sum "$rel")"; digest="${digest%% *}"
    printf '%s %s %s\n' "$full" "$blob" "$digest"
  done < <(git ls-files apps/api/src/auth apps/api/src/profile apps/api/prisma apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/test/private-profile.integration.ts apps/api/test/profile-business-catalog.ts apps/api/test/profile-business-schema.integration.ts apps/api/test/clean-migration-rls.integration.ts apps/web/private-https-server.mjs apps/web/app apps/web/lib apps/web/components apps/web/middleware.ts apps/web/next.config.ts apps/web/package.json apps/web/tsconfig.json apps/web/test/private-profile-browser.mjs packages/contracts packages/i18n packages/money packages/ui packages/ui-tokens pnpm-lock.yaml tools/database/private-profile-proof.sh tools/database/clean-migration-proof.sh ../.github/workflows/subtrack-private-https-profile-proof.yml)
}
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
attached=x["NetworkSettings"]["Networks"]
assert set(attached)=={name} and attached[name]["NetworkID"] in ("",net)
assert set(h["PortBindings"])=={"5432/tcp"}
assert all(p["HostIp"]=="127.0.0.1" for p in h["PortBindings"]["5432/tcp"])
if x["State"]["Running"]:
  assert attached[name]["NetworkID"]==net and len(attached[name]["EndpointID"])==64
  bindings=x["NetworkSettings"]["Ports"]
  assert set(bindings)=={"5432/tcp"} and len(bindings["5432/tcp"])==1
  mapped=bindings["5432/tcp"][0]
  assert mapped["HostIp"]=="127.0.0.1" and mapped["HostPort"].isdigit() and 0<int(mapped["HostPort"])<65536
assert set(h["Tmpfs"])=={"/var/lib/postgresql/data"}
assert all(m["Type"]=="tmpfs" and m["Destination"]=="/var/lib/postgresql/data" and m["RW"] is True for m in x["Mounts"])
' "$cid" "$name" "$marker" "$head" "$image" "$network" || return 1
  docker network inspect "$network" | python3 -c '
import json,sys
x=json.load(sys.stdin)[0]; ident,marker,head,cid=sys.argv[1:]
assert x["Id"]==ident and x["Internal"] is False and x["Driver"]=="bridge"
assert x["Options"]=={"com.docker.network.bridge.host_binding_ipv4":"127.0.0.1","com.docker.network.bridge.gateway_mode_ipv4":"nat"}
assert x["Labels"]["subtrack.task"]=="ST-237:"+marker and x["Labels"]["subtrack.head"]==head
assert set(x["Containers"]).issubset({cid})
' "$network" "$marker" "$head" "$cid" || return 1
  if [[ "$(docker inspect --format '{{.State.Running}}' "$cid")" == true ]]; then
    endpoint="$(docker inspect --format "{{(index .NetworkSettings.Networks \"$name\").EndpointID}}" "$cid")"
    [[ "$endpoint" =~ ^[a-f0-9]{64}$ ]] || return 1
    docker network inspect "$network" | python3 -c 'import json,sys;x=json.load(sys.stdin)[0];assert set(x["Containers"])=={sys.argv[1]} and x["Containers"][sys.argv[1]]["EndpointID"]==sys.argv[2]' "$cid" "$endpoint" || return 1
  fi
  return 0
}
cleanup() {
  local code=$? ok=1 sqlstate=unavailable observed
  if [[ -f "$work/browser.log" ]]; then grep -E '^FAIL ST237_BROWSER_CASE case=(profile|partial-terminal|subscriptions|empty|uncertainty) phase=(LAUNCH|NAVIGATE|IDENTIFIER|IDENTIFIER_READY|IDENTIFIER_SUBMIT|OTP|SIMULATOR|PROFILE|PROFILE_EDIT|PROFILE_SAVE|PROFILE_SAVED|PROFILE_WIRE|PROFILE_COOKIES|AUTHORITY_NEGATIVES|RESTART|LOST_RESPONSE|RELOAD|RELOAD_NAVIGATE|RELOAD_STOP|RELOAD_ABSENT|PARTIAL_TERMINAL|PARTIAL_SETUP|PARTIAL_NAVIGATE|PARTIAL_READY|PARTIAL_FILL|PARTIAL_SUBMIT|PARTIAL_OTP|PARTIAL_SIMULATOR|PARTIAL_COMPLETE|PARTIAL_READ|PARTIAL_STOP|PARTIAL_COOKIES|SUBSCRIPTION_SEED_BARRIER|MODE_CHOICE|SUBSCRIPTION_LIST|SUBSCRIPTION_DETAIL|SUBSCRIPTION_STATUS|SUBSCRIPTION_NEGATIVES|SUBSCRIPTION_INCOMPLETE|SUBSCRIPTION_RESTART|EMPTY_LIST) navigation=(200|304|400|404|500|NONE|OTHER) patch=(200|400|401|403|409|500|NONE|OTHER) read=(200|400|401|403|409|500|NONE|OTHER) reloadNavigation=(reload|navigate|back_forward|prerender|NONE|OTHER) reloadStatus=(200|304|400|404|500|NONE|OTHER) reloadError=(NONE|TIMEOUT|TLS|CONNECTION|ABORT|OTHER) reloadPageClosed=(NONE|YES|NO) reloadRequestFailure=(NONE|TIMEOUT|TLS|CONNECTION|ABORT|OTHER) partialNavigation=(200|304|400|404|500|NONE|OTHER) partialCompletion=(201|400|401|403|409|500|NONE|OTHER) partialRead=(200|400|401|403|409|500|NONE|OTHER) partialCompletionCount=(ZERO|ONE|MANY) partialRoute=(NONE|OK|FAILED)$|^ST237_NEGATIVE_GATE case=(NONE|BROWSER_MATRIX|BROWSER_CSRF|BROWSER_FOREIGN_BODY|BROWSER_DUPLICATE_BODY|BROWSER_VALID|COOKIE_ROSTER|ORIGIN|CHAIN_MISSING|CHAIN_FOREIGN|CHAIN_DUPLICATE|BINDING_MISSING|BINDING_FOREIGN|REFRESH_EXTRA|CSRF_MISSING|WRONG_HOST|NATIVE_DUPLICATE_BODY|STORAGE) status=(200|400|401|403|409|421|500|NONE|OTHER) network=(NONE|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|TLS|OTHER)$' "$work/browser.log" >&3 || true; fi
  if [[ -f "$work/server.log" ]]; then
    grep -E '^ST237_STARTUP_GATE (ENV|CONNECT|IDENTITY|SOURCE|FUNCTIONS|FUNCTION_COUNT|FUNCTION_NAME|PRINCIPALS|PROFILE_COLUMNS|PROFILE_POLICIES|PROFILE_GRANTS|PROFILE_CONSTRAINTS|AUTH_TABLES|AUTH_POLICIES|AUTH_GRANTS|AUTH_ROLES|AUTH_DOMAINS|AUTH_CONSTRAINTS|EPOCH|FENCE_QUERY_FAILED|FENCE_REJECTED|FENCE_ACCEPTED|COMMIT_FAILED|COMMIT_CLEAN|RESET_REJECTED|RESET_CLEAN|COMPOSITION|COMPOSITION_READY|FRAMEWORK|FRAMEWORK_READY|NEXT|NEXT_FAILED_(PORT|PERMISSION|MISSING_FILE|LOCK|COMPILER|CONFIG|TYPE|SYNTAX|OTHER)|NEXT_READY|LISTEN)$' "$work/server.log" | tail -1 >&3 || true
    grep -E '^ST237_FUNCTION_GATE [a-z_]+ (BODY|SECURITY|OWNER|LANGUAGE|VOLATILITY|PARALLEL|STRICT|SET|CONFIG|GRANT_KIND|GRANTEES|SIGNATURE|TERMINAL_ARGS)$|^ST237_STARTUP_SQLSTATE [A-Z0-9]{5}$' "$work/server.log" >&3 || true
    grep -E '^ST238_PROFILE_COLUMNS_DIAGNOSTIC mode_default=(implicit_null|explicit_varchar_null|other|missing_or_duplicate) other_matches=([0-9]|1[0-3])/13$' "$work/server.log" >&3 || true
  fi
  trap - EXIT INT TERM
  if [[ "$phase" == INSTALL && -f "$work/internal.log" ]]; then
    observed="$(sed -nE 's/^ERROR:[[:space:]]+([A-Z0-9]{5}).*/\1/p' "$work/internal.log" | tail -n 1)"
    [[ "$observed" =~ ^[A-Z0-9]{5}$ ]] && sqlstate="$observed"
  fi
  stop_group "$browser_pid" || ok=0
  stop_group "$server_pid" || ok=0
  if [[ -n "$cid" ]]; then
    if custody; then docker rm -f "$cid" >/dev/null 2>&1 || ok=0; else ok=0; fi
    docker inspect "$cid" >/dev/null 2>&1 && ok=0 || true
  fi
  if [[ -n "$network" ]]; then
    if docker network inspect "$network" | python3 -c 'import json,sys;x=json.load(sys.stdin)[0];assert x["Id"]==sys.argv[1] and x["Internal"] is False and x["Labels"]["subtrack.task"]=="ST-237:"+sys.argv[2] and x["Labels"]["subtrack.head"]==sys.argv[3] and not x["Containers"]' "$network" "$marker" "$head"; then
      docker network rm "$network" >/dev/null 2>&1 || ok=0
    else ok=0; fi
    docker network inspect "$network" >/dev/null 2>&1 && ok=0 || true
  fi
  if [[ "$work" == "$base"/st237-profile.* && -d "$work" && ! -L "$work" ]]; then rm -rf -- "$work" || ok=0; else ok=0; fi
  [[ ! -e "$work" && ! -L "$work" ]] || ok=0
  if (( code==0 && complete==1 && ok==1 )); then
    printf 'PASS ST237_PRIVATE_PG_TLS_SECRET_CUSTODY\nPASS ST237_PRIVATE_CASE case=%s\nPROOF PASS head=%s cleanup=removed\n' "$proof_case" "$head" >&3
    exit 0
  fi
  printf 'FAIL ST237_PRIVATE_PROFILE phase=%s step=%s sqlstate=%s cleanup=%s\n' "$phase" "$step" "$sqlstate" "$([[ "$ok" == 1 ]] && printf removed || printf failed)" >&4
  exit 1
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ "$head" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" == "$head" ]]
[[ "${ST237_BROWSER_LOCALE:-}" =~ ^(sv|en)$ && "${ST237_BROWSER_THEME:-}" =~ ^(light|dark)$ ]]
printf 'INPUT case=%s head=%s\n' "$proof_case" "$head" >&3
source_digest > "$source_inputs"
while read -r full blob digest; do printf 'INPUT file=%s blob=%s sha256=%s\n' "$full" "$blob" "$digest" >&3; done < "$source_inputs"
find apps/api/dist -type f -print0 | sort -z | xargs -0 sha256sum > "$work/build-inputs"
[[ -s "$work/build-inputs" ]]
phase=FIXTURE
engine="$(docker version --format '{{.Server.Version}}')"
[[ "$engine" =~ ^([0-9]+)\.[0-9]+\.[0-9]+ ]] && (( BASH_REMATCH[1]>=28 ))
printf 'RUNTIME docker_server=%s\n' "$engine" >&3
owner_pass="$(openssl rand -hex 24)" actor_pass="$(openssl rand -hex 24)"
printf 'POSTGRES_USER=st233a_fixture_owner\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n' "$db" "$owner_pass" > "$work/pg.env"
printf '127.0.0.1:5432:%s:st233a_fixture_owner:%s\n' "$db" "$owner_pass" > "$work/pgpass"
step=NETWORK_CREATE
network="$(docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 --opt com.docker.network.bridge.gateway_mode_ipv4=nat --label "subtrack.task=ST-237:$marker" --label "subtrack.head=$head" "$name")"
[[ "$network" =~ ^[a-f0-9]{64}$ ]]
docker create --name "$name" --label "subtrack.task=ST-237:$marker" --label "subtrack.head=$head" \
  --network "$network" -p 127.0.0.1::5432 --pids-limit 128 --memory 512m --cpus 2 \
  --tmpfs /var/lib/postgresql/data --env-file "$work/pg.env" "$image" > "$work/cid"
cid="$(cat "$work/cid")"; step=CREATED_CUSTODY; custody
docker start "$cid" >/dev/null
for _ in {1..60}; do docker exec "$cid" pg_isready -h 127.0.0.1 -U st233a_fixture_owner -d "$db" >/dev/null && break; sleep 1; done
docker exec "$cid" pg_isready -h 127.0.0.1 -U st233a_fixture_owner -d "$db" >/dev/null
step=RUNNING_CUSTODY
custody
phase=FIXTURE_PORT step=PORT_BINDING
port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$cid")"
[[ "$port" =~ ^[0-9]+$ && "$port" -gt 0 && "$port" -lt 65536 ]]
step=HOST_REACHABILITY
node - "$port" <<'NODE'
const net=require('node:net');
const socket=net.createConnection({host:'127.0.0.1',port:Number(process.argv[2])});
socket.setTimeout(5000);
socket.once('connect',()=>socket.end());
socket.once('timeout',()=>{socket.destroy();process.exitCode=1;});
socket.once('error',()=>{process.exitCode=1;});
NODE
printf 'PASS ST237_PRE_SEED_EXACT_LOOPBACK_BINDING_HOST_REACHABILITY\n' >&3
docker cp "$work/pgpass" "$cid:/tmp/st237.pgpass" >/dev/null
owner() { timeout 25s docker exec -i -e PGPASSFILE=/tmp/st237.pgpass "$cid" psql -X -q -A -t -h 127.0.0.1 -U st233a_fixture_owner -d "$db" -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate; }
phase=INSTALL
step=ORDINARY_0001
owner < apps/api/prisma/migrations/0001_canonical_schema/migration.sql
step=ORDINARY_0002
owner < apps/api/prisma/migrations/0002_privacy_constraints/migration.sql
step=FIXTURE_CONTROL
printf "REVOKE TEMPORARY,CREATE ON DATABASE %s FROM PUBLIC; CREATE TABLE public.st233a_fixture_control(task text,head text,marker text); REVOKE ALL ON public.st233a_fixture_control FROM PUBLIC; INSERT INTO public.st233a_fixture_control VALUES ('ST-233a','%s','%s');\n" "$db" "$head" "$marker" | owner
step=QUALIFIED_001
{ printf "SET st233a.head='%s'; SET st233a.marker='%s';\n" "$head" "$marker"; cat apps/api/prisma/development-auth/001-epoch-nonce-reservation.sql; } | owner
constraints_pin="$(printf "SELECT md5(string_agg(format('%%s:%%s:%%s:%%s:%%s',c.conname,c.contype,c.convalidated,c.condeferrable,pg_get_constraintdef(c.oid)),E'\\n' ORDER BY c.conname,c.oid)) FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::regnamespace;\n" | owner)"
[[ "$constraints_pin" =~ ^[a-f0-9]{32}$ ]]
for sql in apps/api/prisma/development-auth/{002,003,004,005,006,007,008,009,010,011}-*.sql; do
  step="QUALIFIED_$(basename "$sql" | cut -d- -f1)"
  { printf "SET st233a.head='%s'; SET st233a.marker='%s'; SET st233c.constraints='%s';\n" "$head" "$marker" "$constraints_pin"; cat "$sql"; } | owner
done
step=AUTH_CATALOG_PIN
catalog_pin="$(printf "SELECT md5(string_agg(format('%%s:%%s:%%s:%%s:%%s',c.conname,c.contype,c.convalidated,c.condeferrable,pg_get_constraintdef(c.oid)),E'\\n' ORDER BY c.conname,c.oid)) FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::regnamespace;\n" | owner)"
[[ "$catalog_pin" =~ ^[a-f0-9]{32}$ ]]
printf 'ST237_INSTALLED_AUTH_CONSTRAINTS_MD5 %s\n' "$catalog_pin" >&3
step=LOGIN_PASSWORD
printf "ALTER ROLE subtrack_dev_auth_login PASSWORD '%s';\n" "$actor_pass" | owner
export NODE_ENV=development ST237_PRIVATE_CONFIG="$work/auth.json"
node - "$ST237_PRIVATE_CONFIG" "$work/seed.sql" <<'NODE'
const fs=require('node:fs');
const epoch=require('./apps/api/dist/auth/private-auth-epoch.js').provisionPrivateAuthEpoch(process.argv[2]);
if(!/^[a-f0-9]{64}$/.test(epoch.manifestHash)) process.exit(1);
fs.writeFileSync(process.argv[3],`INSERT INTO subtrack_auth.epoch VALUES ('st237_private_https_v1','${epoch.manifestHash}','https://localhost:3443',0,'active');\n`,{mode:0o600});
NODE
step=EPOCH_SEED
owner < "$work/seed.sql"
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
export ST237_HANDSHAKE_DIR="$work/handshake" ST237_SCREENSHOT_DIR="$base/st237-profile-screenshots/$proof_case"
mkdir -m 700 "$ST237_HANDSHAKE_DIR"
mkdir -p -m 700 "$base/st237-profile-screenshots"
[[ ! -e "$ST237_SCREENSHOT_DIR" && ! -L "$ST237_SCREENSHOT_DIR" ]]
cp "$work/ca.crt" "$ST237_HANDSHAKE_DIR/ca.crt"
start_server() {
  setsid node apps/web/private-https-server.mjs > "$work/server.log" 2>&1 & server_pid=$!
  for _ in {1..150}; do
    grep -qx 'ST237_PRIVATE_HTTPS_READY' "$work/server.log" && break
    kill -0 "$server_pid" 2>/dev/null || return 1
    sleep .2
  done
  grep -qx 'ST237_PRIVATE_HTTPS_READY' "$work/server.log"
}
refuses_startup() {
  local label="$1" code=0
  timeout 20s node apps/web/private-https-server.mjs > "$work/refusal.log" 2>&1 || code=$?
  [[ "$code" -ne 0 && "$code" -ne 124 ]] || return 1
  ! grep -q 'ST237_PRIVATE_HTTPS_READY' "$work/refusal.log" || return 1
  printf 'PASS ST237_STARTUP_REFUSES_%s\n' "$label" >&3
}
phase=BUNDLE_REFUSAL
cp "$ST237_PRIVATE_CONFIG" "$work/auth.saved"
mv "$ST237_PRIVATE_CONFIG" "$work/auth.absent"
refuses_startup MISSING_BUNDLE
mv "$work/auth.absent" "$ST237_PRIVATE_CONFIG"
for change in key pair hash tuple; do
  node - "$ST237_PRIVATE_CONFIG" "$change" <<'NODE'
const fs=require('node:fs');
const file=process.argv[2], change=process.argv[3], b=JSON.parse(fs.readFileSync(file,'utf8'));
const flip=v=>`${v[0]==='A'?'B':'A'}${v.slice(1)}`;
if(change==='key') b.keys['enrollment.session']=flip(b.keys['enrollment.session']);
else if(change==='pair') b.accessPublicSpkiDer=require('node:crypto').generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).toString('base64url');
else if(change==='hash') b.manifestHash=`${b.manifestHash[0]==='0'?'1':'0'}${b.manifestHash.slice(1)}`;
else if(change==='tuple') b.origin='https://st233a.invalid';
fs.writeFileSync(file,JSON.stringify(b),{mode:0o600});
NODE
  refuses_startup "${change^^}"
  cp "$work/auth.saved" "$ST237_PRIVATE_CONFIG"
done
[[ "$(sha256sum "$ST237_PRIVATE_CONFIG" | cut -d' ' -f1)" == "$(sha256sum "$work/auth.saved" | cut -d' ' -f1)" ]]
phase=ROW_REFUSAL
printf "UPDATE subtrack_auth.epoch SET manifest_h=repeat('0',64) WHERE id='st237_private_https_v1';\n" | owner
refuses_startup ALTERED_ACTIVE_ROW
printf "UPDATE subtrack_auth.epoch SET manifest_h=(SELECT manifest_h FROM subtrack_auth.epoch LIMIT 1),state='retired' WHERE id='st237_private_https_v1';\n" | owner
# Restore M from the trusted bundle, without sending its contents to a log.
manifest="$(node -e 'const b=require(process.argv[1]);process.stdout.write(b.manifestHash)' "$ST237_PRIVATE_CONFIG")"
printf "UPDATE subtrack_auth.epoch SET manifest_h='%s',state='retired' WHERE id='st237_private_https_v1';\n" "$manifest" | owner
refuses_startup RETIRED_ACTIVE_ROW
printf "UPDATE subtrack_auth.epoch SET state='active';\n" | owner
# Referential rows from the natural browser do not yet exist, so absence is reversible here.
printf "DELETE FROM subtrack_auth.epoch WHERE id='st237_private_https_v1';\n" | owner
refuses_startup MISSING_ACTIVE_ROW
owner < "$work/seed.sql"
phase=SERVER
step=STARTUP
start_server
phase=BROWSER
setsid env -u ST237_PG_PASSWORD -u ST237_PRIVATE_CONFIG -u ST237_LEAF_KEY -u ST237_LEAF_CHAIN \
  NODE_EXTRA_CA_CERTS="$work/ca.crt" node apps/web/test/private-profile-browser.mjs > "$work/browser.log" 2>&1 & browser_pid=$!
if [[ "$proof_case" == profile ]]; then
phase=RESTART
for ((i=0;i<1200;i++)); do
  [[ -f "$ST237_HANDSHAKE_DIR/ready" ]] && break
  kill -0 "$browser_pid" 2>/dev/null || break
  sleep .1
done
[[ -f "$ST237_HANDSHAKE_DIR/ready" ]]
stop_group "$server_pid"; server_pid=''
start_server
: > "$ST237_HANDSHAKE_DIR/resume"
fi
if [[ "$proof_case" == subscriptions || "$proof_case" == uncertainty ]]; then
  phase=SUBSCRIPTION_FIXTURE
  for ((i=0;i<1200;i++)); do
    [[ -f "$ST237_HANDSHAKE_DIR/subscription-seed-ready" ]] && break
    kill -0 "$browser_pid" 2>/dev/null || break
    sleep .1
  done
  [[ -f "$ST237_HANDSHAKE_DIR/subscription-seed-ready" ]]
  owner <<'SQL'
SELECT 1/(count(*)=1 AND bool_and(profile_complete AND onboarding_mode IS NULL))::integer
  FROM public.identity_profile WHERE display_name='Private Proof';
SELECT 1/(count(*)=0)::integer FROM public.subscription;
INSERT INTO public.subscription(identity_id,custom_name,category_code,cadence,
  expected_amount_minor,currency,status,source,always_private,created_at,updated_at)
SELECT p.identity_id,'Proof Subscription '||pg_catalog.lpad(g.i::text,3,'0'),
  'OTHER_SUBSCRIPTION','MONTHLY',100+g.i,'SEK','ACTIVE','MANUAL',true,
  '2026-01-01 00:00:00.123456+00'::timestamptz,
  '2026-01-01 00:00:00.123456+00'::timestamptz
FROM public.identity_profile p CROSS JOIN pg_catalog.generate_series(1,51) AS g(i)
WHERE p.display_name='Private Proof' AND p.profile_complete;
SELECT 1/(count(*)=51)::integer FROM public.subscription;
SQL
  foreign_id="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
  foreign_subscription="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
  [[ "$foreign_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
  [[ "$foreign_subscription" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
  printf '%s' "$foreign_subscription" > "$ST237_HANDSHAKE_DIR/foreign-id"
  printf "INSERT INTO public.identity(id,auth_method,updated_at) VALUES ('%s'::uuid,'MOCK',now()); INSERT INTO public.identity_profile(identity_id,profile_complete,onboarding_mode) VALUES ('%s'::uuid,true,'just-me'); INSERT INTO public.subscription(id,identity_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at) VALUES ('%s'::uuid,'%s'::uuid,'Foreign proof','OTHER_SUBSCRIPTION','MONTHLY',100,'SEK','ACTIVE','MANUAL',true,now());\n" "$foreign_id" "$foreign_id" "$foreign_subscription" "$foreign_id" | owner
  : > "$ST237_HANDSHAKE_DIR/subscription-seeded"
fi
if [[ "$proof_case" == uncertainty ]]; then
  phase=SUBSCRIPTION_RESTART
  for ((i=0;i<1200;i++)); do
    [[ -f "$ST237_HANDSHAKE_DIR/ready" ]] && break
    kill -0 "$browser_pid" 2>/dev/null || break
    sleep .1
  done
  [[ -f "$ST237_HANDSHAKE_DIR/ready" ]]
  stop_group "$server_pid"; server_pid=''
  start_server
  : > "$ST237_HANDSHAKE_DIR/resume"
fi
phase=BROWSER
for ((i=0;i<2400;i++)); do kill -0 "$browser_pid" 2>/dev/null || break; sleep .1; done
kill -0 "$browser_pid" 2>/dev/null && exit 1
if ! wait "$browser_pid"; then
  grep -E '^FAIL ST237_BROWSER_CASE case=(profile|partial-terminal|subscriptions|empty|uncertainty) phase=(LAUNCH|NAVIGATE|IDENTIFIER|IDENTIFIER_READY|IDENTIFIER_SUBMIT|OTP|SIMULATOR|PROFILE|PROFILE_EDIT|PROFILE_SAVE|PROFILE_SAVED|PROFILE_WIRE|PROFILE_COOKIES|AUTHORITY_NEGATIVES|RESTART|LOST_RESPONSE|RELOAD|RELOAD_NAVIGATE|RELOAD_STOP|RELOAD_ABSENT|PARTIAL_TERMINAL|PARTIAL_SETUP|PARTIAL_NAVIGATE|PARTIAL_READY|PARTIAL_FILL|PARTIAL_SUBMIT|PARTIAL_OTP|PARTIAL_SIMULATOR|PARTIAL_COMPLETE|PARTIAL_READ|PARTIAL_STOP|PARTIAL_COOKIES|SUBSCRIPTION_SEED_BARRIER|MODE_CHOICE|SUBSCRIPTION_LIST|SUBSCRIPTION_DETAIL|SUBSCRIPTION_STATUS|SUBSCRIPTION_NEGATIVES|SUBSCRIPTION_INCOMPLETE|SUBSCRIPTION_RESTART|EMPTY_LIST) navigation=(200|304|400|404|500|NONE|OTHER) patch=(200|400|401|403|409|500|NONE|OTHER) read=(200|400|401|403|409|500|NONE|OTHER) reloadNavigation=(reload|navigate|back_forward|prerender|NONE|OTHER) reloadStatus=(200|304|400|404|500|NONE|OTHER) reloadError=(NONE|TIMEOUT|TLS|CONNECTION|ABORT|OTHER) reloadPageClosed=(NONE|YES|NO) reloadRequestFailure=(NONE|TIMEOUT|TLS|CONNECTION|ABORT|OTHER) partialNavigation=(200|304|400|404|500|NONE|OTHER) partialCompletion=(201|400|401|403|409|500|NONE|OTHER) partialRead=(200|400|401|403|409|500|NONE|OTHER) partialCompletionCount=(ZERO|ONE|MANY) partialRoute=(NONE|OK|FAILED)$|^ST237_NEGATIVE_GATE case=(NONE|BROWSER_MATRIX|BROWSER_CSRF|BROWSER_FOREIGN_BODY|BROWSER_DUPLICATE_BODY|BROWSER_VALID|COOKIE_ROSTER|ORIGIN|CHAIN_MISSING|CHAIN_FOREIGN|CHAIN_DUPLICATE|BINDING_MISSING|BINDING_FOREIGN|REFRESH_EXTRA|CSRF_MISSING|WRONG_HOST|NATIVE_DUPLICATE_BODY|STORAGE) status=(200|400|401|403|409|421|500|NONE|OTHER) network=(NONE|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|TLS|OTHER)$' "$work/browser.log" >&3 || true
  exit 1
fi
grep -qx "PASS ST237_BROWSER_CASE case=$proof_case locale=$ST237_BROWSER_LOCALE theme=$ST237_BROWSER_THEME" "$work/browser.log"
if [[ "$proof_case" == profile ]]; then
  grep -qx "PASS ST237_BROWSER_ENROLLMENT_PROFILE locale=$ST237_BROWSER_LOCALE theme=$ST237_BROWSER_THEME" "$work/browser.log"
  for line in ST237_BROWSER_CURRENT_AUTHORITY_NEGATIVES ST237_BROWSER_SAME_KEY_FRESH_PROCESS_RESTART ST237_BROWSER_COMMITTED_PATCH_LOST_RESPONSE_SINGLE_SUBMISSION ST237_BROWSER_RELOAD_STOP; do grep -qx "PASS $line" "$work/browser.log"; done
elif [[ "$proof_case" == subscriptions ]]; then
  grep -qx "PASS ST238_BROWSER_NATURAL_OWNER_MODE_LIST_51_DETAIL_STATUS locale=$ST237_BROWSER_LOCALE theme=$ST237_BROWSER_THEME" "$work/browser.log"
  grep -qx 'PASS ST238_BROWSER_NATURAL_INCOMPLETE_CHOICE_AND_LIST_DENIED' "$work/browser.log"
  grep -qx 'PASS ST238_BROWSER_OWNER_HTTPS_MODE_LIST_DETAIL_STATUS_NEGATIVES' "$work/browser.log"
elif [[ "$proof_case" == uncertainty ]]; then
  grep -qx 'PASS ST238_BROWSER_NATURAL_COMMITTED_MODE_STATUS_LOST_RESPONSE_NO_RETRY_RESTART' "$work/browser.log"
elif [[ "$proof_case" == empty ]]; then
  grep -qx 'PASS ST238_BROWSER_NATURAL_OWNER_PERSISTED_EMPTY_LIST' "$work/browser.log"
else
  grep -qx 'PASS ST237_BROWSER_COMMITTED_PARTIAL_TERMINAL_COOKIE_STOP' "$work/browser.log"
fi
grep '^PASS ST237_BROWSER_' "$work/browser.log" >&3
phase=DATABASE
if [[ "$proof_case" == profile ]]; then
printf "SELECT 1/(count(*)=1 AND bool_and(profile_complete AND default_currency='SEK' AND language='%s' AND theme='%s'))::integer FROM public.identity_profile WHERE display_name='Private Proof Updated'; SELECT 1/(count(*)=1)::integer FROM public.identity_profile;\n" "$ST237_BROWSER_LOCALE" "$ST237_BROWSER_THEME" | owner
printf 'PASS ST237_BROWSER_PROFILE_ACTUAL_PERSISTENCE\n' >&3
elif [[ "$proof_case" == subscriptions || "$proof_case" == uncertainty ]]; then
owner <<'SQL'
SELECT 1/(count(*)=1 AND bool_and(profile_complete AND onboarding_mode='just-me'))::integer
  FROM public.identity_profile WHERE display_name='Private Proof';
SELECT 1/((SELECT count(*)=51 FROM public.subscription s JOIN public.identity_profile p ON p.identity_id=s.identity_id WHERE p.display_name='Private Proof')
  AND (SELECT count(*)=52 FROM public.subscription)
  AND (SELECT count(*)=1 FROM public.subscription WHERE status='PAUSED'))::integer;
SQL
printf 'PASS ST238_BROWSER_OWNER_MODE_AND_STATUS_ACTUAL_PERSISTENCE\n' >&3
elif [[ "$proof_case" == empty ]]; then
owner <<'SQL'
SELECT 1/(count(*)=1 AND bool_and(profile_complete AND onboarding_mode='just-me'))::integer
  FROM public.identity_profile WHERE display_name='Private Proof';
SELECT 1/(count(*)=0)::integer FROM public.subscription;
SQL
printf 'PASS ST238_BROWSER_OWNER_EMPTY_ACTUAL_PERSISTENCE\n' >&3
else
  owner <<'SQL'
SELECT 1/((SELECT count(*)=1 FROM public.identity)
  AND (SELECT count(*)=1 FROM public.identity_profile)
  AND (SELECT count(*)=1 FROM subtrack_auth.family)
  AND (SELECT count(*)=1 FROM subtrack_auth.session)
  AND (SELECT count(*)=1 FROM subtrack_auth.credential)
  AND (SELECT count(*)=1 FROM subtrack_auth.csrf)
  AND (SELECT count(*)=0 FROM subtrack_auth.verified_enrollment)
  AND (SELECT count(*)=0 FROM subtrack_auth.identity_birth)
  AND (SELECT count(*)=0 FROM subtrack_auth.enrollment_intent)
  AND (SELECT count(*)=0 FROM subtrack_auth.nonce WHERE purpose='session')
  AND (SELECT count(*)=1 FROM subtrack_auth.reservation WHERE operation='completeEnrollment' AND state='completed'))::integer;
SELECT 1/(count(*)=1)::integer FROM public.identity i
JOIN public.identity_profile p ON p.identity_id=i.id
JOIN subtrack_auth.family f ON f.identity_id=i.id
JOIN subtrack_auth.session s ON s.identity_id=i.id AND s.family_id=f.family_id AND s.epoch=f.epoch
JOIN subtrack_auth.credential c ON c.identity_id=i.id AND c.session_id=s.session_id AND c.family_id=f.family_id AND c.epoch=s.epoch
JOIN subtrack_auth.csrf x ON x.identity_id=i.id AND x.session_id=s.session_id AND x.family_id=f.family_id AND x.epoch=s.epoch
WHERE i.deleted_at IS NULL AND i.auth_method='BANKID'
  AND NOT p.profile_complete AND p.default_currency='SEK' AND p.display_name IS NULL
  AND p.avatar_color IS NULL AND p.avatar_emoji IS NULL
  AND f.revoked_ms IS NULL AND s.revoked_ms IS NULL AND c.state='current'
  AND s.transport='web' AND s.origin='https://localhost:3443' AND s.epoch='st237_private_https_v1';
SQL
  printf 'PASS ST237_BROWSER_PARTIAL_TERMINAL_ACTUAL_SINGLE_COMMIT\n' >&3
fi
phase=CATALOG_RLS
node -e 'const p=require("node:path");const r=require("node:module").createRequire(p.resolve("apps/api/package.json"));const vite=r.resolve("vite");const es=r(require.resolve("esbuild",{paths:[vite]}));if(es.version!=="0.28.2"||r("pg/package.json").version!=="8.23.1")process.exit(1);es.buildSync({entryPoints:[process.argv[1]],outfile:process.argv[2],bundle:true,packages:"external",platform:"node",format:"cjs",nodePaths:[p.resolve("apps/api/node_modules")],logLevel:"silent"})' apps/api/test/private-profile.integration.ts "$work/pg-proof.cjs"
if ! NODE_PATH="$root/apps/api/node_modules" ST237_OWNER_PASSWORD="$owner_pass" timeout 45s node "$work/pg-proof.cjs" > "$work/pg-proof.log" 2>&1; then
  grep -E '^FAIL ST237_PRIVATE_PG phase=(CONFIG|CATALOG|TUPLE|OWNER_RLS|EXPIRED_OWNER|UNKNOWN_COMMIT|SUBSCRIPTION_OWNER|SUBSCRIPTION_MODE|SUBSCRIPTION_CURSOR|SUBSCRIPTION_STATUS)$' "$work/pg-proof.log" >&3 || true
  grep -E '^FAIL ST237_PRIVATE_PG phase=SUBSCRIPTION_OWNER substep=(household|member|subscription|share|peer_before|force|peer_after|detail_foreign|detail_missing|lock_foreign|lock_missing) class=(ASSERTION|SQL) sqlstate=([A-Z0-9]{5}|unavailable)$' "$work/pg-proof.log" >&3 || true
  grep -E '^FAIL ST237_PRIVATE_PG phase=SUBSCRIPTION_MODE substep=(mode_incomplete|mode_choose|mode_reread) class=(ASSERTION|SQL) sqlstate=([A-Z0-9]{5}|unavailable)$' "$work/pg-proof.log" >&3 || true
  grep -E '^FAIL ST237_PRIVATE_PG phase=SUBSCRIPTION_CURSOR substep=(cursor_insert|cursor_page|cursor_ties) class=(ASSERTION|SQL) sqlstate=([A-Z0-9]{5}|unavailable)$' "$work/pg-proof.log" >&3 || true
  grep -E '^FAIL ST237_PRIVATE_PG phase=SUBSCRIPTION_STATUS substep=(status_lock|status_compare|status_readback) class=(ASSERTION|SQL) sqlstate=([A-Z0-9]{5}|unavailable)$' "$work/pg-proof.log" >&3 || true
  exit 1
fi
for line in ST237_ACTUAL_ORDINARY_QUALIFIED_CATALOG_EQUIVALENCE ST237_ACTUAL_PG_AND_CONSTRUCTOR_CROSS_PAIRED_TUPLE_REFUSAL ST237_PRIVATE_PROFILE_SECOND_OWNER_DUAL_GUC_ROLLBACK_POOL_RESET ST237_PRIVATE_ACTUAL_PG_DELETED_OWNER_EXPIRED_CSRF_REFUSAL ST237_PRIVATE_ACTUAL_PG_UNKNOWN_COMMIT_DISCARD_NO_RETRY ST238_ACTUAL_PG_PEER_POLICY_FORCE_BEFORE_AFTER_OWNER_PREDICATE ST238_ACTUAL_PG_INCOMPLETE_MODE_AND_REPEAT_NO_UPDATE ST238_ACTUAL_PG_OWNER_CURSOR_50_51_103_TIED_MICROSECONDS ST238_ACTUAL_PG_LOCKED_STATUS_STALE_COMPARE_AND_READBACK; do
  grep -qx "PASS $line" "$work/pg-proof.log"
  printf 'PASS %s\n' "$line" >&3
done
phase=SCHEMA_REFUSAL
stop_group "$server_pid"; server_pid=''
printf "ALTER ROLE subtrack_runtime BYPASSRLS;\n" | owner
refuses_startup RUNTIME_BYPASSRLS
printf "ALTER ROLE subtrack_runtime NOBYPASSRLS;\n" | owner
printf "ALTER FUNCTION subtrack_auth.fence(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) SET search_path=public;\n" | owner
refuses_startup CHANGED_FUNCTION_CONFIG
printf "ALTER FUNCTION subtrack_auth.fence(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) SET search_path=pg_catalog;\n" | owner
printf "ALTER POLICY identity_profile_select ON public.identity_profile USING (true);\n" | owner
refuses_startup BROAD_PROFILE_POLICY
printf "ALTER POLICY identity_profile_select ON public.identity_profile USING (public.subtrack_principal_matches(identity_id));\n" | owner
printf "GRANT UPDATE(display_name) ON public.identity_profile TO PUBLIC;\n" | owner
refuses_startup BROAD_PROFILE_GRANT
printf "REVOKE UPDATE(display_name) ON public.identity_profile FROM PUBLIC;\n" | owner
printf "ALTER TABLE public.identity_profile ADD COLUMN st237_drift pg_catalog.text;\n" | owner
refuses_startup CHANGED_PROFILE_SHAPE
printf "ALTER TABLE public.identity_profile DROP COLUMN st237_drift;\n" | owner
start_server
phase=FINISH_SOURCE
source_digest > "$work/source-finish"
cmp "$source_inputs" "$work/source-finish"
find apps/api/dist -type f -print0 | sort -z | xargs -0 sha256sum > "$work/build-finish"
cmp "$work/build-inputs" "$work/build-finish"
printf 'PASS ST237_SOURCE_AND_EXECUTED_BUNDLE_RECHECK\n' >&3
phase=CUSTODY
custody
complete=1
