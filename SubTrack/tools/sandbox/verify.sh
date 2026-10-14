#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 && "$1" =~ ^(validate|preflight)$ ]] || exit 2
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
for name in SANDBOX_POSTGRES_IMAGE SANDBOX_CADDY_IMAGE SANDBOX_API_IMAGE; do
  value="${!name:-}"
  [[ "$value" =~ ^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$ ]] || { printf 'ST250 image digest input unavailable: %s\n' "$name" >&2; exit 1; }
done
[[ "$SANDBOX_POSTGRES_IMAGE" == postgres:16-bookworm@sha256:* ]]
[[ "$SANDBOX_CADDY_IMAGE" == caddy:2.11.7@sha256:* ]]
docker compose --project-name subtrack-sandbox --file "$root/infra/sandbox/compose.yaml" config --quiet
docker compose --project-name subtrack-sandbox --file "$root/infra/sandbox/compose.yaml" --profile sandbox-live config --quiet
docker compose --project-name subtrack-sandbox --file "$root/infra/sandbox/compose.yaml" --profile sandbox-bootstrap config --quiet
if [[ "$1" == preflight ]]; then
  [[ "$(stat -c %a /home/openclaw/subtrack-sandbox/secrets)" == 700 ]]
  for pair in database-bootstrap:999 database-bootstrap-loader:1000 database-runtime:1000 api-auth-material:1000 gateway-key:1000; do
    name="${pair%:*}"; uid="${pair#*:}"; path="/home/openclaw/subtrack-sandbox/secrets/$name"
    [[ -f "$path" && ! -L "$path" && "$(realpath -e "$path")" == "$path" ]]
    [[ "$(stat -c %a "$path")" == 600 && "$(stat -c %u "$path")" == "$uid" && "$(stat -c %g "$path")" == "$uid" ]]
    size="$(stat -c %s "$path")"; [[ "$size" =~ ^[0-9]+$ && "$size" -gt 0 && "$size" -le 16384 ]]
  done
  for image in "$SANDBOX_POSTGRES_IMAGE" "$SANDBOX_CADDY_IMAGE" "$SANDBOX_API_IMAGE"; do docker image inspect "$image" >/dev/null; done
fi
printf 'ST250 preparation/live-profile syntax valid; execution gate remains disabled\n'
