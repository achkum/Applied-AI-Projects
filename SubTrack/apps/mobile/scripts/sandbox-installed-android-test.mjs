import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import test from 'node:test';
import {crc32,deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatch,verifiedAuthority,signedDraft,bindPending,acceptedPng,productReceipt,PACKAGE,SIGNER,REPO,CHECKS,SCREENSHOTS,foregroundSandbox,diagnosticReceipt} from './sandbox-installed-android-contract.mjs';
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
 const names=['setup','bank','manage','pages','restart'];const sources=names.map(name=>readFileSync(new URL(`../e2e/sandbox-product-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 for(const source of sources){assert.ok(source.startsWith('appId: se.subtrack.app.sandbox\n'));assert.doesNotMatch(source,/runScript|evalScript|copyTextFrom|openLink|https:\/\/localhost|se\.subtrack\.app\n/);}
 const all=sources.join('\n'),captures=[...all.matchAll(/- takeScreenshot: ([a-z-]+)/g)].map(m=>`${m[1]}.png`);assert.deepEqual(captures.sort(),[...SCREENSHOTS].sort());
 assert.equal((all.match(/clearState: true/g)??[]).length,0);const driver=readFileSync(new URL('./sandbox-installed-android.mjs',import.meta.url),'utf8');assert.equal((driver.match(/'shell','pm','clear',PACKAGE/g)??[]).length,1);assert.ok(driver.indexOf("'shell','pm','clear',PACKAGE")>driver.indexOf('checks.signedBytesInstalled=true'));assert.ok(driver.indexOf("'shell','pm','clear',PACKAGE")<driver.indexOf("if(name==='setup')freshWorkspaceStarted=true"));assert.equal((all.match(/- stopApp/g)??[]).length,1);assert.equal((all.match(/native-detection-confirm-atlas-ai/g)??[]).length,2);assert.ok(all.includes('native-detection-confirm-evergreen-mobile'));assert.ok(all.includes('native-detection-reject-motion-club'));assert.ok(all.includes('native-detection-undo'));assert.ok(all.includes('native-profile-theme-dark\n    selected: true'));
 const labels=flowLabels(new Date('2026-10-17T12:00:00Z'));assert.equal(labels.TODAY,'2026-10-17');const args=maestroArgs(labels,'/private/output','/flow.yaml');assert.equal(args.filter(value=>value==='-e').length,Object.keys(labels).length);assert.ok(args.includes('TODAY=2026-10-17'));assert.equal(args.at(-1),'/flow.yaml');for(const match of all.matchAll(/\$\{([A-Z_]+)\}/g))assert.equal(typeof labels[match[1]],'string');
 const workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-sandbox-installed-android.yml',import.meta.url),'utf8');assert.doesNotMatch(workflow,/pnpm install|gradlew|expo prebuild|assembleRelease|assembleDebug|eas build|push:|pull_request:/);assert.ok(workflow.includes('if: success()'));assert.ok(workflow.includes('subtrack-sandbox-installed/public/'));
});

test('signed edit opens the acknowledged saved detail once before status actions',()=>{
 const flow=readFileSync(new URL('../e2e/sandbox-product-manage.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.equal((flow.match(/- tapOn: Cedar Video\n/g)??[]).length,1);
 const saved=flow.slice(flow.indexOf('visible: ${E_EDIT_SAVED}'));
 assert.ok(saved.includes('element: Cedar Video Plus'));assert.ok(saved.includes('- assertVisible: Streaming extras'));
 assert.equal((saved.match(/- tapOn: Cedar Video Plus\n/g)??[]).length,1);assert.ok(saved.indexOf('- tapOn: Cedar Video Plus')<saved.indexOf('- tapOn: ${E_PAUSE}'));assert.ok(saved.endsWith('- tapOn:\n    id: native-subscription-detail-close\n'));
 assert.ok(saved.includes('- tapOn: ${E_PAUSE}'));assert.ok(saved.includes('- tapOn: ${E_RESUME}'));assert.ok(saved.includes('- assertNotVisible: ${E_RESUME}'));
});

test('signed cold restart verifies the resumed same-owner household and saved values before final revocation',()=>{
 const flow=readFileSync(new URL('../e2e/sandbox-product-restart.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.ok(flow.includes('- stopApp\n- launchApp\n- extendedWaitUntil:\n    visible:\n      id: native-nav-household\n    timeout: 120000'));
 assert.ok(!flow.includes('native-welcome-logIn'));assert.ok(!flow.includes('clearState:'));
 for(const readback of ['visible: QA Family','- assertVisible: QA Member','element: Cedar Video Plus','- assertVisible: Streaming extras','- assertVisible: ${TODAY}','id: native-profile-language-sv\n    selected: true','id: native-profile-theme-dark\n    selected: true'])assert.ok(flow.includes(readback),readback);
 for(const denied of ['- assertNotVisible: Cedar Video Plus','- assertNotVisible: QA Family','- assertNotVisible:\n    id: native-product-navigation'])assert.ok(flow.includes(denied),denied);
 assert.ok(flow.includes('visible: ${S_LOGOUT_CONFIRMED}'));
});

test('failure screenshot is diagnostic-only and requires verified fresh sandbox foreground fences',()=>{
 const chunk=(kind,data)=>{const type=Buffer.from(kind),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(300);header.writeUInt32BE(600,4);header[8]=8;header[9]=6;
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((300*4+1)*600))),chunk('IEND',Buffer.alloc(0))]);
 const guards={verifiedInstall:true,freshWorkspaceStarted:true,ownedDevice:true,foregroundBefore:true,foregroundAfter:true};
 const result=diagnosticReceipt(expected,'BANK',png,guards);assert.deepEqual(Object.keys(result),['schema','status','phase','sourceHead','signedSha256','applicationId','filename','sha256','bytes']);assert.equal(result.status,'diagnostic-only');assert.equal(result.filename,'failed-sandbox-product.png');assert.equal(result.bytes,png.length);assert.ok(!Object.hasOwn(result,'checks'));assert.ok(!Object.hasOwn(result,'accepted'));
 for(const key of Object.keys(guards))assert.throws(()=>diagnosticReceipt(expected,'BANK',png,{...guards,[key]:false}));for(const phase of ['AUTHORITY','INSTALL','ACCEPTED','private'])assert.throws(()=>diagnosticReceipt(expected,phase,png,guards));assert.throws(()=>diagnosticReceipt(expected,'BANK',Buffer.alloc(32),guards));assert.throws(()=>diagnosticReceipt(expected,'BANK',png,{...guards,token:'private'}));
 const activity='  mResumedActivity: ActivityRecord{abc u0 se.subtrack.app.sandbox/.MainActivity t2}\r\n',windows='  mCurrentFocus=Window{def u0 se.subtrack.app.sandbox/se.subtrack.app.MainActivity}\r\n';assert.equal(foregroundSandbox(activity,windows),true);
 for(const [a,w]of [[activity.replace(PACKAGE,'se.subtrack.app'),windows],[activity,windows.replace(PACKAGE,'com.android.systemui')],['',windows],[activity,''],[activity+activity,windows],[activity,windows+windows]])assert.throws(()=>foregroundSandbox(a,w));
 const driver=readFileSync(new URL('./sandbox-installed-android.mjs',import.meta.url),'utf8'),workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-sandbox-installed-android.yml',import.meta.url),'utf8');assert.ok(driver.includes("foreground('before');const png="));assert.ok(driver.includes("foreground('after');"));assert.ok(driver.includes("diagnostic&&!existsSync(w.privateDir)"));assert.ok(workflow.includes('if: failure()'));assert.ok(workflow.includes('diagnostic/failed-sandbox-product.png'));assert.ok(!workflow.includes('diagnostic/*.log'));assert.ok(!workflow.includes('private/'));
});


test('seeded product flow proves additive review, real household rename and exact ten active plans',()=>{
 const setup=readFileSync(new URL('../e2e/sandbox-product-setup.yaml',import.meta.url),'utf8'),bank=readFileSync(new URL('../e2e/sandbox-product-bank.yaml',import.meta.url),'utf8'),pages=readFileSync(new URL('../e2e/sandbox-product-pages.yaml',import.meta.url),'utf8'),restart=readFileSync(new URL('../e2e/sandbox-product-restart.yaml',import.meta.url),'utf8');
 assert.ok(setup.includes('- assertVisible: Demo family'));assert.ok(setup.includes('id: native-household-rename'));assert.ok(setup.includes('id: native-household-save'));assert.ok(!setup.includes('id: native-household-create'));assert.ok(setup.indexOf('id: native-household-member-add-open')<setup.indexOf('id: native-household-member-name'));
 assert.ok(bank.includes('- assertVisible: ${E_BANK_ACTIVE}'));assert.equal((bank.match(/- tapOn:\s+id: native-bank-sync-0/g)??[]).length,1);assert.ok(!bank.includes('native-bank-connect'));
 const labels=flowLabels(new Date('2026-10-17T12:00:00Z'));assert.equal(labels.E_ACTIVE_TEN,'10 active plans');assert.ok(pages.includes('- assertVisible: ${E_ACTIVE_TEN}'));assert.equal(CHECKS.includes('seededHouseholdReadAndRenamed'),true);assert.equal(CHECKS.includes('householdCreated'),false);
 assert.ok(!restart.includes('native-profile-save-preferences'));const language=restart.indexOf('id: native-profile-language-sv'),theme=restart.indexOf('- tapOn:\n    id: native-profile-theme-dark');assert.ok(language<theme);assert.ok(restart.slice(language,theme).includes('visible: ${S_PROFILE_SAVED}'));assert.ok(restart.slice(language,theme).includes('selected: true'));
});
