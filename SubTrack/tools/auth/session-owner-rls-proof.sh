#!/usr/bin/env bash
# Creates only this job's disposable fixture; never uses inherited DATABASE_URL.
set -euo pipefail
umask 077
unset DATABASE_URL JWT_PRIVATE_KEY_PEM
record="${RUNNER_TEMP:?}/sec-fu1d-container"
cleanup_container() {
  if [[ -f "$record" ]]; then
    local saved label
    saved=$(cat "$record")
    [[ "$saved" =~ ^[a-f0-9]{64}$ ]] || return 1
    label=$(docker inspect --format '{{index .Config.Labels "subtrack.task"}}' "$saved")
    [[ "$label" == SEC-FU1d ]] || return 1
    docker rm --force --volumes "$saved" >/dev/null
    rm -- "$record"
  fi
}
if [[ "${1:-}" == --cleanup ]]; then cleanup_container; exit; fi
[[ ! -e "$record" ]] || { echo 'Disposable proof resource record already exists' >&2; exit 1; }
task_tmp=$(mktemp -d "$RUNNER_TEMP/sec-fu1d.XXXXXX")
trap 'cleanup_container; rm -rf -- "$task_tmp"' EXIT
trap 'exit 1' INT TERM
owner_password=$(openssl rand -hex 24)
reader_password=$(openssl rand -hex 24)
printf 'POSTGRES_USER=fixture_owner\nPOSTGRES_DB=session_owner_proof\nPOSTGRES_PASSWORD=%s\n' "$owner_password" > "$task_tmp/container.env"
name="sec-fu1d-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$RANDOM"
docker create --name "$name" --label subtrack.task=SEC-FU1d \
  --publish 127.0.0.1::5432 --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env-file "$task_tmp/container.env" mirror.gcr.io/library/postgres:16-alpine > "$record"
cid=$(cat "$record")
docker start "$cid" >/dev/null
ready=false
for attempt in {1..40}; do
  if docker exec "$cid" pg_isready --host 127.0.0.1 --port 5432 --username fixture_owner --dbname session_owner_proof >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Disposable PostgreSQL readiness failed' >&2; exit 1; }
binding=$(docker port "$cid" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Disposable loopback endpoint verification failed' >&2; exit 1; }
export SEC_FU1D_PORT="${BASH_REMATCH[1]}"
# Exact archived legacy source hashes preserve the historical focused fixture;
# this is not the canonical whole-chain migration proof. Boundaries are inclusive.
python3 - "$task_tmp/fixture.sql" "$RUNNER_TEMP/sec-fu1d-fixture-evidence.txt" <<'PY'
import hashlib, pathlib, re, sys
base = pathlib.Path('.sdlc/evidence/BUG-008/legacy-migrations')
files = [('0001_identity_household_rls', '9c39d8a5aefafbe71ca9e7c218235bb87d74fee079816dcd01dd9a8c18afcb3c'),
         ('0003_session', 'ef1b08f98e9303ad0b3a50ff16e2db05101faba1ec5d25d5012b9e9903848bfe')]
fixture, evidence = [], ['Exact extracted fixtures only; no migration sequence/history proof.']
for name, digest in files:
    path = base / name / 'migration.sql'
    raw = path.read_bytes()
    # Accepted git blobs have LF line endings; tolerate checkout CRLF only.
    raw = raw.replace(b'\r\n', b'\n')
    if hashlib.sha256(raw).hexdigest() != digest:
        raise SystemExit('Accepted fixture source hash mismatch')
    text = raw.decode()
    evidence.append(f'{path}: SHA256 {digest}')
    if name.startswith('0001'):
        patterns = [r'^CREATE TYPE "auth_method" AS ENUM .*?;',
                    r'^CREATE TABLE "identity" \([\s\S]*?^\);',
                    r'^ALTER TABLE "identity" ENABLE ROW LEVEL SECURITY;',
                    r'^CREATE POLICY "identity_self"[\s\S]*?;']
        for pattern in patterns:
            matches = list(re.finditer(pattern, text, re.M))
            if len(matches) != 1: raise SystemExit('Exact fixture extraction boundary mismatch')
            match = matches[0]
            fixture.append(match.group())
            evidence.append(f'  lines {text.count(chr(10),0,match.start())+1}-{text.count(chr(10),0,match.end())+1}: {match.group().splitlines()[0]}')
    else:
        fixture.append(text)
        evidence.append(f'  unchanged entire accepted session fixture: lines 1-{len(text.splitlines())}')
pathlib.Path(sys.argv[1]).write_text('\n\n'.join(fixture)+'\n')
pathlib.Path(sys.argv[2]).write_text('\n'.join(evidence)+'\n')
PY
cat >> "$task_tmp/fixture.sql" <<SQL
CREATE ROLE proof_reader LOGIN PASSWORD '$reader_password' NOSUPERUSER NOBYPASSRLS NOINHERIT;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO proof_reader;
GRANT SELECT ON identity, session TO proof_reader;
SQL
if ! docker exec -i "$cid" psql --username fixture_owner --dbname session_owner_proof \
  --no-psqlrc --set ON_ERROR_STOP=1 --set VERBOSITY=sqlstate --quiet < "$task_tmp/fixture.sql" > "$task_tmp/sql.log" 2>&1; then
  code=$(grep -Eo 'ERROR:[[:space:]]*[A-Z0-9]{5}' "$task_tmp/sql.log" | head -1 | tr -d '[:space:]' | cut -d: -f2 || true)
  echo "Disposable exact SQL fixture failed code=${code:-unavailable}" >&2; exit 1
fi
export SEC_FU1D_DISPOSABLE=new-container
export SEC_FU1D_OWNER_URL="postgresql://fixture_owner:$owner_password@127.0.0.1:$SEC_FU1D_PORT/session_owner_proof?connection_limit=1"
export SEC_FU1D_READER_URL="postgresql://proof_reader:$reader_password@127.0.0.1:$SEC_FU1D_PORT/session_owner_proof?connection_limit=1"
export DATABASE_URL="$SEC_FU1D_OWNER_URL"
cd apps/api
if ! corepack pnpm exec prisma generate --schema=prisma/schema.prisma > "$task_tmp/generate.log" 2>&1; then
  echo 'Disposable Prisma generation failed' >&2; exit 1
fi
corepack pnpm exec vitest run --config vitest.session-owner.config.ts
printf 'Actual Prisma, authenticated nonowner RLS, current JWT owner state and same-backend local-GUC cleanup: PASS\n' >> "$RUNNER_TEMP/sec-fu1d-fixture-evidence.txt"
printf 'Test-only HTTP guard -> current resolver -> actual Prisma reader: generic401, zero-read transport/JWT rejection, verified context, same-backend cleanup and committed revocation/deletion: PASS\n' >> "$RUNNER_TEMP/sec-fu1d-fixture-evidence.txt"
