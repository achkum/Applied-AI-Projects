#!/usr/bin/env bash
# ST244 owned PostgreSQL16 and TLS provisioning; no API listener or OTP transport here.
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$root"
db=st237_private_https_profile
image=mirror.gcr.io/library/postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
action="${1:-}"; shift || true
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
owner() {
 if [[ "$mode" == docker ]]; then
  docker exec -i -e "PGPASSWORD=$owner_pass" "$cid" psql -X -q -A -t -h127.0.0.1 -Ust233a_fixture_owner -d"$db" -vON_ERROR_STOP=1
 else
  PGPASSWORD="$owner_pass" psql -X -q -A -t -h127.0.0.1 -p"$port" -Ust233a_fixture_owner -d"$db" -vON_ERROR_STOP=1
 fi
}
custody() {
 [[ "$work" == "$base"/st244-mobile.* && ! -L "$work" && -d "$work" ]]
 if [[ "$mode" == docker && -n "$cid" ]]; then
  docker inspect "$cid" | python3 -c 'import json,sys
x=json.load(sys.stdin)[0]; cid,marker,head,image=sys.argv[1:];h=x["HostConfig"];c=x["Config"]
assert x["Id"]==cid and c["Image"]==image
assert c["Labels"]["subtrack.task"]=="ST244:"+marker and c["Labels"]["subtrack.head"]==head
assert not h["Privileged"] and not h["CapAdd"] and not h["Devices"]
assert h["PidsLimit"]==128 and h["Memory"]==536870912
assert set(h["Tmpfs"])=={"/var/lib/postgresql/data"}
assert all(m["Type"]=="tmpfs" and m["Destination"]=="/var/lib/postgresql/data" for m in x["Mounts"])
assert set(h["PortBindings"])=={"5432/tcp"}
assert all(p["HostIp"]=="127.0.0.1" for p in h["PortBindings"]["5432/tcp"])
' "$cid" "$marker" "$head" "$image"
 elif [[ "$mode" == local ]]; then
  [[ "$cluster" == "$work/cluster" && ! -L "$cluster" ]]
  if [[ -f "$cluster/postmaster.pid" ]]; then
   [[ "$(sed -n '2p' "$cluster/postmaster.pid")" == "$cluster" ]]
  fi
 fi
}
remove_owned() {
 custody || return 1
 if [[ "$mode" == docker && -n "$cid" ]]; then docker rm -f "$cid" >/dev/null; ! docker inspect "$cid" >/dev/null 2>&1
 elif [[ "$mode" == local && -f "$cluster/postmaster.pid" ]]; then pg_ctl -D "$cluster" -m immediate -w stop >/dev/null
 fi
 [[ "$work" == "$base"/st244-mobile.* && ! -L "$work" ]]
 rm -rf -- "$work"
 [[ ! -e "$work" ]]
}
if [[ "$action" == stop ]]; then
 [[ "$#" == 2 && "$1" == --config ]]
 config="$2"
 # Exact fields and path custody before reading any secret or selecting a deletion target.
 mapfile_read() { while IFS= read -r line; do config_fields+=("$line"); done; }
 config_fields=()
 mapfile_read < <(python3 - "$config" "$base" <<'PY'
import json,os,stat,sys
p,base=sys.argv[1:];s=os.lstat(p);assert stat.S_ISREG(s.st_mode) and s.st_mode&0o077==0
assert os.path.realpath(p)==p and os.path.dirname(os.path.dirname(p))==base
c=json.load(open(p));w=c['tempDir'];assert os.path.dirname(p)==w and os.path.basename(w).startswith('st244-mobile.')
assert c['version']==1 and c['database']=='st237_private_https_profile' and c['host']=='127.0.0.1'
assert c['mode'] in ('docker','local')
for k in ['tempDir','mode','containerId','clusterDir','marker','head','ownerPassword','port']: print('' if c[k] is None else c[k])
PY
 )
 [[ "${#config_fields[@]}" == 8 ]]
 work="${config_fields[0]}" mode="${config_fields[1]}" cid="${config_fields[2]}" cluster="${config_fields[3]}" marker="${config_fields[4]}" head="${config_fields[5]}" owner_pass="${config_fields[6]}" port="${config_fields[7]}"
 [[ "$head" =~ ^[a-f0-9]{40}$ && "$marker" =~ ^[a-f0-9]{32}$ && "$owner_pass" =~ ^[a-f0-9]{48}$ && "$port" =~ ^[0-9]+$ ]]
 custody
 [[ "$(printf "SELECT count(*) FROM public.st233a_fixture_control WHERE task='ST-233a' AND head='%s' AND marker='%s';" "$head" "$marker" | owner)" == 1 ]]
 remove_owned
 printf 'ST244_FIXTURE_CLEANUP removed\n'
 exit 0
fi
[[ "$action" == start && "$#" == 2 && "$1" == --mode && "$2" =~ ^(docker|local)$ ]]
mode="$2";head="$(git rev-parse HEAD)";[[ "$head" =~ ^[a-f0-9]{40}$ ]]
work="$(mktemp -d "$base/st244-mobile.XXXXXXXX")";cid='';cluster="$work/cluster";marker="$(openssl rand -hex 16)"
exec 3>&1 4>&2
exec >"$work/internal.log" 2>&1
complete=0;phase=START
cleanup_partial() {
 local code=$? ok=1
 trap - EXIT INT TERM
 if (( complete==1 && code==0 )); then exit 0; fi
 remove_owned || ok=0
 printf 'ST244_FIXTURE_FAILED phase=%s cleanup=%s\n' "$phase" "$([[ "$ok" == 1 ]] && printf removed || printf failed)" >&4
 exit 1
}
trap cleanup_partial EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
owner_pass="$(openssl rand -hex 24)";actor_pass="$(openssl rand -hex 24)"
manifest="$(node - "$root" "$work" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{createRequire}=require('node:module');const [root,work]=process.argv.slice(2);
const r=createRequire(path.join(root,'apps/api/package.json')),esbuild=r(r.resolve('esbuild',{paths:[r.resolve('vite')]}));if(esbuild.version!=='0.28.2')throw Error('tool version');
const modulePath=path.join(work,'manifest.cjs');esbuild.buildSync({entryPoints:[path.join(root,'apps/api/test/private-mobile-manifest.ts')],outfile:modulePath,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const bundle={};for(const n of ['otp','rate','idempotency','anonymous','subject','person','simulator','credential'])bundle[n]=crypto.randomBytes(32).toString('hex');
bundle.privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
fs.writeFileSync(work+'/keys.json',JSON.stringify(bundle),{mode:0o600});process.stdout.write(r(modulePath).derivePrivateMobileManifest(bundle));
NODE
)"
[[ "$manifest" =~ ^[a-f0-9]{64}$ ]]
phase=POSTGRES
if [[ "$mode" == docker ]]; then
 engine="$(docker version --format '{{.Server.Version}}')"
 [[ "$engine" =~ ^([0-9]+)\. ]] && (( BASH_REMATCH[1]>=28 ))
 printf 'POSTGRES_USER=st233a_fixture_owner\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n' "$db" "$owner_pass" > "$work/pg.env"
 cid="$(docker create --label "subtrack.task=ST244:$marker" --label "subtrack.head=$head" -p 127.0.0.1::5432 --pids-limit 128 --memory 512m --cpus 2 --tmpfs /var/lib/postgresql/data --env-file "$work/pg.env" "$image")"
 custody;docker start "$cid" >/dev/null
 for _ in {1..60}; do docker exec "$cid" pg_isready -h127.0.0.1 -Ust233a_fixture_owner -d"$db" >/dev/null && break;sleep 1;done
 docker exec "$cid" pg_isready -h127.0.0.1 -Ust233a_fixture_owner -d"$db" >/dev/null
 port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$cid")"
else
 [[ "$(initdb --version)" =~ PostgreSQL\)\ 16\. ]]
 printf '%s\n' "$owner_pass" > "$work/password"
 initdb -D "$cluster" -Ust233a_fixture_owner --pwfile="$work/password" --auth-local=scram-sha-256 --auth-host=scram-sha-256 >/dev/null
 port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
 printf "listen_addresses='127.0.0.1'\nport=%s\nunix_socket_directories='%s'\n" "$port" "$work" >> "$cluster/postgresql.conf"
 # The daemon must not retain the caller's captured readiness/diagnostic pipes.
 pg_ctl -D "$cluster" -l "$work/pg.log" -w start >/dev/null 3>&- 4>&-
 PGPASSWORD="$owner_pass" createdb -h127.0.0.1 -p"$port" -Ust233a_fixture_owner "$db"
fi
[[ "$port" =~ ^[0-9]+$ && "$port" -gt 0 && "$port" -lt 65536 ]]
phase=SCHEMA
owner < apps/api/prisma/migrations/0001_canonical_schema/migration.sql
owner < apps/api/prisma/migrations/0002_privacy_constraints/migration.sql
printf "REVOKE TEMPORARY,CREATE ON DATABASE %s FROM PUBLIC; CREATE TABLE public.st233a_fixture_control(task text,head text,marker text); REVOKE ALL ON public.st233a_fixture_control FROM PUBLIC; INSERT INTO public.st233a_fixture_control VALUES ('ST-233a','%s','%s');\n" "$db" "$head" "$marker" | owner
{ printf "SET st233a.head='%s';SET st233a.marker='%s';\n" "$head" "$marker";cat apps/api/prisma/development-auth/001-epoch-nonce-reservation.sql; } | owner
pin="$(printf "SELECT md5(string_agg(format('%%s:%%s:%%s:%%s:%%s',c.conname,c.contype,c.convalidated,c.condeferrable,pg_get_constraintdef(c.oid)),E'\\n' ORDER BY c.conname,c.oid)) FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::regnamespace;" | owner)"
[[ "$pin" =~ ^[a-f0-9]{32}$ ]]
for sql in apps/api/prisma/development-auth/{002,003,004,005,006,007,008,009,010,011,012,013,014}-*.sql;do
 { printf "SET st233a.head='%s';SET st233a.marker='%s';SET st233c.constraints='%s';\n" "$head" "$marker" "$pin";cat "$sql"; } | owner
done
{ printf "SET st233a.head='%s';SET st233a.marker='%s';SET st244.manifest='%s';\n" "$head" "$marker" "$manifest";cat apps/api/prisma/development-auth/015-private-mobile-session.sql; } | owner
printf "ALTER ROLE subtrack_dev_auth_login PASSWORD '%s';\n" "$actor_pass" | owner
[[ "$(printf 'SELECT count(*) FROM public.identity;' | owner)" == 0 ]]
phase=TLS
printf '[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n' > "$work/ca.cnf"
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 1 -config "$work/ca.cnf" -subj '/CN=ST244 owned CA' -keyout "$work/ca.key" -out "$work/ca.crt" >/dev/null 2>&1
openssl req -new -newkey rsa:3072 -sha256 -nodes -subj '/CN=localhost' -keyout "$work/leaf.key" -out "$work/leaf.csr" >/dev/null 2>&1
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n' > "$work/leaf.ext"
openssl x509 -req -in "$work/leaf.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" -CAcreateserial -out "$work/leaf.crt" -days 1 -sha256 -extfile "$work/leaf.ext" >/dev/null 2>&1
cat "$work/leaf.crt" "$work/ca.crt" > "$work/chain.crt"
openssl verify -CAfile "$work/ca.crt" -verify_hostname localhost "$work/leaf.crt" >/dev/null
phase=CONFIG
ST244_OWNER="$owner_pass" ST244_ACTOR="$actor_pass" node - "$work" "$head" "$marker" "$manifest" "$port" "$mode" "$cid" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [tempDir,head,marker,manifestHash,port,mode,cid]=process.argv.slice(2);
const keyBundlePath=tempDir+'/keys.json';
const config={version:1,head,marker,database:'st237_private_https_profile',host:'127.0.0.1',port:Number(port),ownerPassword:process.env.ST244_OWNER,actorPassword:process.env.ST244_ACTOR,mode,containerId:mode==='docker'?cid:null,clusterDir:mode==='local'?tempDir+'/cluster':null,tempDir,caPath:tempDir+'/ca.crt',leafKeyPath:tempDir+'/leaf.key',leafChainPath:tempDir+'/chain.crt',manifestHash,keyBundlePath};
fs.writeFileSync(tempDir+'/config.json',JSON.stringify(config),{mode:0o600});
NODE
custody;complete=1
printf 'ST244_FIXTURE_READY config=%s/config.json\n' "$work" >&3
