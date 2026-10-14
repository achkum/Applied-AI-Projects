#!/usr/bin/env bash
# ST-216: one fresh, private, disposable PostgreSQL 16 fixture for HTTP and direct Node proof.
set -euo pipefail
umask 077
unset DATABASE_URL
RUNNER_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
[[ -d "$RUNNER_TEMP" && ! -L "$RUNNER_TEMP" ]] || { echo 'ST-216 proof: FAIL phase=runner' >&2; exit 1; }
record="$RUNNER_TEMP/st216-container"
receipt="$RUNNER_TEMP/st216-proof-receipt.txt"
label="ST-216:$(openssl rand -hex 16)"
tmp=''
phase=starting
passed=false
cleanup() {
  [[ -e "$record" ]] || return 0
  [[ -f "$record" && ! -L "$record" ]] || return 1
  local cid recorded actual remaining
  read -r cid recorded < "$record" || return 1
  [[ "$cid" =~ ^[a-f0-9]{64}$ && "$recorded" =~ ^ST-216:[a-f0-9]{32}$ ]] || return 1
  actual=$(docker inspect --format '{{index .Config.Labels "subtrack.task"}}' "$cid" 2>/dev/null) || return 1
  [[ "$actual" == "$recorded" ]] || return 1
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || return 1
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}') || return 1
  [[ -z "$remaining" ]] || return 1
  rm -- "$record"
}
finish() {
  local code=$? safe=true runner_real='' tmp_real='' recorded_cid='' recorded_label=''
  trap - EXIT
  if [[ "$passed" == true ]]; then
    if [[ -f "$record" && ! -L "$record" ]]; then
      read -r recorded_cid recorded_label < "$record" || safe=false
      [[ "$recorded_cid" == "$cid" && "$recorded_label" == "$label" ]] || safe=false
    else safe=false; fi
  fi
  cleanup || safe=false
  if [[ -n "$tmp" ]]; then
    runner_real=$(cd -P -- "$RUNNER_TEMP" && pwd -P) || safe=false
    tmp_real=$(cd -P -- "$tmp" && pwd -P) || safe=false
    if [[ -n "$runner_real" && "$tmp_real" == "$runner_real"/st216.* && "${tmp_real#"$runner_real"/}" != */* ]]; then
      rm -rf -- "$tmp_real" || safe=false
      [[ ! -e "$tmp_real" ]] || safe=false
    else safe=false; fi
  fi
  if [[ "$safe" == true && "$code" -eq 0 && "$passed" == true ]]; then
    printf 'ST-216 disposable HTTP and standalone proof: PASS cleanup=verified\n' > "$receipt"
  else
    printf 'ST-216 disposable HTTP and standalone proof: FAIL phase=%s code=unavailable\n' "$phase" > "$receipt"
    code=1
  fi
  exit "$code"
}
if [[ "${1:-}" == --cleanup ]]; then
  if cleanup; then exit 0; fi
  printf 'ST-216 disposable proof: FAIL phase=cleanup code=unavailable\n' > "$receipt"
  exit 1
fi
[[ $# == 0 && ! -e "$record" ]] || { echo 'ST-216 proof: FAIL phase=ownership' >&2; exit 1; }
printf 'ST-216 disposable proof: FAIL phase=starting code=unavailable\n' > "$receipt"
tmp=$(mktemp -d "$RUNNER_TEMP/st216.XXXXXX")
trap finish EXIT
trap 'exit 1' INT TERM
fail() { echo "ST-216 proof: FAIL phase=$phase" >&2; exit 1; }
owner_pass=$(openssl rand -hex 24)
runtime_pass=$(openssl rand -hex 24)
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=subscription_lifecycle_proof\nPOSTGRES_PASSWORD=%s\n' "$owner_pass" > "$tmp/container.env"
phase=fixture
docker create --name "st216-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$RANDOM" \
  --label "subtrack.task=$label" --publish 127.0.0.1::5432 \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$tmp/cid" 2> "$tmp/docker.log" || fail
cid=$(cat "$tmp/cid")
[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || fail
printf '%s %s\n' "$cid" "$label" > "$record"
rm -- "$tmp/cid"
identity=$(docker inspect --format '{{.Id}}|{{index .Config.Labels "subtrack.task"}}|{{.Config.Image}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{(index .HostConfig.PortBindings "5432/tcp" 0).HostIp}}' "$cid" 2>/dev/null) || fail
[[ "$identity" == "$cid|$label|mirror.gcr.io/library/postgres:16-alpine|tmpfs:/var/lib/postgresql/data|127.0.0.1" ]] || fail
docker start "$cid" >/dev/null 2> "$tmp/start.log" || fail
binding=$(docker port "$cid" 5432/tcp 2>/dev/null) || fail
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || fail
port="${BASH_REMATCH[1]}"
created=$(docker inspect --format '{{.Created}}' "$cid" 2>/dev/null) || fail
owner_url="postgresql://fixture_owner:$owner_pass@127.0.0.1:$port/subscription_lifecycle_proof?connection_limit=1"
runtime_url="postgresql://st216_runtime:$runtime_pass@127.0.0.1:$port/subscription_lifecycle_proof?connection_limit=1"
printf '{"cid":"%s","label":"%s","created":"%s","runtimeUrl":"%s"}\n' "$cid" "$label" "$created" "$runtime_url" > "$tmp/provenance.json"
chmod 600 "$tmp/provenance.json"
phase=readiness
ready=false
for attempt in {1..60}; do
  if docker exec "$cid" pg_isready --host 127.0.0.1 --port 5432 --username fixture_owner --dbname subscription_lifecycle_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail
phase=migration
(cd apps/api && DATABASE_URL="$owner_url" pnpm exec prisma migrate deploy --schema=prisma/schema.prisma) > "$tmp/migrate.log" 2>&1 || fail
phase=runtime-role
printf "CREATE ROLE st216_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_runtime TO st216_runtime WITH INHERIT TRUE, SET FALSE;\n" "$runtime_pass" > "$tmp/role.sql"
docker exec -i "$cid" psql --username fixture_owner --dbname subscription_lifecycle_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --quiet < "$tmp/role.sql" > "$tmp/role.log" 2>&1 || fail
phase=generate
(cd apps/api && DATABASE_URL="$owner_url" pnpm exec prisma generate --schema=prisma/schema.prisma) > "$tmp/generate.log" 2>&1 || fail
phase=build
pnpm --filter @subtrack/domain build:lifecycle > "$tmp/domain.log" 2>&1 || fail
(cd apps/api && DATABASE_URL="$owner_url" pnpm build) > "$tmp/build.log" 2>&1 || fail
phase=http-and-standalone
export ST216_DISPOSABLE=new-container ST216_PORT="$port" ST216_OWNER_URL="$owner_url" ST216_RUNTIME_URL="$runtime_url"
export ST216_PROVENANCE_FILE="$tmp/provenance.json" ST216_PRIVATE_DIR="$tmp" ST216_CID="$cid"
(cd apps/api && pnpm exec vitest run --config vitest.subscription-lifecycle-http.config.ts) > "$tmp/test.log" 2>&1 || fail
passed=true
