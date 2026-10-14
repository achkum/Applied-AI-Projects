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
const [root,configPath]=process.argv.slice(2),r=createRequire(path.join(root,'apps/api/package.json'));
const esbuild=r(r.resolve('esbuild',{paths:[r.resolve('vite')]}));if(esbuild.version!=='0.28.2')throw Error('tool version');
const file=path.join(path.dirname(configPath),'proof.cjs');
esbuild.buildSync({entryPoints:[path.join(root,'apps/api/test/private-mobile-detection.integration.ts')],outfile:file,bundle:true,packages:'external',platform:'node',format:'cjs',nodePaths:[path.join(root,'apps/api/node_modules')],logLevel:'silent'});
process.env.NODE_PATH=path.join(root,'apps/api/node_modules');require('node:module').Module._initPaths();
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
r(file).runPrivateMobileDetectionIntegration(config).then(receipt=>{
 fs.writeFileSync(path.join(path.dirname(configPath),'proof-receipt.json'),JSON.stringify(receipt),{mode:0o600});
}).catch(error=>{if(/^ST249_DETECTION_PROOF_FAILURE phase=(START|OVERFLOW|SCAN|PARALLEL|COLLISION|UNMATCHED|REVIEW|RESTART|TIMING|TWO_OWNER|RLS|PURGE|EXPIRED_SESSION|MINIMAL|BASELINE)$/.test(error.message))process.stderr.write(error.message+'\n');process.exitCode=1;});
NODE
if (( code!=0 ));then
 grep -E '^ST249_DETECTION_PROOF_FAILURE phase=(START|OVERFLOW|SCAN|PARALLEL|COLLISION|UNMATCHED|REVIEW|RESTART|TIMING|TWO_OWNER|RLS|PURGE|EXPIRED_SESSION|MINIMAL|BASELINE)$' "$work/proof-private.log" >&2 || true
 exit 1
fi
receipt_json="$(cat "$work/proof-receipt.json")"
