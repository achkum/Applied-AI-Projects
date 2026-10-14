import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, unlinkSync, openSync, closeSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync, inflateRawSync } from 'node:zlib';
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

export function dataField(value,key){const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):undefined;return d&&'value'in d?d.value:undefined;}
export function crc32(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
/** Read selected native bytes from a bounded APK, never from a metadata sidecar. */
export function apkAssets(apk){
 if(!Buffer.isBuffer(apk)||!bounded(apk.length,200*1024*1024))unavailable();
 let end=-1;for(let p=apk.length-22;p>=Math.max(0,apk.length-65557);p--)if(apk.readUInt32LE(p)===0x06054b50&&p+22+apk.readUInt16LE(p+20)===apk.length){end=p;break;}
 if(end<0||apk.readUInt16LE(end+4)!==0||apk.readUInt16LE(end+6)!==0)unavailable();
 const count=apk.readUInt16LE(end+10),size=apk.readUInt32LE(end+12),start=apk.readUInt32LE(end+16);if(!bounded(count,4096)||count!==apk.readUInt16LE(end+8)||size>1048576||start+size!==end)unavailable();
 const entries=new Map(),ranges=[];let p=start;
 for(let i=0;i<count;i++){
  if(p+46>end||apk.readUInt32LE(p)!==0x02014b50)unavailable();
  const flags=apk.readUInt16LE(p+8),method=apk.readUInt16LE(p+10),crc=apk.readUInt32LE(p+16),compressed=apk.readUInt32LE(p+20),plain=apk.readUInt32LE(p+24),nl=apk.readUInt16LE(p+28),el=apk.readUInt16LE(p+30),cl=apk.readUInt16LE(p+32),offset=apk.readUInt32LE(p+42);
  if(flags&~0x808||![0,8].includes(method)||apk.readUInt16LE(p+34)!==0||compressed===0xffffffff||plain===0xffffffff||offset===0xffffffff||p+46+nl+el+cl>end||plain>200*1024*1024)unavailable();
  const nameBytes=apk.subarray(p+46,p+46+nl),name=nameBytes.toString('utf8');if(!nameBytes.equals(Buffer.from(name))||!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||entries.has(name))unavailable();
  const extras=apk.subarray(p+46+nl,p+46+nl+el);for(let x=0;x<extras.length;){if(x+4>extras.length)unavailable();const id=extras.readUInt16LE(x),n=extras.readUInt16LE(x+2);if(id===1||id===0x9901||x+4+n>extras.length)unavailable();x+=4+n;}
  if(offset+30>start||apk.readUInt32LE(offset)!==0x04034b50||apk.readUInt16LE(offset+6)!==flags||apk.readUInt16LE(offset+8)!==method)unavailable();
  const ln=apk.readUInt16LE(offset+26),le=apk.readUInt16LE(offset+28),data=offset+30+ln+le;if(data+compressed>start||!apk.subarray(offset+30,offset+30+ln).equals(nameBytes))unavailable();
  let stop=data+compressed;
  if(flags&8){let d=stop;if(d+4>start)unavailable();if(apk.readUInt32LE(d)===0x08074b50)d+=4;if(d+12>start||apk.readUInt32LE(d)!==crc||apk.readUInt32LE(d+4)!==compressed||apk.readUInt32LE(d+8)!==plain)unavailable();stop=d+12;}
  else if(apk.readUInt32LE(offset+14)!==crc||apk.readUInt32LE(offset+18)!==compressed||apk.readUInt32LE(offset+22)!==plain)unavailable();
  if(ranges.some(([a,b])=>offset<b&&stop>a))unavailable();ranges.push([offset,stop]);entries.set(name,{data,compressed,plain,crc,method});p+=46+nl+el+cl;
 }
 if(p!==end)unavailable();
 const selected={};for(const [name,key,max]of [['assets/app.config','config',1048576],['assets/index.android.bundle','hermes',200*1024*1024],['AndroidManifest.xml','manifest',1048576]]){const e=entries.get(name);if(!e||!bounded(e.plain,max))unavailable();const raw=apk.subarray(e.data,e.data+e.compressed),bytes=e.method===0?Buffer.from(raw):inflateRawSync(raw,{maxOutputLength:max});if(bytes.length!==e.plain||crc32(bytes)!==e.crc)unavailable();selected[key]=bytes;}
 return selected;
}
export function inspectApkRuntime(apk,versionCode,runtimeEnabled){const assets=apkAssets(apk);if(!bounded(versionCode,2147483647)||!assets.hermes.subarray(0,8).equals(Buffer.from('c61fbc03c103191f','hex')))unavailable();const text=assets.config.toString('utf8');if(!assets.config.equals(Buffer.from(text)))unavailable();const config=JSON.parse(text);if(JSON.stringify(config)!==text)unavailable();const marker=closed(config?.extra?.subtrackSandbox,['variant','apiBaseUrl','runtimeEnabled','publicationEnabled','privateDiagnosticsEnabled']);if(marker.variant!=='sandbox'||marker.apiBaseUrl!=='https://198.44.116.159'||marker.runtimeEnabled!==runtimeEnabled||![true,false].includes(runtimeEnabled)||marker.publicationEnabled!==false||marker.privateDiagnosticsEnabled!==false||config.android?.package!=='se.subtrack.app.sandbox'||(config.android?.versionCode!==versionCode&&!(runtimeEnabled===false&&config.android?.versionCode===undefined&&versionCode===1))||config.ios?.bundleIdentifier!=='se.subtrack.app.sandbox')unavailable();return {embeddedConfigSha256:digest(assets.config),hermesSha256:digest(assets.hermes)};}
export function inspectActiveApk(apk,versionCode){return inspectApkRuntime(apk,versionCode,true);}
export function validateSignedPending(v,manifest,certificate,signed,unsigned){validateManifest(manifest,'apk');const active=manifest.runtimeEnabled===true;closed(v,['schema','sourceHead','signerCertificateSha256','unsignedSha256','signedSha256','bytes','runtimeEnabled',...(active?['embeddedConfigSha256','hermesSha256']:[])]);if(v.schema!==(active?'st250-android-signed-pending-v2':'st250-android-signed-pending-v1')||v.sourceHead!==manifest.sourceHead||v.signerCertificateSha256!==certificate||v.unsignedSha256!==manifest.unsignedSha256||v.signedSha256!==digest(signed)||v.bytes!==signed.length||v.runtimeEnabled!==active)unavailable();if(active){const a=inspectActiveApk(signed,manifest.versionCode),u=inspectActiveApk(unsigned,manifest.versionCode);for(const k of ['embeddedConfigSha256','hermesSha256'])if(v[k]!==manifest[k]||a[k]!==manifest[k]||u[k]!==manifest[k])unavailable();if(!apkAssets(signed).manifest.equals(apkAssets(unsigned).manifest))unavailable();}return Object.freeze({...v});}

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
  const priorActive=dataField(history,'schema')==='st250-android-signed-history-v2';closed(history,['schema','signerCertificateSha256','versionCode','sourceHead','unsignedSha256','signedSha256','apkRun','runtimeEnabled',...(priorActive?['embeddedConfigSha256','hermesSha256']:[])]);
  if(history.schema!==(priorActive?'st250-android-signed-history-v2':'st250-android-signed-history-v1')||history.signerCertificateSha256!==certificate||!head(history.sourceHead)||!sha(history.unsignedSha256)||!sha(history.signedSha256)||!bounded(history.versionCode,2147483647)||!/^[1-9][0-9]*-[1-9][0-9]*$/.test(history.apkRun)||history.runtimeEnabled!==priorActive||(priorActive&&(!sha(history.embeddedConfigSha256)||!sha(history.hermesSha256))))unavailable();
  if(manifest.runtimeEnabled===true&&manifest.versionCode<=history.versionCode)unavailable();
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
  const active=kind==='apk'&&dataField(v,'schema')==='st250-android-transfer-manifest-v2';closed(v,kind === 'apk' ? [...apkFields,...(active?['embeddedConfigSha256','hermesSha256']:[])] : toolFields); base(v,kind);
  if (kind === 'apk') {
    if (v.schema !== (active?'st250-android-transfer-manifest-v2':'st250-android-transfer-manifest-v1') || !sha(v.unsignedSha256) || !bounded(v.bytes,200*1024*1024) ||
      v.applicationId !== 'se.subtrack.app.sandbox' || !bounded(v.versionCode,2147483647) || v.variant !== 'sandbox' ||
      v.origin !== 'https://198.44.116.159' || v.buildType !== 'release' || v.debuggable !== false || v.privateCaIncluded !== false ||
      v.hermesBundled !== true || v.runtimeEnabled !== active || (active&&(!sha(v.embeddedConfigSha256)||!sha(v.hermesSha256))) || v.zipAligned !== true || !sha(v.buildScriptSha256) || !sha(v.receiptModuleSha256)) unavailable();
  } else if (v.schema !== 'st250-android-tools-manifest-v1' || !/^sha256:[a-f0-9]{64}$/.test(v.imageId) || v.baseImage !== JDK_IMAGE ||
    !sha(v.dockerfileSha256) || v.sdkArchiveSha256 !== SDK_SHA256 || !sha(v.apksignerJarSha256) || !sha(v.zipalignSha256) ||
    !sha(v.archiveSha256) || !sha(v.rawTarSha256) || !bounded(v.archiveBytes,1073741824) || !bounded(v.rawTarBytes,2147483648) ||
    v.runtimeUid !== 996 || v.runtimeGid !== 996 || v.buildToolsVersion !== '36.0.0' || v.toolsQualified !== true) unavailable();
  return Object.freeze({...v});
}
export function validateTransfer(v, kind) {
  if(!['apk','tools'].includes(kind))unavailable();
  closed(v,kind === 'apk' ? apkReceiptFields : toolReceiptFields); base(v,kind);
  const tools = kind === 'tools', active=!tools&&dataField(v,'schema')==='st250-android-draft-transfer-receipt-v2';
  if (v.schema !== (tools ? 'st250-android-tools-draft-transfer-receipt-v1' : active?'st250-android-draft-transfer-receipt-v2':'st250-android-draft-transfer-receipt-v1') ||
    !bounded(v.releaseId,Number.MAX_SAFE_INTEGER) || v.draft !== true || !sha(v.manifestSha256) || !bounded(v.manifestBytes,16384) ||
    !bounded(v.manifestAssetId,Number.MAX_SAFE_INTEGER) || v.uploadVerified !== true || v.localCleanupConfirmed !== true || v.remoteCustody !== 'draft-retained' ||
    v.manifestSchema !== (tools ? 'st250-android-tools-manifest-v1' : active?'st250-android-transfer-manifest-v2':'st250-android-transfer-manifest-v1')) unavailable();
  if (tools ? (!/^sha256:[a-f0-9]{64}$/.test(v.imageId) || !sha(v.archiveSha256) || !bounded(v.archiveBytes,1073741824) || !bounded(v.archiveAssetId,Number.MAX_SAFE_INTEGER) || v.toolsQualified !== true) :
    (!sha(v.unsignedSha256) || !bounded(v.bytes,200*1024*1024) || v.applicationId !== 'se.subtrack.app.sandbox' || !bounded(v.apkAssetId,Number.MAX_SAFE_INTEGER) || v.unsignedQualified !== true)) unavailable();
  return Object.freeze({...v});
}
export function closeTransferCandidate(v,kind) {
  closed(v,kind==='tools'?toolReceiptFields:apkReceiptFields);
  const active=kind==='apk'&&dataField(v,'schema')==='st250-android-upload-candidate-v2';if(v.schema!==(kind==='tools'?'st250-android-tools-upload-candidate-v1':active?'st250-android-upload-candidate-v2':'st250-android-upload-candidate-v1')||v.localCleanupConfirmed!==false)unavailable();
  return validateTransfer({...v,schema:kind==='tools'?'st250-android-tools-draft-transfer-receipt-v1':active?'st250-android-draft-transfer-receipt-v2':'st250-android-draft-transfer-receipt-v1',localCleanupConfirmed:true},kind);
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
  if(receipt.manifestSchema!==manifest.schema)unavailable();if(kind==='apk'&&manifest.runtimeEnabled===true){const measured=inspectActiveApk(payload,manifest.versionCode);for(const k of ['embeddedConfigSha256','hermesSha256'])if(measured[k]!==manifest[k])unavailable();}return true;
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
const toolFailures=new WeakMap();
export function toolsArchiveDiagnostic(error){return toolFailures.get(error)??null;}
function inspectToolsBoundary(action){
  let step='INPUT_RAW',category='IO';
  const checkpoint=(next,kind='ASSERTION')=>{step=next;category=kind;};
  try{return action(checkpoint);}catch{
    const error=Error('ST250_ANDROID_TRANSFER_UNAVAILABLE');
    toolFailures.set(error,`ST250_ANDROID_TOOLS_DIAGNOSTIC operation=INSPECT_TOOLS_TAR step=${step} category=${category}`);
    throw error;
  }
}
export function inspectToolTarFiles(rawFile,manifestFile){return inspectToolsBoundary(checkpoint=>{
  const bytes=readRegular(rawFile,2147483648);
  checkpoint('INPUT_MANIFEST','IO');const input=readRegular(manifestFile,16384);
  checkpoint('INPUT_MANIFEST','JSON');const manifest=canonical(input,v=>v);
  return inspectToolTarBody(bytes,manifest,checkpoint);
});}
export function inspectToolTar(bytes,manifest){return inspectToolsBoundary(checkpoint=>inspectToolTarBody(bytes,manifest,checkpoint));}
function inspectToolTarBody(bytes, manifest, checkpoint) {
  checkpoint('MANIFEST_FIELDS');
  validateManifest(manifest,'tools');
  checkpoint('RAW_BINDING');
  if (!Buffer.isBuffer(bytes) || bytes.length!==manifest.rawTarBytes || digest(bytes)!==manifest.rawTarSha256) unavailable();
  const files=new Map();let offset=0;
  while(offset+512<=bytes.length) {
    checkpoint('TAR_HEADER');
    const header=bytes.subarray(offset,offset+512);if(header.every(b=>b===0))break;
    const name=header.subarray(0,100).toString('utf8').split('\0')[0],prefix=header.subarray(345,500).toString('utf8').split('\0')[0];
    const full=prefix?`${prefix}/${name}`:name,size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,''),8),type=header[156];
    const checksum=parseInt(header.subarray(148,156).toString('ascii').replace(/\0.*$/,''),8),observedChecksum=header.reduce((sum,b,index)=>sum+(index>=148&&index<156?32:b),0);
    if(checksum!==observedChecksum||!Number.isSafeInteger(size)||size<0||offset+512+size>bytes.length||! /^[a-zA-Z0-9._/-]+$/.test(full)||full.startsWith('/')||full.split('/').includes('..')||files.has(full)||![0,48,53].includes(type)||files.size>128)unavailable();
    if(type!==53)files.set(full,bytes.subarray(offset+512,offset+512+size));
    offset+=512+Math.ceil(size/512)*512;
  }
  checkpoint('TAR_TRAILER');if(!bytes.subarray(offset).every(b=>b===0))unavailable();
  checkpoint('DOCKER_MANIFEST','JSON');
  const entries=JSON.parse(files.get('manifest.json')?.toString('utf8')??'null');
  checkpoint('DOCKER_MANIFEST');
  if(!Array.isArray(entries)||entries.length!==1||entries[0].RepoTags?.length||!Array.isArray(entries[0].Layers)||entries[0].Layers.length<1)unavailable();
  checkpoint('CONFIG_DIGEST');const configBytes=files.get(entries[0].Config);if(!configBytes||`sha256:${digest(configBytes)}`!==manifest.imageId)unavailable();
  checkpoint('CONFIG_POLICY','JSON');
  const config=JSON.parse(configBytes.toString('utf8'));
  checkpoint('CONFIG_POLICY');
  if((config.config?.Env??[]).some(value=>/(?:token|password|secret|credential|private.?key|ssh_auth_sock)/i.test(value.split('=')[0])))unavailable();
  if(config.os!=='linux'||config.architecture!=='amd64'||config.config?.User!=='996:996'||JSON.stringify(config.config?.Entrypoint)!=='["/opt/android/build-tools/36.0.0/apksigner"]'||config.config?.Labels?.['se.subtrack.android.source']!==manifest.sourceHead||config.config?.Labels?.['se.subtrack.android.run']!==manifest.runId)unavailable();
  checkpoint('ROOTFS');if(config.rootfs?.diff_ids?.length!==entries[0].Layers.length)unavailable();
  for(const [index,name]of entries[0].Layers.entries()){
    checkpoint('ROOTFS');
    const layer=files.get(name);if(!layer)unavailable();
    checkpoint('LAYER_DECOMPRESS','DECOMPRESSION');
    const raw=layer[0]===31&&layer[1]===139?gunzipSync(layer,{maxOutputLength:512*1024*1024}):layer;
    checkpoint('LAYER_DIFFID');
    if(`sha256:${digest(raw)}`!==config.rootfs.diff_ids[index])unavailable();
  }
  // Export only one tool image: reject unrelated object members outside its layers/config.
  const allowed=new Set(['manifest.json','repositories',entries[0].Config,...entries[0].Layers]);
  let verifiedIndex,verifiedOci,indexBytes;
  if(files.has('index.json')||files.has('oci-layout')){
    checkpoint('OCI_INDEX','JSON');
    const layout=JSON.parse(files.get('oci-layout')?.toString('utf8')??'null'),index=JSON.parse(files.get('index.json')?.toString('utf8')??'null');
    checkpoint('OCI_INDEX');
    if(layout?.imageLayoutVersion!=='1.0.0'||index?.schemaVersion!==2||index.manifests?.length!==1)unavailable();
    checkpoint('OCI_DESCRIPTOR');const descriptor=index.manifests[0];
    if(!/^sha256:[a-f0-9]{64}$/.test(descriptor.digest)||descriptor.annotations?.['org.opencontainers.image.ref.name']||descriptor.annotations?.['io.containerd.image.name'])unavailable();
    const name=`blobs/sha256/${descriptor.digest.slice(7)}`,blob=files.get(name);if(!blob||blob.length!==descriptor.size||`sha256:${digest(blob)}`!==descriptor.digest)unavailable();
    checkpoint('OCI_CONFIG','JSON');const oci=JSON.parse(blob.toString('utf8'));
    checkpoint('OCI_CONFIG');
    if(oci.schemaVersion!==2||oci.config?.digest!==manifest.imageId||entries[0].Config!==`blobs/sha256/${manifest.imageId.slice(7)}`||oci.config.size!==configBytes.length||oci.layers?.length!==entries[0].Layers.length)unavailable();
    checkpoint('OCI_LAYER');for(const [i,layer]of oci.layers.entries()){const name=`blobs/sha256/${layer.digest?.slice(7)}`,blob=files.get(name);if(!/^sha256:[a-f0-9]{64}$/.test(layer.digest)||name!==entries[0].Layers[i]||!blob||blob.length!==layer.size||`sha256:${digest(blob)}`!==layer.digest)unavailable();}
    allowed.add('index.json');allowed.add('oci-layout');allowed.add(name);
    verifiedIndex=index;verifiedOci=oci;indexBytes=files.get('index.json');
  }
  checkpoint('EXTRA_MEMBER','JSON');if(files.has('repositories')&&JSON.stringify(JSON.parse(files.get('repositories').toString('utf8')))!=='{}')unavailable();
  checkpoint('EXTRA_MEMBER');
  for(const name of files.keys())if(!allowed.has(name)&&!entries[0].Layers.some(layer=>name===layer.replace(/layer\.tar$/,'json')||name===layer.replace(/layer\.tar$/,'VERSION'))){checkpoint(extraToolMemberClass(name,files.get(name),verifiedIndex,verifiedOci,indexBytes));unavailable();}
  return true;
}
function extraToolMemberClass(name,bytes,index,oci,indexBytes){
  if(!/^blobs\/sha256\/[a-f0-9]{64}$/.test(name)||digest(bytes)!==name.slice(13))return 'EXTRA_OTHER';
  if(bytes.length>1048576)return 'EXTRA_BLOB_OPAQUE';
  let value;try{const text=bytes.toString('utf8');if(!bytes.equals(Buffer.from(text)))return 'EXTRA_BLOB_OPAQUE';value=JSON.parse(text);if(JSON.stringify(value)!==text)return 'EXTRA_BLOB_OPAQUE';}catch{return 'EXTRA_BLOB_OPAQUE';}
  if(!value||typeof value!=='object'||Array.isArray(value))return 'EXTRA_BLOB_OPAQUE';
  const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(object,k));
  if(value.schemaVersion===2&&Array.isArray(value.manifests)){
    if(indexBytes&&bytes.equals(indexBytes))return 'ROOT_INDEX_IDENTICAL_BYTES';
    const descriptor=value.manifests[0],existing=index?.manifests?.[0];
    const annotationKeys=object=>object===undefined||(object&&typeof object==='object'&&!Array.isArray(object)&&Object.entries(object).every(([key,v])=>typeof v==='string'&&(key==='org.opencontainers.image.ref.name'||key==='io.containerd.image.name'||key.startsWith('containerd.io/distribution.source.'))));
    const descriptorShape=d=>d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).every(k=>['mediaType','digest','size','platform','annotations'].includes(k))&&['mediaType','digest','size'].every(k=>Object.prototype.hasOwnProperty.call(d,k))&&annotationKeys(d.annotations);
    if(exact(value,['schemaVersion','mediaType','manifests'])&&value.manifests.length===1&&value.mediaType===index?.mediaType&&descriptorShape(descriptor)&&descriptorShape(existing)&&['mediaType','digest','size'].every(k=>descriptor[k]===existing[k])&&JSON.stringify(descriptor.platform)===JSON.stringify(existing.platform))return 'ROOT_INDEX_SAME_DESCRIPTOR';
    return 'EXTRA_BLOB_INDEX';
  }
  if(value.schemaVersion===2&&value.config&&Array.isArray(value.layers)){
    const descriptor=d=>exact(d,['mediaType','digest','size']);
    if(exact(value,['schemaVersion','mediaType','config','layers'])&&value.mediaType===oci?.mediaType&&descriptor(value.config)&&value.layers.every(descriptor)&&descriptor(oci?.config)&&oci.layers.every(descriptor)&&JSON.stringify(value.config)===JSON.stringify(oci.config)&&JSON.stringify(value.layers)===JSON.stringify(oci.layers))return 'MANIFEST_SAME_GRAPH';
    return 'EXTRA_BLOB_MANIFEST';
  }
  if(value.rootfs&&value.config&&typeof value.os==='string'&&typeof value.architecture==='string')return 'EXTRA_BLOB_CONFIG';
  return 'EXTRA_BLOB_OPAQUE';
}
function downloadAsset(assetId, file, maximum) {
  if(!bounded(assetId,Number.MAX_SAFE_INTEGER)||existsSync(file))unavailable();
  const fd=openSync(file,'wx',0o600),env={...process.env};if(env.GITHUB_TOKEN)env.GH_TOKEN=env.GITHUB_TOKEN;
  try {const result=spawnSync('gh',['api',`${repo}/releases/assets/${assetId}`,'--header','Accept: application/octet-stream'],{stdio:['ignore',fd,'pipe'],env,timeout:600000,maxBuffer:1024*1024});if(result.status!==0)unavailable();} finally{closeSync(fd);}
  readRegular(file,maximum);
}
function download(kind,receiptFile,dir) {
  const receipt=canonical(readRegular(receiptFile,16384),v=>validateTransfer(v,kind)),release=api(`${repo}/releases/${receipt.releaseId}`);names(kind,receipt.sourceHead);
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
  const pendingBytes=readRegular(path.join(dir,'signed-pending.json'),16384),signed=readRegular(path.join(dir,'signed.apk'),200*1024*1024),manifest=canonical(readRegular(path.join(dir,'manifest.json'),16384),v=>validateManifest(v,'apk'));canonical(pendingBytes,v=>validateSignedPending(v,manifest,certificate,signed,readRegular(path.join(dir,'unsigned.apk'),200*1024*1024)));
  if((process.env.SUBTRACK_SANDBOX_RUNTIME_ENABLED==='true')!==manifest.runtimeEnabled||(manifest.runtimeEnabled&&String(manifest.versionCode)!==process.env.SUBTRACK_SANDBOX_VERSION_CODE))unavailable();
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
    const active=dataField(candidate,'schemaVersion')===2;closed(candidate,['schemaVersion','sourceHead','unsignedSha256','applicationId','versionCode','variant','origin','buildType','debuggable','privateCaIncluded','hermesBundled','runtimeEnabled','bytes','signatureVerified','zipAligned',...(active?['embeddedConfigSha256','hermesSha256']:[])]);
    if(candidate.schemaVersion!==(active?2:1)||candidate.runtimeEnabled!==active||candidate.sourceHead!==sourceHead||candidate.signatureVerified!==false||candidate.unsignedSha256!==digest(payload)||candidate.bytes!==payload.length)unavailable();
    const values=Object.fromEntries(Object.entries(candidate).filter(([key])=>!['schemaVersion','signatureVerified'].includes(key)));
    manifest={schema:active?'st250-android-transfer-manifest-v2':'st250-android-transfer-manifest-v1',...values,...baseFields,buildScriptSha256:digest(readFileSync(path.join(root,'tools/sandbox/build-android.sh'))),receiptModuleSha256:digest(readFileSync(path.join(root,'tools/sandbox/android-release-receipt.mjs')))};
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
    const receipt={schema:kind==='tools'?'st250-android-tools-draft-transfer-receipt-v1':manifest.runtimeEnabled===true?'st250-android-draft-transfer-receipt-v2':'st250-android-draft-transfer-receipt-v1',...baseFields,releaseId:release.id,draft:true,
      ...(kind==='tools'?{imageId:manifest.imageId,archiveSha256:manifest.archiveSha256,archiveBytes:manifest.archiveBytes,archiveAssetId:observed.assets.find(a=>a.name===assetNames[0])?.id}:{unsignedSha256:manifest.unsignedSha256,bytes:manifest.bytes,applicationId:manifest.applicationId,apkAssetId:observed.assets.find(a=>a.name===assetNames[0])?.id}),
      manifestSha256:digest(manifestBytes),manifestBytes:manifestBytes.length,manifestAssetId:observed.assets.find(a=>a.name===assetNames[1])?.id,manifestSchema:manifest.schema,
      ...(kind==='tools'?{toolsQualified:true}:{unsignedQualified:true}),uploadVerified:true,localCleanupConfirmed:true,remoteCustody:'draft-retained'};
    validateRemote(observed,manifest,receipt,kind);bind(manifest,receipt,payload,manifestBytes,kind);
    if(api(`${repo}/commits/${encodeURIComponent(repository.default_branch)}`).sha!==defaultTargetHead)unavailable();
    // Candidate/payload/upload manifest belong exclusively to this publisher.
    for(const file of [payloadFile,candidateFile,manifestFile])unlinkSync(file);
    // Parent still owns logs/output; only its successful directory removal can close this.
    const candidate={...receipt,schema:kind==='tools'?'st250-android-tools-upload-candidate-v1':manifest.runtimeEnabled===true?'st250-android-upload-candidate-v2':'st250-android-upload-candidate-v1',localCleanupConfirmed:false};
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
    else if(mode==='validate-pending'&&args.length===5)validateSignedPending(canonical(readRegular(args[0],16384),v=>v),canonical(readRegular(args[1],16384),v=>validateManifest(v,'apk')),args[2],readRegular(args[3],200*1024*1024),readRegular(args[4],200*1024*1024));
    else if(mode==='pins'&&args.length===0)console.log(JSON.stringify({jdk:JDK_IMAGE,sdkUrl:SDK_URL,sdkSha256:SDK_SHA256}));
    else if(mode==='download'&&args.length===3)download(args[0],args[1],args[2]);
    else if(mode==='receive-signed'&&args.length===4)receiveSigned(args[0],args[1],args[2],args[3]);
    else if(mode==='inspect-tools-tar'&&args.length===2)inspectToolTarFiles(args[0],args[1]);
    else if(mode==='close-transfer'&&args.length===1){let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>16384)unavailable();}console.log(JSON.stringify(closeTransferCandidate(JSON.parse(text),args[0])));}
    else if(mode==='validate-backup'&&args.length===1)canonical(readRegular(args[0],16384),validateBackupBinding);
    else if(mode==='validate-identity'&&args.length===1)canonical(readRegular(args[0],16384),validateSignerIdentity);
    else if(mode==='dispose'&&args.length===2)dispose(args[0],args[1]);
    else unavailable();
  } catch(error) {const diagnostic=toolsArchiveDiagnostic(error);if(diagnostic)process.stderr.write(diagnostic+'\n');process.stderr.write('ST250_ANDROID_TRANSFER_UNAVAILABLE\n');process.exitCode=1;}
}
