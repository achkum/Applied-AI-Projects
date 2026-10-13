#!/usr/bin/env bash
# No PostgreSQL/server/secrets: reproduce daemon inheritance against the actual launcher line.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
"${ST244_PYTHON_BIN:-python3}" - "$root/tools/database/private-mobile-proof.sh" "$BASH" <<'PY'
import pathlib,re,subprocess,time,sys,tempfile
source=pathlib.Path(sys.argv[1]).read_text()
lines=[line.strip() for line in source.splitlines() if re.match(r'^\s*pg_ctl .* -w start ',line)]
assert len(lines)==1
fixed=lines[0]
assert fixed.endswith('3>&- 4>&-')
unsafe=fixed.removesuffix(' 3>&- 4>&-')
def observed(command):
    # Background child runs beyond launcher exit and inherits every unclosed descriptor.
    # External executable mock replaces pg_ctl; source redirections match a real daemon launch.
    script='''
launch() {
 exec 3>&1 4>&2
 exec >/dev/null 2>&1
 cluster=/unused; work=/unused
 DAEMON_COMMAND
 printf READY >&3
}
ready=$(launch)
printf '%s' "$ready"
'''.replace('DAEMON_COMMAND',command)
    with tempfile.TemporaryDirectory(prefix='st244-daemon-fd-') as owned:
        done_path=str(pathlib.Path(owned)/'daemon.done')
        mock=pathlib.Path(owned)/'pg_ctl'
        mock.write_text('#!/usr/bin/env bash\n(sleep 2; printf FINISHED > "$done_path") </dev/null >/dev/null 2>&1 &\n')
        mock.chmod(0o700)
        # Pass the owned path as a positional argument; never compose it into shell text.
        script='export done_path="$1"\nmock_bin="$(cd "$2" && pwd -P)"\nexport PATH="$mock_bin:$PATH"\n'+script
        start=time.monotonic()
        try:
            value=subprocess.run([sys.argv[2],'-c',script,'fixture-test',done_path,owned],capture_output=True,text=True,check=True,timeout=8)
            elapsed=time.monotonic()-start
            assert value.stdout=='READY' and value.stderr==''
            return elapsed
        finally:
            # Await this finite child's owned completion marker. Never signal a possibly reused PID.
            deadline=time.monotonic()+8
            while not pathlib.Path(done_path).exists() and time.monotonic()<deadline:
                time.sleep(0.01)
            assert pathlib.Path(done_path).read_text()=='FINISHED'
blocked=observed(unsafe)
released=observed(fixed)
assert blocked>=1.5, 'unsafe control did not retain capture pipe'
assert released<1.5 and blocked-released>1, 'fixed daemon launch did not release capture pipe'
print('PASS ST244_LOCAL_POSTGRES_DAEMON_CAPTURE_FD_CUSTODY')
PY
