#!/usr/bin/env bash
# Preparation gates only. Same-image/transfer execution contract is still pending.
set -euo pipefail
[[ $# == 1 ]] || { printf 'Usage: deploy.sh validate|preflight\n' >&2; exit 2; }
case "$1" in
  validate|preflight) ;;
  initialize|bootstrap|activate)
    # Do not infer same-image qualification from a host-compiled PG receipt or
    # packaging-only receipt. A separately frozen transfer/runtime contract is
    # required before any mutation, key generation, loader or live-profile call.
    printf 'Sandbox execution unavailable: same-image runtime and transfer contract pending\n' >&2
    exit 2;;
  *) printf 'Sandbox execution/publication disabled pending release gates\n' >&2; exit 2;;
esac
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
if [[ "$1" == preflight ]]; then
  [[ "$(hostname)" == racknerd-49cd240 ]]
  deployment_root=/home/openclaw/subtrack-sandbox
  [[ -d "$deployment_root" && ! -L "$deployment_root" ]]
  [[ "$(realpath -e "$deployment_root")" == "$deployment_root" ]]
  [[ "$script_root" == "$deployment_root" ]]
  [[ "$(id -u)" == 996 ]]
  for path in /home /home/openclaw "$deployment_root" "$deployment_root/infra" "$deployment_root/infra/sandbox" "$deployment_root/tools" "$deployment_root/tools/sandbox"; do [[ ! -L "$path" ]]; done
  available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  [[ "$available_kib" =~ ^[0-9]+$ && "$available_kib" -ge 1048576 ]]
  # Refuse ingress collisions; no existing listener is stopped or replaced.
  ! ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .
fi
bash "$script_root/tools/sandbox/verify.sh" "$1"
printf 'ST250 sandbox validation only; no deployment or publication performed\n'
