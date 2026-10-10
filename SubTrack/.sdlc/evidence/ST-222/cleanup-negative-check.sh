#!/usr/bin/env bash
# Run from SubTrack/: bash .sdlc/evidence/ST-222/cleanup-negative-check.sh
set -euo pipefail
umask 077
script=tools/database/browser-subscription-read-proof.sh
mkdir -p apps/api/.coverage-st222
base=$(mktemp -d "$PWD/apps/api/.coverage-st222/cleanup-negative.XXXXXX")
record="$base/st222-container"
receipt="$base/receipt.txt"
source_head=$(git rev-parse HEAD)
# Load the actual wrapper functions, without provisioning any resources.
source <(sed -n '/^cleanup_container() {/,/^}/p' "$script")
source <(sed -n '/^finish() {/,/^}/p' "$script")
tmp="$base/st222.synthetic"
mkdir -m 700 "$tmp"
passed=true
phase=browser-integration
coverage=unavailable
failure_subphase=unavailable
status=0
( trap finish EXIT; exit 0 ) || status=$?
[[ "$status" == 1 && ! -e "$tmp" ]]
grep -qx "ST-222 browser subscription read proof: FAIL source_head=$source_head phase=cleanup subphase=unavailable code=unavailable" "$receipt"
cleanup_container
if cleanup_container expected-cid expected-label expected-name expected-created; then
  echo 'ST-222 missing-record regression: FAIL' >&2
  exit 1
fi
printf 'ST-222 missing-record PASS denial and standalone cleanup idempotency: PASS\n'
