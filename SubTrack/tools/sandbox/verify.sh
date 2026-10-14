#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# == 1 && "$1" =~ ^(validate|staging|preflight|runtime|live)$ ]] || exit 2
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
namespace=/home/openclaw/subtrack-sandbox
runtime="$namespace/runtime"
# BEGIN STATIC CONTRACT
image_arguments() {
  [[ "${SANDBOX_API_IMAGE:-}" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
  [[ "${SANDBOX_POSTGRES_IMAGE:-}" =~ ^postgres:16-bookworm@sha256:[a-f0-9]{64}$ ]] || return 1
  [[ "${SANDBOX_CADDY_IMAGE:-}" =~ ^caddy:2\.11\.7@sha256:[a-f0-9]{64}$ ]] || return 1
  [[ "${ST250_SOURCE_HEAD:-}" =~ ^[a-f0-9]{40}$ ]] || return 1
}
owned_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" && "$(realpath -e "$path")" == "$path" ]] || return 1
  [[ "$(stat -c %u "$path")" == 996 && "$(stat -c %a "$path")" == 700 ]] || return 1
}
# END STATIC CONTRACT
fail(){ printf 'ST250_DEPLOYMENT_UNAVAILABLE stage=VERIFY\n' >&2; exit 1; }
trap fail ERR
image_arguments
compose=(docker compose --project-name subtrack-sandbox --file "$root/infra/sandbox/compose.yaml")
for profile in sandbox-prepared sandbox-live sandbox-bootstrap;do "${compose[@]}" --profile "$profile" config --quiet;done
if [[ "$1" == validate ]];then printf 'ST250_COMPOSITION_VALID startup=not-performed\n';exit 0;fi
[[ "$(hostname)" == racknerd-49cd240 && "$(id -u)" == 996 ]]
[[ "$root" == "$namespace" ]]
[[ "${DOCKER_HOST:-}" == '' && "${DOCKER_CONTEXT:-}" == '' && "${NODE_OPTIONS:-}" == '' && "${NODE_EXTRA_CA_CERTS:-}" == '' && "${NODE_TLS_REJECT_UNAUTHORIZED:-}" == '' ]]
[[ "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" == unix:///var/run/docker.sock ]]
docker info --format '{{json .SecurityOptions}}' | node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(0,"utf8"));if(!Array.isArray(v)||v.some(x=>typeof x!=="string"||/rootless|userns/i.test(x)))process.exit(1);'
for path in /home /home/openclaw "$namespace" "$root/tools" "$root/tools/sandbox" "$root/infra" "$root/infra/sandbox";do [[ -d "$path" && ! -L "$path" && "$(realpath -e "$path")" == "$path" ]];done
owned_directory "$namespace"
[[ "${ST250_SOURCE_CUSTODY_SHA256:-}" =~ ^[a-f0-9]{64}$ ]]
[[ -f "$root/.source-custody.json" && ! -L "$root/.source-custody.json" && "$(realpath -e "$root/.source-custody.json")" == "$root/.source-custody.json" ]]
[[ "$(sha256sum "$root/.source-custody.json" | cut -d' ' -f1)" == "$ST250_SOURCE_CUSTODY_SHA256" ]]
[[ "${ST250_TRANSFER_RUN:-}" =~ ^[0-9]+-[0-9]+$ ]]
staging="$namespace/staging/$ST250_TRANSFER_RUN"
owned_directory "$namespace/staging";owned_directory "$staging"
[[ "${ST250_TOOLING_HEAD:-}" =~ ^[a-f0-9]{40}$ && "${ST250_HISTORICAL_SOURCE_CUSTODY_SHA256:-}" =~ ^[a-f0-9]{64}$ && "${ST250_EXPORTED_IMAGE_ID:-}" =~ ^sha256:[a-f0-9]{64}$ ]]
node "$root/tools/sandbox/image-import-binding.cjs" source "$root" "$staging"
[[ "${ST250_TRANSFER_RECEIPT_SHA256:-}" =~ ^[a-f0-9]{64}$ ]]
[[ "$(sha256sum "$staging/transfer-receipt.json" | cut -d' ' -f1)" == "$ST250_TRANSFER_RECEIPT_SHA256" ]]
for name in transfer-receipt.json transfer-manifest.json api-image.tar.gz;do
 [[ -f "$staging/$name" && ! -L "$staging/$name" && "$(realpath -e "$staging/$name")" == "$staging/$name" ]]
 [[ "$(stat -c %u "$staging/$name")" == 996 && "$(stat -c %a "$staging/$name")" == 600 ]]
 if [[ "$name" != api-image.tar.gz ]];then [[ "$(stat -c %s "$staging/$name")" -le 16384 ]];fi
done
node - "$root" "$staging" "$ST250_SOURCE_HEAD" "$ST250_TRANSFER_RUN" "$SANDBOX_API_IMAGE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
try {const[root,stage,head,run,image]=process.argv.slice(2),wire=require(path.join(root,'tools/sandbox/draft-transfer-receipt.cjs'));
 const m=wire.transferManifest(JSON.parse(fs.readFileSync(path.join(stage,'transfer-manifest.json'),'utf8'))),r=wire.draftTransferReceipt(JSON.parse(fs.readFileSync(path.join(stage,'transfer-receipt.json'),'utf8')),m);
 for(const v of[r,m])if(v.sourceHead!==head||v.runId!==run||v.imageId!==process.env.ST250_EXPORTED_IMAGE_ID)throw Error();
 const mf=fs.readFileSync(path.join(stage,'transfer-manifest.json')),file=path.join(stage,'api-image.tar.gz'),stat=fs.statSync(file);if(stat.size!==m.archiveBytes||stat.size!==r.archiveBytes||mf.length!==r.manifestBytes||crypto.createHash('sha256').update(mf).digest('hex')!==r.manifestSha256||m.archiveSha256!==r.archiveSha256)throw Error();
 const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536),h=crypto.createHash('sha256');try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}if(h.digest('hex')!==r.archiveSha256)throw Error();
 if(m.dockerfileSha256!==crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'infra/sandbox/Dockerfile.api'))).digest('hex'))throw Error();
}catch{process.stderr.write('ST250_DEPLOYMENT_UNAVAILABLE stage=TRANSFER\n');process.exitCode=1;}
NODE
for image in "$SANDBOX_API_IMAGE" "$SANDBOX_POSTGRES_IMAGE" "$SANDBOX_CADDY_IMAGE";do docker image inspect "$image" >/dev/null;done
docker image inspect "$SANDBOX_API_IMAGE" | node -e 'const fs=require("node:fs");try{const v=JSON.parse(fs.readFileSync(0,"utf8"));if(v.length!==1||v[0].Id!==process.env.SANDBOX_API_IMAGE||v[0].Config.User!=="1000:1000"||v[0].Config.Labels["org.subtrack.sandbox-build"]!=="st250-image-"+process.env.ST250_TRANSFER_RUN||JSON.stringify(v[0].Config.Cmd)!==JSON.stringify(["node","apps/api/dist/sandbox/main.js"])||v[0].Os!=="linux"||v[0].Architecture!=="amd64")throw Error();const e=new Set(v[0].Config.Env);for(const x of["NODE_ENV=production","SUBTRACK_RUNTIME=sandbox","SANDBOX_STARTUP_ENABLED=false","SANDBOX_PUBLICATION_ENABLED=false"])if(!e.has(x))throw Error();}catch{process.exit(1);}'
available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
minimum_kib=1048576;if [[ "$1" == runtime || "$1" == live ]];then minimum_kib=262144;fi
[[ "$available_kib" =~ ^[0-9]+$ && "$available_kib" -ge "$minimum_kib" ]]
free_kib="$(df --output=avail -k "$namespace" | tail -1 | tr -d ' ')"
[[ "$free_kib" =~ ^[0-9]+$ && "$free_kib" -ge 4194304 ]]
timeout --kill-after=10s 600s node "$root/tools/sandbox/image-import-binding.cjs" bind "$root" "$staging"
api_container_image="$(ST250_IDENTITY_SERVICE=api node "$root/tools/sandbox/image-import-binding.cjs" container-id "$root" "$staging")"
for name in verified-image-bytes.json verification-private.log mount-readable.txt;do
 if [[ -e "$staging/$name" || -L "$staging/$name" ]];then [[ -f "$staging/$name" && ! -L "$staging/$name" && "$(realpath -e "$staging/$name")" == "$staging/$name" && "$(stat -c %u "$staging/$name")" == 996 && "$(stat -c %a "$staging/$name")" == 600 ]];fi
done
probe_cid="$staging/verification.cid"
[[ ! -e "$probe_cid" && ! -L "$probe_cid" ]]
probe_cleanup(){
 local cid
 if [[ -f "$probe_cid" && ! -L "$probe_cid" ]];then
  cid="$(cat "$probe_cid")";[[ "$cid" =~ ^[a-f0-9]{64}$ ]] || return 1
  [[ "$(docker inspect --format '{{index .Config.Labels "org.subtrack.sandbox.namespace"}}' "$cid")" == st250-verification-v1 && "$(docker inspect --format '{{.Image}}' "$cid")" == "$api_container_image" && "$(docker inspect --format '{{.Config.Image}}' "$cid")" == "$SANDBOX_API_IMAGE" ]] || return 1
  docker rm --force "$cid" >/dev/null
  [[ -z "$(docker ps --all --no-trunc --filter "id=$cid" --format '{{.ID}}')" ]]
  rm -- "$probe_cid"
 fi
}
trap 'probe_cleanup >/dev/null 2>&1 || true;fail' ERR
trap 'probe_cleanup >/dev/null 2>&1 || true;exit 1' INT TERM
probe="const fs=require('node:fs'),crypto=require('node:crypto');if(process.getuid()!==1000||process.getgid()!==1000||process.version!=='v22.18.0')process.exit(1);const h=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');process.stdout.write(JSON.stringify({compiledEntrypointSha256:h('/workspace/apps/api/dist/sandbox/main.js'),foundationSha256:h('/workspace/apps/api/prisma/sandbox/001-sandbox-foundation.sql'),businessSha256:h('/workspace/apps/api/prisma/sandbox/002-sandbox-mobile-business.sql')}));"
docker create --cidfile "$probe_cid" --network none --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --memory 128m --cpus 0.5 --pids-limit 32 --label org.subtrack.sandbox.namespace=st250-verification-v1 --entrypoint node "$SANDBOX_API_IMAGE" -e "$probe" >/dev/null
timeout --kill-after=5s 30s docker start --attach "$(cat "$probe_cid")" > "$staging/verified-image-bytes.json" 2> "$staging/verification-private.log"
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$(cat "$probe_cid")")" == 0 ]]
node - "$staging" <<'NODE'
const fs=require('node:fs'),path=require('node:path');try{const s=process.argv[2],v=JSON.parse(fs.readFileSync(path.join(s,'verified-image-bytes.json'))),m=JSON.parse(fs.readFileSync(path.join(s,'transfer-manifest.json')));if(Object.keys(v).sort().join(',')!=='businessSha256,compiledEntrypointSha256,foundationSha256')throw Error();for(const key of Object.keys(v))if(v[key]!==m[key])throw Error();}catch{process.exit(1);}
NODE
probe_cleanup
trap fail ERR;trap - INT TERM
if [[ "$1" == staging || "$1" == preflight ]];then printf 'ST250_STAGING_VERIFIED runtime=not-started\n';exit 0;fi
owned_directory "$runtime";owned_directory "$namespace/secrets"
for name in source-head image-id;do [[ -f "$runtime/$name" && ! -L "$runtime/$name" && "$(realpath -e "$runtime/$name")" == "$runtime/$name" && "$(stat -c %u "$runtime/$name")" == 996 && "$(stat -c %a "$runtime/$name")" == 600 && "$(stat -c %s "$runtime/$name")" -le 256 ]];done
[[ "$(cat "$runtime/source-head")" == "$ST250_SOURCE_HEAD" && "$(cat "$runtime/image-id")" == "$SANDBOX_API_IMAGE" ]]
node "$root/tools/sandbox/image-import-binding.cjs" runtime "$root" "$staging"
for pair in database-bootstrap:999 database-bootstrap-loader:1000 database-runtime:1000 api-auth-material:1000 gateway-key:1000;do
 name="${pair%:*}";uid="${pair#*:}";file="$namespace/secrets/$name"
 [[ -f "$file" && ! -L "$file" && "$(realpath -e "$file")" == "$file" ]]
 [[ "$(stat -c %a "$file")" == 600 && "$(stat -c %u "$file")" == "$uid" && "$(stat -c %g "$file")" == "$uid" ]]
 size="$(stat -c %s "$file")";[[ "$size" =~ ^[0-9]+$ && "$size" -gt 0 && "$size" -le 16384 ]]
done
for name in volume-generation volume-database-data.json volume-certificate-data.json volume-gateway-config.json;do
 [[ -f "$runtime/$name" && ! -L "$runtime/$name" && "$(realpath -e "$runtime/$name")" == "$runtime/$name" && "$(stat -c %u "$runtime/$name")" == 996 && "$(stat -c %a "$runtime/$name")" == 600 && "$(stat -c %s "$runtime/$name")" -le 16384 ]]
done
for suffix in database-data certificate-data gateway-config;do
 node - "$runtime" "$suffix" "$ST250_SOURCE_HEAD" "$ST250_TRANSFER_RUN" 3< <(docker volume inspect "subtrack-sandbox-$suffix") <<'NODE'
const fs=require('node:fs');
// BEGIN VOLUME VALIDATOR
function validateVolume(actual,record,role,head,run,generation){
 const name='subtrack-sandbox-'+role, labels={'org.subtrack.sandbox.namespace':'st250-runtime-v1','com.docker.compose.project':'subtrack-sandbox','com.docker.compose.volume':role,'org.subtrack.sandbox.source':head,'org.subtrack.sandbox.run':run,'org.subtrack.sandbox.generation':generation};
 for(const x of[actual,record]){if(!x||x.Name!==name||x.Driver!=='local'||x.Scope!=='local'||typeof x.CreatedAt!=='string'||!Number.isFinite(Date.parse(x.CreatedAt))||x.Mountpoint!=='/var/lib/docker/volumes/'+name+'/_data'||Object.keys(x.Options??{}).length||JSON.stringify(Object.entries(x.Labels??{}).sort())!==JSON.stringify(Object.entries(labels).sort()))throw Error();}
 for(const k of['Name','Driver','Scope','CreatedAt','Mountpoint'])if(actual[k]!==record[k])throw Error();
 return record;
}
// END VOLUME VALIDATOR
try{const[r,role,head,run]=process.argv.slice(2),g=fs.readFileSync(r+'/volume-generation','utf8').trim();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(g))throw Error();const record=JSON.parse(fs.readFileSync(r+'/volume-'+role+'.json','utf8'));if(record.length!==1)throw Error();const actual=JSON.parse(fs.readFileSync(3,'utf8'));if(actual.length!==1)throw Error();validateVolume(actual[0],record[0],role,head,run,g);}catch{process.exit(1);}
NODE
done
# Verify real UID1000 readability/config shape through the same immutable image,
# without networking, starting main or querying a database.
[[ ! -e "$probe_cid" && ! -L "$probe_cid" ]]
trap 'probe_cleanup >/dev/null 2>&1 || true;fail' ERR
trap 'probe_cleanup >/dev/null 2>&1 || true;exit 1' INT TERM
docker create --cidfile "$probe_cid" --network none --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --memory 128m --cpus 0.5 --pids-limit 32 --label org.subtrack.sandbox.namespace=st250-verification-v1 \
 --mount "type=bind,src=$namespace/secrets/database-runtime,dst=/run/secrets/database_runtime,readonly" \
 --mount "type=bind,src=$namespace/secrets/api-auth-material,dst=/run/secrets/api_auth_material,readonly" \
 --env NODE_ENV=production --env SUBTRACK_RUNTIME=sandbox --env SANDBOX_STARTUP_ENABLED=true --env SANDBOX_PUBLICATION_ENABLED=true \
 --env SANDBOX_DATABASE_HOST=database --env SANDBOX_DATABASE_NAME=subtrack_sandbox --env SANDBOX_DATABASE_ROLE=subtrack_sandbox_runtime --env SANDBOX_POOL_MAX=4 --env PORT=4000 \
 --env SANDBOX_DATABASE_CREDENTIAL_FILE=/run/secrets/database_runtime --env SANDBOX_AUTH_MATERIAL_FILE=/run/secrets/api_auth_material \
 --entrypoint node "$SANDBOX_API_IMAGE" -e 'const fs=require("node:fs");for(const p of["/run/secrets/database_runtime","/run/secrets/api_auth_material"]){const s=fs.lstatSync(p);if(!s.isFile()||s.uid!==1000||s.gid!==1000||(s.mode&0o777)!==0o600||fs.realpathSync(p)!==p)process.exit(1);}require("/workspace/apps/api/dist/sandbox/sandbox-config.js").loadSandboxConfig(process.env).then(()=>process.stdout.write("ST250_MOUNT_READABLE\n")).catch(()=>process.exit(1));' >/dev/null
timeout --kill-after=5s 30s docker start --attach "$(cat "$probe_cid")" > "$staging/mount-readable.txt" 2>> "$staging/verification-private.log"
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$(cat "$probe_cid")")" == 0 && "$(cat "$staging/mount-readable.txt")" == ST250_MOUNT_READABLE ]]
probe_cleanup;trap fail ERR;trap - INT TERM
if [[ "$1" == live ]];then
 [[ -f "$runtime/bootstrap-complete" && ! -L "$runtime/bootstrap-complete" ]]
 for service in database api-live gateway-live;do
  cid="$("${compose[@]}" --profile sandbox-live ps --all --quiet "$service")";[[ "$cid" =~ ^[a-f0-9]{64}$ ]]
  image="$SANDBOX_API_IMAGE";if [[ "$service" == database ]];then image="$SANDBOX_POSTGRES_IMAGE";elif [[ "$service" == gateway-live ]];then image="$SANDBOX_CADDY_IMAGE";fi
  node - "$service" "$root" 3< <(docker inspect "$cid") 4< <(docker image inspect "$image") <<'NODE'
const fs=require('node:fs');
// BEGIN LIVE VALIDATOR
function validateLive(c,base,service,root,records,head,identity){
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b),empty=x=>x==null||(Array.isArray(x)&&x.length===0),h=c.HostConfig;
 const limits={database:['999:999',256,64,0.5],'api-live':['1000:1000',384,64,0.75],'gateway-live':['1000:1000',96,32,0.25]}[service];
 if(!limits||!base||!identity||base.Id!==identity.inspectedImageId||c.Image!==identity.containerImageId||c.Config.Image!==identity.requestedImage||!/^sha256:[a-f0-9]{64}$/.test(base.Id)||!c.State.Running||c.Config.User!==limits[0]||c.Config.Labels['org.subtrack.sandbox.namespace']!=='st250-runtime-v1'||c.Config.Labels['org.subtrack.sandbox.source']!==head||c.Config.Labels['com.docker.compose.service']!==service)throw Error();
 if(h.Privileged||!empty(h.CapAdd)||!empty(h.Devices)||!empty(h.DeviceRequests)||!empty(h.DeviceCgroupRules)||!eq(h.CapDrop,['ALL'])||!eq(h.SecurityOpt,['no-new-privileges:true'])||h.Memory!==limits[1]*1048576||h.PidsLimit!==limits[2]||h.NanoCpus!==limits[3]*1e9||h.ReadonlyRootfs!==(service!=='database')||h.PidMode||h.IpcMode!=='private'||h.UTSMode||h.UsernsMode)throw Error();
 if(h.LogConfig.Type!=='json-file'||!eq(Object.entries(h.LogConfig.Config).sort(),[['max-file','2'],['max-size','5m']]))throw Error();
 const overrides={database:{POSTGRES_DB:'subtrack_sandbox',POSTGRES_USER:'subtrack_sandbox_bootstrap',POSTGRES_PASSWORD_FILE:'/run/secrets/database_bootstrap',PGDATA:'/var/lib/postgresql/data/pgdata'},'api-live':{NODE_ENV:'production',SUBTRACK_RUNTIME:'sandbox',SANDBOX_STARTUP_ENABLED:'true',SANDBOX_PUBLICATION_ENABLED:'true',SANDBOX_DATABASE_HOST:'database',SANDBOX_DATABASE_NAME:'subtrack_sandbox',SANDBOX_DATABASE_ROLE:'subtrack_sandbox_runtime',SANDBOX_POOL_MAX:'4',SANDBOX_DATABASE_CREDENTIAL_FILE:'/run/secrets/database_runtime',SANDBOX_AUTH_MATERIAL_FILE:'/run/secrets/api_auth_material',PORT:'4000'},'gateway-live':{SANDBOX_GATEWAY_PUBLICATION:'true'}}[service];
 const env=x=>{const m=new Map();for(const e of x){const i=e.indexOf('=');if(i<1||m.has(e.slice(0,i)))throw Error();m.set(e.slice(0,i),e.slice(i+1));}return m;};const expected=env(base.Config.Env);for(const[k,v]of Object.entries(overrides))expected.set(k,v);if(!eq([...env(c.Config.Env)].sort(),[...expected].sort()))throw Error();
 const entry=service==='gateway-live'?['sh','/opt/subtrack/gateway-entrypoint.sh']:base.Config.Entrypoint;
 const cmd=service==='database'?['postgres','-c','shared_buffers=32MB','-c','max_connections=20','-c','work_mem=2MB']:service==='gateway-live'?[]:base.Config.Cmd;
 if(!eq(c.Config.Entrypoint??[],entry??[])||!eq(c.Config.Cmd??[],cmd??[]))throw Error();
 const nets={database:['subtrack-sandbox-database'],'api-live':['subtrack-sandbox-database','subtrack-sandbox-ingress'],'gateway-live':['subtrack-sandbox-edge','subtrack-sandbox-ingress']}[service];if(!eq(Object.keys(c.NetworkSettings.Networks).sort(),nets))throw Error();if(service==='database'&&!c.NetworkSettings.Networks[nets[0]].Aliases.includes('database'))throw Error();
 const ports=h.PortBindings??{};if(service!=='gateway-live'&&Object.keys(ports).length)throw Error();if(service==='gateway-live'){if(!eq(Object.keys(ports).sort(),['8080/tcp','8443/tcp']))throw Error();for(const[p,n]of[['8080/tcp','80'],['8443/tcp','443']])if(!Array.isArray(ports[p])||ports[p].length!==1||ports[p][0].HostPort!==n||!['','0.0.0.0'].includes(ports[p][0].HostIp))throw Error();}
 const bind=(file,dst)=>({Type:'bind',Source:root+'/'+file,Destination:dst,RW:false}),volume=(role,dst)=>({Type:'volume',Name:'subtrack-sandbox-'+role,Source:records[role].Mountpoint,Destination:dst,RW:true});
 const mounts={database:[bind('secrets/database-bootstrap','/run/secrets/database_bootstrap'),volume('database-data','/var/lib/postgresql/data')],'api-live':[bind('secrets/database-runtime','/run/secrets/database_runtime'),bind('secrets/api-auth-material','/run/secrets/api_auth_material')],'gateway-live':[bind('infra/sandbox/Caddyfile','/etc/caddy/Caddyfile'),bind('infra/sandbox/gateway-entrypoint.sh','/opt/subtrack/gateway-entrypoint.sh'),bind('infra/sandbox/caddy-capless','/usr/bin/caddy'),bind('secrets/gateway-key','/run/secrets/gateway_key'),volume('certificate-data','/data'),volume('gateway-config','/config')]}[service];
 if(c.Mounts.length!==mounts.length)throw Error();for(const e of mounts){const m=c.Mounts.find(x=>x.Destination===e.Destination);if(!m||Object.entries(e).some(([k,v])=>m[k]!==v)||(m.Type==='bind'&&m.Name))throw Error();}
 const tmp={database:{'/tmp':'size=16m','/var/run/postgresql':'size=4m,uid=999,gid=999'},'api-live':{'/tmp':'size=16m,uid=1000,gid=1000'},'gateway-live':{'/tmp':'size=8m,uid=1000,gid=1000'}}[service];if(!eq(Object.entries(h.Tmpfs??{}).sort(),Object.entries(tmp).sort()))throw Error();
 return true;
}
// END LIVE VALIDATOR
try{const[service,root]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(3,'utf8')),b=JSON.parse(fs.readFileSync(4,'utf8')),records={},binding=JSON.parse(fs.readFileSync(root+'/runtime/image-import-binding.json','utf8'));if(a.length!==1||b.length!==1)throw Error();for(const role of['database-data','certificate-data','gateway-config'])records[role]=JSON.parse(fs.readFileSync(root+'/runtime/volume-'+role+'.json','utf8'))[0];validateLive(a[0],b[0],service,root,records,process.env.ST250_SOURCE_HEAD,binding.services[{'api-live':'api',database:'database','gateway-live':'gateway'}[service]]);}catch{process.exit(1);}
NODE
 done
 for suffix in database ingress edge;do
  docker network inspect "subtrack-sandbox-$suffix" | node -e 'const fs=require("node:fs");try{const a=JSON.parse(fs.readFileSync(0,"utf8")),suffix=process.argv[1];if(a.length!==1||a[0].Name!=="subtrack-sandbox-"+suffix||a[0].Labels["org.subtrack.sandbox.namespace"]!=="st250-runtime-v1"||a[0].Internal!==(suffix!=="edge"))throw Error();}catch{process.exit(1);}' "$suffix"
 done
 [[ "$(docker ps --quiet --filter label=org.subtrack.sandbox.namespace=st250-runtime-v1 | wc -l | tr -d ' ')" == 3 ]]
fi
printf 'ST250_RUNTIME_CUSTODY_VERIFIED endpoint=not-qualified\n'
