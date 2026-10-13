#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)";cd "$root"
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
receipt_out="$base/st244-private-mobile-receipt.json"
[[ ! -e "$receipt_out" && ! -L "$receipt_out" ]]
ready="$(bash tools/database/private-mobile-proof.sh start --mode docker)"
[[ "$ready" == ST244_FIXTURE_READY\ config=* ]]
config="${ready#ST244_FIXTURE_READY config=}";work="$(dirname "$config")"
receipt_json=''
cleanup(){
 local code=$?;trap - EXIT
 bash tools/database/private-mobile-proof.sh stop --config "$config" || code=1
 if (( code==0 ));then
  ST244_RECEIPT="$receipt_json" node - "$receipt_out" <<'NODE'
const fs=require('node:fs'),value=JSON.parse(process.env.ST244_RECEIPT);
if(value.version!==1||!/^[a-f0-9]{40}$/.test(value.head)||['identityCount','profileCompleteCount','justMeCount','subscriptionCount'].some(n=>value[n]!==1))throw Error('Invalid proof receipt');
fs.writeFileSync(process.argv[2],JSON.stringify({...value,cleanup:'removed'})+'\n',{mode:0o600,flag:'wx'});
NODE
 fi
 exit "$code"
}
trap cleanup EXIT
code=0
NODE_ENV=development node - "$root" "$config" > "$work/proof-private.log" 2>&1 <<'NODE' || code=$?
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const [root,configPath]=process.argv.slice(2),r=createRequire(path.join(root,'apps/api/package.json'));
const esbuild=r(r.resolve('esbuild',{paths:[r.resolve('vite')]}));if(esbuild.version!=='0.28.2')throw Error('tool version');
const file=path.join(path.dirname(configPath),'proof.cjs');
esbuild.buildSync({entryPoints:[path.join(root,'apps/api/test/private-mobile-proof.ts')],outfile:file,bundle:true,packages:'external',platform:'node',format:'cjs',nodePaths:[path.join(root,'apps/api/node_modules')],logLevel:'silent'});
process.env.NODE_PATH=path.join(root,'apps/api/node_modules');require('node:module').Module._initPaths();
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
r(file).runPrivateMobileProof(config).then(receipt=>{
 const closed={version:1,head:config.head,proof:'direct-tls-postgresql16',identityCount:receipt.identityCount,profileCompleteCount:receipt.profileCompleteCount,justMeCount:receipt.justMeCount,subscriptionCount:receipt.subscriptionCount,
 apiRestartReadback:true,logoutBearerDenied:true,refreshReuseRevoked:true,ownerIsolation:true,uncertainMutationCredentialsWithheld:true,oldProofReplayDeniedBeforeAndAfterRestart:true,keyPortfolioDriftRejected:true};
 fs.writeFileSync(path.join(path.dirname(configPath),'proof-receipt.json'),JSON.stringify(closed),{mode:0o600});
}).catch(error=>{if(/^ST244_PROOF_FAILURE phase=(START|ENROLL|PROFILE_MODE|ADD|ISOLATION|ROTATION_REUSE|LOGIN|RESTART|LOGOUT|UNCERTAINTY|KEY_TAMPER)$/.test(error.message))process.stderr.write(error.message+'\n');process.exitCode=1;});
NODE
if (( code!=0 ));then
 grep -E '^ST244_PROOF_FAILURE phase=(START|ENROLL|PROFILE_MODE|ADD|ISOLATION|ROTATION_REUSE|LOGIN|RESTART|LOGOUT|UNCERTAINTY|KEY_TAMPER)$' "$work/proof-private.log" >&2 || true
 exit 1
fi
receipt_json="$(cat "$work/proof-receipt.json")"
printf 'PASS ST244_DIRECT_TLS_PG_PROFILE_JUST_ME_ADD_RESTART_LOGOUT_REFRESH_REUSE_ISOLATION head=%s\n' "$(git rev-parse HEAD)"
