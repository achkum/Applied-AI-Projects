#!/usr/bin/env bash
set -Eeuo pipefail

: "${API_IMAGE:?API_IMAGE must name the built API image}"
: "${WEB_IMAGE:?WEB_IMAGE must name the built web image}"
: "${SMOKE_RECEIPT:?SMOKE_RECEIPT must name the safe receipt output file}"
: "${SMOKE_RUN_ID:?SMOKE_RUN_ID must be set by the caller}"

if [[ ! "$SMOKE_RUN_ID" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "SMOKE_RUN_ID contains unsupported characters" >&2
  exit 2
fi

prefix="st206-${SMOKE_RUN_ID}"
network="${prefix}-net"
postgres="${prefix}-postgres"
api="${prefix}-api"
web="${prefix}-web"
network_created=false
postgres_created=false
api_created=false
web_created=false

for resource in "$network" "$postgres" "$api" "$web"; do
  if docker inspect "$resource" >/dev/null 2>&1 || docker network inspect "$resource" >/dev/null 2>&1; then
    echo "A task resource name is already in use; refusing to continue" >&2
    exit 1
  fi
done

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$web_created" == true ]]; then docker rm --force --volumes "$web" >/dev/null 2>&1 || true; fi
  if [[ "$api_created" == true ]]; then docker rm --force --volumes "$api" >/dev/null 2>&1 || true; fi
  if [[ "$postgres_created" == true ]]; then docker rm --force --volumes "$postgres" >/dev/null 2>&1 || true; fi
  if [[ "$network_created" == true ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  exit "$status"
}
trap cleanup EXIT

docker network create --internal "$network" >/dev/null
network_created=true
docker create --name "$postgres" --network "$network" \
  --network-alias postgres \
  --env POSTGRES_USER=fixture \
  --env POSTGRES_PASSWORD=fixture-only \
  --env POSTGRES_DB=subtrack_fixture \
  --health-cmd='pg_isready -U fixture -d subtrack_fixture' \
  --health-interval=2s --health-timeout=2s --health-retries=30 \
  postgres:16-alpine >/dev/null
postgres_created=true
docker start "$postgres" >/dev/null

for attempt in {1..60}; do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$postgres" 2>/dev/null || true)"
  if [[ "$state" == healthy ]]; then
    break
  fi
  if [[ "$state" == unhealthy || "$state" == exited || "$state" == dead ]]; then
    echo "Fixture database did not become healthy" >&2
    exit 1
  fi
  if (( attempt == 60 )); then
    echo "Timed out waiting for fixture database" >&2
    exit 1
  fi
  sleep 2
done

docker create --name "$api" --network "$network" \
  --network-alias api \
  --env NODE_ENV=production \
  --env DATABASE_URL='postgresql://fixture:fixture-only@postgres:5432/subtrack_fixture?schema=public' \
  "$API_IMAGE" >/dev/null
api_created=true
docker start "$api" >/dev/null
docker create --name "$web" --network "$network" \
  --network-alias web "$WEB_IMAGE" >/dev/null
web_created=true
docker start "$web" >/dev/null

api_uid="$(docker exec "$api" node -p 'process.getuid()')"
web_uid="$(docker exec "$web" node -p 'process.getuid()')"
if [[ ! "$api_uid" =~ ^[0-9]+$ || "$api_uid" == 0 || ! "$web_uid" =~ ^[0-9]+$ || "$web_uid" == 0 ]]; then
  echo "API and web processes must run with nonzero UIDs" >&2
  exit 1
fi

docker run --rm --network "$network" node:24.11.1-bookworm-slim node -e '
const fail = message => { console.error(message); process.exit(1); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, expected, label) {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000) });
      if (response.status === expected) return response;
    } catch {}
    await sleep(1000);
  }
  fail(`${label} did not return HTTP ${expected}`);
}
(async () => {
  await request("http://api:4000/healthz", 200, "API health endpoint");
  for (const locale of ["sv", "en"]) {
    const response = await request(`http://web:3000/${locale}`, 200, `${locale} web route`);
    const html = await response.text();
    const match = html.match(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/);
    if (!match) fail(`${locale} route did not reference a Next static asset`);
    const assetPath = match[1].startsWith("http") ? new URL(match[1]).pathname : match[1];
    await request(`http://web:3000${assetPath}`, 200, "referenced web static asset");
  }
  console.log("API health, Swedish and English routes, and referenced static assets returned HTTP 200.");
})().catch(error => fail(error instanceof Error ? error.message : "Smoke request failed"));
'

mkdir -p "$(dirname "$SMOKE_RECEIPT")"
node - "$SMOKE_RECEIPT" "$api_uid" "$web_uid" <<'NODE'
const fs = require('node:fs');
const [file, apiUid, webUid] = process.argv.slice(2);
fs.writeFileSync(file, `${JSON.stringify({
  task: 'ST-206',
  result: 'passed',
  checks: ['api-healthz', 'web-sv', 'web-en', 'web-static-asset', 'nonroot-processes'],
  apiUid: Number(apiUid),
  webUid: Number(webUid),
  timestamp: new Date().toISOString(),
}, null, 2)}\n`, { mode: 0o600 });
NODE
echo "Container smoke checks passed; safe receipt written."
