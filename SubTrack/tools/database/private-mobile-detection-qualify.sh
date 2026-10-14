#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)";cd "$root"
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
receipt_out="$base/st249-private-mobile-detection-receipt.json"
[[ ! -e "$receipt_out" && ! -L "$receipt_out" ]]
ready="$(bash tools/database/private-mobile-proof.sh start --mode docker)"
[[ "$ready" == ST244_FIXTURE_READY\ config=* ]]
config="${ready#ST244_FIXTURE_READY config=}";work="$(dirname "$config")"
receipt_json=''
cleanup(){
 local code=$?;trap - EXIT
 bash tools/database/private-mobile-proof.sh stop --config "$config" || code=1
 if (( code==0 ));then
  ST249_RECEIPT="$receipt_json" node - "$root" "$receipt_out" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const [root,out]=process.argv.slice(2),r=Module.createRequire(path.join(root,'apps/api/package.json'));
const esbuild=r(r.resolve('esbuild',{paths:[r.resolve('vite')]}));if(esbuild.version!=='0.28.2')throw Error('tool version');
const file=path.join(root,'apps/api/test/private-mobile-detection-receipt.ts');
const compiled=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'cjs',logLevel:'silent'}).code;
const mod=new Module(file);mod._compile(compiled,file);
const receipt=mod.exports.privateMobileDetectionReceipt({...JSON.parse(process.env.ST249_RECEIPT),cleanup:'removed'});
fs.writeFileSync(out,JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});
NODE
  printf 'PASS ST249_DIRECT_TLS_PG_DETECTION_SCAN_REVIEW_UNDO head=%s\n' "$(git rev-parse HEAD)"
 fi
 exit "$code"
}
trap cleanup EXIT
code=0
NODE_ENV=development node - "$root" "$config" > "$work/proof-private.log" 2>&1 <<'NODE' || code=$?
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
try{
const [root,configPath]=process.argv.slice(2),r=createRequire(path.join(root,'apps/api/package.json'));
const esbuild=r(r.resolve('esbuild',{paths:[r.resolve('vite')]}));if(esbuild.version!=='0.28.2')throw Error('tool version');
const file=path.join(path.dirname(configPath),'proof.cjs');
esbuild.buildSync({entryPoints:[path.join(root,'apps/api/test/private-mobile-detection.integration.ts')],outfile:file,bundle:true,packages:'external',platform:'node',format:'cjs',nodePaths:[path.join(root,'apps/api/node_modules')],logLevel:'silent'});
process.env.NODE_PATH=path.join(root,'apps/api/node_modules');require('node:module').Module._initPaths();
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const integration=r(file);
integration.runPrivateMobileDetectionIntegration(config).then(receipt=>{
 try{fs.writeFileSync(path.join(path.dirname(configPath),'proof-receipt.json'),JSON.stringify(receipt),{mode:0o600});}
 catch(error){throw new Error(integration.privateDetectionStageFailure('RECEIPT',error));}
}).catch(error=>{
 let message=null;
 try{const descriptor=error!==null&&(typeof error==='object'||typeof error==='function')?Object.getOwnPropertyDescriptor(error,'message'):undefined;
  if(descriptor&&'value'in descriptor&&typeof descriptor.value==='string')message=descriptor.value;
 }catch{/* Hostile error objects never supply a diagnostic. */}
 const safe=integration.safePrivateDetectionFailure(message);
 process.stderr.write((safe?message:'ST249_DETECTION_PROOF_FAILURE phase=UNKNOWN')+'\n');process.exitCode=1;
});
}catch{process.stderr.write('ST249_DETECTION_PROOF_FAILURE phase=SETUP\n');process.exitCode=1;}
NODE
if (( code!=0 ));then
 grep -E '^ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=(A_SNAPSHOT|B_SESSION|B_DISTINCT|B_PROFILE_GATE|B_PROFILE_PATCH|B_MODE|B_EMPTY_READ|PUBLIC_SELECTOR|B_EMPTY_SNAPSHOT|B_TO_A_SYNC|B_TO_A_SYNC_SNAPSHOT|B_TO_A_RETAIN|B_TO_A_RETAIN_SNAPSHOT|B_TO_A_PURGE|B_TO_A_PURGE_SNAPSHOT|B_CONNECT|B_SYNC|B_POSITIVE_READ|A_POSITIVE_READ|B_POSITIVE_SNAPSHOT|A_TO_B_SYNC|A_TO_B_SYNC_SNAPSHOT|A_TO_B_RETAIN|A_TO_B_RETAIN_SNAPSHOT|A_TO_B_PURGE|A_TO_B_PURGE_SNAPSHOT|B_PURGE|B_EMPTY_AFTER_PURGE|B_LOGOUT|B_LOGOUT_DENIED|A_FINAL_SNAPSHOT|TWO_OWNER_COUNTS) category=(PERMISSION|UNDEFINED_COLUMN|UNDEFINED_TABLE|FOREIGN_KEY|UNIQUE|CHECK|NOT_NULL|TYPE_MISMATCH|INVALID_INPUT|NUMERIC_RANGE|SERIALIZATION|DEADLOCK|ASSERTION|OTHER)$|^ST248_BANK_PROOF_FAILURE phase=(START|CONNECT|SYNC|RESTART|TWO_OWNER|EXPIRED_SESSION|RETAIN|RECONNECT|DEPENDENCY|PURGE|RLS_NEGATIVE|UNCERTAINTY|LOGOUT)$|^ST244_PROOF_FAILURE phase=(START|ENROLL|PROFILE_MODE|ADD|NATIVE_EDIT_STATUS|ISOLATION|ROTATION_REUSE|LOGIN|RESTART|LOGOUT|UNCERTAINTY|KEY_TAMPER)$|^ST249_DETECTION_PROOF_FAILURE phase=(START|OVERFLOW|SCAN|PARALLEL|COLLISION|UNMATCHED|REVIEW|RESTART|TIMING|TWO_OWNER|RLS|PURGE|EXPIRED_SESSION|MINIMAL|BASELINE|SETUP|UNKNOWN)$|^ST249_DETECTION_PROOF_FAILURE phase=(PARENT_SETUP|BANK_SETUP|DETECTION_SETUP|RECEIPT) category=(NODE_MODULE|ARGUMENT|PERMISSION|UNDEFINED_COLUMN|UNDEFINED_TABLE|FOREIGN_KEY|UNIQUE|CHECK|NOT_NULL|TYPE_MISMATCH|INVALID_INPUT|NUMERIC_RANGE|SERIALIZATION|DEADLOCK|ASSERTION|OTHER)$' "$work/proof-private.log" >&2 || true
 exit 1
fi
receipt_json="$(cat "$work/proof-receipt.json")"
