#!/usr/bin/env bash
# Exercise the actual custody/finish code without a database or Docker resource.
set -euo pipefail
umask 077
script=tools/database/development-auth-foundation-proof.sh
base=$(mktemp -d)
trap 'rm -rf -- "$base"' EXIT
record="$base/st233a-container" receipt="$base/receipt.txt"
source_head=$(git rev-parse HEAD)
image=mirror.gcr.io/library/postgres:16-alpine
cid=$(printf '%064d' 0) marker=$(printf '%032d' 0) name="st233a-$(printf '%032d' 0)" created=2026-10-11T01:00:00Z
for function in private_file custody cleanup_container cleanup_temp finish; do
  source <(sed -n "/^$function() {/,/^}/p" "$script")
done
for case_name in success missing substituted identity network mount privileged inspect removal remains record_removal temp_removal failed_probe incomplete temp credentials; do
  tmp=$(mktemp -d "$base/st233a.XXXXXX")
  printf 'fixture-secret\n' > "$tmp/pgpass"
  printf '%s %s %s %s\n' "$cid" "$marker" "$name" "$created" > "$record"
  passed=true phase=catalog
  command rm -f -- "$base/removed"
  [[ "$case_name" != missing ]] || rm -- "$record"
  [[ "$case_name" != substituted ]] || printf 'foreign\n' > "$record"
  if [[ "$case_name" == credentials ]]; then
    chmod 644 "$record"
    [[ $(stat -c %a "$record") == 644 ]] || { printf 'ST-233a custody negatives unavailable: file chmod semantics unsupported on %s\n' "$(uname -s)" >&2; exit 1; }
  fi
  if [[ "$case_name" == temp ]]; then
    chmod 755 "$tmp"
    [[ $(stat -c %a "$tmp") == 755 ]] || { printf 'ST-233a custody negatives unavailable: directory chmod semantics unsupported on %s\n' "$(uname -s)" >&2; exit 1; }
  fi
  [[ "$case_name" != failed_probe && "$case_name" != incomplete ]] || passed=false
  docker() {
    case "$1" in
      inspect)
        [[ "$case_name" != inspect ]] || return 1
        local inspect_id="$cid" inspect_network=none inspect_mount=tmpfs:/var/lib/postgresql/data inspect_privileged=false
        case "$case_name" in identity) inspect_id=foreign ;; network) inspect_network=bridge ;; mount) inspect_mount=bind:/var/lib/postgresql/data ;; privileged) inspect_privileged=true ;; esac
        printf '%s|/%s|%s|ST-233a:%s|%s|%s|%s|0|1|1|%s|%s|0|0|\n' "$inspect_id" "$name" "$created" "$marker" "$source_head" "$image" "$inspect_network" "$inspect_mount" "$inspect_privileged" ;;
      rm) printf '%s\n' "$cid" > "$base/removed"; [[ "$case_name" != removal ]] ;;
      ps) [[ "$case_name" != remains ]] || printf '%s\n' "$cid" ;;
      *) return 1 ;;
    esac
  }
  rm() {
    [[ "$case_name" != record_removal || "$*" != "-- $record" ]] || return 1
    [[ "$case_name" != temp_removal || "$*" != "-rf -- $tmp" ]] || return 1
    command rm "$@"
  }
  status=0
  (trap finish EXIT; [[ "$case_name" != failed_probe ]]) || status=$?
  if [[ "$case_name" == success ]]; then
    [[ "$status" == 0 ]] || { printf 'ST-233a negative harness failure: case=success phase=cleanup status=%s\n' "$status" >&2; exit 1; }
    if [[ -e "$tmp" || -e "$record" ]]; then printf 'ST-233a negative harness failure: case=success residual=owned-path\n' >&2; exit 1; fi
    grep -q '^ST-233a foundation: PASS ' "$receipt"
  else
    [[ "$status" != 0 ]] || { printf 'ST-233a negative harness failure: case=%s unexpected-success\n' "$case_name" >&2; exit 1; }
    grep -q '^ST-233a foundation: FAIL ' "$receipt"
    ! grep -q 'fixture-secret' "$receipt"
  fi
  case "$case_name" in missing|substituted|identity|network|mount|privileged|inspect|credentials) [[ ! -e "$base/removed" ]] ;; esac
  [[ "$case_name" == temp || "$case_name" == temp_removal || ! -e "$tmp" ]]
  chmod 700 "$tmp" 2>/dev/null || true
  command rm -rf -- "$tmp"
  command rm -f -- "$record"
  printf 'ST-233a custody negative case=%s: expected result verified\n' "$case_name"
done
# No deletion when the record is substituted or a temporary root escapes custody.
tmp=$(mktemp -d "$base/st233a.XXXXXX")
outside=$(mktemp -d "$base/foreign.XXXXXX")
ln -s "$outside" "$tmp/link"
saved="$tmp" tmp="$outside"
if cleanup_temp; then exit 1; fi
[[ -d "$outside" ]]
tmp="$saved"
cleanup_temp
[[ -d "$outside" ]]
printf 'ST-233a actual custody and finish negatives: PASS\n'
