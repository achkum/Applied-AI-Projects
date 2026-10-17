import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatch,verifiedAuthority,signedDraft,bindPending,acceptedPng,productReceipt,PACKAGE,SIGNER,REPO,CHECKS,SCREENSHOTS} from './sandbox-installed-android-contract.mjs';
import {flowLabels,maestroArgs} from './sandbox-installed-android.mjs';
const source='a'.repeat(40),signed='c'.repeat(64),unsigned='b'.repeat(64),defaultHead='9'.repeat(40);
const expected={sourceHead:source,releaseId:20,verificationRun:30,signedSha256:signed};
const receipt=()=>({schemaVersion:2,embeddedConfigSha256:'d'.repeat(64),hermesSha256:'e'.repeat(64),sourceHead:source,unsignedSha256:unsigned,applicationId:PACKAGE,versionCode:5,variant:'sandbox',origin:'https://198.44.116.159',buildType:'release',debuggable:false,privateCaIncluded:false,hermesBundled:true,runtimeEnabled:true,bytes:100,signatureVerified:true,zipAligned:true,signedSha256:signed,signerCertificateSha256:SIGNER,cleanup:'REMOVED'});
const transfer=()=>({schema:'st250-android-draft-transfer-receipt-v2',sourceHead:source,runId:'12-1',defaultTargetHead:defaultHead,draftTag:`st250-android-stage-${source}-12-1`,releaseId:19,draft:true,unsignedSha256:unsigned,bytes:90,applicationId:PACKAGE,apkAssetId:10,manifestSha256:'f'.repeat(64),manifestBytes:500,manifestAssetId:11,manifestSchema:'st250-android-transfer-manifest-v2',unsignedQualified:true,uploadVerified:true,localCleanupConfirmed:true,remoteCustody:'draft-retained'});
const run=()=>({id:30,repository:{full_name:REPO},path:'.github/workflows/subtrack-sandbox-android-build.yml',event:'workflow_dispatch',head_sha:source,head_branch:'st/native-synthetic-bank',status:'completed',conclusion:'success'});
const jobs=()=>[{id:31,name:'signed-return-verification',status:'completed',conclusion:'success'}];
const log=(r=receipt(),t=transfer())=>`2026-10-17T10:09:17.0000000Z   ST250_UNSIGNED_TRANSFER_RECEIPT: ${JSON.stringify(t)}\n2026-10-17T10:09:17.0000000Z   ST250_SIGNED_RETURN_RELEASE_ID: 20\n2026-10-17T10:09:18.0000000Z ${JSON.stringify(r)}\n`;
const authority=()=>verifiedAuthority(run(),jobs(),log(),expected);
const release=()=>({id:20,draft:true,prerelease:true,published_at:null,target_commitish:defaultHead,tag_name:`st250-android-signed-stage-${source}-12-1`,created_at:'2026-10-17T10:00:00Z',assets:[{id:21,name:`subtrack-sandbox-signed-${source}.apk`,state:'uploaded',content_type:'application/vnd.android.package-archive',size:100,digest:`sha256:${signed}`},{id:22,name:`st250-android-signed-${source}.json`,state:'uploaded',content_type:'application/json',size:500,digest:`sha256:${'f'.repeat(64)}`}]});
test('manual integrated source and exact already verified successor are required',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/st/native-synthetic-bank',GITHUB_SHA:source,ST_PRODUCT_SOURCE:source,ST_PRODUCT_RELEASE:'20',ST_PRODUCT_VERIFICATION_RUN:'30',ST_PRODUCT_SIGNED_SHA256:signed};assert.deepEqual(dispatch(env,source),expected);
 for(const key of Object.keys(env))assert.throws(()=>dispatch({...env,[key]:'foreign'},source));assert.throws(()=>dispatch(env,'b'.repeat(40)));
 assert.equal(authority().receipt.versionCode,5);
 for(const patch of [{id:29},{head_sha:defaultHead},{path:'other.yml'},{event:'pull_request'},{status:'in_progress'},{conclusion:'failure'},{head_branch:'main'},{repository:{full_name:'foreign/repo'}}])assert.throws(()=>verifiedAuthority({...run(),...patch},jobs(),log(),expected));
 for(const patch of [{versionCode:4},{signerCertificateSha256:'0'.repeat(64)},{sourceHead:defaultHead},{signedSha256:'0'.repeat(64)},{runtimeEnabled:false}])assert.throws(()=>verifiedAuthority(run(),jobs(),log({...receipt(),...patch}),expected));
 for(const value of [[],[...jobs(),...jobs()],[{...jobs()[0],conclusion:'failure'}]])assert.throws(()=>verifiedAuthority(run(),value,log(),expected));
 for(const value of [log()+JSON.stringify(receipt()),log().replace('ST250_SIGNED_RETURN_RELEASE_ID: 20','ST250_SIGNED_RETURN_RELEASE_ID: 21'),log().replace('ST250_UNSIGNED_TRANSFER_RECEIPT:','foreign:'),log(receipt(),{...transfer(),defaultTargetHead:'bad'})])assert.throws(()=>verifiedAuthority(run(),jobs(),value,expected));
});
test('private unpublished two-asset draft is bound to original target, signer and verified APK bytes',()=>{
 const now=Date.parse('2026-10-17T12:00:00Z');assert.equal(signedDraft(release(),authority(),expected,now).apk.id,21);
 for(const patch of [{draft:false},{prerelease:false},{published_at:'2026-10-17'},{target_commitish:source},{tag_name:'old-v4'},{created_at:'2026-10-01'},{assets:[...release().assets,release().assets[0]]}])assert.throws(()=>signedDraft({...release(),...patch},authority(),expected,now));
 for(const field of [{digest:`sha256:${'0'.repeat(64)}`},{size:99},{state:'new'},{content_type:'text/plain'}])assert.throws(()=>signedDraft({...release(),assets:[{...release().assets[0],...field},release().assets[1]]},authority(),expected,now));
 const r=receipt(),pending={schema:'st250-android-signed-pending-v2',...Object.fromEntries(['sourceHead','signerCertificateSha256','unsignedSha256','signedSha256','bytes','runtimeEnabled','embeddedConfigSha256','hermesSha256'].map(key=>[key,r[key]]))};assert.equal(bindPending(pending,authority()),true);assert.throws(()=>bindPending({...pending,bytes:99},authority()));assert.throws(()=>bindPending({...pending,privateInput:'never'},authority()));
});
test('accepted images and closed measured receipt reject missing flags, cleanup and private extensions',()=>{
 const png=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1080,16);png.writeUInt32BE(2400,20);assert.equal(acceptedPng(png).bytes,32);
 for(const value of [Buffer.alloc(0),Buffer.alloc(32),Buffer.from('private text')])assert.throws(()=>acceptedPng(value));
 const checks=Object.fromEntries(CHECKS.map(key=>[key,true])),images=SCREENSHOTS.map(name=>({name,sha256:'d'.repeat(64),bytes:32}));assert.equal(productReceipt(expected,authority(),checks,images,true).backendSqlProofClaimed,false);
 for(const key of CHECKS)assert.throws(()=>productReceipt(expected,authority(),{...checks,[key]:false},images,true));assert.throws(()=>productReceipt(expected,authority(),checks,images,false));assert.throws(()=>productReceipt(expected,authority(),checks,images.slice(1),true));assert.throws(()=>productReceipt(expected,authority(),checks,[{...images[0],privateInput:'never'},...images.slice(1)],true));
});
test('actual flows use sandbox package, no authority extraction or rebuild, one cold restart and final owner revocation',()=>{
 const names=['setup','bank','manage','pages','restart'];const sources=names.map(name=>readFileSync(new URL(`../e2e/sandbox-product-${name}.yaml`,import.meta.url),'utf8'));
 for(const source of sources){assert.ok(source.startsWith('appId: se.subtrack.app.sandbox\n'));assert.doesNotMatch(source,/runScript|evalScript|copyTextFrom|openLink|https:\/\/localhost|se\.subtrack\.app\n/);}
 const all=sources.join('\n'),captures=[...all.matchAll(/- takeScreenshot: ([a-z-]+)/g)].map(m=>`${m[1]}.png`);assert.deepEqual(captures.sort(),[...SCREENSHOTS].sort());
 assert.equal((all.match(/clearState: true/g)??[]).length,1);assert.equal((all.match(/- stopApp/g)??[]).length,1);assert.equal((all.match(/native-detection-confirm-aurora-video/g)??[]).length,2);assert.ok(all.includes('native-detection-confirm-cinema-plus'));assert.ok(all.includes('native-detection-reject-move-club'));assert.ok(all.includes('native-detection-undo'));assert.ok(all.includes('native-profile-theme-dark\n    selected: true'));
 const labels=flowLabels(new Date('2026-10-17T12:00:00Z'));assert.equal(labels.TODAY,'2026-10-17');const args=maestroArgs(labels,'/private/output','/flow.yaml');assert.equal(args.filter(value=>value==='-e').length,Object.keys(labels).length);assert.ok(args.includes('TODAY=2026-10-17'));assert.equal(args.at(-1),'/flow.yaml');for(const match of all.matchAll(/\$\{([A-Z_]+)\}/g))assert.equal(typeof labels[match[1]],'string');
 const workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-sandbox-installed-android.yml',import.meta.url),'utf8');assert.doesNotMatch(workflow,/pnpm install|gradlew|expo prebuild|assembleRelease|assembleDebug|eas build|push:|pull_request:/);assert.ok(workflow.includes('if: success()'));assert.ok(workflow.includes('subtrack-sandbox-installed/public/'));
});
