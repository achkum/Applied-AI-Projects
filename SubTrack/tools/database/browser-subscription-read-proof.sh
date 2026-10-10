#!/usr/bin/env bash
# ST-222: owned disposable PostgreSQL 16, compiled HTTPS child and real Chromium proof.
set -euo pipefail
umask 077
unset DATABASE_URL
base="${RUNNER_TEMP:?}"
[[ -d "$base" && ! -L "$base" ]] || exit 1
record="$base/st222-container"
receipt="$base/st222-proof-receipt.txt"
source_head=$(git rev-parse --verify HEAD)
[[ "$source_head" =~ ^[a-f0-9]{40}$ ]] || exit 1
cleanup_container() {
  [[ "$#" -eq 0 || "$#" -eq 4 ]] || return 1
  if [[ ! -e "$record" && ! -L "$record" ]]; then
    if [[ "$#" -eq 0 ]]; then return 0; else return 1; fi
  fi
  [[ -f "$record" && ! -L "$record" ]] || return 1
  local cid label name created extra actual remaining found named actualcid actualname actuallabel actualcreated image mountcount mount portcount bindingcount hostip
  [[ "$(stat -c '%a:%u' -- "$record")" == "600:$(id -u)" ]] || return 1
  read -r cid label name created extra < "$record" || return 1
  [[ -z "$extra" ]] || return 1
  if [[ "$#" -eq 4 ]]; then
    [[ "$cid" == "$1" && "$label" == "$2" && "$name" == "$3" && "$created" == "$4" &&
       "$cid" != pending && "$created" != pending ]] || return 1
  fi
  [[ "$label" =~ ^ST-222:[a-f0-9]{32}$ && "$name" =~ ^st222-[0-9]+-[0-9]+-[a-f0-9]{32}$ ]] || return 1
  [[ "$cid" == pending || "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
  found=$(docker inspect --format '{{.Id}}' "$name" 2>/dev/null) || {
    [[ "$cid" == pending ]] || return 1
    docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || return 1
    named=$(docker ps -a --no-trunc --filter "name=^/${name}$" --format '{{.ID}}') || return 1
    [[ -z "$named" ]] || return 1
    rm -- "$record"
    return 0
  }
  [[ "$found" =~ ^[a-f0-9]{64}$ && ( "$cid" == pending || "$cid" == "$found" ) ]] || return 1
  cid="$found"
  actual=$(docker inspect --format '{{.Id}}|{{.Name}}|{{index .Config.Labels "subtrack.task"}}|{{.Created}}|{{.Config.Image}}|{{len .Mounts}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{len .HostConfig.PortBindings}}|{{len (index .HostConfig.PortBindings "5432/tcp")}}|{{(index .HostConfig.PortBindings "5432/tcp" 0).HostIp}}' "$cid" 2>/dev/null) || return 1
  IFS='|' read -r actualcid actualname actuallabel actualcreated image mountcount mount portcount bindingcount hostip <<< "$actual"
  [[ "$created" == pending || "$created" == "$actualcreated" ]] || return 1
  [[ "$actualcid" == "$cid" && "$actualname" == "/$name" && "$actuallabel" == "$label" &&
     "$image" == mirror.gcr.io/library/postgres:16-alpine && "$mountcount" == 1 &&
     "$mount" == tmpfs:/var/lib/postgresql/data && "$portcount" == 1 && "$bindingcount" == 1 &&
     "$hostip" == 127.0.0.1 ]] || return 1
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || return 1
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}') || return 1
  [[ -z "$remaining" ]] || return 1
  rm -- "$record"
}
classify_browser_failure() {
  local line browser_case
  while IFS= read -r line; do
    for browser_case in launch context cookie_properties navigation httponly unauthenticated owner_fetch ambient_headers owner_status owner_projection peer_fetch peer_status peer_projection invisible_missing malformed query csrf selector cross_session_csrf binding mixed origin; do
      case "$line" in
        *"ST-222 browser proof failed: browser:${browser_case}"*) printf 'browser_%s\n' "$browser_case"; return ;;
      esac
    done
    case "${line%$'\r'}" in
      *'ST-222 browser proof failed: fixture'*) printf 'fixture\n'; return ;;
      *'ST-222 browser proof failed: compiled child'*) printf 'compiled_child\n'; return ;;
      *'ST-222 browser proof failed: browser'*) printf 'browser\n'; return ;;
      *'ST-222 browser proof failed: current authority'*) printf 'current_authority\n'; return ;;
      *'ST-222 browser proof failed: SIGTERM listener and pool cleanup'*) printf 'sigterm_cleanup\n'; return ;;
      *'ST-222 browser proof failed: SIGINT listener and pool cleanup'*) printf 'sigint_cleanup\n'; return ;;
      *'ST-222 parent or child cleanup failed'*) printf 'parent_cleanup\n'; return ;;
      *'Failed Suites'*|*'No test files found'*) printf 'collection\n'; return ;;
    esac
  done < "$1"
  printf 'unavailable\n'
}
if [[ "${1:-}" == --cleanup ]]; then cleanup_container; exit; fi
[[ ! -e "$record" && ! -L "$record" ]] || { echo 'ST-222 existing fixture requires verified cleanup' >&2; exit 1; }
printf 'ST-222 proof: FAIL source_head=%s phase=starting code=unavailable\n' "$source_head" > "$receipt"
tmp=$(mktemp -d "$base/st222.XXXXXX")
chmod 700 "$tmp"
phase=starting
passed=false
coverage=unavailable
failure_subphase=unavailable
finish() {
  local status=$?
  trap - EXIT
  local bad=false base_real tmp_real
  if [[ "$passed" == true ]]; then
    cleanup_container "${cid:-}" "${label:-}" "${name:-}" "${created:-}" || bad=true
  else
    cleanup_container || bad=true
  fi
  base_real=$(cd -P -- "$base" && pwd -P) || bad=true
  tmp_real=$(cd -P -- "$tmp" && pwd -P) || bad=true
  if [[ "${tmp_real:-}" == "${base_real:-}/st222."* && "${tmp_real#"$base_real"/}" != */* ]]; then
    rm -rf -- "$tmp_real" || bad=true
    [[ ! -e "$tmp_real" ]] || bad=true
  else bad=true; fi
  if [[ "$bad" == true ]]; then status=1; phase=cleanup; fi
  if [[ "$status" -eq 0 && "$passed" == true ]]; then
    printf 'ST-222 browser subscription read proof: PASS source_head=%s coverage=%s cases=owner,peer,invisible404,malformed,query,selector,csrf,binding,mixed,origin,revoke,expire,pool,nowrite,SIGTERM,SIGINT,listener-reuse,pool-baseline fixture=removed child=stopped secrets=destroyed\n' "$source_head" "$coverage" > "$receipt"
  else
    printf 'ST-222 browser subscription read proof: FAIL source_head=%s phase=%s subphase=%s code=unavailable\n' "$source_head" "$phase" "$failure_subphase" > "$receipt"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 1' INT TERM
owner_pass=$(openssl rand -hex 24)
reader_pass=$(openssl rand -hex 24)
nonce=$(openssl rand -hex 16)
label="ST-222:$nonce"
name="st222-${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}-$nonce"
[[ "$name" =~ ^st222-[0-9]+-[0-9]+-[a-f0-9]{32}$ ]] || exit 1
printf 'pending %s %s pending\n' "$label" "$name" > "$record"
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=browser_subscription_read_proof\nPOSTGRES_PASSWORD=%s\n' "$owner_pass" > "$tmp/container.env"
docker create --name "$name" \
  --label "subtrack.task=$label" --publish 127.0.0.1::5432 \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$tmp/container.cid"
cid=$(cat -- "$tmp/container.cid")
[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || exit 1
created=$(docker inspect --format '{{.Created}}' "$cid")
printf '%s %s %s %s\n' "$cid" "$label" "$name" "$created" > "$tmp/record.next"
mv -- "$tmp/record.next" "$record"
rm -- "$tmp/container.cid"
phase=fixture
identity=$(docker inspect --format '{{.Id}}|{{index .Config.Labels "subtrack.task"}}|{{.Config.Image}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{(index .HostConfig.PortBindings "5432/tcp" 0).HostIp}}' "$cid")
[[ "$identity" == "$cid|$label|mirror.gcr.io/library/postgres:16-alpine|tmpfs:/var/lib/postgresql/data|127.0.0.1" ]] || exit 1
docker start "$cid" >/dev/null
binding=$(docker port "$cid" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || exit 1
port="${BASH_REMATCH[1]}"
created=$(docker inspect --format '{{.Created}}' "$cid")
owner_url="postgresql://fixture_owner:$owner_pass@127.0.0.1:$port/browser_subscription_read_proof?connection_limit=1"
runtime_url="postgresql://st221_runtime:$reader_pass@127.0.0.1:$port/browser_subscription_read_proof?connection_limit=1"
printf '{"cid":"%s","label":"%s","created":"%s","runtimeUrl":"%s"}\n' \
  "$cid" "$label" "$created" "$runtime_url" > "$tmp/provenance.json"
chmod 600 "$tmp/provenance.json"
ready=false
for attempt in {1..60}; do
  if docker exec "$cid" pg_isready --host 127.0.0.1 --port 5432 --username fixture_owner --dbname browser_subscription_read_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
phase=migration
if ! (cd apps/api && DATABASE_URL="$owner_url" corepack pnpm exec prisma migrate deploy --schema=prisma/schema.prisma) >"$tmp/migrate.log" 2>&1; then exit 1; fi
phase=role
printf "CREATE ROLE st221_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_runtime TO st221_runtime WITH INHERIT TRUE, SET FALSE;\n" "$reader_pass" > "$tmp/role.sql"
docker exec -i "$cid" psql --username fixture_owner --dbname browser_subscription_read_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --quiet < "$tmp/role.sql" >"$tmp/role.log" 2>&1 || exit 1
role=$(docker exec "$cid" psql --username fixture_owner --dbname browser_subscription_read_proof --no-psqlrc \
  --set ON_ERROR_STOP=1 --tuples-only --no-align --command \
  "SELECT CASE WHEN r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND pg_has_role(r.oid,'subtrack_runtime','MEMBER') AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1 THEN 'ok' ELSE 'bad' END FROM pg_roles r WHERE r.rolname='st221_runtime'")
[[ "$role" == ok ]] || exit 1
phase=tls
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -keyout "$tmp/tls.key" -out "$tmp/tls.crt" -subj '/CN=127.0.0.1' \
  -addext 'subjectAltName=IP:127.0.0.1' >"$tmp/tls.log" 2>&1
chmod 600 "$tmp/tls.key" "$tmp/tls.crt"
phase=build
if ! (cd apps/api && corepack pnpm exec prisma generate --schema=prisma/schema.prisma) >"$tmp/generate.log" 2>&1; then exit 1; fi
if ! (cd apps/api && corepack pnpm build) >"$tmp/build.log" 2>&1; then exit 1; fi
phase=launcher-coverage
if ! (cd apps/api && corepack pnpm exec vitest run src/subscriptions/browser-subscription-read.local.spec.ts \
  --coverage --coverage.include=src/subscriptions/browser-subscription-read.local.ts \
  --coverage.reporter=json-summary --coverage.reportsDirectory="$tmp/coverage" \
  --coverage.thresholds.statements=80 --coverage.thresholds.branches=80 \
  --coverage.thresholds.functions=80 --coverage.thresholds.lines=80) >"$tmp/coverage.log" 2>&1; then exit 1; fi
coverage=$(node -e 'const s=require("node:fs").readFileSync(process.argv[1],"utf8");const t=JSON.parse(s).total;
  for(const k of ["statements","branches","functions","lines"])if(!Number.isFinite(t[k]?.pct)||t[k].pct<80)process.exit(1);
  process.stdout.write(["statements","branches","functions","lines"].map(k=>`${k}:${t[k].pct}`).join(","));' \
  "$tmp/coverage/coverage-summary.json") || exit 1
phase=browser-integration
export ST222_OWNER_URL="$owner_url" ST222_RUNTIME_URL="$runtime_url" ST222_PROVENANCE_FILE="$tmp/provenance.json"
export ST222_TLS_KEY_FILE="$tmp/tls.key" ST222_TLS_CERT_FILE="$tmp/tls.crt"
if ! (cd apps/api && corepack pnpm exec vitest run --config vitest.browser-subscription-read.config.ts) >"$tmp/test.log" 2>&1; then
  failure_subphase=$(classify_browser_failure "$tmp/test.log")
  exit 1
fi
passed=true
