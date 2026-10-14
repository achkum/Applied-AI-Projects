import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, unlinkSync, openSync, closeSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const JDK_IMAGE = 'eclipse-temurin@sha256:8d242405506ad1085e39f1ca80ec76f0812f61073efe76129607e39f043ccbb9';
export const SDK_URL = 'https://dl.google.com/android/repository/build-tools_r36_linux.zip';
export const SDK_SHA256 = '5d9ac77fb6ff43d9da518a337b4fcf8f9097113df531d99ccefe80ef7ce8250b';
const unavailable = () => { throw Error('ST250_ANDROID_TRANSFER_UNAVAILABLE'); };
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const head = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const bounded = (x, max) => Number.isSafeInteger(x) && x > 0 && x <= max;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function closed(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== fields.length) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (fields.some(key => !descriptors[key] || !('value' in descriptors[key]) || descriptors[key].enumerable !== true)) unavailable();
  return value;
}
const common = ['schema','sourceHead','runId','defaultTargetHead','draftTag'];
const apkFields = [...common,'unsignedSha256','bytes','applicationId','versionCode','variant','origin','buildType','debuggable','privateCaIncluded','hermesBundled','runtimeEnabled','zipAligned','buildScriptSha256','receiptModuleSha256'];
const toolFields = [...common,'imageId','baseImage','dockerfileSha256','sdkArchiveSha256','apksignerJarSha256','zipalignSha256','archiveSha256','rawTarSha256','archiveBytes','rawTarBytes','runtimeUid','runtimeGid','buildToolsVersion','toolsQualified'];
const apkReceiptFields = [...common,'releaseId','draft','unsignedSha256','bytes','applicationId','apkAssetId','manifestSha256','manifestBytes','manifestAssetId','manifestSchema','unsignedQualified','uploadVerified','localCleanupConfirmed','remoteCustody'];
const toolReceiptFields = [...common,'releaseId','draft','imageId','archiveSha256','archiveBytes','archiveAssetId','manifestSha256','manifestBytes','manifestAssetId','manifestSchema','toolsQualified','uploadVerified','localCleanupConfirmed','remoteCustody'];
export function validateBackupBinding(v) {
  closed(v,['schema','signerCertificateSha256','ciphertextSha256','ciphertextBytes','protection','backupGeneration','decryptVerified','signingRestoreVerified','temporaryCustodyRemoved','backupConfirmed']);
  if(v.schema!=='st250-android-signer-backup-v1'||!sha(v.signerCertificateSha256)||!sha(v.ciphertextSha256)||!bounded(v.ciphertextBytes,131072)||v.protection!=='windows-dpapi-current-user'||v.backupGeneration!==1||v.decryptVerified!==true||v.signingRestoreVerified!==true||v.temporaryCustodyRemoved!==true||v.backupConfirmed!==true)unavailable();
  return Object.freeze({...v});
}
export function validateSignerIdentity(v) {
  closed(v,['schema','signerCertificateSha256','imageId','sourceHead','alias','storeType','keyAlgorithm','generation']);
  if(v.schema!=='st250-android-signer-identity-v1'||!sha(v.signerCertificateSha256)||!/^sha256:[a-f0-9]{64}$/.test(v.imageId)||!head(v.sourceHead)||v.alias!=='subtrack-sandbox'||v.storeType!=='PKCS12'||v.keyAlgorithm!=='RSA3072'||v.generation!==1)unavailable();
  return Object.freeze({...v});
}
export function assertSignedUpdate(manifest,certificate,history) {
  validateManifest(manifest,'apk');if(!sha(certificate))unavailable();
  if(history===null)return true;
  closed(history,['schema','signerCertificateSha256','versionCode','sourceHead','unsignedSha256','signedSha256','apkRun','runtimeEnabled']);
  if(history.schema!=='st250-android-signed-history-v1'||history.signerCertificateSha256!==certificate||!head(history.sourceHead)||!sha(history.unsignedSha256)||!sha(history.signedSha256)||!bounded(history.versionCode,2147483647)||!/^[1-9][0-9]*-[1-9][0-9]*$/.test(history.apkRun)||history.runtimeEnabled!==false)unavailable();
  if(manifest.versionCode<history.versionCode||(manifest.versionCode===history.versionCode&&(manifest.sourceHead!==history.sourceHead||manifest.unsignedSha256!==history.unsignedSha256)))unavailable();
  return true;
}
export function names(kind, sourceHead) {
  if (!head(sourceHead) || !['apk','tools','signed'].includes(kind)) unavailable();
  return kind === 'tools' ? [`subtrack-sandbox-signing-tools-${sourceHead}.tar.gz`, `st250-android-tools-${sourceHead}.json`] :
    kind === 'signed' ? [`subtrack-sandbox-signed-${sourceHead}.apk`, `st250-android-signed-${sourceHead}.json`] :
      [`subtrack-sandbox-unsigned-${sourceHead}.apk`, `st250-android-transfer-${sourceHead}.json`];
}
export function tag(kind, sourceHead, runId) {
  if (!['apk','tools','signed'].includes(kind) || !head(sourceHead) || !/^[1-9][0-9]*-[1-9][0-9]*$/.test(runId)) unavailable();
  return `st250-android-${kind === 'apk' ? '' : `${kind}-`}stage-${sourceHead}-${runId}`;
}
function base(v, kind) {
  if (!head(v.sourceHead) || !head(v.defaultTargetHead) || v.draftTag !== tag(kind,v.sourceHead,v.runId)) unavailable();
}
export function validateManifest(v, kind) {
  if (!['apk','tools'].includes(kind)) unavailable();
  closed(v,kind === 'apk' ? apkFields : toolFields); base(v,kind);
  if (kind === 'apk') {
    if (v.schema !== 'st250-android-transfer-manifest-v1' || !sha(v.unsignedSha256) || !bounded(v.bytes,200*1024*1024) ||
      v.applicationId !== 'se.subtrack.app.sandbox' || !bounded(v.versionCode,2147483647) || v.variant !== 'sandbox' ||
      v.origin !== 'https://198.44.116.159' || v.buildType !== 'release' || v.debuggable !== false || v.privateCaIncluded !== false ||
      v.hermesBundled !== true || v.runtimeEnabled !== false || v.zipAligned !== true || !sha(v.buildScriptSha256) || !sha(v.receiptModuleSha256)) unavailable();
  } else if (v.schema !== 'st250-android-tools-manifest-v1' || !/^sha256:[a-f0-9]{64}$/.test(v.imageId) || v.baseImage !== JDK_IMAGE ||
    !sha(v.dockerfileSha256) || v.sdkArchiveSha256 !== SDK_SHA256 || !sha(v.apksignerJarSha256) || !sha(v.zipalignSha256) ||
    !sha(v.archiveSha256) || !sha(v.rawTarSha256) || !bounded(v.archiveBytes,1073741824) || !bounded(v.rawTarBytes,2147483648) ||
    v.runtimeUid !== 996 || v.runtimeGid !== 996 || v.buildToolsVersion !== '36.0.0' || v.toolsQualified !== true) unavailable();
  return Object.freeze({...v});
}
export function validateTransfer(v, kind) {
  if(!['apk','tools'].includes(kind))unavailable();
  closed(v,kind === 'apk' ? apkReceiptFields : toolReceiptFields); base(v,kind);
  const tools = kind === 'tools';
  if (v.schema !== (tools ? 'st250-android-tools-draft-transfer-receipt-v1' : 'st250-android-draft-transfer-receipt-v1') ||
    !bounded(v.releaseId,Number.MAX_SAFE_INTEGER) || v.draft !== true || !sha(v.manifestSha256) || !bounded(v.manifestBytes,16384) ||
    !bounded(v.manifestAssetId,Number.MAX_SAFE_INTEGER) || v.uploadVerified !== true || v.localCleanupConfirmed !== true || v.remoteCustody !== 'draft-retained' ||
    v.manifestSchema !== (tools ? 'st250-android-tools-manifest-v1' : 'st250-android-transfer-manifest-v1')) unavailable();
  if (tools ? (!/^sha256:[a-f0-9]{64}$/.test(v.imageId) || !sha(v.archiveSha256) || !bounded(v.archiveBytes,1073741824) || !bounded(v.archiveAssetId,Number.MAX_SAFE_INTEGER) || v.toolsQualified !== true) :
    (!sha(v.unsignedSha256) || !bounded(v.bytes,200*1024*1024) || v.applicationId !== 'se.subtrack.app.sandbox' || !bounded(v.apkAssetId,Number.MAX_SAFE_INTEGER) || v.unsignedQualified !== true)) unavailable();
  return Object.freeze({...v});
}
export function closeTransferCandidate(v,kind) {
  closed(v,kind==='tools'?toolReceiptFields:apkReceiptFields);
  if(v.schema!==(kind==='tools'?'st250-android-tools-upload-candidate-v1':'st250-android-upload-candidate-v1')||v.localCleanupConfirmed!==false)unavailable();
  return validateTransfer({...v,schema:kind==='tools'?'st250-android-tools-draft-transfer-receipt-v1':'st250-android-draft-transfer-receipt-v1',localCleanupConfirmed:true},kind);
}
export function canonical(bytes, validator) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 16384) unavailable();
  const text = bytes.toString('utf8'); const value = JSON.parse(text);
  if (JSON.stringify(value) !== text) unavailable();
  return validator(value);
}
export function bind(manifest, receipt, payload, manifestBytes, kind) {
  validateManifest(manifest,kind); validateTransfer(receipt,kind);
  const hashField = kind === 'tools' ? 'archiveSha256' : 'unsignedSha256', sizeField = kind === 'tools' ? 'archiveBytes' : 'bytes';
  for (const field of ['sourceHead','runId','defaultTargetHead','draftTag',hashField,sizeField]) if (manifest[field] !== receipt[field]) unavailable();
  if (kind === 'tools' && manifest.imageId !== receipt.imageId) unavailable();
  if (digest(payload) !== manifest[hashField] || payload.length !== manifest[sizeField] || digest(manifestBytes) !== receipt.manifestSha256 || manifestBytes.length !== receipt.manifestBytes) unavailable();
  return true;
}
export function validateRemote(release, manifest, receipt, kind, allowExpired=false) {
  validateManifest(manifest,kind); validateTransfer(receipt,kind);
  const assetNames = names(kind,manifest.sourceHead), hash = kind === 'tools' ? receipt.archiveSha256 : receipt.unsignedSha256;
  const bytes = kind === 'tools' ? receipt.archiveBytes : receipt.bytes, id = kind === 'tools' ? receipt.archiveAssetId : receipt.apkAssetId;
  if (release.id !== receipt.releaseId || release.draft !== true || release.prerelease !== true || release.tag_name !== manifest.draftTag || release.target_commitish !== manifest.defaultTargetHead ||
    !Array.isArray(release.assets) || release.assets.length !== 2 || typeof release.created_at !== 'string' || !Number.isFinite(Date.parse(release.created_at)) ||
    (!allowExpired && Date.now()-Date.parse(release.created_at) > 7*86400000) || Date.parse(release.created_at) > Date.now()+60000) unavailable();
  for (const [index,assetId,assetSha,assetBytes] of [[0,id,hash,bytes],[1,receipt.manifestAssetId,receipt.manifestSha256,receipt.manifestBytes]]) {
    const asset = release.assets.find(a=>a.id===assetId);
    if (!asset || asset.name!==assetNames[index] || asset.state!=='uploaded' || asset.size!==assetBytes || asset.digest!==`sha256:${assetSha}` ||
      asset.content_type!==(index===1?'application/json':kind==='tools'?'application/gzip':'application/vnd.android.package-archive')) unavailable();
  }
  return true;
}
function runGh(args, input) {
  const env = {...process.env}; if (env.GITHUB_TOKEN) env.GH_TOKEN=env.GITHUB_TOKEN;
  const result = spawnSync('gh',args,{encoding:'utf8',input,env,maxBuffer:1024*1024,timeout:60000});
  if (result.status!==0) unavailable();
  return result.stdout;
}
function api(endpoint, method='GET', body) {
  const args=['api','--hostname','github.com',endpoint,'--method',method];
  if (body) args.push('--input','-');
  const output=runGh(args,body?JSON.stringify(body):undefined);return output.trim()?JSON.parse(output):null;
}
const repo='repos/achkum/Applied-AI-Projects';
export function readRegular(file,max) {
  const stat=lstatSync(file); if(!stat.isFile()||stat.isSymbolicLink()||!bounded(stat.size,max))unavailable();
  return readFileSync(file);
}
export function inspectToolTar(bytes, manifest) {
  validateManifest(manifest,'tools');
  if (!Buffer.isBuffer(bytes) || bytes.length!==manifest.rawTarBytes || digest(bytes)!==manifest.rawTarSha256) unavailable();
  const files=new Map();let offset=0;
  while(offset+512<=bytes.length) {
    const header=bytes.subarray(offset,offset+512);if(header.every(b=>b===0))break;
    const name=header.subarray(0,100).toString('utf8').split('\0')[0],prefix=header.subarray(345,500).toString('utf8').split('\0')[0];
    const full=prefix?`${prefix}/${name}`:name,size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,''),8),type=header[156];
    const checksum=parseInt(header.subarray(148,156).toString('ascii').replace(/\0.*$/,''),8),observedChecksum=header.reduce((sum,b,index)=>sum+(index>=148&&index<156?32:b),0);
    if(checksum!==observedChecksum||!Number.isSafeInteger(size)||size<0||offset+512+size>bytes.length||! /^[a-zA-Z0-9._/-]+$/.test(full)||full.startsWith('/')||full.split('/').includes('..')||files.has(full)||![0,48,53].includes(type)||files.size>128)unavailable();
    if(type!==53)files.set(full,bytes.subarray(offset+512,offset+512+size));
    offset+=512+Math.ceil(size/512)*512;
  }
  if(!bytes.subarray(offset).every(b=>b===0))unavailable();
  const entries=JSON.parse(files.get('manifest.json')?.toString('utf8')??'null');
  if(!Array.isArray(entries)||entries.length!==1||entries[0].RepoTags?.length||!Array.isArray(entries[0].Layers)||entries[0].Layers.length<1)unavailable();
  const configBytes=files.get(entries[0].Config);if(!configBytes||`sha256:${digest(configBytes)}`!==manifest.imageId)unavailable();
  const config=JSON.parse(configBytes.toString('utf8'));
  if((config.config?.Env??[]).some(value=>/(?:token|password|secret|credential|private.?key|ssh_auth_sock)/i.test(value.split('=')[0])))unavailable();
  if(config.os!=='linux'||config.architecture!=='amd64'||config.config?.User!=='996:996'||JSON.stringify(config.config?.Entrypoint)!=='["/opt/android/build-tools/36.0.0/apksigner"]'||config.config?.Labels?.['se.subtrack.android.source']!==manifest.sourceHead||config.config?.Labels?.['se.subtrack.android.run']!==manifest.runId||config.rootfs?.diff_ids?.length!==entries[0].Layers.length)unavailable();
  for(const [index,name]of entries[0].Layers.entries()){
    const layer=files.get(name);if(!layer)unavailable();
    const raw=layer[0]===31&&layer[1]===139?gunzipSync(layer,{maxOutputLength:512*1024*1024}):layer;
    if(`sha256:${digest(raw)}`!==config.rootfs.diff_ids[index])unavailable();
  }
  // Export only one tool image: reject unrelated object members outside its layers/config.
  const allowed=new Set(['manifest.json','repositories',entries[0].Config,...entries[0].Layers]);
  if(files.has('index.json')||files.has('oci-layout')){
    const layout=JSON.parse(files.get('oci-layout')?.toString('utf8')??'null'),index=JSON.parse(files.get('index.json')?.toString('utf8')??'null');
    if(layout?.imageLayoutVersion!=='1.0.0'||index?.schemaVersion!==2||index.manifests?.length!==1)unavailable();
    const descriptor=index.manifests[0];
    if(!/^sha256:[a-f0-9]{64}$/.test(descriptor.digest)||descriptor.annotations?.['org.opencontainers.image.ref.name']||descriptor.annotations?.['io.containerd.image.name'])unavailable();
    const name=`blobs/sha256/${descriptor.digest.slice(7)}`,blob=files.get(name);if(!blob||blob.length!==descriptor.size||`sha256:${digest(blob)}`!==descriptor.digest)unavailable();
    const oci=JSON.parse(blob.toString('utf8'));
    if(oci.schemaVersion!==2||oci.config?.digest!==manifest.imageId||entries[0].Config!==`blobs/sha256/${manifest.imageId.slice(7)}`||oci.config.size!==configBytes.length||oci.layers?.length!==entries[0].Layers.length)unavailable();
    for(const [i,layer]of oci.layers.entries()){const name=`blobs/sha256/${layer.digest?.slice(7)}`,blob=files.get(name);if(!/^sha256:[a-f0-9]{64}$/.test(layer.digest)||name!==entries[0].Layers[i]||!blob||blob.length!==layer.size||`sha256:${digest(blob)}`!==layer.digest)unavailable();}
    allowed.add('index.json');allowed.add('oci-layout');allowed.add(name);
  }
  if(files.has('repositories')&&JSON.stringify(JSON.parse(files.get('repositories').toString('utf8')))!=='{}')unavailable();
  for(const name of files.keys())if(!allowed.has(name)&&!entries[0].Layers.some(layer=>name===layer.replace(/layer\.tar$/,'json')||name===layer.replace(/layer\.tar$/,'VERSION')))unavailable();
  return true;
}
function downloadAsset(assetId, file, maximum) {
  if(!bounded(assetId,Number.MAX_SAFE_INTEGER)||existsSync(file))unavailable();
  const fd=openSync(file,'wx',0o600),env={...process.env};if(env.GITHUB_TOKEN)env.GH_TOKEN=env.GITHUB_TOKEN;
  try {const result=spawnSync('gh',['api',`${repo}/releases/assets/${assetId}`,'--header','Accept: application/octet-stream'],{stdio:['ignore',fd,'pipe'],env,timeout:600000,maxBuffer:1024*1024});if(result.status!==0)unavailable();} finally{closeSync(fd);}
  readRegular(file,maximum);
}
function download(kind,receiptFile,dir) {
  const receipt=canonical(readRegular(receiptFile,16384),v=>validateTransfer(v,kind)),release=api(`${repo}/releases/${receipt.releaseId}`),assetNames=names(kind,receipt.sourceHead);
  if(!lstatSync(dir).isDirectory()||lstatSync(dir).isSymbolicLink())unavailable();
  downloadAsset(receipt.manifestAssetId,path.join(dir,'manifest.json'),16384);
  const mb=readRegular(path.join(dir,'manifest.json'),16384),manifest=canonical(mb,v=>validateManifest(v,kind));
  validateRemote(release,manifest,receipt,kind);
  const id=kind==='tools'?receipt.archiveAssetId:receipt.apkAssetId,payloadName=kind==='tools'?'tools-image.tar.gz':'unsigned.apk';
  downloadAsset(id,path.join(dir,payloadName),kind==='tools'?1073741824:200*1024*1024);
  bind(manifest,receipt,readRegular(path.join(dir,payloadName),kind==='tools'?1073741824:200*1024*1024),mb,kind);
  validateRemote(api(`${repo}/releases/${receipt.releaseId}`),manifest,receipt,kind);
  writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt),{flag:'wx',mode:0o600});
}
function receiveSigned(receiptFile,releaseId,certificate,dir) {
  if(!bounded(Number(releaseId),Number.MAX_SAFE_INTEGER)||!sha(certificate))unavailable();
  const receipt=canonical(readRegular(receiptFile,16384),v=>validateTransfer(v,'apk'));
  download('apk',receiptFile,dir);
  const release=api(`${repo}/releases/${releaseId}`),assetNames=names('signed',receipt.sourceHead);
  if(release.id!==Number(releaseId)||release.draft!==true||release.prerelease!==true||release.tag_name!==tag('signed',receipt.sourceHead,receipt.runId)||release.target_commitish!==receipt.defaultTargetHead||release.assets?.length!==2||!Number.isFinite(Date.parse(release.created_at))||Date.parse(release.created_at)>Date.now()+60000||Date.now()-Date.parse(release.created_at)>7*86400000)unavailable();
  for(const [i,name]of assetNames.entries()) {
    const asset=release.assets.find(a=>a.name===name);if(!asset||asset.state!=='uploaded'||asset.content_type!==(i===0?'application/vnd.android.package-archive':'application/json')||!/^sha256:[a-f0-9]{64}$/.test(asset.digest)||!bounded(asset.size,i===0?200*1024*1024:16384))unavailable();
    const file=path.join(dir,i===0?'signed.apk':'signed-pending.json');downloadAsset(asset.id,file,i===0?200*1024*1024:16384);
    const bytes=readRegular(file,i===0?200*1024*1024:16384);if(bytes.length!==asset.size||`sha256:${digest(bytes)}`!==asset.digest)unavailable();
  }
  const pending=canonical(readRegular(path.join(dir,'signed-pending.json'),16384),v=>closed(v,['schema','sourceHead','signerCertificateSha256','unsignedSha256','signedSha256','bytes','runtimeEnabled'])),signed=readRegular(path.join(dir,'signed.apk'),200*1024*1024);
  if(pending.schema!=='st250-android-signed-pending-v1'||pending.sourceHead!==receipt.sourceHead||pending.signerCertificateSha256!==certificate||pending.unsignedSha256!==receipt.unsignedSha256||pending.signedSha256!==digest(signed)||pending.bytes!==signed.length||pending.runtimeEnabled!==false)unavailable();
  const again=api(`${repo}/releases/${releaseId}`);if(JSON.stringify(again.assets)!==JSON.stringify(release.assets)||again.id!==release.id||again.draft!==true||again.prerelease!==true||again.tag_name!==release.tag_name||again.target_commitish!==release.target_commitish)unavailable();
}
function dispose(kind,receiptFile) {
  const receipt=canonical(readRegular(receiptFile,16384),v=>validateTransfer(v,kind)),release=api(`${repo}/releases/${receipt.releaseId}`);
  const mb=Buffer.from(runGh(['api',`${repo}/releases/assets/${receipt.manifestAssetId}`,'--header','Accept: application/octet-stream']),'utf8'),manifest=canonical(mb,v=>validateManifest(v,kind));
  // Disposal may occur after seven days; exact ownership remains required then.
  validateRemote(release,manifest,receipt,kind,true);
  if(digest(mb)!==receipt.manifestSha256||mb.length!==receipt.manifestBytes)unavailable();
  api(`${repo}/releases/${receipt.releaseId}`,'DELETE');
  const absent=spawnSync('gh',['api',`${repo}/releases/${receipt.releaseId}`],{encoding:'utf8',env:{...process.env,...(process.env.GITHUB_TOKEN?{GH_TOKEN:process.env.GITHUB_TOKEN}:{})},timeout:60000});
  if(absent.status===0||!absent.stderr.includes('HTTP 404'))unavailable();
  console.log('ST250_ANDROID_OWNED_DRAFT_REMOVED');
}
// Only publisher modes mutate remote custody; ordinary validators have no effects.
function publish(kind,payloadFile,candidateFile,outputFile) {
  if(!['apk','tools'].includes(kind)||process.env.GITHUB_REPOSITORY!=='achkum/Applied-AI-Projects'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_REF!=='refs/heads/st/native-synthetic-bank'||process.env.ST250_FREE_DRAFT_CONFIRMED!=='true')unavailable();
  const sourceHead=process.env.ST250_SOURCE_HEAD,runId=`${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  if(sourceHead!==process.env.GITHUB_SHA)unavailable();
  const checkout=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});if(checkout.status!==0||checkout.stdout.trim()!==sourceHead)unavailable();
  const ownerDir=path.dirname(path.resolve(payloadFile));
  if(path.dirname(path.resolve(candidateFile))!==ownerDir||path.dirname(path.resolve(outputFile))!==ownerDir)unavailable();
  const payload=readRegular(payloadFile,kind==='tools'?1073741824:200*1024*1024),candidate=JSON.parse(readRegular(candidateFile,16384));
  const repository=api(repo),branch=api(`${repo}/commits/${encodeURIComponent(repository.default_branch)}`),defaultTargetHead=branch.sha;
  const baseFields={sourceHead,runId,defaultTargetHead,draftTag:tag(kind,sourceHead,runId)};
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  let manifest;
  if(kind==='apk') {
    closed(candidate,['schemaVersion','sourceHead','unsignedSha256','applicationId','versionCode','variant','origin','buildType','debuggable','privateCaIncluded','hermesBundled','runtimeEnabled','bytes','signatureVerified','zipAligned']);
    if(candidate.sourceHead!==sourceHead||candidate.signatureVerified!==false||candidate.unsignedSha256!==digest(payload)||candidate.bytes!==payload.length)unavailable();
    const {schemaVersion,signatureVerified,...values}=candidate;
    manifest={schema:'st250-android-transfer-manifest-v1',...values,...baseFields,buildScriptSha256:digest(readFileSync(path.join(root,'tools/sandbox/build-android.sh'))),receiptModuleSha256:digest(readFileSync(path.join(root,'tools/sandbox/android-release-receipt.mjs')))};
  } else {if(candidate.dockerfileSha256!==digest(readFileSync(path.join(root,'infra/sandbox/Dockerfile.android-signing'))))unavailable();manifest={...candidate,...baseFields};}
  validateManifest(manifest,kind);
  const hashField=kind==='tools'?'archiveSha256':'unsignedSha256',sizeField=kind==='tools'?'archiveBytes':'bytes';
  if(manifest[hashField]!==digest(payload)||manifest[sizeField]!==payload.length)unavailable();
  const assetNames=names(kind,sourceHead);if(path.basename(payloadFile)!==assetNames[0])unavailable();
  const manifestFile=path.join(ownerDir,assetNames[1]),manifestBytes=Buffer.from(JSON.stringify(manifest));
  writeFileSync(manifestFile,manifestBytes,{flag:'wx',mode:0o600});
  // Collision cannot be overwritten, and default head is rechecked after upload.
  const existing=spawnSync('gh',['api',`${repo}/releases/tags/${manifest.draftTag}`],{encoding:'utf8',env:{...process.env,GH_TOKEN:process.env.GITHUB_TOKEN},timeout:60000});
  if(existing.status===0||!existing.stderr.includes('HTTP 404'))unavailable();
  const existingTag=spawnSync('gh',['api',`${repo}/git/ref/tags/${manifest.draftTag}`],{encoding:'utf8',env:{...process.env,GH_TOKEN:process.env.GITHUB_TOKEN},timeout:60000});
  if(existingTag.status===0||!existingTag.stderr.includes('HTTP 404'))unavailable();
  let release;
  try {
    release=api(`${repo}/releases`,'POST',{tag_name:manifest.draftTag,target_commitish:defaultTargetHead,name:manifest.draftTag,body:`Private Android ${kind} staging. sourceHead=${sourceHead}; retention<=7days; never publish.`,draft:true,prerelease:true,make_latest:'false'});
    if(!bounded(release.id,Number.MAX_SAFE_INTEGER)||release.draft!==true||release.tag_name!==manifest.draftTag)unavailable();
    const token=process.env.GITHUB_TOKEN; if(!token)unavailable();
    // Single native binary POST per asset: no gh release upload's implicit retry loop.
    for(const [index,file]of[payloadFile,manifestFile].entries()) {
      runGh(['api',`https://uploads.github.com/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetNames[index])}`,'--method','POST','--header',`Content-Type: ${index===1?'application/json':kind==='tools'?'application/gzip':'application/vnd.android.package-archive'}`,'--input',file]);
    }
    const observed=api(`${repo}/releases/${release.id}`);
    const receipt={schema:kind==='tools'?'st250-android-tools-draft-transfer-receipt-v1':'st250-android-draft-transfer-receipt-v1',...baseFields,releaseId:release.id,draft:true,
      ...(kind==='tools'?{imageId:manifest.imageId,archiveSha256:manifest.archiveSha256,archiveBytes:manifest.archiveBytes,archiveAssetId:observed.assets.find(a=>a.name===assetNames[0])?.id}:{unsignedSha256:manifest.unsignedSha256,bytes:manifest.bytes,applicationId:manifest.applicationId,apkAssetId:observed.assets.find(a=>a.name===assetNames[0])?.id}),
      manifestSha256:digest(manifestBytes),manifestBytes:manifestBytes.length,manifestAssetId:observed.assets.find(a=>a.name===assetNames[1])?.id,manifestSchema:manifest.schema,
      ...(kind==='tools'?{toolsQualified:true}:{unsignedQualified:true}),uploadVerified:true,localCleanupConfirmed:true,remoteCustody:'draft-retained'};
    validateRemote(observed,manifest,receipt,kind);bind(manifest,receipt,payload,manifestBytes,kind);
    if(api(`${repo}/commits/${encodeURIComponent(repository.default_branch)}`).sha!==defaultTargetHead)unavailable();
    // Candidate/payload/upload manifest belong exclusively to this publisher.
    for(const file of [payloadFile,candidateFile,manifestFile])unlinkSync(file);
    // Parent still owns logs/output; only its successful directory removal can close this.
    const candidate={...receipt,schema:kind==='tools'?'st250-android-tools-upload-candidate-v1':'st250-android-upload-candidate-v1',localCleanupConfirmed:false};
    closeTransferCandidate(candidate,kind);
    writeFileSync(outputFile,JSON.stringify(candidate),{flag:'wx',mode:0o600});
  } catch {
    if(release?.id) {
      const observed=api(`${repo}/releases/${release.id}`);
      if(observed.draft!==true||observed.tag_name!==baseFields.draftTag||observed.target_commitish!==defaultTargetHead)unavailable();
      api(`${repo}/releases/${release.id}`,'DELETE');
    }
    unavailable();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [mode,...args]=process.argv.slice(2);
    if(mode==='validate'&&args.length===2)console.log(JSON.stringify(canonical(readRegular(args[1],16384),v=>validateManifest(v,args[0]))));
    else if(mode==='publish'&&args.length===4)publish(args[0],args[1],args[2],args[3]);
    else if(mode==='pins'&&args.length===0)console.log(JSON.stringify({jdk:JDK_IMAGE,sdkUrl:SDK_URL,sdkSha256:SDK_SHA256}));
    else if(mode==='download'&&args.length===3)download(args[0],args[1],args[2]);
    else if(mode==='receive-signed'&&args.length===4)receiveSigned(args[0],args[1],args[2],args[3]);
    else if(mode==='inspect-tools-tar'&&args.length===2)inspectToolTar(readRegular(args[0],2147483648),canonical(readRegular(args[1],16384),v=>validateManifest(v,'tools')));
    else if(mode==='close-transfer'&&args.length===1){let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>16384)unavailable();}console.log(JSON.stringify(closeTransferCandidate(JSON.parse(text),args[0])));}
    else if(mode==='validate-backup'&&args.length===1)canonical(readRegular(args[0],16384),validateBackupBinding);
    else if(mode==='validate-identity'&&args.length===1)canonical(readRegular(args[0],16384),validateSignerIdentity);
    else if(mode==='dispose'&&args.length===2)dispose(args[0],args[1]);
    else unavailable();
  } catch {process.stderr.write('ST250_ANDROID_TRANSFER_UNAVAILABLE\n');process.exitCode=1;}
}
