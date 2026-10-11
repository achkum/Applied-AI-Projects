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
declare -A clients=() writers=()
driver_cid='' driver_name='' driver_env='' driver_image='node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
for function in private_file custody custody_diagnostic terminate_container cleanup_container cleanup_temp finish record_migration_failure monotonic registry launch_client observe_clients live_client poll_client join_client close_writers terminate_clients driver_custody driver_cleanup; do
  source <(sed -n "/^$function() {/,/^}/p" "$script")
done
# Run the production parser and receipt writer against private client-log fixtures.
# Raw psql text must never become a receipt field, even when it resembles SQLSTATE.
diagnostic_cid=$cid; cid=''
for diagnostic_case in undefined_table insufficient_privilege no_colon end_of_line embedded_error malformed_code long_code lowercase_code invalid_exit timeout missing_log; do
  tmp=$(mktemp -d "$base/st233a.XXXXXX")
  client_log="$tmp/client.log"; migration_step=parent-0001 phase=migration passed=false
  client_exit_status=1; expected_state=unavailable; expected_exit=1
  case "$diagnostic_case" in
    undefined_table) printf 'ERROR:  42P01: private-sentinel\n' > "$client_log"; expected_state=42P01 ;;
    insufficient_privilege) printf 'ERROR:  42501: private-sentinel\n' > "$client_log"; expected_state=42501 ;;
    no_colon) printf 'ERROR:  42P01 private-sentinel\n' > "$client_log"; expected_state=42P01 ;;
    end_of_line) printf 'ERROR:  42P01\n' > "$client_log"; expected_state=42P01 ;;
    embedded_error) printf 'NOTICE: prefix ERROR:  42P01: private-sentinel\n' > "$client_log" ;;
    malformed_code) printf 'ERROR:  42P0 private-sentinel\n' > "$client_log" ;;
    long_code) printf 'ERROR:  42P01X private-sentinel\n' > "$client_log" ;;
    lowercase_code) printf 'ERROR:  42p01 private-sentinel\n' > "$client_log" ;;
    invalid_exit) printf 'ERROR:  42P01: private-sentinel\n' > "$client_log"; client_exit_status=999; expected_state=42P01; expected_exit=unavailable ;;
    timeout) printf 'private-sentinel timeout\n' > "$client_log"; client_exit_status=unavailable; expected_exit=unavailable ;;
    missing_log) client_log="$tmp/missing" ;;
  esac
  : > "$receipt"
  record_migration_failure
  [[ "$migration_sqlstate" == "$expected_state" && "$migration_exit" == "$expected_exit" ]]
  status=0; (trap finish EXIT; false) || status=$?
  [[ "$status" != 0 && ! -e "$tmp" ]]
  grep -Eq "^ST-233a foundation: FAIL source_head=$source_head phase=migration cleanup=removed step=parent-0001 sqlstate=$expected_state client_exit=$expected_exit$" "$receipt"
  ! grep -q 'private-sentinel' "$receipt"
  printf 'ST-236 migration diagnostic case=%s: expected result verified\n' "$diagnostic_case"
done

# The enrollment diagnostic passes through the same real finish writer.
for diagnostic_case in sql010 driver_exit invalid_step invalid_fields; do
  tmp=$(mktemp -d "$base/st233a.XXXXXX")
  phase=durable-enrollment passed=false
  enrollment_step=sql010 enrollment_failure_kind=operation enrollment_sqlstate=unavailable enrollment_driver_exit=unavailable
  expected_step=sql010 expected_kind=operation expected_state=unavailable expected_exit=unavailable
  case "$diagnostic_case" in
    sql010) enrollment_sqlstate=42P01; expected_state=42P01 ;;
    driver_exit) enrollment_step=driver-exit; enrollment_failure_kind=nonzero-exit; enrollment_driver_exit=255
      expected_step=driver-exit expected_kind=nonzero-exit expected_exit=255 ;;
    invalid_step) enrollment_step='private-sentinel'; expected_step=unavailable ;;
    invalid_fields) enrollment_failure_kind='private-sentinel'; enrollment_sqlstate='42P01X'; enrollment_driver_exit='256'
      expected_kind=unavailable ;;
  esac
  : > "$receipt"
  status=0; (trap finish EXIT; false) || status=$?
  [[ "$status" != 0 && ! -e "$tmp" ]]
  grep -Eq "^ST-233a foundation: FAIL source_head=$source_head phase=durable-enrollment cleanup=removed step=$expected_step failure_kind=$expected_kind sqlstate=$expected_state driver_exit=$expected_exit$" "$receipt"
  ! grep -q 'private-sentinel' "$receipt"
  printf 'ST-236 enrollment diagnostic case=%s: expected result verified\n' "$diagnostic_case"
done
cid=$diagnostic_cid
custody_cases() {
for case_name in "$@"; do
  created=$(python3 -c 'import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"))')
  case "$case_name" in
    future|stale) created=$(python3 -c 'import datetime,sys; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=int(sys.argv[1]))).isoformat().replace("+00:00","Z"))' "$([[ "$case_name" == future ]] && printf '%s' 120 || printf '%s' -1900)") ;;
    invalid_age) created=2026-99-99T00:00:00Z ;;
  esac
  tmp=$(mktemp -d "$base/st233a.XXXXXX")
  printf 'fixture-secret\n' > "$tmp/pgpass"
  printf '%s %s %s %s\n' "$cid" "$marker" "$name" "$created" > "$record"
  passed=true phase=catalog container_gone=false
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
  case "$case_name" in success|empty|failed_probe|incomplete) [[ ! -e "$tmp" ]] ;; *) [[ -f "$tmp/pgpass" ]] ;; esac
  chmod 700 "$tmp" 2>/dev/null || true
  command rm -rf -- "$tmp"
  command rm -f -- "$record"
  printf 'ST-233a custody negative case=%s: expected result verified\n' "$case_name"
done
}
custody_cases success empty missing substituted identity label head image name creation parse null_shape null_mounts null_networks missing_config future stale invalid_age network network_key extra_network port_binding published_port mount extra_mount privileged cap device pid inspect removal remains record_removal temp_removal failed_probe failed_probe_cleanup incomplete
# Actual launch/registry/observer/finish helpers; only Docker transport is a shell fixture.
# These cases require real Linux private-file/FIFO semantics; no SQL/PG emulation.
eval "$(declare -f docker | sed '1s/docker/custody_docker/')"
mkdir "$base/bin"
cat > "$base/bin/docker" <<'SH'
#!/usr/bin/env bash
[[ "$1" == exec ]] || exit 90
printf 'launch\n' >> "$ST233B_EVENTS"
[[ "$*" != *st233b-observer* ]] || { cat >/dev/null; printf 'no-edge\n'; exit 0; }
[[ "$ST233B_MODE" != child ]] || exit 7
[[ "$ST233B_MODE" != exited ]] || exit 0
exec sleep 5
SH
chmod 700 "$base/bin/docker"
PATH="$base/bin:$PATH"; export PATH
for lifecycle in registry_write valid_fifo child wait deadline observer term exited uncertain custody survivor absence input fifo log registry; do
  tmp=$(mktemp -d "$base/st233a.XXXXXX"); : > "$tmp/clients"; printf 'fixture-secret\n' > "$tmp/pgpass"
  input="$tmp/input"; printf 'payload\n' > "$input"; events="$tmp/events"; : > "$events"
  custody_fault=false case_name=success clients=() writers=() container_gone=false registering=false interrupted=false passed=true phase=fence db=fixture
  printf '%s %s %s %s\n' "$cid" "$marker" "$name" "$created" > "$record"; chmod 600 "$record"
  export ST233B_EVENTS="$events" ST233B_MODE="$lifecycle"
  docker() {
    case "$1" in
      inspect) [[ "$custody_fault" == false ]] && custody_docker "$@" ;;
      rm) printf 'remove\n' >> "$events"; [[ "$lifecycle" != survivor ]] || return 1; kill -TERM "$server_pid"; command wait "$server_pid" || true ;;
      ps) [[ "$lifecycle" != absence ]] || { printf '%s\n' "$cid"; return; }; printf 'absent\n' >> "$events" ;;
      *) return 90 ;;
    esac
  }
  if [[ "$lifecycle" == input || "$lifecycle" == fifo || "$lifecycle" == registry ]]; then
    victim="$input"; [[ "$lifecycle" != registry ]] || victim="$tmp/clients"
    [[ "$lifecycle" != fifo ]] || { rm -- "$victim"; mkfifo -m 600 "$victim"; }
    mv -- "$victim" "$tmp/unsafe"; ln -s "$tmp/unsafe" "$victim"
    ! launch_client login "$input" st233b-holder; [[ ! -s "$events" && ${#clients[@]} == 0 ]]
  elif [[ "$lifecycle" == log ]]; then
    mktemp() { ln -s "$input" "$tmp/badlog"; printf '%s\n' "$tmp/badlog"; }
    ! launch_client login "$input" st233b-holder; unset -f mktemp
    [[ ! -s "$events" && $(cat "$input") == payload && ${#clients[@]} == 0 ]]
  else
    if [[ "$lifecycle" == valid_fifo ]]; then rm -- "$input"; mkfifo -m 600 "$input"; exec {fd}<>"$input"; writers[holder]=$fd; fi
    if [[ "$lifecycle" == registry_write ]]; then
      printf 'retained\n' > "$tmp/clients"
      printf() { [[ "$1" != '%s %s\n' ]] || return 1; builtin printf "$@"; }
    fi
    status=0; launch_client login "$input" st233b-holder || status=$?; pid=$client_pid holder_log=$client_log
    unset -f printf 2>/dev/null || true
    [[ "$lifecycle" != registry_write ]] || [[ "$status" != 0 && ${clients[$pid]} == st233b-holder && "$interrupted" == true ]]
    [[ "$lifecycle" == registry_write ]] || grep -qx "$pid st233b-holder" "$tmp/clients"
    if [[ "$lifecycle" == child ]]; then ! join_client "$pid" 2000; [[ ${#clients[@]} == 0 ]]
    elif [[ "$lifecycle" == wait ]]; then
      wait() { return 127; }; kill -TERM "$pid"; ! join_client "$pid" 2000; [[ ${#clients[@]} == 1 ]]; unset -f wait
    elif [[ "$lifecycle" == deadline ]]; then ! poll_client "$pid" 1; live_client "$pid"
    elif [[ "$lifecycle" == observer ]]; then
      holder_pid=$pid waiter_pid='' observer="$input"
      ! observe_clients 'unobserved-edge' '^ t *$' 300; [[ "$holder_log" != "$client_log" ]]; live_client "$pid"; [[ $(grep -c launch "$events") -gt 1 ]]
    else
      [[ "$lifecycle" != custody ]] || custody_fault=true
      (exec sleep 5) & server_pid=$!
      [[ "$lifecycle" != exited ]] || { poll_client "$pid" 2000; kill -0 "$server_pid"; }
      wait() { [[ "$lifecycle" != uncertain ]] || return 127; [[ "$container_gone" == true && $(tail -1 "$events") == absent ]] || return 127; printf 'reap\n' >> "$events"; command wait "$@"; }
      if [[ "$lifecycle" == uncertain || "$lifecycle" == custody || "$lifecycle" == survivor || "$lifecycle" == absence ]]; then
        status=0; (trap finish EXIT; false) 2> "$tmp/failure" || status=$?; [[ "$status" != 0 ]]
        grep -q '^ST-233b lifecycle: FAIL recovery=retained$' "$tmp/failure"; ! grep -q fixture-secret "$receipt"
        [[ -f "$tmp/pgpass" && -f "$tmp/clients" && -e "$record" ]]; ! grep -q reap "$events"
      else
        terminate_clients; [[ ${#clients[@]} == 0 ]]; grep -q reap "$events"
        [[ $(sed -n '/remove/p;/absent/p;/reap/p' "$events" | head -3 | tr '\n' ' ') == 'remove absent reap ' ]]
      fi
      unset -f wait; kill -TERM "$server_pid" 2>/dev/null || true; command wait "$server_pid" 2>/dev/null || true
    fi
    for pid in "${!clients[@]}"; do kill -TERM "$pid" 2>/dev/null || true; command wait "$pid" 2>/dev/null || true; done
  fi
  close_writers; clients=(); command rm -rf -- "$tmp"; command rm -f -- "$record"
  printf 'ST-233b actual shell lifecycle case=%s: expected result verified\n' "$lifecycle"
done
# Permission/type and custody faults must fail at the real pre-registration gate.
launch_snapshot() {
  local path
  for path in "$input" "$tmp/clients" "$log" "$record" "$tmp"; do
    stat -c '%F:%a:%u:%i' "$path"; [[ ! -f "$path" ]] || sha256sum "$path"
  done
}
for prelaunch in input_mode fifo_mode log_mode registry_mode temp_mode input_directory log_directory registry_directory custody_record custody_inspect custody_identity; do
  tmp=$(mktemp -d "$base/st233a.XXXXXX"); input="$tmp/input" log="$tmp/log" events="$tmp/events"
  printf 'payload\n' > "$input"; printf 'retained-registry\n' > "$tmp/clients"; printf 'retained-log\n' > "$log"; : > "$events"
  printf '%s %s %s %s\n' "$cid" "$marker" "$name" "$created" > "$record"; chmod 600 "$record"
  custody_fault=false case_name=success clients=() writers=() registering=false interrupted=false client_pid='' client_log=''
  export ST233B_EVENTS="$events" ST233B_MODE="$prelaunch"
  victim='' expected_mode=''
  case "$prelaunch" in
    input_mode) victim="$input"; expected_mode=644 ;;
    fifo_mode) command rm -- "$input"; mkfifo -m 600 "$input"; [[ -p "$input" && ! -L "$input" ]]; victim="$input"; expected_mode=644 ;;
    log_mode) victim="$log"; expected_mode=644 ;;
    registry_mode) victim="$tmp/clients"; expected_mode=644 ;;
    temp_mode) victim="$tmp"; expected_mode=755 ;;
    input_directory) victim="$input" ;;
    log_directory) victim="$log" ;;
    registry_directory) victim="$tmp/clients" ;;
    custody_record) printf 'foreign\n' > "$record" ;;
    custody_inspect) custody_fault=true ;;
    custody_identity) case_name=identity ;;
  esac
  if [[ "$prelaunch" == *_directory ]]; then
    command rm -- "$victim"; mkdir -m 600 "$victim"; [[ -d "$victim" && ! -L "$victim" ]]
    expected_mode=600
  fi
  if [[ -n "$expected_mode" ]]; then
    chmod "$expected_mode" "$victim"
    [[ $(stat -c %a "$victim") == "$expected_mode" ]] || { printf 'ST-233b prelaunch negatives unavailable: actual chmod semantics unsupported on %s\n' "$(uname -s)" >&2; exit 1; }
  fi
  before=$(launch_snapshot); before_jobs=$(jobs -p)
  mktemp() { printf '%s\n' "$log"; }
  docker() {
    case "$1" in
      inspect) printf 'inspect\n' >> "$tmp/preflight"; [[ "$custody_fault" == false ]] && custody_docker "$@" ;;
      *) printf 'unexpected-transport\n' >> "$events"; return 90 ;;
    esac
  }
  status=0; launch_client login "$input" st233b-holder 2> "$tmp/refusal" || status=$?
  unset -f mktemp
  [[ "$status" != 0 && ! -s "$events" && ${#clients[@]} == 0 && ${#writers[@]} == 0 && -z "$client_pid" ]]
  [[ "$registering" == false && "$interrupted" == false && $(jobs -p) == "$before_jobs" && $(launch_snapshot) == "$before" ]]
  case "$prelaunch" in
    custody_inspect|custody_identity) [[ $(cat "$tmp/preflight") == inspect ]] ;;
    *) [[ ! -e "$tmp/preflight" ]] ;;
  esac
  [[ "$prelaunch" != *_directory ]] || chmod 700 "$victim"
  chmod 700 "$tmp"; command rm -rf -- "$tmp"; command rm -f -- "$record"
  printf 'ST-233b actual prelaunch case=%s: refusal-before-use verified\n' "$prelaunch"
done
custody_cases temp credentials
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
# Sidecar custody faults must refuse use and removal without touching the PG registry.
tmp=$(mktemp -d "$base/st233a.XXXXXX")
: > "$tmp/driver.cjs"; : > "$tmp/driver.json"
driver_cid=$(printf '%064d' 1); driver_name="st233l-$marker"
for driver_case in valid valid-development image network mount label uid pid port pids-limit memory-limit env env-production created-pid exited-running; do
  driver_removed=false
  driver_env=''
  [[ "$driver_case" != valid-development && "$driver_case" != env-production ]] || driver_env='NODE_ENV=development'
  docker() {
    case "$1" in
      inspect)
        python3 - "$driver_case" "$driver_cid" "$driver_name" "$marker" "$source_head" "$driver_image" "$cid" "$tmp" "$UID" <<'PY'
import json,sys
case,ident,name,marker,head,image,pg,tmp,uid=sys.argv[1:]
x={'Id':ident,'Name':'/'+name,'Config':{'Image':image,'Labels':{'subtrack.task':'ST-233l:'+marker,'subtrack.head':head},'User':uid,'Env':['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','NODE_VERSION=22.23.2','YARN_VERSION=1.22.22'],'Entrypoint':['docker-entrypoint.sh'],'Cmd':['node','/fixture.cjs']},
   'HostConfig':{'NetworkMode':'container:'+pg,'Privileged':False,'PortBindings':None,'CapAdd':None,'CapDrop':['ALL'],'Devices':None,'ReadonlyRootfs':True,'SecurityOpt':['no-new-privileges'],'PidsLimit':64,'Memory':134217728},
   'NetworkSettings':{'Ports':{}},'State':{'Running':True,'Status':'running','Pid':1234},
   'Mounts':[{'Type':'bind','Source':tmp+'/driver.cjs','Destination':'/fixture.cjs','RW':False},{'Type':'bind','Source':tmp+'/driver.json','Destination':'/fixture.json','RW':False}]}
if case=='image': x['Config']['Image']='foreign'
if case=='network': x['HostConfig']['NetworkMode']='bridge'
if case=='mount': x['Mounts'][0]['Source']='/foreign'
if case=='label': x['Config']['Labels']['subtrack.head']='foreign'
if case=='uid': x['Config']['User']='0'
if case=='pid': x['State']['Pid']=0
if case=='port': x['HostConfig']['PortBindings']={'5432/tcp':[{}]}
if case=='pids-limit': x['HostConfig']['PidsLimit']=65
if case=='memory-limit': x['HostConfig']['Memory']=134217729
if case=='env': x['Config']['Env'].append('PGPASSWORD=foreign')
if case=='valid-development': x['Config']['Env'].append('NODE_ENV=development')
if case=='env-production': x['Config']['Env'].append('NODE_ENV=production')
if case=='created-pid': x['State'].update(Status='created',Running=False,Pid=1234)
if case=='exited-running': x['State'].update(Status='exited',Running=True,Pid=1234)
print(json.dumps(x))
PY
        ;;
      rm) driver_removed=true ;;
      ps) ;;
      *) return 1 ;;
    esac
  }
  if [[ "$driver_case" == valid || "$driver_case" == valid-development ]]; then driver_custody running; driver_cleanup; [[ "$driver_removed" == true ]]; driver_cid=$(printf '%064d' 1)
  else ! driver_custody running; ! driver_cleanup; [[ "$driver_removed" == false ]]; fi
  printf 'ST-233l sidecar custody case=%s: expected result verified\n' "$driver_case"
done
command rm -rf -- "$tmp"
