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
cid=$(printf '%064d' 0) marker=$(printf '%032d' 0) name="st233a-$(printf '%032d' 0)" created=''
for function in private_file custody custody_diagnostic cleanup_container cleanup_temp finish; do
  source <(sed -n "/^$function() {/,/^}/p" "$script")
done
for case_name in success empty missing substituted identity label head image name creation parse null_shape null_mounts null_networks missing_config future stale invalid_age network network_key extra_network port_binding published_port mount extra_mount privileged cap device pid inspect removal remains record_removal temp_removal failed_probe failed_probe_cleanup incomplete temp credentials; do
  created=$(python3 -c 'import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"))')
  case "$case_name" in
    future|stale) created=$(python3 -c 'import datetime,sys; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=int(sys.argv[1]))).isoformat().replace("+00:00","Z"))' "$([[ "$case_name" == future ]] && printf '%s' 120 || printf '%s' -1900)") ;;
    invalid_age) created=2026-99-99T00:00:00Z ;;
  esac
  tmp=$(mktemp -d "$base/st233a.XXXXXX")
  printf 'fixture-secret\n' > "$tmp/pgpass"
  printf '%s %s %s %s\n' "$cid" "$marker" "$name" "$created" > "$record"
  passed=true phase=catalog
  : > "$receipt"
  printf 'ST-233a input=fixture blob=%s sha256=%s\n' "$cid" "$cid" > "$receipt"
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
  [[ "$case_name" != failed_probe && "$case_name" != failed_probe_cleanup && "$case_name" != incomplete ]] || passed=false
  docker() {
    case "$1" in
      inspect)
        [[ "$case_name" != inspect ]] || return 1
        python3 - "$case_name" "$cid" "$name" "$created" "$marker" "$source_head" "$image" <<'PY'
import json, sys
case, cid, name, created, marker, head, image = sys.argv[1:]
x = {'Id':cid, 'Name':'/'+name, 'Created':created,
     'Config':{'Labels':{'subtrack.task':'ST-233a:'+marker, 'subtrack.head':head}, 'Image':image},
     'HostConfig':{'NetworkMode':'none', 'PortBindings':None, 'Privileged':False, 'CapAdd':None, 'Devices':None, 'PidMode':''},
     'NetworkSettings':{'Networks':{'none':{}}, 'Ports':{'5432/tcp':None}},
     'Mounts':[{'Type':'tmpfs','Destination':'/var/lib/postgresql/data'}]}
h, n, c = x['HostConfig'], x['NetworkSettings'], x['Config']
if case == 'parse': print('{'); sys.exit(0)
if case == 'empty': h.update(PortBindings={}, CapAdd=[], Devices=[]); n['Ports']={}
if case == 'identity': x['Id']='foreign'
if case == 'name': x['Name']='/foreign'
if case == 'creation': x['Created']='2026-01-01T00:00:00Z'
if case == 'label': c['Labels']['subtrack.task']='foreign'
if case == 'head': c['Labels']['subtrack.head']='foreign'
if case == 'image': c['Image']='foreign'
if case == 'null_shape': x['HostConfig']=None
if case == 'null_mounts': x['Mounts']=None
if case == 'null_networks': n['Networks']=None
if case == 'missing_config': del x['Config']
if case == 'network': h['NetworkMode']='bridge'
if case == 'network_key': n['Networks']={'bridge':{}}
if case == 'extra_network': n['Networks']['bridge']={}
if case == 'port_binding': h['PortBindings']={'5432/tcp':[{'HostPort':'5432'}]}
if case == 'published_port': n['Ports']['5432/tcp']=[{'HostPort':'5432'}]
if case == 'mount': x['Mounts'][0]['Type']='bind'
if case == 'extra_mount': x['Mounts'].append({'Type':'bind','Destination':'/foreign'})
if case == 'privileged': h['Privileged']=True
if case == 'cap': h['CapAdd']=['SYS_ADMIN']
if case == 'device': h['Devices']=[{}]
if case == 'pid': h['PidMode']='host'
print(json.dumps(x))
PY
        ;;
      rm) printf '%s\n' "$cid" > "$base/removed"; [[ "$case_name" != removal && "$case_name" != failed_probe_cleanup ]] ;;
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
  (trap finish EXIT; [[ "$case_name" != failed_probe && "$case_name" != failed_probe_cleanup ]]) || status=$?
  if [[ "$case_name" == success || "$case_name" == empty ]]; then
    [[ "$status" == 0 ]] || { printf 'ST-233a negative harness failure: case=success phase=cleanup status=%s\n' "$status" >&2; exit 1; }
    if [[ -e "$tmp" || -e "$record" ]]; then printf 'ST-233a negative harness failure: case=success residual=owned-path\n' >&2; exit 1; fi
    grep -q '^ST-233a foundation: PASS ' "$receipt"
  else
    [[ "$status" != 0 ]] || { printf 'ST-233a negative harness failure: case=%s unexpected-success\n' "$case_name" >&2; exit 1; }
    grep -q '^ST-233a foundation: FAIL ' "$receipt"
    ! grep -q 'fixture-secret' "$receipt"
    grep -q '^ST-233a foundation: FAIL .* phase=catalog cleanup=' "$receipt"
    grep -q '^ST-233a input=fixture ' "$receipt"
    [[ "$case_name" != failed_probe_cleanup ]] || grep -q 'phase=catalog cleanup=failed$' "$receipt"
  fi
  case "$case_name" in success|empty|removal|remains|record_removal|temp_removal|failed_probe|failed_probe_cleanup|incomplete|temp) ;; *) [[ ! -e "$base/removed" ]] ;; esac
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
