#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)";cd "$root"
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
receipt_out="$base/st248-private-mobile-bank-receipt.json"
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
if(value.version!==1||!/^[a-f0-9]{40}$/.test(value.head)||['identityCount','profileCompleteCount','justMeCount'].some(n=>value[n]!==2)||value.subscriptionCount!==1||['bankDedup','bankRestart','bankRetainedReachable','bankPurged','bankImmutableReplay','bankOwnerIsolation','bankManualPreserved','bankUncertaintyRollback','bankLogoutDenied','bankDependencyRollback','bankParallelConnect','bankExpiredSessionDenied','bankTwoVerifiedOwners','bankRlsNegative'].some(n=>value[n]!==true))throw Error('Invalid proof receipt');
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
esbuild.buildSync({entryPoints:[path.join(root,'apps/api/test/private-mobile-bank.integration.ts')],outfile:file,bundle:true,packages:'external',platform:'node',format:'cjs',nodePaths:[path.join(root,'apps/api/node_modules')],logLevel:'silent'});
process.env.NODE_PATH=path.join(root,'apps/api/node_modules');require('node:module').Module._initPaths();
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
r(file).runPrivateMobileBankIntegration(config).then(receipt=>{
 const closed={version:1,head:config.head,proof:'direct-tls-postgresql16',identityCount:receipt.identityCount,profileCompleteCount:receipt.profileCompleteCount,justMeCount:receipt.justMeCount,subscriptionCount:receipt.subscriptionCount,
 apiRestartReadback:true,logoutBearerDenied:true,refreshReuseRevoked:true,ownerIsolation:true,uncertainMutationCredentialsWithheld:true,oldProofReplayDeniedBeforeAndAfterRestart:true,keyPortfolioDriftRejected:true,bankDedup:receipt.dedup,bankRestart:receipt.restart,bankRetainedReachable:receipt.retainedReachable,bankPurged:receipt.purged,bankImmutableReplay:receipt.replay,bankOwnerIsolation:receipt.ownerIsolation,bankManualPreserved:receipt.manualPreserved,bankUncertaintyRollback:receipt.uncertaintyRollback,bankLogoutDenied:receipt.logoutDenied,bankDependencyRollback:receipt.dependencyRollback,bankParallelConnect:receipt.parallelConnect,bankExpiredSessionDenied:receipt.expiredSessionDenied,bankTwoVerifiedOwners:receipt.twoVerifiedOwners,bankRlsNegative:receipt.rlsNegative};
 fs.writeFileSync(path.join(path.dirname(configPath),'proof-receipt.json'),JSON.stringify(closed),{mode:0o600});
}).catch(error=>{if(r(file).safePrivateBankFailure(error.message)||/^ST244_PROOF_FAILURE phase=(START|ENROLL|PROFILE_MODE|ADD|NATIVE_EDIT_STATUS|ISOLATION|ROTATION_REUSE|LOGIN|RESTART|LOGOUT|UNCERTAINTY|KEY_TAMPER)$/.test(error.message))process.stderr.write(error.message+'\n');process.exitCode=1;});
NODE
if (( code!=0 ));then
 grep -E '^ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=(A_SNAPSHOT|B_SESSION|B_DISTINCT|B_PROFILE_GATE|B_PROFILE_PATCH|B_MODE|B_EMPTY_READ|PUBLIC_SELECTOR|B_EMPTY_SNAPSHOT|B_TO_A_SYNC|B_TO_A_SYNC_SNAPSHOT|B_TO_A_RETAIN|B_TO_A_RETAIN_SNAPSHOT|B_TO_A_PURGE|B_TO_A_PURGE_SNAPSHOT|B_CONNECT|B_SYNC|B_POSITIVE_READ|A_POSITIVE_READ|B_POSITIVE_SNAPSHOT|A_TO_B_SYNC|A_TO_B_SYNC_SNAPSHOT|A_TO_B_RETAIN|A_TO_B_RETAIN_SNAPSHOT|A_TO_B_PURGE|A_TO_B_PURGE_SNAPSHOT|B_PURGE|B_EMPTY_AFTER_PURGE|B_LOGOUT|B_LOGOUT_DENIED|A_FINAL_SNAPSHOT|TWO_OWNER_COUNTS) category=(PERMISSION|UNDEFINED_COLUMN|UNDEFINED_TABLE|FOREIGN_KEY|UNIQUE|CHECK|NOT_NULL|TYPE_MISMATCH|INVALID_INPUT|NUMERIC_RANGE|SERIALIZATION|DEADLOCK|ASSERTION|OTHER)$|^ST248_BANK_PROOF_FAILURE phase=(START|CONNECT|SYNC|RESTART|TWO_OWNER|EXPIRED_SESSION|RETAIN|RECONNECT|DEPENDENCY|PURGE|RLS_NEGATIVE|UNCERTAINTY|LOGOUT)$|^ST244_PROOF_FAILURE phase=(START|ENROLL|PROFILE_MODE|ADD|NATIVE_EDIT_STATUS|ISOLATION|ROTATION_REUSE|LOGIN|RESTART|LOGOUT|UNCERTAINTY|KEY_TAMPER)$' "$work/proof-private.log" >&2 || true
 exit 1
fi
receipt_json="$(cat "$work/proof-receipt.json")"
printf 'PASS ST248_DIRECT_TLS_PG_SYNTHETIC_CONNECT_SYNC_REPLAY_RESTART_RETAIN_PURGE_OWNER_ISOLATION head=%s\n' "$(git rev-parse HEAD)"
