#!/bin/sh
# Reads only this gateway's key. Never print adapted config or enable shell tracing.
set -eu
fail() { printf 'Sandbox gateway unavailable\n' >&2; exit 1; }
[ "${SANDBOX_GATEWAY_PUBLICATION:-false}" = true ] || fail
keyfile=/run/secrets/gateway_key
[ -f "$keyfile" ] && [ ! -L "$keyfile" ] || fail
[ "$(readlink -f "$keyfile")" = "$keyfile" ] || fail
[ "$(stat -c %a "$keyfile")" = 600 ] && [ "$(stat -c %u "$keyfile")" = 1000 ] || fail
[ "$(wc -c < "$keyfile" | tr -d ' ')" = 64 ] || fail
SANDBOX_GATEWAY_KEY=$(cat "$keyfile")
case "$SANDBOX_GATEWAY_KEY" in *[!a-f0-9]*|'') fail;; esac
[ "${#SANDBOX_GATEWAY_KEY}" = 64 ] || fail
export SANDBOX_GATEWAY_KEY SANDBOX_GATEWAY_PUBLICATION
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
