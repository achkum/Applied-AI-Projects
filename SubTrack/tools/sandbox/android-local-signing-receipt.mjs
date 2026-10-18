import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {closed,canonical,digest,validateManifest,validateTransfer,bind,validateSignedPending,validateRunSignedHistory,names,tag} from './android-transfer-receipt.mjs';
import {validateReceipt} from './android-release-receipt.mjs';

const fail=()=>{throw Error('ST253_ANDROID_LOCAL_RECEIPT_UNAVAILABLE');};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const head=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const id=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
export const LOCAL_JDK_SHA256='e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0';
export const LOCAL_JAR_SHA256='3716d9311e55d2b0918a2fd9d54ba9e406c5f6abeea700b287f11259bc163dec';
export const LOCAL_REPOSITORY='achkum/Applied-AI-Projects';
export const VERIFICATION_WORKFLOW='.github/workflows/subtrack-sandbox-android-build.yml';
export const operationId=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
export function jsonBytes(value){return Buffer.from(JSON.stringify(value));}
export function sameJson(one,two){return jsonBytes(one).equals(jsonBytes(two));}

/** Public preparation is deliberately not evidence of signing execution. */
export function validatePublicToolsRecord(value,expectedSha256){
 closed(value,['schema','qualification','toolsManifestSha256','toolsReceiptSha256','toolsSourceHead','toolsRunId','toolsImageId','apksignerJarSha256','jdkPublisherChecksumUrl','jdkArchiveSha256','jdkRoot','jdkFiles','javaExecuted','signerAccessed','remoteOperationPerformed','alignmentVerified','signingQualified']);
 if(!hash(expectedSha256)||digest(jsonBytes(value))!==expectedSha256||value.schema!=='st253-android-local-public-tools-v1'||value.qualification!=='public-bytes-only'||!hash(value.toolsManifestSha256)||!hash(value.toolsReceiptSha256)||!head(value.toolsSourceHead)||!/^[1-9][0-9]*-[1-9][0-9]*$/.test(value.toolsRunId)||!/^sha256:[a-f0-9]{64}$/.test(value.toolsImageId)||value.apksignerJarSha256!==LOCAL_JAR_SHA256||value.jdkArchiveSha256!==LOCAL_JDK_SHA256||value.jdkRoot!=='jdk-17.0.20.1+1'||value.jdkPublisherChecksumUrl!=='https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip.sha256.txt'||['javaExecuted','signerAccessed','remoteOperationPerformed','alignmentVerified','signingQualified'].some(key=>value[key]!==false))fail();
 if(!value.jdkFiles||Object.getPrototypeOf(value.jdkFiles)!==Object.prototype||Object.keys(value.jdkFiles).length!==492)fail();
 for(const [name,file] of Object.entries(value.jdkFiles)){closed(file,['sha256','bytes']);if(!/^[A-Za-z0-9_./+-]+$/.test(name)||name.startsWith('/')||name.split('/').some(part=>part===''||part==='.'||part==='..')||!hash(file.sha256)||!positive(file.bytes)||file.bytes>256*1024*1024)fail();}
 for(const name of ['bin/java.exe','bin/keytool.exe','release'])if(!value.jdkFiles[name])fail();
 return Object.freeze(value);
}

export function validateExecutionReceipt(value,{binding,reservationSha256,publicTools}={}){
 closed(value,['schema','operationId','reservationSha256','bindingSha256','sourceHead','executionHead','platform','architecture','publicToolsReceiptSha256','jdkArchiveSha256','javaSha256','keytoolSha256','apksignerJarSha256','syntheticQualificationSha256','unsignedSha256','signedSha256','pendingSha256','signerCertificateSha256','attempt','signatureVerified','temporaryCustodyRemoved','secretBuffersCleared','alignmentVerified']);
 if(value.schema!=='st253-android-local-signing-execution-v1'||!operationId(value.operationId)||!head(value.sourceHead)||!head(value.executionHead)||value.platform!=='win32'||value.architecture!=='x64'||value.jdkArchiveSha256!==LOCAL_JDK_SHA256||value.apksignerJarSha256!==LOCAL_JAR_SHA256||value.attempt!==1||value.signatureVerified!==true||value.temporaryCustodyRemoved!==true||value.secretBuffersCleared!==true||value.alignmentVerified!==false)fail();
 for(const key of ['reservationSha256','bindingSha256','publicToolsReceiptSha256','javaSha256','keytoolSha256','syntheticQualificationSha256','unsignedSha256','signedSha256','pendingSha256','signerCertificateSha256'])if(!hash(value[key]))fail();
 if(value.unsignedSha256===value.signedSha256)fail();
 if(binding){for(const key of ['sourceHead','executionHead','publicToolsReceiptSha256','unsignedSha256','signerCertificateSha256'])if(value[key]!==binding[key])fail();if(value.bindingSha256!==digest(jsonBytes(binding)))fail();}
 if(reservationSha256&&value.reservationSha256!==reservationSha256)fail();
 if(publicTools){validatePublicToolsRecord(publicTools,value.publicToolsReceiptSha256);if(value.javaSha256!==publicTools.jdkFiles['bin/java.exe'].sha256||value.keytoolSha256!==publicTools.jdkFiles['bin/keytool.exe'].sha256)fail();}
 return Object.freeze({...value});
}

export function validatePublicQualification(value,publicTools){
 closed(value,['schema','platform','architecture','publicToolsReceiptSha256','jdkArchiveSha256','javaSha256','keytoolSha256','apksignerJarSha256','unsignedSha256','signedSha256','syntheticCertificateSha256','signatureVerified','temporaryCustodyRemoved']);
 if(value.schema!=='st253-android-local-public-qualification-v1'||value.platform!=='win32'||value.architecture!=='x64'||value.jdkArchiveSha256!==LOCAL_JDK_SHA256||value.apksignerJarSha256!==LOCAL_JAR_SHA256||value.signatureVerified!==true||value.temporaryCustodyRemoved!==true||value.unsignedSha256===value.signedSha256)fail();
 for(const key of ['publicToolsReceiptSha256','javaSha256','keytoolSha256','unsignedSha256','signedSha256','syntheticCertificateSha256'])if(!hash(value[key]))fail();
 validatePublicToolsRecord(publicTools,value.publicToolsReceiptSha256);
 if(value.javaSha256!==publicTools.jdkFiles['bin/java.exe'].sha256||value.keytoolSha256!==publicTools.jdkFiles['bin/keytool.exe'].sha256)fail();return Object.freeze({...value});
}

export function buildSignedHistory(manifest,certificate,signedSha256){
 validateManifest(manifest,'apk');
 const value={schema:'st250-android-signed-history-v2',signerCertificateSha256:certificate,versionCode:manifest.versionCode,sourceHead:manifest.sourceHead,unsignedSha256:manifest.unsignedSha256,signedSha256,apkRun:manifest.runId,runtimeEnabled:true,embeddedConfigSha256:manifest.embeddedConfigSha256,hermesSha256:manifest.hermesSha256};
 if(manifest.runtimeEnabled!==true)fail();return validateRunSignedHistory(value,manifest,certificate,signedSha256,manifest.runId);
}

function bindVerifiedReceipt(receipt,binding,execution){
 validateReceipt(receipt,true);
 for(const key of ['sourceHead','unsignedSha256','versionCode','embeddedConfigSha256','hermesSha256','signerCertificateSha256'])if(receipt[key]!==binding[key])fail();
 if(receipt.runtimeEnabled!==true||receipt.signedSha256!==execution.signedSha256)fail();
}
function pendingMetadata(bytes,receipt){
 const value=canonical(bytes,v=>v);closed(value,['schema','sourceHead','signerCertificateSha256','unsignedSha256','signedSha256','bytes','runtimeEnabled','embeddedConfigSha256','hermesSha256']);
 if(value.schema!=='st250-android-signed-pending-v2')fail();
 for(const key of Object.keys(value).filter(key=>key!=='schema'))if(value[key]!==receipt[key])fail();return value;
}

/** A trusted operator observation of an independently executed Ubuntu job.
 * This envelope is explicitly NOT a GitHub-signed attestation. */
export function createVerifierObservation({binding,execution,reservationSha256,verificationToolingHead,run,jobs,log,release,pendingBytes,now=Date.now()}){
 validateExecutionReceipt(execution,{binding,reservationSha256});
 if(!head(verificationToolingHead)||!run||!positive(run.id)||!positive(run.run_attempt)||!positive(run.workflow_id)||run.repository?.full_name!==LOCAL_REPOSITORY||run.path!==VERIFICATION_WORKFLOW||run.event!=='workflow_dispatch'||run.head_sha!==verificationToolingHead||run.head_branch!=='st/native-synthetic-bank'||run.status!=='completed'||run.conclusion!=='success'||!Array.isArray(jobs)||jobs.length>100)fail();
 const selected=jobs.filter(job=>job.name==='signed-return-verification');if(selected.length!==1)fail();const job=selected[0];
 if(!positive(job.id)||job.run_id!==run.id||job.head_sha!==verificationToolingHead||job.status!=='completed'||job.conclusion!=='success'||!Array.isArray(job.labels)||!job.labels.includes('ubuntu-24.04'))fail();
 const step=job.steps?.filter(row=>row.name==='Actual signed manifest Hermes certificate and cleanup receipt');if(step?.length!==1||step[0].status!=='completed'||step[0].conclusion!=='success')fail();
 if(!Buffer.isBuffer(log)||log.length<1||log.length>8388608||!log.equals(Buffer.from(log.toString('utf8'))))fail();
 const lines=log.toString('utf8').split(/\r?\n/).map(line=>line.replace(/^\d{4}-\d\d-\d\dT[^ ]+Z /,'').trim());
 const receiptLines=lines.filter(line=>line.startsWith('{"schemaVersion":2,'));if(receiptLines.length!==1)fail();
 const receipt=canonical(Buffer.from(receiptLines[0]),v=>validateReceipt(v,true));bindVerifiedReceipt(receipt,binding,execution);
 const unique=prefix=>[...new Set(lines.filter(line=>line.startsWith(prefix)).map(line=>line.slice(prefix.length)))];
 const transfers=unique('ST250_UNSIGNED_TRANSFER_RECEIPT: '),releases=unique('ST250_SIGNED_RETURN_RELEASE_ID: '),sources=unique('ST250_SOURCE_HEAD: '),toolings=unique('ST250_VERIFICATION_TOOLING_HEAD: '),certificates=unique('ST250_SIGNER_CERTIFICATE_SHA256: '),modes=unique('ST250_DELIVERY_MODE: ');
 if(transfers.length!==1||releases.length!==1||sources.length!==1||sources[0]!==binding.sourceHead||toolings.length!==1||toolings[0]!==verificationToolingHead||certificates.length!==1||certificates[0]!==binding.signerCertificateSha256||modes.length!==1||modes[0]!=='verify-signed'||!id(releases[0]))fail();
 const transfer=canonical(Buffer.from(transfers[0]),v=>validateTransfer(v,'apk'));if(digest(Buffer.from(transfers[0]))!==binding.apkReceiptSha256||transfer.sourceHead!==binding.sourceHead||transfer.runId!==binding.apkRun||transfer.unsignedSha256!==binding.unsignedSha256)fail();
 const signedNames=names('signed',binding.sourceHead);
 if(!release||release.id!==Number(releases[0])||!positive(release.id)||release.draft!==true||release.prerelease!==true||release.published_at!==null||release.target_commitish!==transfer.defaultTargetHead||release.tag_name!==tag('signed',binding.sourceHead,binding.apkRun)||!Array.isArray(release.assets)||release.assets.length!==2||!Number.isFinite(now)||!Number.isFinite(Date.parse(release.created_at))||Date.parse(release.created_at)>now+60000||now-Date.parse(release.created_at)>7*86400000)fail();
 const assets=signedNames.map((name,index)=>{const matches=release.assets.filter(asset=>asset.name===name);if(matches.length!==1)fail();const asset=matches[0],bytes=index===0?receipt.bytes:pendingBytes?.length,sha256=index===0?execution.signedSha256:execution.pendingSha256,contentType=index===0?'application/vnd.android.package-archive':'application/json';if(!positive(asset.id)||asset.state!=='uploaded'||asset.content_type!==contentType||asset.size!==bytes||asset.digest!==`sha256:${sha256}`)fail();return {id:asset.id,name,bytes,sha256,contentType};});
 if(digest(pendingBytes)!==execution.pendingSha256)fail();pendingMetadata(pendingBytes,receipt);
 return validateVerifierObservation({schema:'st253-android-ubuntu-verification-observation-v1',trust:'source-bound-trusted-operator-observation',repository:LOCAL_REPOSITORY,workflowPath:VERIFICATION_WORKFLOW,workflowId:run.workflow_id,verificationToolingHead,runId:String(run.id),attempt:run.run_attempt,jobId:String(job.id),jobLogSha256:digest(log),reservationSha256,bindingSha256:digest(jsonBytes(binding)),executionReceiptSha256:digest(jsonBytes(execution)),releaseId:release.id,releaseTag:release.tag_name,defaultTargetHead:release.target_commitish,assets,receipt},{binding,execution,reservationSha256});
}

export function validateVerifierObservation(value,{binding,execution,reservationSha256}){
 closed(value,['schema','trust','repository','workflowPath','workflowId','verificationToolingHead','runId','attempt','jobId','jobLogSha256','reservationSha256','bindingSha256','executionReceiptSha256','releaseId','releaseTag','defaultTargetHead','assets','receipt']);
 if(value.schema!=='st253-android-ubuntu-verification-observation-v1'||value.trust!=='source-bound-trusted-operator-observation'||value.repository!==LOCAL_REPOSITORY||value.workflowPath!==VERIFICATION_WORKFLOW||!positive(value.workflowId)||!head(value.verificationToolingHead)||!id(value.runId)||!positive(value.attempt)||!id(value.jobId)||!hash(value.jobLogSha256)||value.reservationSha256!==reservationSha256||value.bindingSha256!==digest(jsonBytes(binding))||value.executionReceiptSha256!==digest(jsonBytes(execution))||!positive(value.releaseId)||value.releaseTag!==tag('signed',binding.sourceHead,binding.apkRun)||!head(value.defaultTargetHead)||!Array.isArray(value.assets)||value.assets.length!==2)fail();
 bindVerifiedReceipt(value.receipt,binding,execution);
 const expectedNames=names('signed',binding.sourceHead);for(const [index,asset]of value.assets.entries()){closed(asset,['id','name','bytes','sha256','contentType']);if(!positive(asset.id)||asset.name!==expectedNames[index]||!positive(asset.bytes)||asset.bytes>(index===0?209715200:16384)||asset.sha256!==(index===0?execution.signedSha256:execution.pendingSha256)||asset.contentType!==(index===0?'application/vnd.android.package-archive':'application/json'))fail();}if(value.assets[0].bytes!==value.receipt.bytes||value.assets[0].id===value.assets[1].id)fail();
 return Object.freeze({...value});
}

/** This additionally performs the original byte/runtime predicate, never just metadata. */
export function validateLocalSignedBytes({pending,manifest,certificate,signed,unsigned}){return validateSignedPending(pending,manifest,certificate,signed,unsigned);}

function localRegular(file,max){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.resolve(file)!==file)fail();
 let current=file;while(current!==path.dirname(current)){if(fs.lstatSync(current).isSymbolicLink()||fs.realpathSync(current)!==current)fail();current=path.dirname(current);}
 const before=fs.lstatSync(file,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size<1n||before.size>BigInt(max))fail();
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const opened=fs.fstatSync(fd,{bigint:true}),data=fs.readFileSync(fd),after=fs.fstatSync(fd,{bigint:true}),last=fs.lstatSync(file,{bigint:true});for(const key of ['dev','ino','size','mtimeNs','ctimeNs','mode','nlink','uid','gid','birthtimeNs']){if(before[key]!==last[key]||opened[key]!==after[key]||key!=='ctimeNs'&&before[key]!==opened[key]||process.platform!=='win32'&&key==='ctimeNs'&&before[key]!==opened[key])fail();}if(data.length!==Number(before.size))fail();return data;}finally{fs.closeSync(fd);}
}
function localJson(file,max=65536){const raw=localRegular(file,max);if(!raw.equals(Buffer.from(raw.toString('utf8'))))fail();const value=JSON.parse(raw);if(!raw.equals(jsonBytes(value)))fail();return value;}
function desktopWorkspace(request){
 if(process.platform!=='win32'||['NODE_OPTIONS','NODE_PATH','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','CLASSPATH'].some(key=>process.env[key]!==undefined)||!operationId(request.operationId)||!hash(request.reservationSha256)||typeof request.primaryCheckout!=='string'||!path.isAbsolute(request.primaryCheckout)||path.resolve(request.primaryCheckout)!==request.primaryCheckout||/[\\/]\.codex[\\/]worktrees[\\/]/i.test(request.primaryCheckout))fail();
 const project=JSON.parse(localRegular(path.join(request.primaryCheckout,'package.json'),65536));if(project.name!=='subtrack'||project.private!==true)fail();
 const directory=path.join(request.primaryCheckout,'.codex-local-task-setup','android-local-signing',request.operationId);let current=directory;while(current!==path.dirname(current)){const state=fs.lstatSync(current);if(!state.isDirectory()||state.isSymbolicLink()||fs.realpathSync(current)!==current)fail();current=path.dirname(current);}
 const execution=localJson(path.join(directory,'execution.json'));validateExecutionReceipt(execution,{binding:request.binding,reservationSha256:request.reservationSha256});if(execution.operationId!==request.operationId)fail();
 return {directory,execution};
}
export function runDesktopGithub(args,{input,max=1048576,absence=false}={},execute=spawnSync,environment=process.env){
 if(environment.GH_HOST!==undefined&&environment.GH_HOST!=='github.com'||!Array.isArray(args)||args[0]!=='api'||typeof args[1]!=='string'||!(args[1].startsWith(`repos/${LOCAL_REPOSITORY}/`)||args[1].startsWith(`https://uploads.github.com/repos/${LOCAL_REPOSITORY}/releases/`))||args[1].includes('..'))fail();
 const result=execute('gh',['api','--hostname','github.com',...args.slice(1)],{input,encoding:null,timeout:60000,killSignal:'SIGKILL',maxBuffer:max,windowsHide:true,env:{...environment,GH_HOST:'github.com'}});
 if(result.error||result.signal||!Buffer.isBuffer(result.stdout)||result.stdout.length>max||!Buffer.isBuffer(result.stderr)||result.stderr.length>65536)fail();if(absence){if(result.status!==0&&/\(HTTP 404\)/.test(result.stderr.toString('utf8')))return {status:404};fail();}if(result.status!==0)fail();return result.stdout;
}
const gh=(args,options)=>runDesktopGithub(args,options);
const api=(endpoint,port)=>JSON.parse(port(['api',`repos/${LOCAL_REPOSITORY}/${endpoint}`]).toString('utf8'));
export async function observeUbuntuFromGithub(request,{github=gh,workspace=desktopWorkspace,read=localRegular,write=(file,value)=>fs.writeFileSync(file,jsonBytes(value),{flag:'wx',mode:384})}={}){
 closed(request,['schema','primaryCheckout','operationId','binding','reservationSha256','verificationRun','verificationToolingHead','signedReleaseId']);
 if(request.schema!=='st253-android-local-observe-request-v1'||!positive(request.verificationRun)||!head(request.verificationToolingHead)||!positive(request.signedReleaseId))fail();
 const {directory,execution}=workspace(request),run=api(`actions/runs/${request.verificationRun}`,github);if(run.id!==request.verificationRun||!positive(run.run_attempt))fail();const response=api(`actions/runs/${request.verificationRun}/attempts/${run.run_attempt}/jobs?per_page=100`,github);
 if(response.total_count!==response.jobs?.length||response.jobs.length>100)fail();const selected=response.jobs.filter(job=>job.name==='signed-return-verification');if(selected.length!==1||!positive(selected[0].id))fail();
 const log=github(['api',`repos/${LOCAL_REPOSITORY}/actions/jobs/${selected[0].id}/logs`],{max:8388608});
 try{const release=api(`releases/${request.signedReleaseId}`,github),pendingAsset=release.assets?.filter(asset=>asset.name===names('signed',request.binding.sourceHead)[1]);if(pendingAsset?.length!==1||!positive(pendingAsset[0].id))fail();const pendingBytes=github(['api',`repos/${LOCAL_REPOSITORY}/releases/assets/${pendingAsset[0].id}`,'--header','Accept: application/octet-stream'],{max:16384});
  const value=createVerifierObservation({binding:request.binding,execution,reservationSha256:request.reservationSha256,verificationToolingHead:request.verificationToolingHead,run,jobs:response.jobs,log,release,pendingBytes});
  const again=createVerifierObservation({binding:request.binding,execution,reservationSha256:request.reservationSha256,verificationToolingHead:request.verificationToolingHead,run,jobs:response.jobs,log,release:api(`releases/${request.signedReleaseId}`,github),pendingBytes});if(!sameJson(again,value)||!read(path.join(directory,'signed-pending.json'),16384).equals(pendingBytes))fail();write(path.join(directory,'verification.json'),value);return value;
 }finally{log.fill(0);}
}
export async function returnLocalDraft(request,{github=gh,workspace=desktopWorkspace,read=localRegular,exists=file=>{try{fs.lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}},write=(file,value)=>fs.writeFileSync(file,jsonBytes(value),{flag:'wx',mode:384})}={}){
 closed(request,['schema','primaryCheckout','operationId','binding','reservationSha256']);if(request.schema!=='st253-android-local-return-request-v1')fail();const {directory,execution}=workspace(request),unsignedDir=path.join(request.primaryCheckout,'.codex-local-task-setup','android-transfer',`apk-${request.binding.apkRun}`),manifestBytes=read(path.join(unsignedDir,'manifest.json'),16384),transferBytes=read(path.join(unsignedDir,'receipt.json'),16384),manifest=canonical(manifestBytes,v=>validateManifest(v,'apk')),transfer=canonical(transferBytes,v=>validateTransfer(v,'apk'));
 if(digest(manifestBytes)!==request.binding.apkManifestSha256||digest(transferBytes)!==request.binding.apkReceiptSha256)fail();
 const unsigned=read(path.join(unsignedDir,'unsigned.apk'),209715200),signed=read(path.join(directory,'signed.apk'),209715200),pendingBytes=read(path.join(directory,'signed-pending.json'),16384);bind(manifest,transfer,unsigned,manifestBytes,'apk');validateLocalSignedBytes({pending:canonical(pendingBytes,v=>v),manifest,certificate:request.binding.signerCertificateSha256,signed,unsigned});if(digest(signed)!==execution.signedSha256||digest(pendingBytes)!==execution.pendingSha256)fail();
 const releaseTag=tag('signed',request.binding.sourceHead,request.binding.apkRun);if(exists(path.join(directory,'return-claim.json'))||exists(path.join(directory,'return.json')))fail();
 let complete=false;for(let page=1;page<=10;page++){const releases=api(`releases?per_page=100&page=${page}`,github);if(!Array.isArray(releases)||releases.length>100||releases.some(value=>value?.tag_name===releaseTag))fail();if(releases.length<100){complete=true;break;}}if(!complete)fail();
 // The observer port returns status explicitly; a generic failed GET is never absence.
 for(const endpoint of [`releases/tags/${releaseTag}`,`git/ref/tags/${releaseTag}`]){const result=github(['api',`repos/${LOCAL_REPOSITORY}/${endpoint}`],{absence:true});if(result?.status!==404)fail();}
 const release=JSON.parse(github(['api',`repos/${LOCAL_REPOSITORY}/releases`,'--method','POST','--input','-'],{input:jsonBytes({tag_name:releaseTag,target_commitish:transfer.defaultTargetHead,draft:true,prerelease:true,make_latest:'false',name:releaseTag,body:'Private Windows-signed testing candidate; Ubuntu manifest and alignment verification pending; never publish.'})}).toString('utf8'));
 if(!positive(release.id)||release.tag_name!==releaseTag||release.target_commitish!==transfer.defaultTargetHead||release.draft!==true||release.prerelease!==true||release.published_at!==null||!Array.isArray(release.assets)||release.assets.length!==0)fail();
 write(path.join(directory,'return-claim.json'),{schema:'st253-android-local-return-claim-v1',operationId:request.operationId,releaseId:release.id,releaseTag,defaultTargetHead:transfer.defaultTargetHead,executionReceiptSha256:digest(jsonBytes(execution))});
 const content=[signed,pendingBytes],media=['application/vnd.android.package-archive','application/json'],assetNames=names('signed',request.binding.sourceHead);
 for(let index=0;index<2;index++)github(['api',`https://uploads.github.com/repos/${LOCAL_REPOSITORY}/releases/${release.id}/assets?name=${encodeURIComponent(assetNames[index])}`,'--method','POST','--header',`Content-Type: ${media[index]}`,'--input','-'],{input:content[index]});
 const observed=api(`releases/${release.id}`,github);if(observed.id!==release.id||observed.tag_name!==releaseTag||observed.target_commitish!==transfer.defaultTargetHead||observed.draft!==true||observed.prerelease!==true||observed.published_at!==null||observed.assets?.length!==2)fail();
 const assets=assetNames.map((name,index)=>{const matches=observed.assets.filter(asset=>asset.name===name);if(matches.length!==1)fail();const asset=matches[0];if(!positive(asset.id)||asset.state!=='uploaded'||asset.content_type!==media[index]||asset.size!==content[index].length||asset.digest!==`sha256:${digest(content[index])}`)fail();return {id:asset.id,name,bytes:asset.size,sha256:digest(content[index]),contentType:media[index]};});
 const result={schema:'st253-android-local-return-v1',operationId:request.operationId,bindingSha256:digest(jsonBytes(request.binding)),executionReceiptSha256:digest(jsonBytes(execution)),releaseId:release.id,releaseTag,defaultTargetHead:transfer.defaultTargetHead,assets,manifestVerified:false,alignmentVerified:false,remoteCustody:'draft-retained'};write(path.join(directory,'return.json'),result);return result;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{const [verb,...args]=process.argv.slice(2);let result;if(verb==='public-tools'&&args.length===2){const value=localJson(path.resolve(args[0]),262144);validatePublicToolsRecord(value,args[1]);result={schema:'st253-android-local-validation-v1',kind:verb,valid:true,sha256:args[1]};}else if(verb==='qualification'&&args.length===2){const value=localJson(path.resolve(args[0])),tools=localJson(path.resolve(args[1]),262144);validatePublicQualification(value,tools);result={schema:'st253-android-local-validation-v1',kind:verb,valid:true,sha256:digest(jsonBytes(value))};}else if(verb==='execution'&&args.length===3){const value=localJson(path.resolve(args[0])),observation=localJson(path.resolve(args[1])),publicTools=localJson(path.resolve(args[2]),262144);validateExecutionReceipt(value,{binding:observation.binding,reservationSha256:observation.reservationSha256,publicTools});result={schema:'st253-android-local-validation-v1',kind:verb,valid:true,sha256:digest(jsonBytes(value))};}else if(verb==='return-local'&&args.length===1)result=await returnLocalDraft(localJson(path.resolve(args[0])));else if(verb==='observe-ubuntu'&&args.length===1)result=await observeUbuntuFromGithub(localJson(path.resolve(args[0])));else fail();console.log(JSON.stringify(result));}catch{console.error('ST253_ANDROID_LOCAL_RECEIPT_UNAVAILABLE');process.exitCode=1;}
}
