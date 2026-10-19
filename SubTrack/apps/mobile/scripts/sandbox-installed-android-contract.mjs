import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {validAndroidPng} from './private-runtime-maestro-metadata.mjs';
import {validateReceipt} from '../../../tools/sandbox/android-release-receipt.mjs';
import {validateTransfer} from '../../../tools/sandbox/android-transfer-receipt.mjs';
export const PACKAGE='se.subtrack.app.sandbox';
export const SIGNER='10c659cae262ad807ae2da9a9c137b581c633ebef2ea3bce86bfe6c41052186c';
export const REPO='achkum/Applied-AI-Projects';
export const VISUAL_CASES=Object.freeze(['en-light','en-dark','sv-light','sv-dark']);
export const VISUAL_SCREENS=Object.freeze(['home','subscriptions','detail','household','insights','trend','profile']);
export const VISUAL_SCREENSHOTS=Object.freeze(VISUAL_CASES.flatMap(mode=>VISUAL_SCREENS.map(screen=>`accepted-sandbox-visual-${mode}-${screen}.png`)));
export const SCREENSHOTS=Object.freeze([...['welcome','profile','household','bank','detections','reviewed','subscriptions','edit','calendar','home-top','home','insights-top','insights','trend','comparisons','preferences','restart-household','restart-subscriptions','logout'].map(name=>`accepted-sandbox-${name}.png`),...VISUAL_SCREENSHOTS]);
export const CHECKS=Object.freeze(['signedVerificationBound','signedBytesInstalled','sameSigner','isolatedEnrollment','seededHouseholdReadAndRenamed','dependantCreated','syntheticBankSynced','detectionConfirmedTwice','detectionRejectedAndUndone','confirmedPlanEdited','customCategorySaved','datePickerSaved','trackingReread','calendarOpened','homePopulated','insightsPopulated','comparisonOpened','visualMatrixCaptured','preferencesPersisted','coldRestartHouseholdReadback','coldRestartSubscriptionReadback','logoutClearedPrivateUi']);
const fail=()=>{throw Error('Sandbox installed Android unavailable');};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const head=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const id=value=>typeof value==='string'&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const PRODUCT_STAGES=Object.freeze([
 ['setup',['isolatedEnrollment','seededHouseholdReadAndRenamed','dependantCreated']],
 ['bank',['syntheticBankSynced','detectionConfirmedTwice','detectionRejectedAndUndone']],
 ['manage',['confirmedPlanEdited','customCategorySaved','datePickerSaved','trackingReread']],
 ['pages',['calendarOpened','homePopulated','insightsPopulated','comparisonOpened']],
 ['visual',['visualMatrixCaptured']],
 ['restart',['preferencesPersisted','coldRestartHouseholdReadback','coldRestartSubscriptionReadback','logoutClearedPrivateUi']],
].map(([name,checks])=>Object.freeze([name,Object.freeze(checks)])));
// Enrollment and mutations establish the shared fixture. Later suites each enter
// their own tab; a natural assertion failure must not hide their independent results.
// Tool interruption, timeout or an unknown exit throws and stops the collection.
export function collectProductStages({execute,onPassed,onFailure}){
 const failed=[];
 for(const [index,[name,checks]] of PRODUCT_STAGES.entries()){
  const passed=execute(name);if(typeof passed!=='boolean')fail();
  if(passed)onPassed(name,checks);else{failed.push(name);onFailure(name);if(index<3)break;}
 }
 return failed;
}
export const REUSABLE_APK_SOURCE='81420b1faa8dae3143bd18653ac5cae383e8a9bc';
export const INSTALLED_TOOLING_PATHS=Object.freeze([
 '.github/workflows/subtrack-native-device-proof.yml','.github/workflows/subtrack-sandbox-installed-android.yml',
 'SubTrack/apps/mobile/scripts/sandbox-installed-android.mjs','SubTrack/apps/mobile/scripts/sandbox-installed-android-contract.mjs','SubTrack/apps/mobile/scripts/sandbox-installed-android-test.mjs',
 ...['bank','pages','restart'].map(name=>`SubTrack/apps/mobile/e2e/sandbox-product-${name}.yaml`),
]);
export function dispatch(env,checkout,lineage){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/st/native-synthetic-bank'||!head(env.ST_PRODUCT_SOURCE)||!head(checkout)||env.GITHUB_SHA!==checkout||!id(env.ST_PRODUCT_RELEASE)||!id(env.ST_PRODUCT_VERIFICATION_RUN)||!sha(env.ST_PRODUCT_SIGNED_SHA256))fail();
 const tooling=env.ST_PRODUCT_TOOLING_SOURCE??checkout;if(tooling!==checkout)fail();
 if(checkout!==env.ST_PRODUCT_SOURCE){
  if(env.ST_PRODUCT_SOURCE!==REUSABLE_APK_SOURCE||env.ST_PRODUCT_TOOLING_SOURCE!==checkout||!lineage||Object.getPrototypeOf(lineage)!==Object.prototype||Object.keys(lineage).sort().join(',')!=='parents,paths'||!Array.isArray(lineage.parents)||lineage.parents.length!==1||lineage.parents[0]!==REUSABLE_APK_SOURCE||!Array.isArray(lineage.paths)||lineage.paths.length<1||lineage.paths.length>INSTALLED_TOOLING_PATHS.length||new Set(lineage.paths).size!==lineage.paths.length||lineage.paths.some(value=>!INSTALLED_TOOLING_PATHS.includes(value)))fail();
 }
 return {sourceHead:env.ST_PRODUCT_SOURCE,toolingSourceHead:checkout,releaseId:Number(env.ST_PRODUCT_RELEASE),verificationRun:Number(env.ST_PRODUCT_VERIFICATION_RUN),signedSha256:env.ST_PRODUCT_SIGNED_SHA256};
}

export function verifiedAuthority(run,jobs,raw,expected){
 if(run?.id!==expected.verificationRun||run.repository?.full_name!==REPO||run.path!=='.github/workflows/subtrack-sandbox-android-build.yml'||run.event!=='workflow_dispatch'||run.head_sha!==expected.sourceHead||run.head_branch!=='st/native-synthetic-bank'||run.status!=='completed'||run.conclusion!=='success'||!Array.isArray(jobs)||jobs.length>100)fail();
 const selected=jobs.filter(job=>job.name==='signed-return-verification'&&job.status==='completed'&&job.conclusion==='success');if(selected.length!==1)fail();
 const log=Buffer.isBuffer(raw)?raw.toString('utf8'):raw;if(typeof log!=='string'||Buffer.byteLength(log)>8388608)fail();
 const lines=log.split(/\r?\n/).map(line=>line.replace(/^\d{4}-\d\d-\d\dT[^ ]+Z /,'').trim());
 const candidates=[];for(const line of lines)if(line.startsWith('{"schemaVersion":2,')){try{candidates.push(validateReceipt(JSON.parse(line),true));}catch{fail();}}
 if(candidates.length!==1)fail();const receipt=candidates[0];
 if(receipt.sourceHead!==expected.sourceHead||receipt.signedSha256!==expected.signedSha256||receipt.signerCertificateSha256!==SIGNER||receipt.versionCode<5||!receipt.runtimeEnabled)fail();
 const transferStrings=[...new Set(lines.filter(line=>line.startsWith('ST250_UNSIGNED_TRANSFER_RECEIPT: ')).map(line=>line.slice('ST250_UNSIGNED_TRANSFER_RECEIPT: '.length)))];
 const releaseIds=[...new Set(lines.filter(line=>line.startsWith('ST250_SIGNED_RETURN_RELEASE_ID: ')).map(line=>line.slice('ST250_SIGNED_RETURN_RELEASE_ID: '.length)))];
 if(transferStrings.length!==1||releaseIds.length!==1||releaseIds[0]!==String(expected.releaseId))fail();
 const transfer=validateTransfer(JSON.parse(transferStrings[0]),'apk');if(transfer.sourceHead!==expected.sourceHead||transfer.unsignedSha256!==receipt.unsignedSha256||transfer.manifestSchema!=='st250-android-transfer-manifest-v2')fail();
 return Object.freeze({receipt,transfer,verificationJob:selected[0].id});
}
export function signedDraft(release,authority,expected,now=Date.now()){
 const {receipt,transfer}=authority;
 if(release?.id!==expected.releaseId||release.draft!==true||release.prerelease!==true||release.published_at!==null||release.target_commitish!==transfer.defaultTargetHead||release.tag_name!==`st250-android-signed-stage-${expected.sourceHead}-${transfer.runId}`||!Array.isArray(release.assets)||release.assets.length!==2||!Number.isFinite(Date.parse(release.created_at))||Date.parse(release.created_at)>now+60000||now-Date.parse(release.created_at)>7*86400000)fail();
 const apk=release.assets.find(asset=>asset.name===`subtrack-sandbox-signed-${expected.sourceHead}.apk`),manifest=release.assets.find(asset=>asset.name===`st250-android-signed-${expected.sourceHead}.json`);
 for(const [asset,media,max] of [[apk,'application/vnd.android.package-archive',200*1024*1024],[manifest,'application/json',16384]])if(!asset||!Number.isSafeInteger(asset.id)||asset.id<1||asset.state!=='uploaded'||asset.content_type!==media||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>max||typeof asset.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(asset.digest))fail();
 if(apk.size!==receipt.bytes||apk.digest!==`sha256:${expected.signedSha256}`)fail();return {apk,manifest};
}
export function bindPending(pending,authority){
 const receipt=authority.receipt,fields=['schema','sourceHead','signerCertificateSha256','unsignedSha256','signedSha256','bytes','runtimeEnabled','embeddedConfigSha256','hermesSha256'];
 if(!pending||Object.getPrototypeOf(pending)!==Object.prototype||Reflect.ownKeys(pending).length!==fields.length||fields.some(key=>!Object.hasOwn(pending,key))||pending.schema!=='st250-android-signed-pending-v2')fail();
 for(const key of fields.filter(key=>key!=='schema'))if(pending[key]!==receipt[key])fail();return true;
}
export function acceptedPng(bytes){if(!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>16777216||!validAndroidPng(bytes)||bytes.readUInt32BE(16)<300||bytes.readUInt32BE(16)>4000||bytes.readUInt32BE(20)<600||bytes.readUInt32BE(20)>5000)fail();return {sha256:digest(bytes),bytes:bytes.length};}
export function productReceipt(expected,authority,checks,images,cleanup){
 if(!head(expected?.sourceHead)||!head(expected?.toolingSourceHead)||cleanup!==true||!checks||Object.keys(checks).length!==CHECKS.length||CHECKS.some(key=>checks[key]!==true)||!Array.isArray(images)||images.length!==SCREENSHOTS.length||new Set(images.map(image=>image.name)).size!==images.length||images.some(image=>!image||Object.getPrototypeOf(image)!==Object.prototype||Object.keys(image).sort().join(',')!=='bytes,name,sha256'||!SCREENSHOTS.includes(image.name)||!sha(image.sha256)||!Number.isSafeInteger(image.bytes)||image.bytes<24))fail();
 return {schema:'st253-installed-sandbox-android-v1',sourceHead:expected.sourceHead,toolingSourceHead:expected.toolingSourceHead,signedSha256:expected.signedSha256,signedReleaseId:expected.releaseId,verificationRun:expected.verificationRun,applicationId:PACKAGE,versionCode:authority.receipt.versionCode,signerCertificateSha256:SIGNER,origin:'https://198.44.116.159',readback:'authoritative-app-refresh-and-cold-restart',backendSqlProofClaimed:false,checks:Object.fromEntries(CHECKS.map(key=>[key,true])),screenshots:images,visualMatrix:{status:'captured',cases:[...VISUAL_CASES],screens:[...VISUAL_SCREENS],captureCount:VISUAL_SCREENSHOTS.length,comparisonPerformed:false,parityPassed:false},privateCleanupConfirmed:true};
}

export function foregroundSandbox(activity,windows){
 if(typeof activity!=='string'||typeof windows!=='string'||Buffer.byteLength(activity)>1048576||Buffer.byteLength(windows)>1048576)fail();
 activity=activity.replaceAll('\r','');windows=windows.replaceAll('\r','');
 // API34 Task.dumpInner emits topResumedActivity=; retain the historical field
 // without accepting multiple/contradictory activities. Android14 source checked2026-10-18:
 // https://android.googlesource.com/platform/frameworks/base/+/android-14.0.0_r1/services/core/java/com/android/server/wm/Task.java
 const resumed=[...activity.matchAll(/^[\t ]*(?:mResumedActivity:[\t ]+|topResumedActivity=)ActivityRecord\{[^\r\n]* u([0-9]+) ([a-zA-Z0-9_.]+)\/[^\r\n]*\}$/gm)];
 const focused=[...windows.matchAll(/^[\t ]*mCurrentFocus=Window\{[^\r\n]* u([0-9]+) ([a-zA-Z0-9_.]+)\/[^\r\n]*\}$/gm)];
 if(resumed.length!==1||focused.length!==1||resumed[0][1]!=='0'||focused[0][1]!=='0'||resumed[0][2]!==PACKAGE||focused[0][2]!==PACKAGE)fail();return true;
}
export function diagnosticReceipt(expected,phase,png,guards){
 if(!head(expected?.sourceHead)||!head(expected?.toolingSourceHead)||!sha(expected?.signedSha256)||!['SETUP','BANK','MANAGE','PAGES','RESTART'].includes(phase)||!guards||Object.keys(guards).sort().join(',')!=='foregroundAfter,foregroundBefore,freshWorkspaceStarted,ownedDevice,verifiedInstall'||Object.values(guards).some(value=>value!==true)||!validAndroidPng(png))fail();
 return {schema:'st253-installed-sandbox-diagnostic-v1',status:'diagnostic-only',phase,sourceHead:expected.sourceHead,toolingSourceHead:expected.toolingSourceHead,signedSha256:expected.signedSha256,applicationId:PACKAGE,filename:'failed-sandbox-product.png',sha256:digest(png),bytes:png.length};
}
