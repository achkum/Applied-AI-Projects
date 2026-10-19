#!/usr/bin/env bash
# ST-081c: actual HTTP/RLS proof on an owned, disposable PostgreSQL 16 only.
set -euo pipefail
umask 077
unset DATABASE_URL
record="${RUNNER_TEMP:?}/st081c-container"
receipt="$RUNNER_TEMP/st081c-proof-receipt.txt"
cleanup() {
  [[ -e "$record" ]] || return 0
  [[ -f "$record" && ! -L "$record" ]] || return 1
  local cid label
  cid=$(cat -- "$record") || return 1
  [[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
  label=$(docker inspect --format '{{index .Config.Labels "subtrack.task"}}' "$cid" 2>/dev/null) || return 1
  [[ "$label" == ST-081c ]] || return 1
  docker rm --force --volumes "$cid" >/dev/null 2>&1 || true
  local remaining
  remaining=$(docker ps -a --no-trunc --filter "id=$cid" --format '{{.ID}}') || return 1
  [[ -z "$remaining" ]] || return 1
  rm -- "$record"
}
write_cleanup_failure() {
  printf 'ST-081c disposable proof: FAIL phase=cleanup code=unavailable\n' > "$receipt"
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
printf 'ST-081c disposable proof: FAIL phase=starting code=unavailable\n' > "$receipt"
tmp=$(mktemp -d "$RUNNER_TEMP/st081c.XXXXXX")
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
  if [[ -n "${runner_real:-}" && -n "${tmp_real:-}" && "$tmp_real" == "$runner_real"/st081c.* && "${tmp_real#"$runner_real"/}" != */* ]]; then
    rm -rf -- "$tmp_real" || cleanup_failed=true
  else
    cleanup_failed=true
  fi
  if [[ "$cleanup_failed" == true ]]; then
    write_cleanup_failure
    status=1
  elif [[ "$status" -eq 0 && "$proof_succeeded" == true ]]; then
    printf 'ST-081c disposable PostgreSQL proof: PASS receipt=integration-wrapper\n' > "$receipt"
  elif [[ ! -s "$receipt" || "$phase" != starting ]]; then
    printf 'ST-081c disposable proof: FAIL phase=%s code=unavailable\n' "$phase" > "$receipt"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 1' INT TERM
owner_pass=$(openssl rand -hex 24)
reader_pass=$(openssl rand -hex 24)
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=subscription_lifecycle_proof\nPOSTGRES_PASSWORD=%s\n' \
  "$owner_pass" > "$tmp/container.env"
docker create --name "st081c-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$RANDOM" \
  --label subtrack.task=ST-081c --publish 127.0.0.1::5432 \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$tmp/container.cid"
cid=$(cat -- "$tmp/container.cid")
[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || { echo 'ST-081c proof: FAIL phase=fixture code=unavailable' >&2; exit 1; }
mv -- "$tmp/container.cid" "$record"
docker start "$cid" >/dev/null
binding=$(docker port "$cid" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'ST-081c proof: FAIL phase=fixture code=unavailable' >&2; exit 1; }
port="${BASH_REMATCH[1]}"
ready=false
for attempt in {1..60}; do
  if docker exec "$cid" pg_isready --host 127.0.0.1 --port 5432 --username fixture_owner --dbname subscription_lifecycle_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'ST-081c proof: FAIL phase=readiness code=unavailable' >&2; exit 1; }
export ST081C_DISPOSABLE=new-container ST081C_PORT="$port"
export ST081C_OWNER_URL="postgresql://fixture_owner:$owner_pass@127.0.0.1:$port/subscription_lifecycle_proof?connection_limit=1"
export ST081C_READER_URL="postgresql://st081c_runtime:$reader_pass@127.0.0.1:$port/subscription_lifecycle_proof?connection_limit=1"
export DATABASE_URL="$ST081C_OWNER_URL"
phase=migration
fail() {
  local code=unavailable log="${1:-}"
  if [[ -n "$log" && -f "$log" ]]; then
    code=$(grep -Eo 'P[0-9]{4}|SQLSTATE[ =:]+[A-Z0-9]{5}|ERROR:[[:space:]]*[A-Z0-9]{5}' "$log" | head -1 || true)
  fi
  printf 'ST-081c disposable proof: FAIL phase=%s code=%s\n' "$phase" "${code:-unavailable}" | tee "$receipt" >&2
  exit 1
}
if ! (cd apps/api && pnpm exec prisma migrate deploy --schema=prisma/schema.prisma) >"$tmp/migrate.log" 2>&1; then fail "$tmp/migrate.log"; fi
phase=reader-role
printf "CREATE ROLE st081c_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_runtime TO st081c_runtime WITH INHERIT TRUE, SET FALSE;\n" \
  "$reader_pass" > "$tmp/reader.sql"
if ! docker exec -i "$cid" psql --username fixture_owner --dbname subscription_lifecycle_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --set VERBOSITY=sqlstate --quiet < "$tmp/reader.sql" >"$tmp/role.log" 2>&1; then fail "$tmp/role.log"; fi
if ! docker exec "$cid" psql --username fixture_owner --dbname subscription_lifecycle_proof --no-psqlrc \
  --set ON_ERROR_STOP=1 --tuples-only --no-align --command \
  "SELECT CASE WHEN r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND pg_has_role(r.oid, 'subtrack_runtime', 'MEMBER') AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1 THEN 'ok' ELSE 'bad' END FROM pg_roles r WHERE r.rolname='st081c_runtime'" | grep -qx ok; then fail; fi
phase=generate
if ! (cd apps/api && pnpm exec prisma generate --schema=prisma/schema.prisma) >"$tmp/generate.log" 2>&1; then fail "$tmp/generate.log"; fi
phase=domain-build
if ! pnpm --filter @subtrack/domain build:lifecycle >"$tmp/domain-build.log" 2>&1; then fail "$tmp/domain-build.log"; fi
phase=storage-integration
if ! (cd apps/api && pnpm exec vitest run --config vitest.subscription-lifecycle.config.ts) >"$tmp/test.log" 2>&1; then
  code=$(grep -Eo 'P[0-9]{4}|SQLSTATE[ =:]+[A-Z0-9]{5}|ERROR:[[:space:]]*[A-Z0-9]{5}' "$tmp/test.log" | head -1 || true)
  detail=$(grep -Eo 'Disposable subscription lifecycle proof failed: [A-Za-z -]+' "$tmp/test.log" | head -1 | sed 's/.*: //' | tr ' ' '-' || true)
  printf 'ST-081c disposable proof: FAIL phase=storage-integration detail=%s code=%s\n' \
    "${detail:-unavailable}" "${code:-unavailable}" > "$receipt"
  cat "$receipt" >&2
  exit 1
fi
proof_succeeded=true
