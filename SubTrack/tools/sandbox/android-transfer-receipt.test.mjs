import {createRequire} from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync,crc32 as zipCrc,deflateRawSync } from 'node:zlib';
import { JDK_IMAGE,SDK_SHA256,digest,validateManifest,validateTransfer,bind,validateRemote,canonical,tag,inspectToolTar,toolsArchiveDiagnostic,closeTransferCandidate,validateBackupBinding,assertSignedUpdate,validateSignerIdentity,apkAssets,inspectActiveApk,validateSignedPending } from './android-transfer-receipt.mjs';

test('signed return labels preserve measured runtime and unverified testing candidate scope',()=>{
  const fs=createRequire(import.meta.url)('node:fs');
  const source=fs.readFileSync(new URL('./download-android.ps1',import.meta.url),'utf8');
  const start=source.indexOf("if($Mode -eq 'ReturnSigned'){");
  const end=source.indexOf('\n}catch{',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.ok(block.includes("body='Private signed testing candidate return; runtime measured; manifest unverified; retention <=7days; never publish.'"));
  assert.ok(block.includes('manifest=unverified runtime=measured'));
  assert.ok(block.includes("make_latest='false'"));
  assert.ok(block.includes('draft=$true;prerelease=$true'));
  assert.ok(!block.includes('runtime disabled'));
  assert.ok(!block.includes('runtime=disabled'));
});

function makeApk(runtime=false,version=1,options={}){
 const config={android:{package:'se.subtrack.app.sandbox',versionCode:version},ios:{bundleIdentifier:'se.subtrack.app.sandbox'},extra:{subtrackSandbox:{variant:'sandbox',apiBaseUrl:'https://198.44.116.159',runtimeEnabled:runtime,publicationEnabled:false,privateDiagnosticsEnabled:false,...options.marker}}},files=[['assets/app.config',Buffer.from(options.configText??JSON.stringify(config))],['assets/index.android.bundle',options.hermes??Buffer.from('c61fbc03c103191f00','hex')],['AndroidManifest.xml',options.binaryManifest??Buffer.from('public binary manifest unit bytes')],...(options.duplicate?[['assets/app.config',Buffer.from('{}')]]:[])],locals=[],central=[];let offset=0;
 for(const [name,data]of files){const n=Buffer.from(name),compressed=options.deflate?deflateRawSync(data):data,crc=zipCrc(data),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);if(options.descriptor)local.writeUInt16LE(8,6);local.writeUInt16LE(options.deflate?8:0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);if(options.descriptor)entry.writeUInt16LE(8,8);entry.writeUInt16LE(options.deflate?8:0,10);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);let descriptor=Buffer.alloc(0);if(options.descriptor){descriptor=Buffer.alloc(options.descriptor==='signature'?16:12);let d=0;if(descriptor.length===16){descriptor.writeUInt32LE(0x08074b50);d=4;}descriptor.writeUInt32LE(crc,d);descriptor.writeUInt32LE(compressed.length,d+4);descriptor.writeUInt32LE(data.length,d+8);local.writeUInt32LE(0,14);local.writeUInt32LE(0,18);local.writeUInt32LE(0,22);}locals.push(local,n,compressed,descriptor);central.push(entry,n);offset+=local.length+n.length+compressed.length+descriptor.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22),comment=Buffer.from(options.signed?'APK Sig Block 42':'');end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(comment.length,20);return Buffer.concat([...locals,cd,end,comment]);
}

const source='a'.repeat(40),run='1-1',payload=Buffer.from('unsigned synthetic APK fixture');
const apk=()=>({schema:'st250-android-transfer-manifest-v1',sourceHead:source,runId:run,defaultTargetHead:'b'.repeat(40),draftTag:tag('apk',source,run),unsignedSha256:digest(payload),bytes:payload.length,applicationId:'se.subtrack.app.sandbox',versionCode:1,variant:'sandbox',origin:'https://198.44.116.159',buildType:'release',debuggable:false,privateCaIncluded:false,hermesBundled:true,runtimeEnabled:false,zipAligned:true,buildScriptSha256:'c'.repeat(64),receiptModuleSha256:'d'.repeat(64)});
const tools=()=>({schema:'st250-android-tools-manifest-v1',sourceHead:source,runId:run,defaultTargetHead:'b'.repeat(40),draftTag:tag('tools',source,run),imageId:'sha256:'+'c'.repeat(64),baseImage:JDK_IMAGE,dockerfileSha256:'d'.repeat(64),sdkArchiveSha256:SDK_SHA256,apksignerJarSha256:'e'.repeat(64),zipalignSha256:'f'.repeat(64),archiveSha256:digest(payload),rawTarSha256:'a'.repeat(64),archiveBytes:payload.length,rawTarBytes:1024,runtimeUid:996,runtimeGid:996,buildToolsVersion:'36.0.0',toolsQualified:true});
const receipt=(manifest,kind)=>({schema:kind==='tools'?'st250-android-tools-draft-transfer-receipt-v1':'st250-android-draft-transfer-receipt-v1',sourceHead:source,runId:run,defaultTargetHead:manifest.defaultTargetHead,draftTag:manifest.draftTag,releaseId:1,draft:true,...(kind==='tools'?{imageId:manifest.imageId,archiveSha256:manifest.archiveSha256,archiveBytes:manifest.archiveBytes,archiveAssetId:2}:{unsignedSha256:manifest.unsignedSha256,bytes:manifest.bytes,applicationId:manifest.applicationId,apkAssetId:2}),manifestSha256:digest(Buffer.from(JSON.stringify(manifest))),manifestBytes:Buffer.byteLength(JSON.stringify(manifest)),manifestAssetId:3,manifestSchema:manifest.schema,...(kind==='tools'?{toolsQualified:true}:{unsignedQualified:true}),uploadVerified:true,localCleanupConfirmed:true,remoteCustody:'draft-retained'});
test('literal separate nineteen-field APK and tools manifests/final receipts reject every missing hidden or accessor field',()=>{
  for(const[kind,create]of[['apk',apk],['tools',tools]]){
    const m=create(),r=receipt(m,kind);assert.equal(Object.keys(m).length,19);assert.equal(Object.keys(r).length,19);
    validateManifest(m,kind);validateTransfer(r,kind);
    for(const[value,validator]of[[m,v=>validateManifest(v,kind)],[r,v=>validateTransfer(v,kind)]]){
      for(const key of Object.keys(value)){
        const missing={...value};delete missing[key];assert.throws(()=>validator(missing));
        const hidden={...value};Object.defineProperty(hidden,key,{value:value[key],enumerable:false});assert.throws(()=>validator(hidden));
        const getter={...value};Object.defineProperty(getter,key,{get(){throw Error('sensitive-canary')},enumerable:true});assert.throws(()=>validator(getter),/UNAVAILABLE/);
      }
      assert.throws(()=>validator({...value,extra:true}));assert.throws(()=>validator(Object.create(value)));
    }
  }
  assert.throws(()=>validateManifest({...tools(),runtimeUid:1000},'tools'));
  assert.throws(()=>validateManifest({...tools(),baseImage:'eclipse-temurin:17-jdk-jammy'},'tools'));
  assert.throws(()=>validateManifest({...apk(),runtimeEnabled:true},'apk'));
  assert.throws(()=>validateTransfer({...receipt(tools(),'tools'),schema:'st250-draft-transfer-receipt-v1'},'tools'));
});
test('canonical manifest and measured byte binding reject duplicate keys, substitution, stale receipts and overbounds',()=>{
  for(const[kind,m]of[['apk',apk()],['tools',tools()]]){
    const bytes=Buffer.from(JSON.stringify(m)),r=receipt(m,kind);assert(bind(m,r,payload,bytes,kind));
    assert.deepEqual(canonical(bytes,v=>validateManifest(v,kind)),m);
    assert.throws(()=>canonical(Buffer.from(`{"schema":"wrong",${JSON.stringify(m).slice(1)}`),v=>validateManifest(v,kind)));
    assert.throws(()=>bind(m,r,Buffer.from('substituted'),bytes,kind));
    assert.throws(()=>bind(m,{...r,sourceHead:'c'.repeat(40)},payload,bytes,kind));
    assert.throws(()=>bind(m,r,payload,Buffer.concat([bytes,Buffer.from('\n')]),kind));
  }
  assert.throws(()=>validateManifest({...apk(),bytes:200*1024*1024+1},'apk'));
});
test('authenticated remote draft requires exact ids digest roster staging target and short retention',()=>{
  const m=apk(),r=receipt(m,'apk'),release={id:1,draft:true,prerelease:true,tag_name:m.draftTag,target_commitish:m.defaultTargetHead,created_at:new Date().toISOString(),assets:[{id:2,name:`subtrack-sandbox-unsigned-${source}.apk`,state:'uploaded',size:m.bytes,digest:`sha256:${m.unsignedSha256}`,content_type:'application/vnd.android.package-archive'},{id:3,name:`st250-android-transfer-${source}.json`,state:'uploaded',size:r.manifestBytes,digest:`sha256:${r.manifestSha256}`,content_type:'application/json'}]};
  assert(validateRemote(release,m,r,'apk'));
  for(const patch of[{draft:false},{prerelease:false},{id:4},{target_commitish:source},{assets:[...release.assets,release.assets[0]]},{created_at:new Date(Date.now()-8*86400000).toISOString()},{created_at:'invalid'}])assert.throws(()=>validateRemote({...release,...patch},m,r,'apk'));
  assert.throws(()=>validateRemote({...release,assets:[{...release.assets[0],digest:'sha256:'+'0'.repeat(64)},release.assets[1]]},m,r,'apk'));
});
function tar(files){const parts=[];for(const[name,data]of files){const h=Buffer.alloc(512);h.write(name);h.write('0000600\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(data.length.toString(8).padStart(11,'0')+'\0',124);h[156]=48;h.fill(32,148,156);const sum=h.reduce((s,b)=>s+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);parts.push(h,data,Buffer.alloc((512-data.length%512)%512));}parts.push(Buffer.alloc(1024));return Buffer.concat(parts);}
test('tools diagnostic checkpoints expose only closed labels and preserve rejection',()=>{
  const layer=Buffer.from('private-canary'),config=Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',config:{User:'996:996',Entrypoint:['/opt/android/build-tools/36.0.0/apksigner'],Labels:{'se.subtrack.android.source':source,'se.subtrack.android.run':run}},rootfs:{diff_ids:[`sha256:${digest(layer)}`]}})),name=`${digest(config)}.json`,index=Buffer.from(JSON.stringify([{Config:name,RepoTags:null,Layers:['layer/layer.tar']}]));
  const files=[[name,config],['layer/layer.tar',layer],['manifest.json',index]],raw=tar(files),manifest=b=>({...tools(),imageId:`sha256:${digest(config)}`,rawTarSha256:digest(b),rawTarBytes:b.length});
  const failure=(bytes,m,step,category='ASSERTION')=>assert.throws(()=>inspectToolTar(bytes,m),error=>{assert.equal(error.message,'ST250_ANDROID_TRANSFER_UNAVAILABLE');assert.ok(toolsArchiveDiagnostic(error).startsWith(`ST250_ANDROID_TOOLS_DIAGNOSTIC operation=INSPECT_TOOLS_TAR step=${step} category=${category}`));return true;});
  failure(raw,{...manifest(raw),toolsQualified:false},'MANIFEST_FIELDS');
  failure(raw,{...manifest(raw),rawTarSha256:'0'.repeat(64)},'RAW_BINDING');
  const header=Buffer.from(raw);header[0]^=1;failure(header,manifest(header),'TAR_HEADER');
  const trailer=Buffer.from(raw);trailer[trailer.length-1]=1;failure(trailer,manifest(trailer),'TAR_TRAILER');
  const json=tar(files.map(([n,b])=>[n,n==='manifest.json'?Buffer.from('private-canary-invalid-json'):b]));failure(json,manifest(json),'DOCKER_MANIFEST','JSON');
  const codec=tar(files.map(([n,b])=>[n,n==='layer/layer.tar'?Buffer.from([31,139,0]):b]));failure(codec,manifest(codec),'LAYER_DECOMPRESS','DECOMPRESSION');
  const extra=tar([...files,['private-canary',layer]]);failure(extra,manifest(extra),'EXTRA_OTHER');
  let invoked=false;const hostile=Object.defineProperty({},'message',{get(){invoked=true;throw Error('private-canary');}});assert.equal(toolsArchiveDiagnostic(hostile),null);assert.equal(invoked,false);
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('./android-transfer-receipt.mjs',import.meta.url)),'inspect-tools-tar','private-canary-nonexistent','private-canary-nonexistent'],{encoding:'utf8'});assert.equal(cli.status,1);assert.equal(cli.stdout,'');assert.equal(cli.stderr,'ST250_ANDROID_TOOLS_DIAGNOSTIC operation=INSPECT_TOOLS_TAR step=INPUT_RAW category=IO\nST250_ANDROID_TRANSFER_UNAVAILABLE\n');
});
test('tools tar config and every uncompressed layer digest bind one anonymous Linuxamd64 UID996 image',()=>{
  const layer=Buffer.from('tool image layer fixture'),config=Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',config:{User:'996:996',Entrypoint:['/opt/android/build-tools/36.0.0/apksigner'],Labels:{'se.subtrack.android.source':source,'se.subtrack.android.run':run}},rootfs:{diff_ids:[`sha256:${digest(layer)}`]}}));
  const configName=`${digest(config)}.json`,index=Buffer.from(JSON.stringify([{Config:configName,RepoTags:null,Layers:['layer/layer.tar']}]));
  const raw=tar([[configName,config],['layer/layer.tar',layer],['manifest.json',index]]),m={...tools(),imageId:`sha256:${digest(config)}`,rawTarSha256:digest(raw),rawTarBytes:raw.length};assert(inspectToolTar(raw,m));
  const changed=Buffer.from(raw);changed[512]^=1;assert.throws(()=>inspectToolTar(changed,{...m,rawTarSha256:digest(changed)}));
  const unrelated=tar([[configName,config],['layer/layer.tar',layer],['manifest.json',index],['secret.txt',Buffer.from('canary')]]);assert.throws(()=>inspectToolTar(unrelated,{...m,rawTarSha256:digest(unrelated),rawTarBytes:unrelated.length}));
});
test('held upload candidates cannot be consumed as final cleanup receipts',()=>{
  for(const[kind,m]of[['apk',apk()],['tools',tools()]]){
    const final=receipt(m,kind),candidate={...final,schema:kind==='tools'?'st250-android-tools-upload-candidate-v1':'st250-android-upload-candidate-v1',localCleanupConfirmed:false};
    assert.throws(()=>validateTransfer(candidate,kind));assert.deepEqual(closeTransferCandidate(candidate,kind),final);
    assert.throws(()=>closeTransferCandidate({...candidate,localCleanupConfirmed:true},kind));
  }
});
test('OCI Docker save layout binds one manifest config and compressed layer; extra named or unrelated objects reject',()=>{
  const rawLayer=Buffer.from('synthetic OCI tool layer'),layer=gzipSync(rawLayer),config=Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',config:{User:'996:996',Entrypoint:['/opt/android/build-tools/36.0.0/apksigner'],Labels:{'se.subtrack.android.source':source,'se.subtrack.android.run':run}},rootfs:{diff_ids:[`sha256:${digest(rawLayer)}`]}}));
  const configName=`blobs/sha256/${digest(config)}`,layerName=`blobs/sha256/${digest(layer)}`,oci=Buffer.from(JSON.stringify({schemaVersion:2,config:{digest:`sha256:${digest(config)}`,size:config.length},layers:[{digest:`sha256:${digest(layer)}`,size:layer.length}]})),ociName=`blobs/sha256/${digest(oci)}`;
  const index=Buffer.from(JSON.stringify({schemaVersion:2,manifests:[{digest:`sha256:${digest(oci)}`,size:oci.length}]})),docker=Buffer.from(JSON.stringify([{Config:configName,RepoTags:null,Layers:[layerName]}]));
  const files=[[configName,config],[layerName,layer],[ociName,oci],['index.json',index],['oci-layout',Buffer.from('{"imageLayoutVersion":"1.0.0"}')],['manifest.json',docker]];
  const raw=tar(files),m={...tools(),imageId:`sha256:${digest(config)}`,rawTarSha256:digest(raw),rawTarBytes:raw.length};assert(inspectToolTar(raw,m));
  const namedIndex=Buffer.from(JSON.stringify({schemaVersion:2,manifests:[{digest:`sha256:${digest(oci)}`,size:oci.length,annotations:{'org.opencontainers.image.ref.name':'unowned'}}]}));
  const named=tar(files.map(([n,b])=>[n,n==='index.json'?namedIndex:b]));assert.throws(()=>inspectToolTar(named,{...m,rawTarSha256:digest(named),rawTarBytes:named.length}));
});
test('extra tools members classify measured root-index and manifest equivalence but always reject',()=>{
 const rawLayer=Buffer.from('private-canary-layer'),layer=gzipSync(rawLayer),config=Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',config:{User:'996:996',Entrypoint:['/opt/android/build-tools/36.0.0/apksigner'],Labels:{'se.subtrack.android.source':source,'se.subtrack.android.run':run}},rootfs:{diff_ids:[`sha256:${digest(rawLayer)}`]}}));
 const configName=`blobs/sha256/${digest(config)}`,layerName=`blobs/sha256/${digest(layer)}`,cd={mediaType:'application/vnd.oci.image.config.v1+json',digest:`sha256:${digest(config)}`,size:config.length},ld={mediaType:'application/vnd.oci.image.layer.v1.tar',digest:`sha256:${digest(layer)}`,size:layer.length};
 const graph={schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:cd,layers:[ld]},oci=Buffer.from(JSON.stringify(graph)),descriptor={mediaType:graph.mediaType,digest:`sha256:${digest(oci)}`,size:oci.length,platform:{os:'linux',architecture:'amd64'}},index={schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[descriptor]},indexBytes=Buffer.from(JSON.stringify(index));
 const files=[[configName,config],[layerName,layer],[`blobs/sha256/${digest(oci)}`,oci],['index.json',indexBytes],['oci-layout',Buffer.from('{"imageLayoutVersion":"1.0.0"}')],['manifest.json',Buffer.from(JSON.stringify([{Config:configName,RepoTags:null,Layers:[layerName]}]))]];
 const classify=(bytes,expected,name=`blobs/sha256/${digest(bytes)}`)=>{const raw=tar([...files,[name,bytes]]),m={...tools(),imageId:`sha256:${digest(config)}`,rawTarSha256:digest(raw),rawTarBytes:raw.length};assert.throws(()=>inspectToolTar(raw,m),error=>{assert.ok(toolsArchiveDiagnostic(error).startsWith(`ST250_ANDROID_TOOLS_DIAGNOSTIC operation=INSPECT_TOOLS_TAR step=${expected} category=ASSERTION`));const top={"[]":"TOP_ARRAY","null":"TOP_NULL","7":"TOP_NUMBER","true":"TOP_BOOLEAN","\"canary\"":"TOP_STRING"}[bytes.toString()];if(top)assert.ok(toolsArchiveDiagnostic(error).includes(top));return true;});};
 classify(indexBytes,'ROOT_INDEX_IDENTICAL_BYTES');
 classify(rawLayer,'RAW_SAME_VERIFIED_LAYER');
 const equivalentGzip=Buffer.from(layer);equivalentGzip[9]=equivalentGzip[9]===3?0:3;classify(equivalentGzip,'GZIP_SAME_VERIFIED_LAYER');
 classify(Buffer.from(JSON.stringify(graph)+'\n'),'EXTRA_BLOB_NONCANONICAL_MANIFEST');
 classify(Buffer.from(config.toString()+'\n'),'EXTRA_BLOB_NONCANONICAL_CONFIG');
 classify(Buffer.from('{}\n'),'EXTRA_BLOB_NONCANONICAL_OTHER');
 for(const [magic,bytes]of [['GZIP',Buffer.from([31,139,0])],['ZSTD',Buffer.from('28b52ffd00','hex')],['TAR',(()=>{const b=Buffer.alloc(512);b.write('ustar',257);return b;})()]]){classify(bytes,`EXTRA_BLOB_JSON_INVALID_${magic}`);const large=Buffer.alloc(1048577);bytes.copy(large);classify(large,`EXTRA_BLOB_OVERSIZED_${magic}`);}
 classify(Buffer.from(indexBytes.toString().replace('"schemaVersion":2','"schemaVersion":1,"schemaVersion":2')),'EXTRA_BLOB_NONCANONICAL_INDEX');
 classify(Buffer.from(indexBytes.toString().replace('"manifests":','"manifests":[],"manifests":')),'EXTRA_BLOB_NONCANONICAL_INDEX');
 classify(Buffer.from(indexBytes.toString()+'\n'),'EXTRA_BLOB_NONCANONICAL_INDEX');
 classify(Buffer.from('{"schemaVersion":2,"canary":"\xff"}','binary'),'EXTRA_BLOB_UTF8_INVALID');
 classify(Buffer.from(JSON.stringify({...index,manifests:[{...descriptor,annotations:{'containerd.io/distribution.source.example':'private-canary'}}]})),'ROOT_INDEX_SAME_DESCRIPTOR');
 classify(Buffer.from(JSON.stringify({layers:graph.layers,config:graph.config,mediaType:graph.mediaType,schemaVersion:2})),'MANIFEST_SAME_GRAPH');
 for(const d of [{...descriptor,digest:'sha256:'+'0'.repeat(64)},{...descriptor,size:descriptor.size+1},{...descriptor,annotations:{canary:'private'}}])classify(Buffer.from(JSON.stringify({...index,manifests:[d]})),'EXTRA_BLOB_INDEX');
 classify(Buffer.from(JSON.stringify({...index,manifests:[descriptor,descriptor]})),'EXTRA_BLOB_INDEX');
 classify(Buffer.from(JSON.stringify({...graph,config:{...cd,digest:'sha256:'+'0'.repeat(64)}})),'EXTRA_BLOB_MANIFEST');
 classify(Buffer.from(JSON.stringify({...graph,unknown:true})),'EXTRA_BLOB_MANIFEST');
 classify(Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',config:{},rootfs:{}})),'EXTRA_BLOB_CONFIG');
 classify(Buffer.from('private-canary-not-json'),'EXTRA_BLOB_JSON_INVALID_OTHER');for(const text of ['[]','null','7','true','"canary"'])classify(Buffer.from(text),'EXTRA_BLOB_UNRECOGNIZED');classify(Buffer.alloc(1048577),'EXTRA_BLOB_OVERSIZED_OTHER');
 classify(Buffer.from('private-canary'),'EXTRA_OTHER','blobs/sha256/'+'0'.repeat(64));
});

test('same-job private graph inspector reports a closed attestation class set and rejects all extras',()=>{
 const layer=Buffer.from('layer'),config=Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',config:{User:'996:996',Entrypoint:['/opt/android/build-tools/36.0.0/apksigner'],Labels:{'se.subtrack.android.source':source,'se.subtrack.android.run':run}},rootfs:{diff_ids:[`sha256:${digest(layer)}`]}}));
 const descriptor=(bytes,mediaType)=>({mediaType,digest:`sha256:${digest(bytes)}`,size:bytes.length}),configDescriptor=descriptor(config,'application/vnd.oci.image.config.v1+json'),layerDescriptor=descriptor(layer,'application/vnd.oci.image.layer.v1.tar'),oci=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:configDescriptor,layers:[layerDescriptor]})),target=descriptor(oci,'application/vnd.oci.image.manifest.v1+json'),blob=(bytes)=>[`blobs/sha256/${digest(bytes)}`,bytes];
 const files=[blob(config),blob(layer),blob(oci),['index.json',Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[target]}))],['oci-layout',Buffer.from('{"imageLayoutVersion":"1.0.0"}')],['manifest.json',Buffer.from(JSON.stringify([{Config:blob(config)[0],RepoTags:null,Layers:[blob(layer)[0]]}]))]];
 let observed;
 const inspect=(predicateType,foreign=false,linked=true,extra={},legacy=false,configPatch={})=>{
  const statement=Buffer.from(JSON.stringify({_type:'https://in-toto.io/Statement/v1',subject:[{name:'private-canary',digest:{sha256:foreign?'0'.repeat(64):target.digest.slice(7)}}],predicateType,predicate:{private:'never output'},...extra}));
  const empty=Buffer.from(JSON.stringify(legacy?{architecture:'unknown',os:'unknown',rootfs:{type:'layers',diff_ids:[`sha256:${digest(statement)}`]},...configPatch}:{}));
  const attestation=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',...(legacy?{}:{artifactType:'application/vnd.docker.attestation.manifest.v1+json'}),config:{...descriptor(empty,legacy?'application/vnd.oci.image.config.v1+json':'application/vnd.oci.empty.v1+json'),...(legacy?{}:{data:'e30='})},layers:[descriptor(statement,'application/vnd.in-toto+json')],...(legacy?{}:{subject:target})}));
  const legacyIndex=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[target,{...descriptor(attestation,'application/vnd.oci.image.manifest.v1+json'),platform:{os:'unknown',architecture:'unknown'},annotations:{'vnd.docker.reference.type':'attestation-manifest','vnd.docker.reference.digest':target.digest}}]}));
  const raw=tar([...files,blob(empty),blob(statement),...(linked?[blob(attestation),...(legacy?[blob(legacyIndex)]:[])]:[])]),m={...tools(),imageId:configDescriptor.digest,rawTarSha256:digest(raw),rawTarBytes:raw.length};let label;assert.throws(()=>inspectToolTar(raw,m),error=>{label=toolsArchiveDiagnostic(error);return true;});assert.ok(!label.includes('private-canary'));assert.ok(!label.includes(target.digest));observed=label;return label.split(' classes=')[1].split(' shapeFlags=')[0];
 };
 assert.equal(inspect('https://slsa.dev/provenance/v0.2'),'EMPTY_JSON_ATTESTATION_CONFIG_BOUND,INTOTO_PROVENANCE_BOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1'),'EMPTY_JSON_ATTESTATION_CONFIG_BOUND,INTOTO_PROVENANCE_BOUND,UNRECOGNIZED');
 assert.equal(inspect('https://spdx.dev/Document'),'EMPTY_JSON_ATTESTATION_CONFIG_BOUND,INTOTO_SBOM_BOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1',true),'EMPTY_JSON_UNBOUND,INTOTO_PROVENANCE_UNBOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1',false,false),'EMPTY_JSON_UNBOUND,INTOTO_PROVENANCE_UNBOUND');
 assert.equal(inspect('unknown'),'EMPTY_JSON_UNBOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1',false,true,{unknown:true}),'EMPTY_JSON_UNBOUND,UNRECOGNIZED');
 for(const predicate of [null,false,7,'private-canary',[]])assert.equal(inspect('https://slsa.dev/provenance/v1',false,true,{predicate}),'EMPTY_JSON_UNBOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1',false,true,{},true),'LEGACY_ATTESTATION_CONFIG_BOUND,INTOTO_PROVENANCE_BOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1',true,true,{},true),'LEGACY_ATTESTATION_CONFIG_UNBOUND,INTOTO_PROVENANCE_UNBOUND,UNRECOGNIZED');
 assert.equal(inspect('https://slsa.dev/provenance/v1',false,false,{},true,{rootfs:{type:'layers',diff_ids:null}}),'LEGACY_ATTESTATION_CONFIG_UNBOUND,INTOTO_PROVENANCE_UNBOUND');
 for(const patch of [{os:'linux'},{config:null},{rootfs:{type:'layers',diff_ids:['wrong']}},{created:'private-canary'}]){inspect('unknown',false,false,{},true,patch);assert.ok(observed.includes('shapeFlags='));assert.ok(observed.includes('FIELD_OS_STRING'));assert.ok(observed.includes('FIELD_ROOTFS_OBJECT'));}
 inspect('unknown',false,false,{predicate:null},true,{rootfs:null,config:[],created:false,history:7});for(const flag of ['FIELD_ROOTFS_NULL','FIELD_CONFIG_ARRAY','FIELD_CREATED_BOOLEAN','FIELD_HISTORY_NUMBER','FIELD_PREDICATE_NULL','FIELD_OS_STRING','FIELD_SUBJECT_ARRAY'])assert.ok(observed.includes(flag));
});

test('legacy V1 sideconfigs bind exact Go ID transcripts to verified ordered layer chain only',()=>{
 const layers=[Buffer.from('first layer'),Buffer.from('second layer')],diffs=layers.map(b=>`sha256:${digest(b)}`),zero={Hostname:'',Domainname:'',User:'',AttachStdin:false,AttachStdout:false,AttachStderr:false,Tty:false,OpenStdin:false,StdinOnce:false,Env:null,Cmd:null,Image:'',Volumes:null,WorkingDir:'',Entrypoint:null,OnBuild:null,Labels:null},created='2026-01-01T00:00:00Z',runtime={User:'996:996',Entrypoint:['/opt/android/build-tools/36.0.0/apksigner'],Labels:{'se.subtrack.android.source':source,'se.subtrack.android.run':run}};
 const legacyRuntime={...zero,User:runtime.User,Entrypoint:runtime.Entrypoint,Labels:Object.fromEntries(Object.entries(runtime.Labels).sort(([a],[b])=>a.localeCompare(b)))};
 const first=digest(Buffer.from('{"container_config":'+JSON.stringify(zero)+',"created":"1970-01-01T00:00:00Z","layer_id":'+JSON.stringify(diffs[0])+'}')),chain=`sha256:${digest(Buffer.from(diffs[0]+' '+diffs[1]))}`;
 const last=digest(Buffer.from('{"architecture":"amd64","config":'+JSON.stringify(legacyRuntime)+',"container_config":'+JSON.stringify(zero)+',"created":'+JSON.stringify(created)+',"layer_id":'+JSON.stringify(chain)+',"os":"linux","parent":'+JSON.stringify(`sha256:${first}`)+'}'));
 const records=[{id:first,created:'1970-01-01T00:00:00Z',container_config:zero,os:'linux'},{id:last,parent:first,created,container_config:zero,config:legacyRuntime,architecture:'amd64',os:'linux'}],config=Buffer.from(JSON.stringify({created,architecture:'amd64',os:'linux',config:runtime,rootfs:{type:'layers',diff_ids:diffs}})),blob=b=>[`blobs/sha256/${digest(b)}`,b],cd={mediaType:'application/vnd.oci.image.config.v1+json',digest:`sha256:${digest(config)}`,size:config.length},oci=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:cd,layers:layers.map(b=>({mediaType:'application/vnd.oci.image.layer.v1.tar',digest:`sha256:${digest(b)}`,size:b.length}))}));
 const files=[blob(config),...layers.map(blob),blob(oci),['index.json',Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[{mediaType:'application/vnd.oci.image.manifest.v1+json',digest:`sha256:${digest(oci)}`,size:oci.length}]}))],['oci-layout',Buffer.from('{"imageLayoutVersion":"1.0.0"}')],['manifest.json',Buffer.from(JSON.stringify([{Config:blob(config)[0],RepoTags:null,Layers:layers.map(b=>blob(b)[0])}]))]];
 const proof=(values,patch,format='')=>{let base=files,imageId=cd.digest;if(patch||format){const cfg=Buffer.from(JSON.stringify({created,architecture:'amd64',os:'linux',config:{...runtime,...patch},rootfs:{type:'layers',diff_ids:diffs}})+format),header={...cd,digest:`sha256:${digest(cfg)}`,size:cfg.length},graph=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:header,layers:layers.map(b=>({mediaType:'application/vnd.oci.image.layer.v1.tar',digest:`sha256:${digest(b)}`,size:b.length}))}));imageId=header.digest;base=[blob(cfg),...layers.map(blob),blob(graph),['index.json',Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[{mediaType:'application/vnd.oci.image.manifest.v1+json',digest:`sha256:${digest(graph)}`,size:graph.length}]}))],['oci-layout',Buffer.from('{"imageLayoutVersion":"1.0.0"}')],['manifest.json',Buffer.from(JSON.stringify([{Config:blob(cfg)[0],RepoTags:null,Layers:layers.map(b=>blob(b)[0])}]))]];}const raw=tar([...base,...values.map(v=>blob(Buffer.from(JSON.stringify(v))))]),m={...tools(),imageId,rawTarSha256:digest(raw),rawTarBytes:raw.length};let label;assert.throws(()=>inspectToolTar(raw,m),e=>{label=toolsArchiveDiagnostic(e);return true;});assert.ok(!label.includes(first));return label;};
 assert.ok(proof(records).includes('classes=V1_CONFIG_CHAIN_BOUND,V1_CONFIG_CHAIN_COMPLETE'));
 assert.ok(proof(records).includes('V1_STAGE_COMPLETE'));
 const newlineContext=proof(records,{},'\n');assert.ok(newlineContext.includes('V1_CONFIG_CHAIN_COMPLETE'));assert.ok(newlineContext.includes('V1_STAGE_COMPLETE'));assert.ok(!newlineContext.includes('V1_STAGE_IMAGE_CONFIG_TYPE'));
 for(const [values,stage]of [[[{...records[0],container_config:{}},records[1]],'ZERO_CONTAINER_CONFIG'],[[records[0],{...records[1],config:{...legacyRuntime,User:'0'}}],'FINAL_PROJECTION'],[[records[0],{...records[1],parent:'0'.repeat(64)}],'TOPOLOGY'],[[{...records[0],os:'foreign'},records[1]],'OS'],[[{...records[0],created:'1970-01-02T00:00:00Z'},records[1]],'INTERMEDIATE_FIELDS'],[[{...records[0],id:'0'.repeat(64)},{...records[1],parent:'0'.repeat(64)}],'ID_TRANSCRIPT']]){const label=proof(values);assert.ok(label.includes(`V1_STAGE_${stage}`));assert.ok(!label.includes('V1_STAGE_COMPLETE'));assert.ok(!label.includes(first));}
 const mismatch=proof([{...records[0],id:'0'.repeat(64)},{...records[1],parent:'0'.repeat(64)}]);for(const flag of ['ID_OS_OMITTED_NO_MATCH','ID_OS_RETAINED_NO_MATCH','ID_RAW_CONFIG_NO_MATCH','ID_PROJECTED_CONFIG_NO_MATCH'])assert.ok(mismatch.includes(`V1_STAGE_${flag}`));
 for(const [i,patch]of [[0,{id:'0'.repeat(64)}],[1,{parent:'0'.repeat(64)}],[0,{os:'foreign'}],[1,{config:{...runtime,User:'0'}}],[0,{unknown:true}],[0,{container_config:{}}],[0,{created:'1970-01-02T00:00:00Z'}],[1,{id:digest(Buffer.from('foreign layer chain'))}]]){const result=proof(records.map((v,n)=>n===i?{...v,...patch}:v));assert.ok(result.includes('V1_CONFIG_UNBOUND'));assert.ok(result.includes('V1_CONFIG_CHAIN_INCOMPLETE'));assert.ok(!result.includes('V1_CONFIG_CHAIN_COMPLETE'));}
 assert.ok(proof([records[0]]).includes('V1_CONFIG_CHAIN_INCOMPLETE'));
 for(const patch of [{StopSignal:false},{WorkingDir:false},{StopTimeout:0.5},{Healthcheck:false},{Healthcheck:{}},{Cmd:7},{ArgsEscaped:'true'},{Volumes:{'/data':false}},{ExposedPorts:{'10':{},'2':{}}},{Labels:{...runtime.Labels,'10':'a','2':'b'}}]){const result=proof(records,patch);assert.ok(result.includes('V1_CONFIG_UNBOUND'));assert.ok(!result.includes('V1_CONFIG_CHAIN_BOUND'));assert.ok(result.includes('V1_CONFIG_CHAIN_INCOMPLETE'));}
 assert.ok(proof(records,{StopSignal:false}).includes('V1_STAGE_CONFIG_FIELD_STOPSIGNAL_UNSUPPORTED'));
 assert.ok(proof(records,{StopSignal:false}).includes('V1_STAGE_IMAGE_CONFIG_TYPE'));
});

test('ten-field backup binding rejects fabricated partial status wrong protection and extra metadata',()=>{
  const value={schema:'st250-android-signer-backup-v1',signerCertificateSha256:'a'.repeat(64),ciphertextSha256:'b'.repeat(64),ciphertextBytes:1024,protection:'windows-dpapi-current-user',backupGeneration:1,decryptVerified:true,signingRestoreVerified:true,temporaryCustodyRemoved:true,backupConfirmed:true};
  assert.equal(Object.keys(validateBackupBinding(value)).length,10);
  for(const patch of[{protection:'windows-dpapi-local-machine'},{backupGeneration:2},{ciphertextBytes:131073},{signingRestoreVerified:false},{temporaryCustodyRemoved:false},{extra:true}])assert.throws(()=>validateBackupBinding({...value,...patch}));
});
test('immutable signer identity and signed history reject replacement identities lower versions and same-version changed bytes',()=>{
  const cert='e'.repeat(64),identity={schema:'st250-android-signer-identity-v1',signerCertificateSha256:cert,imageId:'sha256:'+'c'.repeat(64),sourceHead:source,alias:'subtrack-sandbox',storeType:'PKCS12',keyAlgorithm:'RSA3072',generation:1};
  validateSignerIdentity(identity);assert.throws(()=>validateSignerIdentity({...identity,alias:'androiddebugkey'}));assert.throws(()=>validateSignerIdentity({...identity,generation:2}));
  const m=apk(),history={schema:'st250-android-signed-history-v1',signerCertificateSha256:cert,versionCode:1,sourceHead:source,unsignedSha256:m.unsignedSha256,signedSha256:'f'.repeat(64),apkRun:run,runtimeEnabled:false};
  assert(assertSignedUpdate(m,cert,null));assert(assertSignedUpdate(m,cert,history));assert(assertSignedUpdate({...m,versionCode:2},cert,history));
  assert.throws(()=>assertSignedUpdate({...m,unsignedSha256:'c'.repeat(64)},cert,history));assert.throws(()=>assertSignedUpdate(m,cert,{...history,versionCode:2}));assert.throws(()=>assertSignedUpdate(m,'f'.repeat(64),history));
});
test('Windows actual bounded backup codec and CurrentUser DPAPI reject altered ciphertext context identity and trailing bytes',{skip:process.platform!=='win32'},()=>{
  const code=String.raw`
$ErrorActionPreference='Stop';$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($env:ST250_TEST_DESKTOP_SOURCE,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'desktop syntax'}
$definitions=$ast.FindAll({param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -in @('Require','Pack','Unpack','Clear-Bytes','Native')},$true)
Invoke-Expression (($definitions|ForEach-Object{$_.Extent.Text}) -join [Environment]::NewLine)
$SignerCertificateSha256='e'*64;$context=[Text.Encoding]::UTF8.GetBytes('st250-android-signer-backup-v1/current-user')
$key=[Text.Encoding]::ASCII.GetBytes('synthetic-fixture-no-real-key');$pass=[Text.Encoding]::ASCII.GetBytes('0'*64)
$payload=Pack $key $pass $SignerCertificateSha256
$cipher=[Security.Cryptography.ProtectedData]::Protect($payload,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$restored=Unpack $plain;Require ($restored.Key.Length -eq $key.Length -and $restored.Password.Length -eq $pass.Length)
$failed=$false;try{[void](Unpack ([byte[]]($plain+[byte]0)))}catch{$failed=$true};Require $failed
$SignerCertificateSha256='f'*64;$failed=$false;try{[void](Unpack $plain)}catch{$failed=$true};Require $failed
$failed=$false;try{[void][Security.Cryptography.ProtectedData]::Unprotect($cipher,[byte[]]@(1),[Security.Cryptography.DataProtectionScope]::CurrentUser)}catch{$failed=$true};Require $failed
$cipher[0]=$cipher[0]-bxor 1;$failed=$false;try{[void][Security.Cryptography.ProtectedData]::Unprotect($cipher,$context,[Security.Cryptography.DataProtectionScope]::CurrentUser)}catch{$failed=$true};Require $failed
foreach($bytes in @($payload,$cipher,$plain,$key,$pass,$restored.Key,$restored.Password)){Clear-Bytes $bytes}
$native=Native $env:ST250_TEST_NODE @('-e','process.stdout.write(process.argv[1])','synthetic argument with spaces');Require ($native -eq 'synthetic argument with spaces')
$failed=$false;try{[void](Native $env:ST250_TEST_NODE @('-e','process.stderr.write("sensitive-canary");process.exit(1)'))}catch{$failed=$true;Require ($_.Exception.Message -notmatch 'sensitive-canary')};Require $failed
'ST250_SYNTHETIC_DPAPI_CODEC_PASS'
`;
  const result=spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',env:{...process.env,ST250_TEST_NODE:process.execPath,ST250_TEST_DESKTOP_SOURCE:fileURLToPath(new URL('./download-android.ps1',import.meta.url))},timeout:30000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/ST250_SYNTHETIC_DPAPI_CODEC_PASS/);
});
const active=()=>{const bytes=makeApk(true,2),measured=inspectActiveApk(bytes,2);return {...apk(),schema:'st250-android-transfer-manifest-v2',versionCode:2,unsignedSha256:digest(bytes),bytes:bytes.length,runtimeEnabled:true,...measured};};
test('active native assets are unique bounded CRC-checked stored/deflated ZIP entries with exact generated config',()=>{for(const deflate of [false,true])for(const descriptor of [false,true,'signature']){const bytes=makeApk(true,2,{deflate,descriptor});assert.equal(inspectActiveApk(bytes,2).hermesSha256,digest(apkAssets(bytes).hermes));}for(const options of [{duplicate:true},{marker:{runtimeEnabled:false}},{marker:{publicationEnabled:true}},{marker:{privateDiagnosticsEnabled:true}},{marker:{apiBaseUrl:'https://other.example'}},{marker:{extra:true}},{hermes:Buffer.from('wrong')},{configText:'{"extra":{},"extra":{}}'},{configText:'{}\n'}])assert.throws(()=>inspectActiveApk(makeApk(true,2,options),2));assert.throws(()=>inspectActiveApk(makeApk(true,2),1));assert.throws(()=>inspectActiveApk(makeApk(false),1));for(const bad of [Buffer.alloc(0),Buffer.from('not zip'),Buffer.alloc(22)])assert.throws(()=>apkAssets(bad));const valid=makeApk(true,2),end=valid.length-22,cd=valid.readUInt32LE(end+16);for(const [offset,value,size]of [[end,0,4],[end+4,1,2],[end+8,0,2],[end+10,0,2],[end+12,0,4],[end+16,0,4],[cd,0,4],[cd+8,1,2],[cd+10,99,2],[cd+20,0xffffffff,4],[cd+24,0xffffffff,4],[cd+34,1,2],[cd+42,0xffffffff,4],[0,0,4],[6,1,2],[8,99,2],[14,0,4],[18,0,4],[22,0,4]]){const bad=Buffer.from(valid);if(size===2)bad.writeUInt16LE(value,offset);else bad.writeUInt32LE(value,offset);assert.throws(()=>apkAssets(bad));}const corrupt=Buffer.from(valid);corrupt[30+Buffer.byteLength('assets/app.config')]^=1;assert.throws(()=>apkAssets(corrupt));});
test('active manifest/transfer/pending lanes bind fresh native hashes and strictly greater signed history',()=>{const m=active(),r={...receipt(m,'apk'),schema:'st250-android-draft-transfer-receipt-v2'},bytes=makeApk(true,2),mb=Buffer.from(JSON.stringify(m));assert.equal(Object.keys(validateManifest(m,'apk')).length,21);validateTransfer(r,'apk');bind(m,r,bytes,mb,'apk');assert.throws(()=>validateManifest({...m,schema:'st250-android-transfer-manifest-v1'},'apk'));assert.throws(()=>validateManifest({...apk(),schema:'st250-android-transfer-manifest-v2',runtimeEnabled:true},'apk'));assert.throws(()=>validateTransfer({...r,schema:'st250-android-draft-transfer-receipt-v1'},'apk'));assert.throws(()=>bind({...m,hermesSha256:'f'.repeat(64)},r,bytes,mb,'apk'));const closed=closeTransferCandidate({...r,schema:'st250-android-upload-candidate-v2',localCleanupConfirmed:false},'apk');assert.equal(closed.schema,r.schema);const cert='e'.repeat(64),history={schema:'st250-android-signed-history-v1',signerCertificateSha256:cert,versionCode:1,sourceHead:source,unsignedSha256:'a'.repeat(64),signedSha256:'b'.repeat(64),apkRun:run,runtimeEnabled:false};assert.equal(assertSignedUpdate(m,cert,history),true);assert.throws(()=>assertSignedUpdate({...m,versionCode:1},cert,history));const signed=makeApk(true,2,{signed:true}),p={schema:'st250-android-signed-pending-v2',sourceHead:source,signerCertificateSha256:cert,unsignedSha256:digest(bytes),signedSha256:digest(signed),bytes:signed.length,runtimeEnabled:true,embeddedConfigSha256:m.embeddedConfigSha256,hermesSha256:m.hermesSha256};validateSignedPending(p,m,cert,signed,bytes);for(const [k,value]of [['schema','st250-android-signed-pending-v1'],['runtimeEnabled',false],['embeddedConfigSha256','f'.repeat(64)],['hermesSha256','f'.repeat(64)],['signedSha256','f'.repeat(64)]])assert.throws(()=>validateSignedPending({...p,[k]:value},m,cert,signed,bytes));const altered=makeApk(true,2,{signed:true,binaryManifest:Buffer.from('changed')});assert.throws(()=>validateSignedPending({...p,signedSha256:digest(altered),bytes:altered.length},m,cert,altered,bytes));});
test('registered caller and reusable child forward typed active inputs through actual bounded readonly guards',()=>{const require=createRequire(import.meta.url),fs=require('node:fs'),path=require('node:path'),root=fileURLToPath(new URL('../../',import.meta.url)),yaml=loadContractYaml(root),caller=yaml.parse(fs.readFileSync(path.join(root,'../.github/workflows/subtrack-container-proof.yml'),'utf8')),child=yaml.parse(fs.readFileSync(path.join(root,'../.github/workflows/subtrack-sandbox-android-build.yml'),'utf8'));for(const inputs of [caller.on.workflow_dispatch.inputs,child.on.workflow_dispatch.inputs,child.on.workflow_call.inputs]){assert.equal(inputs.runtime_enabled.type,'boolean');assert.equal(inputs.runtime_enabled.default,false);assert.equal(inputs.version_code.type,'string');assert.equal(inputs.version_code.default,'');}const forward=caller.jobs['android-delivery'].with;assert.equal(forward.runtime_enabled,'${{ inputs.runtime_enabled }}');assert.equal(forward.version_code,'${{ inputs.version_code }}');const check=caller.jobs['android-delivery-authority'].steps.find(s=>s.name==='Reject mixed or untrusted manual delivery').run,prefix=check.slice(0,check.indexOf('          [[ "$ST250_SOURCE_HEAD"')).replace(/\r/g,'');const headStart=prefix.indexOf('[[ "$ST250_SOURCE_HEAD"');const script='set -euo pipefail\n'+(headStart<0?prefix:prefix.slice(0,headStart));assert.ok(script.includes('ST250_ANDROID_RUNTIME_ENABLED'));assert.ok(!script.includes('${{'));const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';for(const [active,version,mode,backend,success]of [['false','','unsigned-apk','false',true],['true','2','unsigned-apk','false',true],['true','2','verify-signed','false',true],['false','2','unsigned-apk','false',false],['true','0','unsigned-apk','false',false],['true','2147483648','unsigned-apk','false',false],['true','2','signing-tools','false',false],['true','2','none','false',false],['true','2','unsigned-apk','true',false]]){const r=spawnSync(bash,['-c',script],{encoding:'utf8',timeout:3000,env:{...process.env,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',GITHUB_REF:'refs/heads/st/native-synthetic-bank',ST250_ANDROID_RUNTIME_ENABLED:active,ST250_ANDROID_VERSION_CODE:version,ST250_ANDROID_MODE:mode,ST250_BACKEND_TRANSFER:backend}});assert.equal(r.status===0,success);}const build=fs.readFileSync(new URL('./build-android.sh',import.meta.url),'utf8'),sign=fs.readFileSync(new URL('./sign-android.sh',import.meta.url),'utf8'),receiver=fs.readFileSync(new URL('./download-android.ps1',import.meta.url),'utf8');assert.ok(build.includes('export SUBTRACK_SANDBOX_RUNTIME_ENABLED="$active"'));assert.ok(build.includes("['expo-updates','expo-dev-launcher']"));assert.ok(sign.includes('wire.validateSignedPending(p,m,cert'));assert.ok(sign.includes('hermesSha256:m.hermesSha256'));assert.ok(receiver.includes("Native 'node' @($module,'validate-pending'"));});
function loadContractYaml(root,env=process.env){
 const require=createRequire(import.meta.url),fs=require('node:fs'),path=require('node:path');
 if(env.ST250_DELIVERY_MODE==='signing-tools')assert.equal(typeof env.ST250_TOOLS_YAML_ROOT,'string');
 if(env.ST250_TOOLS_YAML_ROOT!==undefined){
  assert.equal(env.ST250_DELIVERY_MODE,'signing-tools');assert.ok(path.isAbsolute(env.ST250_TOOLS_YAML_ROOT));
  const pkg=JSON.parse(fs.readFileSync(path.join(env.ST250_TOOLS_YAML_ROOT,'package.json'),'utf8'));
  assert.equal(pkg.name,'yaml');assert.equal(pkg.version,'2.9.1');for(const key of ['dependencies','optionalDependencies','peerDependencies'])assert.equal(Object.keys(pkg[key]??{}).length,0);
  return require(env.ST250_TOOLS_YAML_ROOT);
 }
 const folder=fs.readdirSync(path.join(root,'node_modules/.pnpm')).find(n=>n==='yaml@2.9.1');assert.ok(folder);return require(path.join(root,'node_modules/.pnpm',folder,'node_modules/yaml'));
}
test('tools parser custody works without workspace modules and rejects lock hash or package substitution',()=>{
 const require=createRequire(import.meta.url),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),root=fileURLToPath(new URL('../../',import.meta.url));
 const yamlSource=process.env.ST250_DELIVERY_MODE==='signing-tools'?process.env.ST250_TOOLS_YAML_ROOT:path.join(root,'node_modules/.pnpm/yaml@2.9.1/node_modules/yaml'),owner=fs.mkdtempSync(path.join(os.tmpdir(),'st250-yaml-test-'));
 try{
  const parser=path.join(owner,'package');fs.cpSync(yamlSource,parser,{recursive:true});
  const env={ST250_DELIVERY_MODE:'signing-tools',ST250_TOOLS_YAML_ROOT:parser};
  assert.deepEqual(loadContractYaml(path.join(owner,'fresh-without-node_modules'),env).parse('value: true'),{value:true});
  const preload=path.join(owner,'forbid-workspace.cjs');fs.writeFileSync(preload,"const fs=require('node:fs'),read=fs.readdirSync;fs.readdirSync=function(p,...args){if(String(p).replace(/\\\\/g,'/').includes('node_modules/.pnpm'))throw Error('workspace dependencies forbidden');return read.call(this,p,...args);};");
  const childEnv={...process.env,...env};delete childEnv.NODE_TEST_CONTEXT;const fresh=spawnSync(process.execPath,['--require',preload,'--test','--test-reporter=spec','--test-name-pattern=^registered caller',fileURLToPath(import.meta.url)],{encoding:'utf8',env:childEnv,timeout:10000});assert.equal(fresh.status,0,fresh.stderr);assert.ok(fresh.stdout.includes('registered caller'));
  assert.throws(()=>loadContractYaml(root,{...env,ST250_DELIVERY_MODE:'unsigned-apk'}));
  assert.throws(()=>loadContractYaml(root,{ST250_DELIVERY_MODE:'signing-tools'}));
  const pkgFile=path.join(parser,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgFile,'utf8'));
  for(const patch of [{name:'other'},{version:'2.9.0'},{dependencies:{canary:'1'}}]){fs.writeFileSync(pkgFile,JSON.stringify({...pkg,...patch}));assert.throws(()=>loadContractYaml(root,env));}fs.writeFileSync(pkgFile,JSON.stringify(pkg));
  const workflow=fs.readFileSync(path.join(root,'../.github/workflows/subtrack-sandbox-android-build.yml'),'utf8');
  const validators=workflow.split('// ST250_TOOLS_YAML_VALIDATORS_BEGIN')[1].split('// ST250_TOOLS_YAML_VALIDATORS_END')[0];
  const checks=Function('createHash','Buffer',validators+'\nreturn {validateDependencyLock,validateDependencyArchive};')(crypto.createHash,Buffer);
  const lock=fs.readFileSync(path.join(root,'pnpm-lock.yaml'),'utf8').replace(/\r\n/g,'\n');checks.validateDependencyLock(lock);
  for(const text of ['',lock.replace('sha512-3NxN8','sha512-0NxN8'),lock.replace('  yaml@2.9.1: {}','  yaml@2.9.1:\n    dependencies: {}')])assert.throws(()=>checks.validateDependencyLock(text));
  for(const bytes of [Buffer.alloc(0),Buffer.from('canary'),Buffer.alloc(1048577)])assert.throws(()=>checks.validateDependencyArchive(bytes));
  assert.ok(workflow.includes("trap 'rm -rf -- \"$yaml_owner\"' EXIT"));assert.ok(workflow.includes("redirect:'error'"));
 }finally{fs.rmSync(owner,{recursive:true,force:true});}
});
