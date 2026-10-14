#!/usr/bin/env bash
# Validation only: deliberately no compose up, SQL, secret creation or public publication.
set -euo pipefail
[[ $# == 1 ]] || { printf 'Usage: deploy.sh validate|preflight\n' >&2; exit 2; }
case "$1" in validate|preflight) ;; *) printf 'Sandbox execution/publication disabled pending release gates\n' >&2; exit 2;; esac
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
if [[ "$1" == preflight ]]; then
  [[ "$(hostname)" == racknerd-49cd240 ]]
  deployment_root=/home/openclaw/subtrack-sandbox
  [[ -d "$deployment_root" && ! -L "$deployment_root" ]]
  [[ "$(realpath -e "$deployment_root")" == "$deployment_root" ]]
  [[ "$script_root" == "$deployment_root" ]]
  for path in /home /home/openclaw "$deployment_root" "$deployment_root/infra" "$deployment_root/infra/sandbox" "$deployment_root/tools" "$deployment_root/tools/sandbox"; do [[ ! -L "$path" ]]; done
  available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  [[ "$available_kib" =~ ^[0-9]+$ && "$available_kib" -ge 1048576 ]]
fi
bash "$script_root/tools/sandbox/verify.sh" "$1"
printf 'ST250 sandbox validation only; no deployment or publication performed\n'
