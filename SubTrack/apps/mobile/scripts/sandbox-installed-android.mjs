import {Buffer} from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync,readdirSync,copyFileSync,rmSync,openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {URL,fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {dispatch,verifiedAuthority,signedDraft,bindPending,acceptedPng,productReceipt,digest,PACKAGE,SIGNER,SCREENSHOTS,REPO,foregroundSandbox,diagnosticReceipt} from './sandbox-installed-android-contract.mjs';
import {inspectActiveApk} from '../../../tools/sandbox/android-transfer-receipt.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(app,'../..');
const fail=()=>{throw Error('Sandbox installed Android unavailable');};
let phase='AUTHORITY';
function workspace(){
 const base=realpathSync(process.env.RUNNER_TEMP??'');if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||!path.isAbsolute(base))fail();
 const directory=path.join(base,'subtrack-sandbox-installed');if(!existsSync(directory))mkdirSync(directory,{mode:0o700});
 const state=lstatSync(directory);if(!state.isDirectory()||state.isSymbolicLink()||realpathSync(directory)!==directory||(state.mode&0o777)!==0o700)fail();
 const privateDir=path.join(directory,'private');return {base,directory,privateDir,publicDir:path.join(directory,'public')};
}
function write(file,value){writeFileSync(file,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value),{flag:'wx',mode:0o600});}
function command(command,args,privateDir,label,timeout=30000){
 const file=path.join(privateDir,`${label}.log`),fd=openSync(file,'wx',0o600);
 try{const env={...process.env};delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const result=spawnSync(command,args,{cwd:app,env,stdio:['ignore',fd,fd],timeout,killSignal:'SIGKILL'});if(result.status!==0||result.error)fail();
 }finally{closeSync(fd);}return readFileSync(file);
}
async function bounded(response,max){if(!response.ok||response.status!==200)fail();const chunks=[];let size=0;for await(const chunk of response.body??[]){size+=chunk.length;if(size>max)fail();chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
async function github(endpoint,max=1048576,binary=false){
 if(typeof process.env.GITHUB_TOKEN!=='string'||process.env.GITHUB_TOKEN.length<1||!endpoint.startsWith(`/repos/${REPO}/`)||endpoint.includes('..'))fail();
 const response=await globalThis.fetch(`https://api.github.com${endpoint}`,{method:'GET',redirect:'manual',signal:globalThis.AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:binary?'application/octet-stream':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 if(response.status===302){const location=new URL(response.headers.get('location')??'');if(location.protocol!=='https:'||!(['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(location.hostname)||/^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(location.hostname)))fail();return bounded(await globalThis.fetch(location,{method:'GET',redirect:'error',signal:globalThis.AbortSignal.timeout(60000)}),max);}
 return bounded(response,max);
}
const json=async endpoint=>JSON.parse((await github(endpoint)).toString('utf8'));
export function flowLabels(now=new Date()){
 const catalogs={en:JSON.parse(readFileSync(path.join(root,'packages/i18n/catalogs/en.json'),'utf8')),sv:JSON.parse(readFileSync(path.join(root,'packages/i18n/catalogs/sv.json'),'utf8'))};
 const get=(locale,key,values={})=>{let value=key.split('.').reduce((result,part)=>result?.[part],catalogs[locale]);if(typeof value!=='string'||value.length>500||/[\r\n\0]/.test(value))fail();for(const [name,replacement]of Object.entries(values))value=value.replaceAll(`%{${name}}`,String(replacement));return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');};
 const labels={TODAY:now.toISOString().slice(0,10)};
 const keys={CONTINUE:'onboarding.identifier.continueLabel',SAVE_PROFILE:'onboarding.nativePersonal.saveProfile',MY_HOUSEHOLD:'onboarding.mode.household',HOUSEHOLD_SAVED:'onboarding.nativeHousehold.saved',BANK_OPEN:'onboarding.nativeBank.open',BANK_ACTIVE:'onboarding.nativeBank.active',BANK_UPDATED:'onboarding.nativeBank.updated',REVIEWED:'onboarding.nativeDetection.reviewed',UNDONE:'onboarding.nativeDetection.undone',MANAGE:'onboarding.nativeDetection.manage',EDIT:'onboarding.nativeSubscriptionEdit.edit',SAVE_EDIT:'onboarding.nativeSubscriptionEdit.save',EDIT_SAVED:'onboarding.nativeSubscriptionEdit.saved',PAUSE:'onboarding.nativeSubscriptionEdit.pause',RESUME:'onboarding.nativeSubscriptionEdit.resume',STATUS_SAVED:'onboarding.nativeSubscriptionEdit.statusSaved',TODAY:'onboarding.datePicker.today',ANALYTICS_SUMMARY:'nativeAnalytics.summary',PRICE_RISE:'nativeAnalytics.priceRise',TREND_EVIDENCE:'nativeAnalytics.trendEvidence',COMPARE:'nativeAnalytics.compare',YOUR_PLANS:'nativeAnalytics.yourPlans',ANNUAL:'nativeAnalytics.annual',SAMPLE_PRICE:'nativeAnalytics.samplePrice',PROFILE_SAVED:'onboarding.nativePersonal.profileSaved',CANCEL_ADD:'onboarding.manualSubscription.cancel',LOGOUT:'onboarding.nativePersonal.logout',LOGOUT_CONFIRMED:'onboarding.nativePersonal.logoutConfirmed'};
 for(const locale of ['en','sv'])for(const [name,key]of Object.entries(keys))labels[`${locale==='en'?'E':'S'}_${name}`]=get(locale,key);
 labels.E_ACTIVE_TEN=get('en','nativeAnalytics.activePlans',{count:10});labels.S_ACTIVE_TEN=get('sv','nativeAnalytics.activePlans',{count:10});labels.E_DETAIL_CEDAR_PLUS=get('en','onboarding.billingMonth.details',{name:'Cedar Video Plus'});return labels;
}
// Maestro CLI parameters require explicit -e; arbitrary shell variables are not auto-imported.
// https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants
export function maestroArgs(labels,output,flow){
 return ['test','--test-output-dir',output,...Object.entries(labels).flatMap(([key,value])=>['-e',`${key}=${value}`]),flow];
}
async function prepare(){
 const w=workspace();if(existsSync(w.privateDir)||existsSync(w.publicDir))fail();mkdirSync(w.privateDir,{mode:0o700});
 const checkout=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});if(checkout.status!==0)fail();const expected=dispatch(process.env,checkout.stdout.trim());
 phase='VERIFICATION';const run=await json(`/repos/${REPO}/actions/runs/${expected.verificationRun}`),jobs=(await json(`/repos/${REPO}/actions/runs/${expected.verificationRun}/jobs?per_page=100`)).jobs;
 const job=jobs?.filter(value=>value.name==='signed-return-verification');if(job?.length!==1||!Number.isSafeInteger(job[0].id))fail();
 const logs=await github(`/repos/${REPO}/actions/jobs/${job[0].id}/logs`,8388608);let authority;try{authority=verifiedAuthority(run,jobs,logs,expected);}finally{logs.fill(0);}
 phase='DRAFT';const release=await json(`/repos/${REPO}/releases/${expected.releaseId}`),assets=signedDraft(release,authority,expected);
 const manifest=await github(`/repos/${REPO}/releases/assets/${assets.manifest.id}`,16384,true);if(manifest.length!==assets.manifest.size||`sha256:${digest(manifest)}`!==assets.manifest.digest)fail();bindPending(JSON.parse(manifest),authority);
 const apk=await github(`/repos/${REPO}/releases/assets/${assets.apk.id}`,200*1024*1024,true);if(apk.length!==authority.receipt.bytes||digest(apk)!==expected.signedSha256)fail();
 const measured=inspectActiveApk(apk,authority.receipt.versionCode);for(const key of ['embeddedConfigSha256','hermesSha256'])if(measured[key]!==authority.receipt[key])fail();
 const again=await json(`/repos/${REPO}/releases/${expected.releaseId}`);signedDraft(again,authority,expected);if(JSON.stringify(again.assets)!==JSON.stringify(release.assets))fail();
 write(path.join(w.privateDir,'signed.apk'),apk);write(path.join(w.privateDir,'authority.json'),{expected,authority});console.log('ST253_SANDBOX_ANDROID phase=AUTHORITY status=verified');
}
function run(){
 const w=workspace();const {expected,authority}=JSON.parse(readFileSync(path.join(w.privateDir,'authority.json'),'utf8'));
 const checkout=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});if(checkout.status!==0||JSON.stringify(dispatch(process.env,checkout.stdout.trim()))!==JSON.stringify(expected))fail();
 const apk=path.join(w.privateDir,'signed.apk');if(digest(readFileSync(apk))!==expected.signedSha256)fail();
 const checks={signedVerificationBound:true};let complete=false,freshWorkspaceStarted=false,diagnostic;
 try{
  phase='SIGNATURE';const tools=path.join(process.env.ANDROID_HOME??'','build-tools/36.0.0');
  const cert=command(path.join(tools,'apksigner'),['verify','--verbose','--print-certs',apk],w.privateDir,'signature').toString('utf8');
  const certificates=[...cert.matchAll(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})$/gm)];if(certificates.length!==1||certificates[0][1]!==SIGNER||/^Signer #2 /m.test(cert))fail();checks.sameSigner=true;
  command(path.join(tools,'zipalign'),['-c','-P','16','4',apk],w.privateDir,'alignment');
  const badging=command(path.join(tools,'aapt2'),['dump','badging',apk],w.privateDir,'badging').toString('utf8');if(!badging.includes(`package: name='${PACKAGE}' versionCode='${authority.receipt.versionCode}'`)||/application-debuggable/.test(badging))fail();
  phase='INSTALL';command('bash',['scripts/private-runtime-android.sh','owned-device'],w.privateDir,'owned-device');command('adb',['-s','emulator-5554','install',apk],w.privateDir,'install',120000);
  const installed=command('adb',['-s','emulator-5554','shell','dumpsys','package',PACKAGE],w.privateDir,'installed-package').toString('utf8');if(!installed.includes(`versionCode=${authority.receipt.versionCode} `)||/\bDEBUGGABLE\b/.test(installed))fail();checks.signedBytesInstalled=true;
  const deviceDate=command('adb',['-s','emulator-5554','shell','date','+%Y-%m-%d'],w.privateDir,'device-date').toString('utf8').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(deviceDate))fail();
  const labels=flowLabels(new Date(`${deviceDate}T12:00:00Z`)),environment={...process.env,...labels};delete environment.GITHUB_TOKEN;delete environment.GH_TOKEN;
  if(command('adb',['-s','emulator-5554','shell','pm','clear',PACKAGE],w.privateDir,'fresh-sandbox-clear').toString('utf8').trim()!=='Success')fail();
  const stages=[['setup',['isolatedEnrollment','seededHouseholdReadAndRenamed','dependantCreated']],['bank',['syntheticBankSynced','detectionConfirmedTwice','detectionRejectedAndUndone']],['manage',['confirmedPlanEdited','customCategorySaved','datePickerSaved','trackingReread']],['pages',['calendarOpened','homePopulated','insightsPopulated','comparisonOpened']],['visual',['visualMatrixCaptured']],['restart',['preferencesPersisted','coldRestartHouseholdReadback','coldRestartSubscriptionReadback','logoutClearedPrivateUi']]];
  for(const [name,flags]of stages){phase=name==='visual'?'PAGES':name.toUpperCase();if(name==='setup')freshWorkspaceStarted=true;const log=openSync(path.join(w.privateDir,`${name}.log`),'wx',0o600);let result;try{result=spawnSync('maestro',maestroArgs(labels,path.join(w.privateDir,name),path.join(app,'e2e',`sandbox-product-${name}.yaml`)),{cwd:app,env:environment,stdio:['ignore',log,log],timeout:600000,killSignal:'SIGKILL'});}finally{closeSync(log);}if(result.status!==0||result.error)fail();for(const key of flags)checks[key]=true;console.log(`ST253_SANDBOX_ANDROID phase=${phase} status=passed`);}
  phase='SCREENSHOTS';const found=new Map();function walk(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())fail();if(entry.isDirectory())walk(file);else if(SCREENSHOTS.includes(entry.name)){if(found.has(entry.name))fail();const bytes=readFileSync(file);found.set(entry.name,{file,...acceptedPng(bytes)});}}}walk(w.privateDir);
  if(found.size!==SCREENSHOTS.length)fail();mkdirSync(w.publicDir,{mode:0o700});const images=SCREENSHOTS.map(name=>{const image=found.get(name);copyFileSync(image.file,path.join(w.publicDir,name),1);return {name,sha256:image.sha256,bytes:image.bytes};});
  phase='CLEANUP';rmSync(w.privateDir,{recursive:true});if(existsSync(w.privateDir))fail();
  const receipt=productReceipt(expected,authority,checks,images,true);write(path.join(w.publicDir,'installed-sandbox-android-receipt.json'),receipt);complete=true;console.log('ST253_SANDBOX_ANDROID phase=ACCEPTED status=passed');
 }catch(error){
  try{
   if(!checks.signedBytesInstalled||!freshWorkspaceStarted||!['SETUP','BANK','MANAGE','PAGES','RESTART'].includes(phase))fail();
   command('bash',['scripts/private-runtime-android.sh','owned-device'],w.privateDir,'diagnostic-owned-device');
   const foreground=label=>foregroundSandbox(command('adb',['-s','emulator-5554','shell','dumpsys','activity','activities'],w.privateDir,`diagnostic-${label}-activity`).toString('utf8'),command('adb',['-s','emulator-5554','shell','dumpsys','window','windows'],w.privateDir,`diagnostic-${label}-windows`).toString('utf8'));
   foreground('before');const png=command('adb',['-s','emulator-5554','exec-out','screencap','-p'],w.privateDir,'diagnostic-original-png');foreground('after');
   diagnostic={png,receipt:diagnosticReceipt(expected,phase,png,{verifiedInstall:true,freshWorkspaceStarted:true,ownedDevice:true,foregroundBefore:true,foregroundAfter:true})};
  }catch{/* Withhold diagnostics unless every independent fence passes. */}
  throw error;
 }finally{
  if(existsSync(w.privateDir)&&realpathSync(w.privateDir)===path.join(w.directory,'private'))rmSync(w.privateDir,{recursive:true});if(!complete&&existsSync(w.publicDir))rmSync(w.publicDir,{recursive:true});
  try{if(diagnostic&&!existsSync(w.privateDir)){const out=path.join(w.directory,'diagnostic');mkdirSync(out,{mode:0o700});write(path.join(out,'failed-sandbox-product.png'),diagnostic.png);write(path.join(out,'diagnostic-only-receipt.json'),diagnostic.receipt);}}finally{diagnostic?.png.fill(0);}
 }
}
function cleanup(){const w=workspace();for(const name of ['private','public','diagnostic']){const file=path.join(w.directory,name);if(name==='public'&&existsSync(path.join(file,'installed-sandbox-android-receipt.json')))continue;if(name==='diagnostic'&&existsSync(path.join(file,'diagnostic-only-receipt.json')))continue;if(existsSync(file)){if(lstatSync(file).isSymbolicLink()||realpathSync(file)!==file)fail();rmSync(file,{recursive:true});}}}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const mode=process.argv[2];if(mode==='prepare')await prepare();else if(mode==='run')run();else if(mode==='cleanup')cleanup();else fail();}catch{console.error(`ST253_SANDBOX_ANDROID phase=${['AUTHORITY','VERIFICATION','DRAFT','SIGNATURE','INSTALL','SETUP','BANK','MANAGE','PAGES','RESTART','SCREENSHOTS','CLEANUP'].includes(phase)?phase:'UNKNOWN'} status=failed`);process.exitCode=1;}}
