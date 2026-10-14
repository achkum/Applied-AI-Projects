import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { JDK_IMAGE,SDK_SHA256,digest,validateManifest,validateTransfer,bind,validateRemote,canonical,tag,inspectToolTar,closeTransferCandidate,validateBackupBinding,assertSignedUpdate,validateSignerIdentity } from './android-transfer-receipt.mjs';
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
