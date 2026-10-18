import {Buffer} from 'node:buffer';
import process from 'node:process';
import {URL} from 'node:url';
import test from 'node:test';
import {crc32,deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dispatch,verifiedAuthority,signedDraft,bindPending,acceptedPng,productReceipt,PACKAGE,SIGNER,REPO,CHECKS,SCREENSHOTS,VISUAL_CASES,VISUAL_SCREENS,VISUAL_SCREENSHOTS,foregroundSandbox,diagnosticReceipt,REUSABLE_APK_SOURCE,INSTALLED_TOOLING_PATHS,PRODUCT_STAGES,collectProductStages} from './sandbox-installed-android-contract.mjs';
import {flowLabels,maestroArgs} from './sandbox-installed-android.mjs';
function productYaml(directory=process.env.ST_PRODUCT_YAML_ROOT){
 const require=createRequire(import.meta.url);
 if(directory){const pkg=require(`${directory}/package.json`);assert.equal(pkg.name,'yaml');assert.equal(pkg.version,'2.9.1');for(const key of ['dependencies','optionalDependencies','peerDependencies'])assert.equal(Object.keys(pkg[key]??{}).length,0);return require(directory);}
 const mobile=createRequire(new URL('../package.json',import.meta.url));return createRequire(mobile.resolve('expo/package.json'))('yaml');
}
const source='a'.repeat(40),signed='c'.repeat(64),unsigned='b'.repeat(64),defaultHead='9'.repeat(40);
const expected={sourceHead:source,toolingSourceHead:source,releaseId:20,verificationRun:30,signedSha256:signed};
function actualPng(){
 const chunk=(kind,data)=>{const type=Buffer.from(kind),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(300);header.writeUInt32BE(600,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((300*4+1)*600))),chunk('IEND',Buffer.alloc(0))]);
}
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
 const png=actualPng();assert.equal(acceptedPng(png).bytes,png.length);
 const headerOnly=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(headerOnly);headerOnly.write('IHDR',12);headerOnly.writeUInt32BE(1080,16);headerOnly.writeUInt32BE(2400,20);
 const corrupt=Buffer.from(png);corrupt[corrupt.length-1]^=1;
 for(const value of [Buffer.alloc(0),Buffer.alloc(32),Buffer.from('private text'),headerOnly,png.subarray(0,png.length-12),corrupt])assert.throws(()=>acceptedPng(value));
 const checks=Object.fromEntries(CHECKS.map(key=>[key,true])),images=SCREENSHOTS.map(name=>({name,sha256:'d'.repeat(64),bytes:32}));assert.equal(productReceipt(expected,authority(),checks,images,true).backendSqlProofClaimed,false);
 for(const key of CHECKS)assert.throws(()=>productReceipt(expected,authority(),{...checks,[key]:false},images,true));assert.throws(()=>productReceipt(expected,authority(),checks,images,false));assert.throws(()=>productReceipt(expected,authority(),checks,images.slice(1),true));assert.throws(()=>productReceipt(expected,authority(),checks,[{...images[0],privateInput:'never'},...images.slice(1)],true));
});
test('actual flows use sandbox package, no authority extraction or rebuild, one cold restart and final owner revocation',()=>{
 const names=['setup','bank','manage','pages','visual','restart'];const sources=names.map(name=>readFileSync(new URL(`../e2e/sandbox-product-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 for(const source of sources){assert.ok(source.startsWith('appId: se.subtrack.app.sandbox\n'));assert.doesNotMatch(source,/runScript|evalScript|copyTextFrom|openLink|https:\/\/localhost|se\.subtrack\.app\n/);}
 const all=sources.join('\n'),captures=[...all.matchAll(/- takeScreenshot: ([a-z-]+)/g)].map(m=>`${m[1]}.png`);assert.deepEqual(captures.sort(),[...SCREENSHOTS].sort());
 assert.equal((all.match(/clearState: true/g)??[]).length,0);const driver=readFileSync(new URL('./sandbox-installed-android.mjs',import.meta.url),'utf8');assert.equal((driver.match(/'shell','pm','clear',PACKAGE/g)??[]).length,1);assert.ok(driver.indexOf("'shell','pm','clear',PACKAGE")>driver.indexOf('checks.signedBytesInstalled=true'));assert.ok(driver.indexOf("'shell','pm','clear',PACKAGE")<driver.indexOf("if(name==='setup')freshWorkspaceStarted=true"));assert.equal((all.match(/- stopApp/g)??[]).length,1);assert.equal((all.match(/native-detection-confirm-spotify-premium-individual/g)??[]).length,2);assert.ok(all.includes('native-detection-confirm-disney-premium'));assert.ok(all.includes('native-detection-reject-icloud-50-gb'));assert.ok(all.includes('native-detection-undo'));assert.ok(all.includes('native-profile-theme-dark\n    selected: true'));
 const labels=flowLabels(new Date('2026-10-17T12:00:00Z'));assert.equal(labels.TODAY,'2026-10-17');const args=maestroArgs(labels,'/private/output','/flow.yaml');assert.equal(args.filter(value=>value==='-e').length,Object.keys(labels).length);assert.ok(args.includes('TODAY=2026-10-17'));assert.equal(args.at(-1),'/flow.yaml');for(const match of all.matchAll(/\$\{([A-Z_]+)\}/g))assert.equal(typeof labels[match[1]],'string');
 const workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-sandbox-installed-android.yml',import.meta.url),'utf8');assert.doesNotMatch(workflow,/pnpm install|gradlew|expo prebuild|assembleRelease|assembleDebug|eas build|push:|pull_request:/);assert.ok(workflow.includes('if: success()'));assert.ok(workflow.includes('subtrack-sandbox-installed/public/'));
});

test('signed edit opens the acknowledged saved detail once before status actions',()=>{
 const flow=readFileSync(new URL('../e2e/sandbox-product-manage.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.equal((flow.match(/- tapOn: Netflix\n/g)??[]).length,1);
 const saved=flow.slice(flow.indexOf('visible: ${E_EDIT_SAVED}'));
 assert.ok(saved.includes('element: Netflix household'));assert.ok(saved.includes('- assertVisible: Streaming extras'));
 assert.equal((saved.match(/- tapOn: Netflix household\n/g)??[]).length,1);assert.ok(saved.indexOf('- tapOn: Netflix household')<saved.indexOf('- tapOn: ${E_PAUSE}'));assert.ok(saved.endsWith('- tapOn:\n    id: native-subscription-detail-close\n'));
 assert.ok(saved.includes('- tapOn: ${E_PAUSE}'));assert.ok(saved.includes('- tapOn: ${E_RESUME}'));assert.ok(saved.includes('- assertNotVisible: ${E_RESUME}'));
});

test('signed cold restart verifies the resumed same-owner household and saved values before final revocation',()=>{
 const flow=readFileSync(new URL('../e2e/sandbox-product-restart.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.ok(flow.includes('- stopApp\n- launchApp\n- extendedWaitUntil:\n    visible:\n      id: native-nav-household\n    timeout: 120000'));
 assert.ok(!flow.includes('native-welcome-logIn'));assert.ok(!flow.includes('clearState:'));
 for(const readback of ['visible: QA Family','- assertVisible: QA Member','element: Netflix household','- assertVisible: Streaming extras','- assertVisible: ${TODAY}','id: native-profile-language-sv\n    selected: true','id: native-profile-theme-dark\n    selected: true'])assert.ok(flow.includes(readback),readback);
 for(const denied of ['- assertNotVisible: Netflix household','- assertNotVisible: QA Family','- assertNotVisible:\n    id: native-product-navigation'])assert.ok(flow.includes(denied),denied);
 assert.ok(flow.includes('visible: ${S_LOGOUT_CONFIRMED}'));
});

test('failure screenshot is diagnostic-only and requires verified fresh sandbox foreground fences',()=>{
 const png=actualPng();
 const guards={verifiedInstall:true,freshWorkspaceStarted:true,ownedDevice:true,foregroundBefore:true,foregroundAfter:true};
 const result=diagnosticReceipt(expected,'BANK',png,guards);assert.deepEqual(Object.keys(result),['schema','status','phase','sourceHead','toolingSourceHead','signedSha256','applicationId','filename','sha256','bytes']);assert.equal(result.status,'diagnostic-only');assert.equal(result.filename,'failed-sandbox-product.png');assert.equal(result.bytes,png.length);assert.ok(!Object.hasOwn(result,'checks'));assert.ok(!Object.hasOwn(result,'accepted'));
 for(const key of Object.keys(guards))assert.throws(()=>diagnosticReceipt(expected,'BANK',png,{...guards,[key]:false}));for(const phase of ['AUTHORITY','INSTALL','ACCEPTED','private'])assert.throws(()=>diagnosticReceipt(expected,phase,png,guards));assert.throws(()=>diagnosticReceipt(expected,'BANK',Buffer.alloc(32),guards));assert.throws(()=>diagnosticReceipt(expected,'BANK',png,{...guards,token:'private'}));
 const activity='  mResumedActivity: ActivityRecord{abc u0 se.subtrack.app.sandbox/.MainActivity t2}\r\n',windows='  mCurrentFocus=Window{def u0 se.subtrack.app.sandbox/se.subtrack.app.MainActivity}\r\n';assert.equal(foregroundSandbox(activity,windows),true);
 for(const [a,w]of [[activity.replace(PACKAGE,'se.subtrack.app'),windows],[activity,windows.replace(PACKAGE,'com.android.systemui')],['',windows],[activity,''],[activity+activity,windows],[activity,windows+windows]])assert.throws(()=>foregroundSandbox(a,w));
 // API34's actual Task.dumpInner label; both independent observations must agree.
 const api34=activity.replace('mResumedActivity: ','topResumedActivity=');assert.equal(foregroundSandbox(api34,windows),true);
 for(const value of [api34.replace(PACKAGE,'com.android.systemui'),api34+activity,api34+api34,api34.replace('u0 ','u10 '),api34.replace('topResumedActivity=','notTopResumedActivity=')])assert.throws(()=>foregroundSandbox(value,windows));
 assert.throws(()=>foregroundSandbox(api34+api34.replace('u0 ','u10 '),windows));assert.throws(()=>foregroundSandbox(api34,windows+windows.replace('u0 ','u10 ')));assert.throws(()=>foregroundSandbox(api34,windows.replace('u0 ','u10 ')));
 const driver=readFileSync(new URL('./sandbox-installed-android.mjs',import.meta.url),'utf8'),workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-sandbox-installed-android.yml',import.meta.url),'utf8');assert.ok(driver.indexOf("foreground('before');")<driver.indexOf("'screencap','-p'"));assert.ok(driver.indexOf("'screencap','-p'")<driver.indexOf("foreground('after');"));assert.ok(driver.includes("diagnostic&&!existsSync(w.privateDir)"));assert.ok(driver.includes('if(!retained)png?.fill(0)'));assert.ok(workflow.includes('if: failure()'));assert.ok(workflow.includes('diagnostic/failed-sandbox-product.png'));assert.ok(!workflow.includes('diagnostic/*.log'));assert.ok(!workflow.includes('private/'));
});


test('seeded product flow proves additive review, real household rename and exact fourteen active plans',()=>{
 const setup=readFileSync(new URL('../e2e/sandbox-product-setup.yaml',import.meta.url),'utf8'),bank=readFileSync(new URL('../e2e/sandbox-product-bank.yaml',import.meta.url),'utf8'),pages=readFileSync(new URL('../e2e/sandbox-product-pages.yaml',import.meta.url),'utf8'),restart=readFileSync(new URL('../e2e/sandbox-product-restart.yaml',import.meta.url),'utf8');
 assert.ok(setup.includes('- assertVisible: Demo family'));assert.ok(setup.includes('id: native-household-rename'));assert.ok(setup.includes('id: native-household-save'));assert.ok(!setup.includes('id: native-household-create'));assert.ok(setup.indexOf('id: native-household-member-add-open')<setup.indexOf('id: native-household-member-name'));
 assert.ok(bank.includes('- assertVisible: ${E_BANK_ACTIVE}'));assert.equal((bank.match(/- tapOn:\s+id: native-bank-sync-0/g)??[]).length,1);assert.ok(!bank.includes('native-bank-connect'));
 const labels=flowLabels(new Date('2026-10-17T12:00:00Z'));assert.equal(labels.E_ACTIVE_FOURTEEN,'14 active plans');assert.ok(pages.includes('- assertVisible: ${E_ACTIVE_FOURTEEN}'));assert.equal(CHECKS.includes('seededHouseholdReadAndRenamed'),true);assert.equal(CHECKS.includes('householdCreated'),false);
 assert.ok(!restart.includes('native-profile-save-preferences'));const language=restart.indexOf('id: native-profile-language-sv'),theme=restart.indexOf('- tapOn:\n    id: native-profile-theme-dark');assert.ok(language<theme);assert.ok(restart.slice(language,theme).includes('id: native-profile-language-sv\n      selected: true'));assert.ok(restart.slice(language,theme).includes('selected: true'));
});

test('actual signed visual flow captures all five tabs, real detail and chart in four saved locale/theme states before the original cold restart',()=>{
 const yaml=productYaml();
 const source=readFileSync(new URL('../e2e/sandbox-product-visual.yaml',import.meta.url),'utf8'),documents=yaml.parseAllDocuments(source).map(document=>document.toJSON()),rows=documents[1];
 assert.deepEqual(documents[0],{appId:PACKAGE});assert.deepEqual(VISUAL_CASES,['en-light','en-dark','sv-light','sv-dark']);assert.deepEqual(VISUAL_SCREENS,['home','subscriptions','detail','household','insights','trend','profile']);
 const captures=rows.filter(row=>row.takeScreenshot).map(row=>`${row.takeScreenshot}.png`);assert.deepEqual(captures,[...VISUAL_SCREENSHOTS]);assert.equal(captures.length,28);
 const tapId=(steps,id)=>steps.findIndex(row=>row.tapOn?.id===id),selected=(steps,id)=>steps.findIndex(row=>row.extendedWaitUntil?.visible?.id===id&&row.extendedWaitUntil.visible.selected===true&&row.extendedWaitUntil.timeout===30000);
 const capture=(steps,mode,screen)=>steps.findIndex(row=>row.takeScreenshot===`accepted-sandbox-visual-${mode}-${screen}`);
 let start=0;
 for(const mode of VISUAL_CASES){
  const [locale,theme]=mode.split('-'),end=rows.findIndex((row,index)=>index>=start&&row.takeScreenshot===`accepted-sandbox-visual-${mode}-profile`),steps=rows.slice(start,end+1);assert.ok(end>start);
  const languageId=`native-profile-language-${locale}`,themeId=`native-profile-theme-${theme}`,language=tapId(steps,languageId),languageReady=selected(steps,languageId),themeAt=tapId(steps,themeId),themeReady=selected(steps,themeId);
  assert.ok(language>=0&&languageReady>language&&themeAt>languageReady&&themeReady>themeAt&&capture(steps,mode,'home')>themeReady,mode);
  for(const [tab,screenName]of [['month','home'],['manage','subscriptions'],['household','household'],['insights','insights'],['profile','profile']]){const at=steps.findIndex((row,index)=>row.tapOn?.id===`native-nav-${tab}`&&index<capture(steps,mode,screenName));assert.ok(at>=0,mode+tab);assert.deepEqual(steps[at+1],{extendedWaitUntil:{visible:{id:`native-nav-${tab}`,selected:true},timeout:30000}});}
  const open=steps.findIndex(row=>row.tapOn==='Netflix household'),detail=capture(steps,mode,'detail'),close=tapId(steps,'native-subscription-detail-close');assert.ok(open>capture(steps,mode,'subscriptions')&&detail>open&&close>detail&&capture(steps,mode,'household')>close);
  assert.ok(steps.slice(open,detail).some(row=>row.extendedWaitUntil?.visible?.id==='native-subscription-charge-history'));
  const chart=steps.findIndex(row=>row.scrollUntilVisible?.element?.id==='native-insights-trend'&&row.scrollUntilVisible.direction==='DOWN');assert.ok(chart>capture(steps,mode,'insights')&&chart<capture(steps,mode,'trend'));
  assert.ok(steps.some(row=>row.extendedWaitUntil?.visible==='${'+(locale==='en'?'E':'S')+'_ACTIVE_FOURTEEN}'));
  start=end+1;
 }
 const restore=rows.slice(start);assert.ok(tapId(restore,'native-profile-language-en')<selected(restore,'native-profile-language-en'));assert.ok(tapId(restore,'native-profile-theme-light')<selected(restore,'native-profile-theme-light'));assert.deepEqual(restore.at(-1),{assertVisible:{id:'native-profile-language-en',selected:true}});
 assert.doesNotMatch(source,/stopApp|launchApp|clearState|runScript|evalScript|openLink|copyTextFrom|PROFILE_SAVED|inputText/);
 const driver=readFileSync(new URL('./sandbox-installed-android.mjs',import.meta.url),'utf8');assert.deepEqual(PRODUCT_STAGES.slice(-2).map(([name])=>name),['visual','restart']);assert.ok(driver.includes("phase=name==='visual'?'PAGES':name.toUpperCase()"));
});

test('closed installed receipt requires every matrix image and describes capture without claiming visual parity',()=>{
 const checks=Object.fromEntries(CHECKS.map(key=>[key,true])),images=SCREENSHOTS.map(name=>({name,sha256:'d'.repeat(64),bytes:32}));
 const value=productReceipt(expected,authority(),checks,images,true);assert.deepEqual(value.visualMatrix,{status:'captured',cases:[...VISUAL_CASES],screens:[...VISUAL_SCREENS],captureCount:28,comparisonPerformed:false,parityPassed:false});
 for(const name of VISUAL_SCREENSHOTS)assert.throws(()=>productReceipt(expected,authority(),checks,images.filter(image=>image.name!==name),true),name);
 assert.throws(()=>productReceipt(expected,authority(),{...checks,visualMatrixCaptured:false},images,true));
 assert.throws(()=>productReceipt(expected,authority(),checks,[...images.slice(0,-1),{...images.at(-1),name:'accepted-sandbox-visual-en-system-profile.png'}],true));
});

test('only the fixed814 artifact may use a clean reviewed direct-child tooling portfolio while artifact verification remains separate',()=>{
 const tooling='d'.repeat(40),env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/st/native-synthetic-bank',GITHUB_SHA:tooling,ST_PRODUCT_SOURCE:REUSABLE_APK_SOURCE,ST_PRODUCT_TOOLING_SOURCE:tooling,ST_PRODUCT_RELEASE:'20',ST_PRODUCT_VERIFICATION_RUN:'30',ST_PRODUCT_SIGNED_SHA256:signed};
 const lineage={parents:[REUSABLE_APK_SOURCE],paths:[...INSTALLED_TOOLING_PATHS]};
 const bound=dispatch(env,tooling,lineage);assert.equal(bound.sourceHead,REUSABLE_APK_SOURCE);assert.equal(bound.toolingSourceHead,tooling);
 for(const changed of [undefined,{parents:[],paths:lineage.paths},{parents:[source],paths:lineage.paths},{parents:[REUSABLE_APK_SOURCE,source],paths:lineage.paths},{parents:lineage.parents,paths:[]},{parents:lineage.parents,paths:[lineage.paths[0],lineage.paths[0]]},{parents:lineage.parents,paths:['SubTrack/apps/mobile/src/components/onboarding/NativePersonalScreen.tsx']},{parents:lineage.parents,paths:['SubTrack/apps/mobile/app.config.ts']},{parents:lineage.parents,paths:['SubTrack/packages/i18n/catalogs/en.json']},{...lineage,extra:true}])assert.throws(()=>dispatch(env,tooling,changed));
 for(const patch of [{ST_PRODUCT_SOURCE:source},{GITHUB_SHA:source},{ST_PRODUCT_TOOLING_SOURCE:source},{ST_PRODUCT_TOOLING_SOURCE:undefined}])assert.throws(()=>dispatch({...env,...patch},tooling,lineage));
 const artifactExpected={...bound,sourceHead:source};const verified=verifiedAuthority(run(),jobs(),log(),artifactExpected);assert.equal(verified.receipt.sourceHead,source);assert.throws(()=>verifiedAuthority({...run(),head_sha:tooling},jobs(),log(),artifactExpected));
 const checks=Object.fromEntries(CHECKS.map(key=>[key,true])),images=SCREENSHOTS.map(name=>({name,sha256:'d'.repeat(64),bytes:32}));const receipt=productReceipt(artifactExpected,verified,checks,images,true);assert.equal(receipt.sourceHead,source);assert.equal(receipt.toolingSourceHead,tooling);assert.throws(()=>productReceipt({...artifactExpected,toolingSourceHead:'unknown'},verified,checks,images,true));
 const runner=readFileSync(new URL('./sandbox-installed-android.mjs',import.meta.url),'utf8');for(const guard of ["['rev-list','--parents','-n','1','HEAD']","['diff','--name-only','--no-renames','-z','HEAD^','HEAD']","['status','--porcelain','--untracked-files=no']","JSON.stringify(currentDispatch())!==JSON.stringify(expected)"])assert.ok(runner.includes(guard));
});

test('signed fixture navigation targets Profile bank entry, the bottom Compare and bounded horizontal plan-strip gestures before exact selection',()=>{
 const yaml=productYaml();
 const rows=name=>yaml.parseAllDocuments(readFileSync(new URL(`../e2e/sandbox-product-${name}.yaml`,import.meta.url),'utf8'))[1].toJSON();const bank=rows('bank'),pages=rows('pages'),restart=rows('restart');
 assert.deepEqual(bank[0],{tapOn:{id:'native-nav-profile'}});assert.deepEqual(bank[1],{extendedWaitUntil:{visible:{id:'native-profile-bank'},timeout:30000}});assert.deepEqual(bank[2],{tapOn:{id:'native-profile-bank'}});
 assert.ok(pages.some(row=>row.tapOn?.text==='${E_COMPARE}'&&row.tapOn.below==='${E_TREND_EVIDENCE}'));
 const loop=pages.find(row=>row.repeat);assert.equal(loop.repeat.times,12);assert.deepEqual(loop.repeat.commands,[{runFlow:{when:{notVisible:'Disney[+] Standard'},commands:[{swipe:{start:'90%, 24%',end:'10%, 24%',duration:500}}]}}]);assert.ok(pages.findIndex(row=>row.assertVisible==='Disney[+] Standard')<pages.findIndex(row=>row.tapOn==='Disney[+] Standard'));
 for(const id of ['native-profile-language-sv','native-profile-theme-dark']){const tap=restart.findIndex(row=>row.tapOn?.id===id);assert.deepEqual(restart[tap+1],{extendedWaitUntil:{visible:{id,selected:true},timeout:30000}});}
});

test('hosted qualification supplies the exact locked dependency alone and local fallback parses the same actual YAML',()=>{
 const mobile=createRequire(new URL('../package.json',import.meta.url)),directory=process.env.ST_PRODUCT_YAML_ROOT??createRequire(mobile.resolve('expo/package.json')).resolve('yaml').replace(/[\\/]dist[\\/]index\.js$/,'');
 assert.deepEqual(productYaml(directory).parse('bound: true'),{bound:true});if(!process.env.ST_PRODUCT_YAML_ROOT)assert.deepEqual(productYaml(null).parse('bound: true'),{bound:true});assert.throws(()=>productYaml('/not-an-owned-yaml-package'));
 const workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-sandbox-installed-android.yml',import.meta.url),'utf8');for(const required of ['ST_PRODUCT_YAML_ROOT','yaml-2.9.1.tgz','validateDependencyLock','validateDependencyArchive','--no-same-owner','--no-same-permissions','trap'])assert.ok(workflow.includes(required));assert.ok(workflow.indexOf('validateDependencyArchive(bytes)')<workflow.indexOf('node --test apps/mobile/scripts/sandbox-installed-android-test.mjs'));
});

test('natural page/visual failures collect independent restart results and cannot grant accepted receipt',()=>{
 const attempted=[],passed={},failures=[];
 const failed=collectProductStages({execute(name){attempted.push(name);return !['pages','visual'].includes(name);},onPassed(_name,flags){for(const flag of flags)passed[flag]=true;},onFailure(name){failures.push(name);}});
 assert.deepEqual(attempted,['setup','bank','manage','pages','visual','restart']);assert.deepEqual(failed,['pages','visual']);assert.deepEqual(failures,failed);
 assert.equal(passed.coldRestartSubscriptionReadback,true);assert.equal(passed.homePopulated,undefined);assert.equal(passed.visualMatrixCaptured,undefined);
 const images=SCREENSHOTS.map(name=>({name,sha256:'d'.repeat(64),bytes:32}));assert.throws(()=>productReceipt(expected,authority(),{...passed,signedVerificationBound:true,signedBytesInstalled:true,sameSigner:true},images,true));
 const yaml=productYaml(),restart=yaml.parseAllDocuments(readFileSync(new URL('../e2e/sandbox-product-restart.yaml',import.meta.url),'utf8'))[1].toJSON();assert.deepEqual(restart[0],{tapOn:{id:'native-nav-profile'}});
});

test('fixture prerequisite failure and unknown/interrupted execution stop dependent collection',()=>{
 for(const prerequisite of ['setup','bank','manage']){
  const seen=[];assert.deepEqual(collectProductStages({execute(name){seen.push(name);return name!==prerequisite;},onPassed(){},onFailure(){}}),[prerequisite]);assert.deepEqual(seen,['setup','bank','manage'].slice(0,['setup','bank','manage'].indexOf(prerequisite)+1));
 }
 const seen=[];assert.throws(()=>collectProductStages({execute(name){seen.push(name);if(name==='pages')throw Error('interrupted');return true;},onPassed(){},onFailure(){}}));assert.deepEqual(seen,['setup','bank','manage','pages']);
 for(const invalid of [undefined,0,1,null,'true'])assert.throws(()=>collectProductStages({execute(){return invalid;},onPassed(){},onFailure(){}}));
 const passed=[];assert.deepEqual(collectProductStages({execute(){return true;},onPassed(name,checks){passed.push([name,checks]);},onFailure(){assert.fail('unexpected failure');}}),[]);assert.deepEqual(passed,PRODUCT_STAGES);
});
