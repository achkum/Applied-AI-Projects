import {crc32 as zipCrc,deflateRawSync} from 'node:zlib';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { unsignedTemplate, inspectUnsigned, inspectSigned, validateReceipt, buildDiagnostic } from './android-release-receipt.mjs';


function makeApk(runtime=false,version=1,options={}){
 const config={android:{package:'se.subtrack.app.sandbox',versionCode:version},ios:{bundleIdentifier:'se.subtrack.app.sandbox'},extra:{subtrackSandbox:{variant:'sandbox',apiBaseUrl:'https://198.44.116.159',runtimeEnabled:runtime,publicationEnabled:false,privateDiagnosticsEnabled:false,...options.marker}}},files=[['assets/app.config',Buffer.from(options.configText??JSON.stringify(config))],['assets/index.android.bundle',options.hermes??Buffer.from('c61fbc03c103191f00','hex')],['AndroidManifest.xml',options.binaryManifest??Buffer.from('public binary manifest unit bytes')],...(options.duplicate?[['assets/app.config',Buffer.from('{}')]]:[])],locals=[],central=[];let offset=0;
 for(const [name,data]of files){const n=Buffer.from(name),compressed=options.deflate?deflateRawSync(data):data,crc=zipCrc(data),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);if(options.descriptor)local.writeUInt16LE(8,6);local.writeUInt16LE(options.deflate?8:0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);if(options.descriptor)entry.writeUInt16LE(8,8);entry.writeUInt16LE(options.deflate?8:0,10);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);let descriptor=Buffer.alloc(0);if(options.descriptor){descriptor=Buffer.alloc(options.descriptor==='signature'?16:12);let d=0;if(descriptor.length===16){descriptor.writeUInt32LE(0x08074b50);d=4;}descriptor.writeUInt32LE(crc,d);descriptor.writeUInt32LE(compressed.length,d+4);descriptor.writeUInt32LE(data.length,d+8);local.writeUInt32LE(0,14);local.writeUInt32LE(0,18);local.writeUInt32LE(0,22);}locals.push(local,n,compressed,descriptor);central.push(entry,n);offset+=local.length+n.length+compressed.length+descriptor.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22),comment=Buffer.from(options.signed?'APK Sig Block 42':'');end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(comment.length,20);return Buffer.concat([...locals,cd,end,comment]);
}

const template = '    buildTypes {\n        debug {\n            signingConfig signingConfigs.debug\n        }\n        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n            minifyEnabled false\n        }\n    }';
const input = () => ({ manifest: '<manifest package="se.subtrack.app.sandbox" android:versionCode="1"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:debuggable="false" android:usesCleartextTraffic="false"/></manifest>',
  bundle: Buffer.from('c61fbc03c103191f00', 'hex'), apk: makeApk(), sourceHead: 'a'.repeat(40), signatureExit: 1,
  signatureOutput: 'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF\n' });
const receipt = () => ({ ...inspectUnsigned(input()), cleanup: 'REMOVED' });

test('actual signed inspection binds verified one-signer certificate manifest and unchanged Hermes to authenticated unsigned bytes',()=>{
  const unsigned=input(),value=inspectUnsigned(unsigned),cert='e'.repeat(64);
  const fields=Object.fromEntries(Object.entries(value).filter(([key])=>!['schemaVersion','signatureVerified'].includes(key)));
  const manifest={schema:'st250-android-transfer-manifest-v1',...fields,runId:'1-1',defaultTargetHead:'b'.repeat(40),draftTag:`st250-android-stage-${value.sourceHead}-1-1`,buildScriptSha256:'c'.repeat(64),receiptModuleSha256:'d'.repeat(64)};
  const signed={manifest:unsigned.manifest,bundle:unsigned.bundle,unsignedBundle:unsigned.bundle,unsignedApk:unsigned.apk,signedApk:makeApk(false,1,{signed:true}),signatureOutput:`Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${cert}\n`,signatureExit:0,alignmentExit:0,expectedCertificateSha256:cert,unsignedManifest:manifest};
  const result=inspectSigned(signed);assert.equal(validateReceipt({...result,cleanup:'REMOVED'},true).signerCertificateSha256,cert);
  for(const patch of[{signatureExit:1},{alignmentExit:1},{expectedCertificateSha256:'f'.repeat(64)},{bundle:Buffer.from('replaced')},{unsignedApk:Buffer.from('replaced')},{signedApk:unsigned.apk},{manifest:unsigned.manifest.replace('versionCode="1"','versionCode="2"')},{manifest:unsigned.manifest.replace('debuggable="false"','debuggable="true"')},{signatureOutput:signed.signatureOutput+'Signer #2 certificate SHA-256 digest: '+cert+'\n'},{signatureOutput:signed.signatureOutput+'Signer #1 certificate DN: CN=Android Debug\n'},{unsignedManifest:{...manifest,runtimeEnabled:true}}])assert.throws(()=>inspectSigned({...signed,...patch}));
});

test('actual post-cleanup inline importer exits successfully without invoking standalone CLI', () => {
  const script = readFileSync(new URL('./build-android.sh', import.meta.url), 'utf8');
  const command = script.split('\n').find(line => line.startsWith("printf '%s' \"$pending\" | node --input-type=module -e "));
  const match = command.match(/ -e '([^']+)' st250-receipt-import "\$root\/tools\/sandbox\/android-release-receipt\.mjs"$/);
  assert(match, 'actual importer invocation must keep a separate entrypoint argument');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', match[1], 'st250-receipt-import', fileURLToPath(new URL('./android-release-receipt.mjs', import.meta.url))], { input: JSON.stringify(receipt()), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), receipt());
});

test('build diagnostics emit finite metadata without compiler text, paths or credentials', () => {
  const failure = (task, reason) => `> Task :expo:compileReleaseKotlin SUCCESS\nExecution failed for task '${task}'.\n${reason}\nprivate-canary=https://private.invalid/secret`;
  assert.equal(buildDiagnostic(failure(':app:bundleReleaseJsAndAssets', 'Could not resolve dependency')), 'ST250_ANDROID_BUILD_FAILURE task=JS_BUNDLE category=DEPENDENCY');
  assert.equal(buildDiagnostic(failure(':expo:compileReleaseKotlin', 'Unresolved reference')), 'ST250_ANDROID_BUILD_FAILURE task=KOTLIN category=COMPILER');
  assert.equal(buildDiagnostic(failure(':app:compileReleaseJavaWithJavac', 'cannot find symbol')), 'ST250_ANDROID_BUILD_FAILURE task=JAVA category=COMPILER');
  assert.equal(buildDiagnostic(failure(':app:externalNativeBuildRelease', 'OutOfMemoryError')), 'ST250_ANDROID_BUILD_FAILURE task=NATIVE category=MEMORY');
  assert.equal(buildDiagnostic(failure(':app:assembleRelease', 'private-canary')), 'ST250_ANDROID_BUILD_FAILURE task=OTHER category=UNKNOWN');
  assert.equal(buildDiagnostic('Gradle build daemon disappeared unexpectedly'), 'ST250_ANDROID_BUILD_FAILURE task=OTHER category=UNKNOWN');
  for (const value of [null, {}, Buffer.from('private-canary'), 'x'.repeat(8 * 1024 * 1024 + 1)]) {
    assert.equal(buildDiagnostic(value), 'ST250_ANDROID_BUILD_FAILURE task=OTHER category=UNKNOWN');
  }
  assert.equal(buildDiagnostic('> Task :expo:compileReleaseKotlin SUCCESS'), 'ST250_ANDROID_BUILD_FAILURE task=OTHER category=UNKNOWN');
});

test('locked release stanza loses only debug signing; unknown/duplicate/idempotent rewrites reject', () => {
  const output = unsignedTemplate(template);
  assert.equal(output, template.replace('            signingConfig signingConfigs.debug\n            minifyEnabled', '            signingConfig null\n            minifyEnabled'));
  assert.equal(output.match(/signingConfig signingConfigs.debug/g).length, 1);
  for (const bad of [null, '', template + template, template.replace('Caution!', 'Warning!'), output, template.replace('        debug {', '        other {')]) assert.throws(() => unsignedTemplate(bad));
});

test('actual binary evidence policy accepts only unsigned Hermes sandbox Release and fixed closed receipt', () => {
  const value = validateReceipt(receipt()); assert.equal(value.signatureVerified, false); assert.equal(value.runtimeEnabled, false); assert(Object.isFrozen(value));
  for (const key of Object.keys(value)) {
    const missing = { ...value }; delete missing[key]; assert.throws(() => validateReceipt(missing));
  }
  for (const bad of [null, {}, { ...value, extra: true }, { ...value, cleanup: 'PENDING' }, { ...value, runtimeEnabled: true },
    { ...value, signatureVerified: true }, { ...value, applicationId: 'se.subtrack.app' }, { ...value, bytes: 0 }, { ...value, bytes: 200 * 1024 * 1024 + 1 },
    { ...value, sourceHead: 'bad' }, { ...value, unsignedSha256: 'bad' }, { ...value, versionCode: 0 }, { ...value, zipAligned: false },
    { ...value, hermesBundled: false }, { ...value, privateCaIncluded: true }, { ...value, debuggable: true }, Object.create(value)]) assert.throws(() => validateReceipt(bad));
  const hostile = { ...value }; Object.defineProperty(hostile, 'cleanup', { get() { throw Error('private-canary'); } }); assert.throws(() => validateReceipt(hostile), /preparation unavailable/);
  for (const key of Object.keys(value)) {
    const hidden = { ...value }; Object.defineProperty(hidden, key, { value: hidden[key], enumerable: false });
    assert.throws(() => validateReceipt(hidden), /preparation unavailable/);
  }
});

test('wrong package/debug/CA/cleartext/target/bundle/signature payload rejects without leaking raw fields', () => {
  const valid = input();
  for (const patch of [{ manifest: valid.manifest.replace('.sandbox', '') }, { manifest: valid.manifest.replace('debuggable="false"', 'debuggable="true"') },
    { manifest: valid.manifest.replace('<application ', '<application android:networkSecurityConfig="@xml/private" ') },
    { manifest: valid.manifest.replace('usesCleartextTraffic="false"', 'usesCleartextTraffic="true"') },
    { manifest: valid.manifest.replace('targetSdkVersion="36"', 'targetSdkVersion="35"') }, { manifest: '' },
    { bundle: Buffer.from('debug plain JS') }, { apk: Buffer.from('APK Sig Block 42') }, { signatureExit: 0 },
    { signatureOutput: 'private-canary tool crash' }, { signatureOutput: 'DOES NOT VERIFY\nERROR: invalid signed APK' }]) {
    assert.throws(() => inspectUnsigned({ ...valid, ...patch }), /preparation unavailable/);
  }
});

test('signed schema is separate and cannot bless identical unsigned APK or missing certificate identity', () => {
  const signed = { ...receipt(), signedSha256: 'b'.repeat(64), signerCertificateSha256: 'c'.repeat(64), signatureVerified: true };
  assert.equal(validateReceipt(signed, true).signatureVerified, true);
  assert.throws(() => validateReceipt(signed));
  assert.throws(() => validateReceipt({ ...signed, signedSha256: signed.unsignedSha256 }, true));
  assert.throws(() => validateReceipt({ ...signed, signerCertificateSha256: 'debug' }, true));
  assert.throws(() => validateReceipt({ ...signed, signatureVerified: false }, true));
  for (const key of ['signedSha256', 'signerCertificateSha256']) {
    const hidden = { ...signed }; Object.defineProperty(hidden, key, { value: hidden[key], enumerable: false });
    assert.throws(() => validateReceipt(hidden, true), /preparation unavailable/);
  }
});
test('active v2 unsigned/signed receipts derive runtime and both hashes from actual APK assets; preparation remains v1',()=>{const active={...input(),runtimeEnabled:true,manifest:input().manifest.replace('versionCode="1"','versionCode="2"'),apk:makeApk(true,2)},v=inspectUnsigned(active);assert.equal(v.schemaVersion,2);assert.equal(v.runtimeEnabled,true);assert.equal(v.versionCode,2);assert.equal(Object.keys(validateReceipt({...v,cleanup:'REMOVED'})).length,18);assert.throws(()=>inspectUnsigned({...active,runtimeEnabled:false}));assert.throws(()=>inspectUnsigned({...input(),runtimeEnabled:true}));const fields=Object.fromEntries(Object.entries(v).filter(([key])=>!['schemaVersion','signatureVerified'].includes(key))),m={schema:'st250-android-transfer-manifest-v2',...fields,runId:'1-1',defaultTargetHead:'b'.repeat(40),draftTag:`st250-android-stage-${v.sourceHead}-1-1`,buildScriptSha256:'c'.repeat(64),receiptModuleSha256:'d'.repeat(64)},cert='e'.repeat(64),signed={manifest:active.manifest,bundle:active.bundle,unsignedBundle:active.bundle,unsignedApk:active.apk,signedApk:makeApk(true,2,{signed:true}),signatureOutput:`Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${cert}\n`,signatureExit:0,alignmentExit:0,expectedCertificateSha256:cert,unsignedManifest:m};const result=inspectSigned(signed);assert.equal(validateReceipt({...result,cleanup:'REMOVED'},true).runtimeEnabled,true);for(const patch of [{signedApk:makeApk(true,2,{signed:true,marker:{publicationEnabled:true}})},{signedApk:makeApk(true,2,{signed:true,binaryManifest:Buffer.from('substituted manifest')})},{unsignedManifest:{...m,embeddedConfigSha256:'f'.repeat(64)}}])assert.throws(()=>inspectSigned({...signed,...patch}));for(const key of ['embeddedConfigSha256','hermesSha256']){const bad={...v,cleanup:'REMOVED'};delete bad[key];assert.throws(()=>validateReceipt(bad));}assert.throws(()=>validateReceipt({...v,schemaVersion:1,cleanup:'REMOVED'}));assert.throws(()=>validateReceipt({...receipt(),schemaVersion:2}));});
