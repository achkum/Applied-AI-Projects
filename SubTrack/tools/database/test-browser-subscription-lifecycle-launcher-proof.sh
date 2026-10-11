#!/usr/bin/env bash
# Exercise actual finish and cleanup functions without Docker resources.
set -euo pipefail
umask 077
script=tools/database/browser-subscription-lifecycle-launcher-proof.sh
mkdir -p apps/api/.coverage-st226
base=$(mktemp -d "$PWD/apps/api/.coverage-st226/cleanup-negative.XXXXXX")
record="$base/st226-container"
receipt="$base/receipt.txt"
source_head=$(git rev-parse HEAD)
source <(sed -n '/^cleanup_container() {/,/^}/p' "$script")
source <(sed -n '/^classify_launcher_failure() {/,/^}/p' "$script")
source <(sed -n '/^finish() {/,/^}/p' "$script")
passed=true
phase=launcher-integration
coverage=unavailable
failure_subphase=unavailable
failure_cleanup=unavailable
cid=$(printf '%064d' 0)
label="ST-226:$(printf '%032d' 0)"
name="st226-0-1-${label#ST-226:}"
created=synthetic
for case_name in missing substituted docker_failure removal_failure network_public network_extra network_bad_port; do
  tmp="$base/st226.$case_name"
  mkdir -m 700 "$tmp"
  rm -f -- "$record"
  if [[ "$case_name" != missing ]]; then
    printf '%s %s %s %s\n' "$cid" "$label" "$name" "$created" > "$record"
    if [[ "$case_name" == substituted ]]; then printf 'foreign\n' > "$record"; fi
  fi
  docker() {
    [[ "$case_name" == removal_failure || "$case_name" == network_* ]] || return 1
    if [[ "$1" == inspect && "$3" == '{{.Id}}' ]]; then printf '%s\n' "$cid"; return; fi
    if [[ "$1" == inspect ]]; then
      netcount=1 netip=127.0.0.1 netport=35001
      case "$case_name" in network_public) netip=0.0.0.0 ;; network_extra) netcount=2 ;; network_bad_port) netport=65536 ;; esac
      printf '%s|/%s|%s|%s|mirror.gcr.io/library/postgres:16-alpine|1|tmpfs:/var/lib/postgresql/data|1|1|127.0.0.1|%s|1|%s|%s|true\n' "$cid" "$name" "$label" "$created" "$netcount" "$netip" "$netport"; return
    fi
    [[ "$1" != rm || "$case_name" == removal_failure ]] || exit 99
    return 1
  }
  status=0
  (trap finish EXIT; exit 0) || status=$?
  [[ "$status" == 1 && ! -e "$tmp" ]]
  grep -qx "ST-226 browser subscription lifecycle launcher proof: FAIL source_head=$source_head phase=cleanup subphase=unavailable parent_cleanup=unavailable fixture_cleanup=true code=unavailable" "$receipt"
  if [[ "$case_name" != missing ]]; then [[ -e "$record" ]]; fi
 done
rm -f -- "$record"
tmp="$base/st226.primary"
mkdir -m 700 "$tmp"
failure_subphase=child_startup_exit failure_cleanup=child_exit
status=0
(trap finish EXIT; exit 1) || status=$?
[[ "$status" == 1 && ! -e "$tmp" ]]
grep -qx "ST-226 browser subscription lifecycle launcher proof: FAIL source_head=$source_head phase=cleanup subphase=child_startup_exit parent_cleanup=child_exit fixture_cleanup=true code=unavailable" "$receipt"
cleanup_container
if cleanup_container "$cid" "$label" "$name" "$created"; then exit 1; fi
printf '%s %s %s %s\n' "$cid" "$label" "$name" "$created" > "$record"
docker() {
  if [[ "$1" == inspect && "$3" == '{{.Id}}' ]]; then printf '%s\n' "$cid"
  elif [[ "$1" == inspect ]]; then
    printf '%s|/%s|%s|%s|mirror.gcr.io/library/postgres:16-alpine|1|tmpfs:/var/lib/postgresql/data|1|1|127.0.0.1|0|0|||false\n' "$cid" "$name" "$label" "$created"
  elif [[ "$1" != rm && "$1" != ps ]]; then return 1; fi
}
cleanup_container
[[ ! -e "$record" ]]
for code in fixture compiled_child child_spawn child_bootstrap child_startup_exit child_startup_timeout child_pool smoke denials sigterm_cleanup sigint_cleanup parent_cleanup; do
  printf '\033[31mError: ST-226 launcher proof failed: %s\033[39m\n' "$code" > "$base/failure.log"
  [[ "$(classify_launcher_failure "$base/failure.log")" == "$code" ]]
done
for code in none child_exit child_timeout owner_disconnect; do
  printf 'Failed Suites 1\nError: ST-226 launcher proof failed: child_startup_exit; cleanup: %s\n' "$code" > "$base/failure.log"
  [[ "$(classify_launcher_failure "$base/failure.log")" == child_startup_exit ]]
  [[ "$(classify_launcher_failure "$base/failure.log" cleanup)" == "$code" ]]
done
printf 'ST-226 launcher proof failed: smoke-secret; cleanup: child_exit-secret\n' > "$base/failure.log"
[[ "$(classify_launcher_failure "$base/failure.log" cleanup)" == unavailable ]]
for text in 'ST-226 launcher proof failed: unknown-sensitive' 'ST-226 launcher proof failed: smoke-secret' 'credentialURL header body'; do
  printf '%s\n' "$text" > "$base/failure.log"
  [[ "$(classify_launcher_failure "$base/failure.log")" == unavailable ]]
done
printf 'Failed Suites 1\n' > "$base/failure.log"
[[ "$(classify_launcher_failure "$base/failure.log")" == collection ]]
printf 'ST-226 actual finish negatives and diagnostic allowlist: PASS\n'
