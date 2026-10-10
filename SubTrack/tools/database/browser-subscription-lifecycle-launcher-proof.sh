#!/usr/bin/env bash
# ST-226: owned disposable PostgreSQL 16, compiled HTTPS READ/PATCH persistence proof.
set -euo pipefail
umask 077
[[ -z "${DATABASE_URL:-}" ]] || exit 1
unset DATABASE_URL
base="${RUNNER_TEMP:?}"
[[ -d "$base" && ! -L "$base" ]] || exit 1
record="$base/st226-container"
receipt="$base/st226-proof-receipt.txt"
source_head=$(git rev-parse --verify HEAD)
[[ "$source_head" =~ ^[a-f0-9]{40}$ ]] || exit 1
cleanup_container() {
  [[ "$#" -eq 0 || "$#" -eq 4 ]] || return 1
  if [[ ! -e "$record" && ! -L "$record" ]]; then
    if [[ "$#" -eq 0 ]]; then return 0; else return 1; fi
  fi
  [[ -f "$record" && ! -L "$record" ]] || return 1
  local cid label name created extra actual remaining found named actualcid actualname actuallabel actualcreated image mountcount mount portcount bindingcount hostip netcount netbindings netip netport running
  [[ "$(stat -c '%a:%u' -- "$record")" == "600:$(id -u)" ]] || return 1
  read -r cid label name created extra < "$record" || return 1
  [[ -z "$extra" ]] || return 1
  if [[ "$#" -eq 4 ]]; then
    [[ "$cid" == "$1" && "$label" == "$2" && "$name" == "$3" && "$created" == "$4" &&
       "$cid" != pending && "$created" != pending ]] || return 1
  fi
  [[ "$label" =~ ^ST-226:[a-f0-9]{32}$ && "$name" =~ ^st226-[0-9]+-[0-9]+-[a-f0-9]{32}$ ]] || return 1
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
  actual=$(docker inspect --format '{{.Id}}|{{.Name}}|{{index .Config.Labels "subtrack.task"}}|{{.Created}}|{{.Config.Image}}|{{len .Mounts}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{len .HostConfig.PortBindings}}|{{len (index .HostConfig.PortBindings "5432/tcp")}}|{{(index .HostConfig.PortBindings "5432/tcp" 0).HostIp}}|{{len .NetworkSettings.Ports}}|{{len (index .NetworkSettings.Ports "5432/tcp")}}|{{range (index .NetworkSettings.Ports "5432/tcp")}}{{.HostIp}}{{end}}|{{range (index .NetworkSettings.Ports "5432/tcp")}}{{.HostPort}}{{end}}|{{.State.Running}}' "$cid" 2>/dev/null) || return 1
  IFS='|' read -r actualcid actualname actuallabel actualcreated image mountcount mount portcount bindingcount hostip netcount netbindings netip netport running <<< "$actual"
  [[ "$created" == pending || "$created" == "$actualcreated" ]] || return 1
  [[ "$actualcid" == "$cid" && "$actualname" == "/$name" && "$actuallabel" == "$label" &&
     "$image" == mirror.gcr.io/library/postgres:16-alpine && "$mountcount" == 1 &&
     "$mount" == tmpfs:/var/lib/postgresql/data && "$portcount" == 1 && "$bindingcount" == 1 &&
     "$hostip" == 127.0.0.1 ]] || return 1
  if [[ "$netcount" == 0 && "$netbindings" == 0 && "$running" == false && "$#" == 0 ]]; then :
  else
    [[ "$netcount" == 1 && "$netbindings" == 1 && "$netip" == 127.0.0.1 &&
       "$netport" =~ ^[1-9][0-9]{0,4}$ && "$netport" -le 65535 ]] || return 1
  fi
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || return 1
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}') || return 1
  [[ -z "$remaining" ]] || return 1
  rm -- "$record"
}
classify_launcher_failure() {
  local line code
  while IFS= read -r line; do
    for code in fixture compiled_child smoke denials sigterm_cleanup sigint_cleanup; do
      if [[ "$line" =~ ST-226\ launcher\ proof\ failed:\ ${code}($|[^a-zA-Z0-9_-]) ]]; then printf '%s\n' "$code"; return; fi
    done
    case "$line" in
      *'ST-226 parent cleanup failed'*) printf 'parent_cleanup\n'; return ;;
      *'Failed Suites'*|*'No test files found'*) printf 'collection\n'; return ;;
    esac
  done < "$1"
  printf 'unavailable\n'
}

if [[ "${1:-}" == --cleanup ]]; then cleanup_container; exit; fi
[[ ! -e "$record" && ! -L "$record" ]] || { echo 'ST-226 existing fixture requires verified cleanup' >&2; exit 1; }
printf 'ST-226 proof: FAIL source_head=%s phase=starting code=unavailable\n' "$source_head" > "$receipt"
tmp=$(mktemp -d "$base/st226.XXXXXX")
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
  if [[ "${tmp_real:-}" == "${base_real:-}/st226."* && "${tmp_real#"$base_real"/}" != */* ]]; then
    rm -rf -- "$tmp_real" || bad=true
    [[ ! -e "$tmp_real" ]] || bad=true
  else bad=true; fi
  if [[ "$bad" == true ]]; then status=1; phase=cleanup; fi
  case "$phase" in starting|fixture|migration|role|tls|build|launcher-coverage|launcher-integration|cleanup) ;; *) phase=starting; status=1 ;; esac
  case "$failure_subphase" in unavailable|fixture|compiled_child|smoke|denials|sigterm_cleanup|sigint_cleanup|parent_cleanup|collection) ;; *) failure_subphase=unavailable; status=1 ;; esac
  [[ "$coverage" == unavailable || "$coverage" =~ ^statements:[0-9]+([.][0-9]+)?,branches:[0-9]+([.][0-9]+)?,functions:[0-9]+([.][0-9]+)?,lines:[0-9]+([.][0-9]+)?$ ]] || { coverage=unavailable; status=1; }
  if [[ "$status" -eq 0 && "$passed" == true ]]; then
    printf 'ST-226 browser subscription lifecycle launcher proof: PASS source_head=%s coverage=%s cases=READ,PATCH,reread,persistence,peer404,missing404,conflict409,pool-PID,dual-GUC,SIGTERM,SIGINT,listener-reuse,pool-baseline fixture=removed child=stopped secrets=destroyed\n' "$source_head" "$coverage" > "$receipt"
  else
    printf 'ST-226 browser subscription lifecycle launcher proof: FAIL source_head=%s phase=%s subphase=%s code=unavailable\n' "$source_head" "$phase" "$failure_subphase" > "$receipt"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 1' INT TERM
owner_pass=$(openssl rand -hex 24)
reader_pass=$(openssl rand -hex 24)
nonce=$(openssl rand -hex 16)
label="ST-226:$nonce"
name="st226-${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}-$nonce"
[[ "$name" =~ ^st226-[0-9]+-[0-9]+-[a-f0-9]{32}$ ]] || exit 1
printf 'pending %s %s pending\n' "$label" "$name" > "$record"
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=browser_subscription_lifecycle_proof\nPOSTGRES_PASSWORD=%s\n' "$owner_pass" > "$tmp/container.env"
docker create --name "$name" \
  --label "subtrack.task=$label" --publish 127.0.0.1::5432 \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$tmp/container.cid" 2>"$tmp/create.log"
cid=$(cat -- "$tmp/container.cid")
[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || exit 1
created=$(docker inspect --format '{{.Created}}' "$cid" 2>"$tmp/inspect.log")
printf '%s %s %s %s\n' "$cid" "$label" "$name" "$created" > "$tmp/record.next"
mv -- "$tmp/record.next" "$record"
rm -- "$tmp/container.cid"
phase=fixture
identity=$(docker inspect --format '{{.Id}}|{{index .Config.Labels "subtrack.task"}}|{{.Config.Image}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{(index .HostConfig.PortBindings "5432/tcp" 0).HostIp}}' "$cid" 2>"$tmp/inspect.log")
[[ "$identity" == "$cid|$label|mirror.gcr.io/library/postgres:16-alpine|tmpfs:/var/lib/postgresql/data|127.0.0.1" ]] || exit 1
docker start "$cid" >/dev/null 2>"$tmp/start.log"
binding=$(docker port "$cid" 5432/tcp 2>"$tmp/port.log")
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || exit 1
port="${BASH_REMATCH[1]}"
created=$(docker inspect --format '{{.Created}}' "$cid" 2>"$tmp/inspect.log")
owner_url="postgresql://fixture_owner:$owner_pass@127.0.0.1:$port/browser_subscription_lifecycle_proof?connection_limit=1"
runtime_url="postgresql://st_browser_lifecycle_runtime:$reader_pass@127.0.0.1:$port/browser_subscription_lifecycle_proof?connection_limit=1"
printf '{"cid":"%s","label":"%s","name":"%s","created":"%s","runtimeUrl":"%s"}\n' \
  "$cid" "$label" "$name" "$created" "$runtime_url" > "$tmp/provenance.json"
printf '{"ownerUrl":"%s"}\n' "$owner_url" > "$tmp/owner-provenance.json"
chmod 600 "$tmp/provenance.json" "$tmp/owner-provenance.json"
ready=false
for attempt in {1..60}; do
  if docker exec "$cid" pg_isready --host 127.0.0.1 --port 5432 --username fixture_owner --dbname browser_subscription_lifecycle_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
phase=tls
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -keyout "$tmp/tls.key" -out "$tmp/tls.crt" -subj '/CN=127.0.0.1' \
  -addext 'subjectAltName=IP:127.0.0.1' >"$tmp/tls.log" 2>&1
chmod 600 "$tmp/tls.key" "$tmp/tls.crt"
phase=build
if ! (cd apps/api && corepack pnpm exec prisma generate --schema=prisma/schema.prisma) >"$tmp/generate.log" 2>&1; then exit 1; fi
if ! (cd apps/api && corepack pnpm build) >"$tmp/build.log" 2>&1; then exit 1; fi
export ST226_OWNER_URL="$owner_url" ST226_RUNTIME_URL="$runtime_url" ST226_PROVENANCE_FILE="$tmp/provenance.json"
export ST226_OWNER_PROVENANCE_FILE="$tmp/owner-provenance.json"
export ST226_TLS_KEY_FILE="$tmp/tls.key" ST226_TLS_CERT_FILE="$tmp/tls.crt"
if ! node -e 'const p=require("./apps/api/dist/subscriptions/browser-subscription-lifecycle.local.js");
  p.inspectOwnedFixture(process.env.ST226_PROVENANCE_FILE,process.env.ST226_RUNTIME_URL);
  const r=JSON.parse(p.privateFile(process.env.ST226_OWNER_PROVENANCE_FILE,384).toString());
  const o=new URL(process.env.ST226_OWNER_URL),u=new URL(process.env.ST226_RUNTIME_URL);
  if(Object.keys(r).join(",")!=="ownerUrl"||r.ownerUrl!==process.env.ST226_OWNER_URL||
    !/^[a-f0-9]{48}$/.test(o.password)||process.env.ST226_OWNER_URL!==
    `postgresql://fixture_owner:${o.password}@127.0.0.1:${u.port}/browser_subscription_lifecycle_proof?connection_limit=1`)process.exit(1);
  p.privateFile(process.env.ST226_TLS_KEY_FILE,384).fill(0);p.privateFile(process.env.ST226_TLS_CERT_FILE,384).fill(0);' \
  >"$tmp/custody.log" 2>&1; then exit 1; fi
phase=migration
if ! (cd apps/api && DATABASE_URL="$owner_url" corepack pnpm exec prisma migrate deploy --schema=prisma/schema.prisma) >"$tmp/migrate.log" 2>&1; then exit 1; fi
phase=role
printf "CREATE ROLE st_browser_lifecycle_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_runtime TO st_browser_lifecycle_runtime WITH INHERIT TRUE, SET FALSE;\n" "$reader_pass" > "$tmp/role.sql"
docker exec -i "$cid" psql --username fixture_owner --dbname browser_subscription_lifecycle_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --quiet < "$tmp/role.sql" >"$tmp/role.log" 2>&1 || exit 1
role=$(docker exec "$cid" psql --username fixture_owner --dbname browser_subscription_lifecycle_proof --no-psqlrc \
  --set ON_ERROR_STOP=1 --tuples-only --no-align --command \
  "SELECT CASE WHEN r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND pg_has_role(r.oid,'subtrack_runtime','MEMBER') AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1 THEN 'ok' ELSE 'bad' END FROM pg_roles r WHERE r.rolname='st_browser_lifecycle_runtime'" 2>"$tmp/role-check.log")
[[ "$role" == ok ]] || exit 1
phase=launcher-coverage
if ! (cd apps/api && corepack pnpm exec vitest run src/subscriptions/browser-subscription-lifecycle.local.spec.ts \
  --coverage --coverage.include=src/subscriptions/browser-subscription-lifecycle.local.ts \
  --coverage.reporter=json-summary --coverage.reportsDirectory="$tmp/coverage" \
  --coverage.thresholds.statements=80 --coverage.thresholds.branches=80 \
  --coverage.thresholds.functions=80 --coverage.thresholds.lines=80) >"$tmp/coverage.log" 2>&1; then exit 1; fi
coverage=$(node -e 'const s=require("node:fs").readFileSync(process.argv[1],"utf8");const t=JSON.parse(s).total;
  for(const k of ["statements","branches","functions","lines"])if(!Number.isFinite(t[k]?.pct)||t[k].pct<80)process.exit(1);
  process.stdout.write(["statements","branches","functions","lines"].map(k=>`${k}:${t[k].pct}`).join(","));' \
  "$tmp/coverage/coverage-summary.json") || exit 1
phase=launcher-integration
export ST226_OWNER_URL="$owner_url" ST226_RUNTIME_URL="$runtime_url" ST226_PROVENANCE_FILE="$tmp/provenance.json"
export ST226_OWNER_PROVENANCE_FILE="$tmp/owner-provenance.json"
export ST226_TLS_KEY_FILE="$tmp/tls.key" ST226_TLS_CERT_FILE="$tmp/tls.crt"
if ! (cd apps/api && corepack pnpm exec vitest run --config test/vitest.browser-subscription-lifecycle-launcher.config.ts) >"$tmp/test.log" 2>&1; then
  failure_subphase=$(classify_launcher_failure "$tmp/test.log")
  exit 1
fi
passed=true
