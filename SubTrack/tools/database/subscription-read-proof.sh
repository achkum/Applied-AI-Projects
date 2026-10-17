#!/usr/bin/env bash
# ST-212: actual HTTP/RLS proof on an owned, disposable PostgreSQL 16 only.
set -euo pipefail
umask 077
unset DATABASE_URL
mode=proof
if [[ "${1:-}" == --serve ]]; then mode=serve; shift; fi
if [[ "$mode" == serve ]]; then
  [[ $# == 2 && "${ST213_DEVELOPMENT_ENABLED:-}" == 1 && "${ST213_BIND_HOST:-}" == 127.0.0.1 && "${NODE_ENV:-}" != production ]] || {
    echo 'ST-213 launch denied' >&2; exit 1;
  }
  key_file="$1"; listen_port="$2"
  [[ -f "$key_file" && ! -L "$key_file" && "$listen_port" =~ ^[0-9]+$ && "$listen_port" -ge 1 && "$listen_port" -le 65535 ]] || {
    echo 'ST-213 launch denied' >&2; exit 1;
  }
  key_file=$(realpath -- "$key_file") || { echo 'ST-213 launch denied' >&2; exit 1; }
  task=ST-213; prefix="st213-$(openssl rand -hex 8)"
else
  task=ST-212; prefix=st212
fi
RUNNER_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
[[ -d "$RUNNER_TEMP" && ! -L "$RUNNER_TEMP" ]] || { echo 'Disposable runner directory unavailable' >&2; exit 1; }
task_label="$task"
if [[ "$mode" == serve ]]; then task_label="$task:$(openssl rand -hex 16)"; fi
record="${RUNNER_TEMP:?}/$prefix-container"
receipt="$RUNNER_TEMP/$prefix-proof-receipt.txt"
cleanup() {
  [[ -e "$record" ]] || return 0
  [[ -f "$record" && ! -L "$record" ]] || return 1
  local cid label recorded_label
  read -r cid recorded_label < "$record" || return 1
  [[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
  [[ "${recorded_label:-$task}" == "$task" || ( "$mode" == serve && "$recorded_label" =~ ^ST-213:[a-f0-9]{32}$ ) ]] || return 1
  label=$(docker inspect --format '{{index .Config.Labels "subtrack.task"}}' "$cid" 2>/dev/null) || return 1
  [[ "$label" == "${recorded_label:-$task}" ]] || return 1
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || true
  local remaining
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}') || return 1
  [[ -z "$remaining" ]] || return 1
  rm -- "$record"
}
write_cleanup_failure() {
  printf '%s disposable proof: FAIL phase=cleanup code=unavailable\n' "$task" > "$receipt"
}
if [[ "${1:-}" == --cleanup ]]; then
  if ! cleanup; then write_cleanup_failure; exit 1; fi
  exit 0
fi
if [[ -e "$record" ]] && ! cleanup; then
  write_cleanup_failure
  echo 'Existing disposable resource could not be verified and removed' >&2
  exit 1
fi
printf '%s disposable proof: FAIL phase=starting code=unavailable\n' "$task" > "$receipt"
tmp=$(mktemp -d "$RUNNER_TEMP/$prefix.XXXXXX")
proof_succeeded=false
phase=starting
finish() {
  local status=$?
  trap - EXIT
  local cleanup_failed=false
  if ! cleanup; then cleanup_failed=true; fi
  local runner_real tmp_real
  runner_real=$(cd -P -- "$RUNNER_TEMP" 2>/dev/null && pwd -P) || cleanup_failed=true
  tmp_real=$(cd -P -- "$tmp" 2>/dev/null && pwd -P) || cleanup_failed=true
  if [[ -n "${runner_real:-}" && -n "${tmp_real:-}" && "$tmp_real" == "$runner_real"/"$prefix".* && "${tmp_real#"$runner_real"/}" != */* ]]; then
    rm -rf -- "$tmp_real" || cleanup_failed=true
    [[ ! -e "$tmp_real" ]] || cleanup_failed=true
  else
    cleanup_failed=true
  fi
  if [[ "$cleanup_failed" == true ]]; then
    write_cleanup_failure
    status=1
  elif [[ "$status" -eq 0 && "$proof_succeeded" == true && "$mode" == serve ]]; then
    printf 'ST-213 local listener: STOPPED cleanup=verified\n' > "$receipt"
  elif [[ "$status" -eq 0 && "$proof_succeeded" == true ]]; then
    printf '%s disposable PostgreSQL proof: PASS receipt=integration-wrapper\n' "$task" > "$receipt"
  elif [[ ! -s "$receipt" || "$phase" != starting ]]; then
    printf '%s disposable proof: FAIL phase=%s code=unavailable\n' "$task" "$phase" > "$receipt"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 1' INT TERM
owner_pass=$(openssl rand -hex 24)
reader_pass=$(openssl rand -hex 24)
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=subscription_read_proof\nPOSTGRES_PASSWORD=%s\n' \
  "$owner_pass" > "$tmp/container.env"
docker create --name "$prefix-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$RANDOM" \
  --label "subtrack.task=$task_label" --publish 127.0.0.1::5432 \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$tmp/container.cid"
cid=$(cat -- "$tmp/container.cid")
[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || { echo 'Disposable fixture creation failed' >&2; exit 1; }
printf '%s %s\n' "$cid" "$task_label" > "$record"
rm -- "$tmp/container.cid"
identity=$(docker inspect --format '{{.Id}}|{{index .Config.Labels "subtrack.task"}}|{{.Config.Image}}|{{range .Mounts}}{{.Type}}:{{.Destination}}{{end}}|{{(index .HostConfig.PortBindings "5432/tcp" 0).HostIp}}' "$cid" 2>/dev/null) || exit 1
[[ "$identity" == "$cid|$task_label|mirror.gcr.io/library/postgres:16-alpine|tmpfs:/var/lib/postgresql/data|127.0.0.1" ]] || exit 1
docker start "$cid" >/dev/null
binding=$(docker port "$cid" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Disposable fixture binding failed' >&2; exit 1; }
port="${BASH_REMATCH[1]}"
if [[ "$mode" == serve ]]; then
  created=$(docker inspect --format '{{.Created}}' "$cid") || exit 1
  [[ "$created" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]] || exit 1
  printf '{"cid":"%s","label":"%s","created":"%s"}\n' "$cid" "$task_label" "$created" > "$tmp/provenance.json"
  chmod 600 "$tmp/provenance.json"
fi
ready=false
for attempt in {1..60}; do
  if docker exec "$cid" pg_isready --host 127.0.0.1 --port 5432 --username fixture_owner --dbname subscription_read_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'ST-212 proof: FAIL phase=readiness code=unavailable' >&2; exit 1; }
export ST212_DISPOSABLE=new-container ST212_PORT="$port"
export ST212_OWNER_URL="postgresql://fixture_owner:$owner_pass@127.0.0.1:$port/subscription_read_proof?connection_limit=1"
export ST212_READER_URL="postgresql://st212_runtime:$reader_pass@127.0.0.1:$port/subscription_read_proof?connection_limit=1"
export DATABASE_URL="$ST212_OWNER_URL"
phase=migration
fail() {
  local code=unavailable log="${1:-}"
  if [[ -n "$log" && -f "$log" ]]; then
    code=$(grep -Eo 'P[0-9]{4}|SQLSTATE[ =:]+[A-Z0-9]{5}|ERROR:[[:space:]]*[A-Z0-9]{5}' "$log" | head -1 || true)
  fi
  printf 'ST-212 disposable proof: FAIL phase=%s code=%s\n' "$phase" "${code:-unavailable}" | tee "$receipt" >&2
  exit 1
}
if ! (cd apps/api && pnpm exec prisma migrate deploy --schema=prisma/schema.prisma) >"$tmp/migrate.log" 2>&1; then fail "$tmp/migrate.log"; fi
phase=reader-role
printf "CREATE ROLE st212_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_runtime TO st212_runtime WITH INHERIT TRUE, SET FALSE;\n" \
  "$reader_pass" > "$tmp/reader.sql"
if ! docker exec -i "$cid" psql --username fixture_owner --dbname subscription_read_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --set VERBOSITY=sqlstate --quiet < "$tmp/reader.sql" >"$tmp/role.log" 2>&1; then fail "$tmp/role.log"; fi
if ! docker exec "$cid" psql --username fixture_owner --dbname subscription_read_proof --no-psqlrc \
  --set ON_ERROR_STOP=1 --tuples-only --no-align --command \
  "SELECT CASE WHEN r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND pg_has_role(r.oid, 'subtrack_runtime', 'MEMBER') AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1 THEN 'ok' ELSE 'bad' END FROM pg_roles r WHERE r.rolname='st212_runtime'" | grep -qx ok; then fail; fi
phase=generate
if ! (cd apps/api && pnpm exec prisma generate --schema=prisma/schema.prisma) >"$tmp/generate.log" 2>&1; then fail "$tmp/generate.log"; fi
if [[ "$mode" == serve ]]; then
  phase=compile
  if ! (cd apps/api && pnpm build) >"$tmp/compile.log" 2>&1; then fail "$tmp/compile.log"; fi
  phase=local-listener
  export ST213_READER_URL="$ST212_READER_URL" ST213_BIND_PORT="$listen_port" ST213_TRUSTED_PUBLIC_KEY_FILE="$key_file"
  export ST213_PROVENANCE_FILE="$tmp/provenance.json"
  unset ST212_OWNER_URL DATABASE_URL
  (cd apps/api && node dist/subscriptions/subscription-read.local.js) &
  child=$!
  shutdown_child() {
    kill -TERM "$child" 2>/dev/null || true
    for attempt in {1..50}; do
      kill -0 "$child" 2>/dev/null || break
      sleep 0.2
    done
    if kill -0 "$child" 2>/dev/null; then kill -KILL "$child" 2>/dev/null || true; fi
    wait "$child" 2>/dev/null || true
  }
  trap 'shutdown_child; proof_succeeded=true; exit 0' INT TERM
  if ! wait "$child"; then fail; fi
  trap 'exit 1' INT TERM
  proof_succeeded=true
  exit 0
fi
phase=http-integration
if ! (cd apps/api && pnpm exec vitest run --config vitest.subscription-read.config.ts) >"$tmp/test.log" 2>&1; then
  code=$(grep -Eo 'P[0-9]{4}|SQLSTATE[ =:]+[A-Z0-9]{5}|ERROR:[[:space:]]*[A-Z0-9]{5}' "$tmp/test.log" | head -1 || true)
  detail=$(grep -Eo 'Disposable subscription read proof failed: [A-Za-z -]+' "$tmp/test.log" | head -1 | sed 's/.*: //' | tr ' ' '-' || true)
  printf 'ST-212 disposable proof: FAIL phase=http-integration detail=%s code=%s\n' \
    "${detail:-unavailable}" "${code:-unavailable}" > "$receipt"
  cat "$receipt" >&2
  exit 1
fi
proof_succeeded=true
