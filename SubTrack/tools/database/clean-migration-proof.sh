#!/usr/bin/env bash
# BUG-008b: owned, disposable PostgreSQL 16 only. Never consume inherited URLs.
set -euo pipefail
umask 077
unset DATABASE_URL
record="${RUNNER_TEMP:?}/bug-008b-container"
cleanup() {
  if [[ -f "$record" ]]; then
    local cid label
    cid=$(cat "$record")
    [[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
    label=$(docker inspect --format '{{index .Config.Labels "subtrack.task"}}' "$cid")
    [[ "$label" == BUG-008b ]] || return 1
    docker rm --force --volumes "$cid" >/dev/null
    rm -- "$record"
  fi
}
if [[ "${1:-}" == --cleanup ]]; then cleanup; exit; fi
[[ ! -e "$record" ]] || { echo 'Existing disposable resource record' >&2; exit 1; }
tmp=$(mktemp -d "$RUNNER_TEMP/bug-008b.XXXXXX")
trap 'cleanup; rm -rf -- "$tmp"' EXIT
trap 'exit 1' INT TERM
owner_pass=$(openssl rand -hex 24)
runtime_pass=$(openssl rand -hex 24)
service_pass=$(openssl rand -hex 24)
identity_pass=$(openssl rand -hex 24)
otp_pass=$(openssl rand -hex 24)
catalogue_pass=$(openssl rand -hex 24)
receipt="$RUNNER_TEMP/bug-008b-proof-receipt.txt"
fail() {
  local stage="$1" logfile="${2:-}" code=""
  if [[ -n "$logfile" && -f "$logfile" ]]; then
    code=$(grep -Eo 'P[0-9]{4}|SQLSTATE[ =:]+[A-Z0-9]{5}' "$logfile" | head -1 || true)
  fi
  printf 'BUG-008b disposable proof: FAIL stage=%s code=%s\n' "$stage" "${code:-unavailable}" | tee "$receipt" >&2
  exit 1
}
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=clean_migration_proof\nPOSTGRES_PASSWORD=%s\n' "$owner_pass" > "$tmp/container.env"
docker create --name "bug-008b-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$RANDOM" \
  --label subtrack.task=BUG-008b --publish 127.0.0.1::5432 \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$record"
cid=$(cat "$record")
docker start "$cid" >/dev/null
ready=false
for attempt in {1..40}; do
  if docker exec "$cid" pg_isready --username fixture_owner --dbname clean_migration_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail readiness
binding=$(docker port "$cid" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || fail binding
port="${BASH_REMATCH[1]}"
export BUG_008B_DISPOSABLE=new-container BUG_008B_PORT="$port"
export BUG_008B_OWNER_URL="postgresql://fixture_owner:$owner_pass@127.0.0.1:$port/clean_migration_proof?connection_limit=1"
export BUG_008B_RUNTIME_URL="postgresql://proof_runtime:$runtime_pass@127.0.0.1:$port/clean_migration_proof?connection_limit=1"
export BUG_008B_SERVICE_URL="postgresql://proof_service:$service_pass@127.0.0.1:$port/clean_migration_proof?connection_limit=1"
export BUG_008B_IDENTITY_URL="postgresql://proof_identity:$identity_pass@127.0.0.1:$port/clean_migration_proof?connection_limit=1"
export BUG_008B_OTP_URL="postgresql://proof_otp:$otp_pass@127.0.0.1:$port/clean_migration_proof?connection_limit=1"
export BUG_008B_CATALOGUE_URL="postgresql://proof_catalogue:$catalogue_pass@127.0.0.1:$port/clean_migration_proof?connection_limit=1"
export DATABASE_URL="$BUG_008B_OWNER_URL"
if ! (cd apps/api && corepack pnpm exec prisma migrate deploy --schema=prisma/schema.prisma) > "$tmp/migrate.log" 2>&1; then
  fail migrate "$tmp/migrate.log"
fi
expected=$(printf '0001_canonical_schema|%s\n0002_privacy_constraints|%s' \
  "$(sha256sum apps/api/prisma/migrations/0001_canonical_schema/migration.sql | cut -d' ' -f1)" \
  "$(sha256sum apps/api/prisma/migrations/0002_privacy_constraints/migration.sql | cut -d' ' -f1)")
actual=$(docker exec "$cid" psql --username fixture_owner --dbname clean_migration_proof \
  --no-psqlrc --tuples-only --no-align --command \
  "SELECT migration_name || '|' || checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name") || fail migration-ledger
[[ "$actual" == "$expected" ]] || fail migration-ledger
[[ "$(docker exec "$cid" psql --username fixture_owner --dbname clean_migration_proof \
  --no-psqlrc --tuples-only --no-align --command 'SELECT count(*) FROM _prisma_migrations')" == 2 ]] || fail migration-ledger
printf "CREATE ROLE proof_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_runtime TO proof_runtime WITH INHERIT TRUE, SET FALSE;\nCREATE ROLE proof_service LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_invitation_service TO proof_service WITH INHERIT TRUE, SET FALSE;\nCREATE ROLE proof_identity LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_identity_provisioner TO proof_identity WITH INHERIT TRUE, SET FALSE;\nCREATE ROLE proof_otp LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_otp_service TO proof_otp WITH INHERIT TRUE, SET FALSE;\nCREATE ROLE proof_catalogue LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '%s';\nGRANT subtrack_catalogue_writer TO proof_catalogue WITH INHERIT TRUE, SET FALSE;\n" \
  "$runtime_pass" "$service_pass" "$identity_pass" "$otp_pass" "$catalogue_pass" > "$tmp/runtime.sql"
if ! docker exec -i "$cid" psql --username fixture_owner --dbname clean_migration_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --quiet < "$tmp/runtime.sql" > "$tmp/role.log" 2>&1; then
  fail roles "$tmp/role.log"
fi
if ! (cd apps/api && corepack pnpm exec prisma migrate diff --from-url "$BUG_008B_OWNER_URL" \
  --to-schema-datamodel prisma/schema.prisma --script) > "$tmp/drift.sql" 2> "$tmp/drift.log"; then
  fail modeled-drift "$tmp/drift.log"
fi
python3 - "$tmp/drift.sql" <<'PY'
import pathlib, re, sys
sql = pathlib.Path(sys.argv[1]).read_text()
statements = re.sub(r'--[^\n]*', '', sql).strip().split(';')
allowed = {'household_member_active_membership_idx',
           'subscription_share_active_household_idx', 'invitation_token_hash_idx'}
for statement in statements:
    statement = statement.strip()
    if not statement: continue
    match = re.fullmatch(r'DROP INDEX "?([a-z_]+)"?', statement)
    if not match or match.group(1) not in allowed:
        raise SystemExit('Modeled-schema drift outside SQL-only partial indexes')
PY
if ! (cd apps/api && corepack pnpm exec prisma generate --schema=prisma/schema.prisma) > "$tmp/generate.log" 2>&1; then
  fail prisma-generate "$tmp/generate.log"
fi
if ! (cd apps/api && corepack pnpm exec vitest run --config vitest.clean-migration.config.ts) > "$tmp/test.log" 2>&1; then
  phase=$(grep -Eo 'BUG-008b disposable PostgreSQL proof failed: (endpoint|role and catalog invariants|fixture|principal isolation and visibility|concurrent source and admin guards|mutation boundaries|service invitation lifecycle|owner departure and revocation|context failure and rollback cleanup)' "$tmp/test.log" | head -1 || true)
  [[ -n "$phase" ]] || phase=startup
  step=$(grep -Eo 'step=(none|(rc|rr)-(source-seed|capture|source-await-block|source-edit-assert|admin-seed|admin-first|admin-await-block|admin-second-assert))' "$tmp/test.log" | head -1 || true)
  code=$(grep -Eo 'code=(P[0-9]{4}|[0-9A-Z]{5}|unavailable)' "$tmp/test.log" | head -1 || true)
  printf 'BUG-008b disposable proof: FAIL stage=policy phase=%s %s %s\n' "${phase##*: }" "${step:-step=unavailable}" "${code:-code=unavailable}" | tee "$receipt" >&2
  exit 1
fi
printf 'BUG-008b: PASS migrations=2 ledger_checksums=2 modeled_drift=0 vitest_tests=1 ordinary_login=1 service_logins=4\n' > "$receipt"
