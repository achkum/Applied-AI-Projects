import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { unsignedTemplate, inspectUnsigned, inspectSigned, validateReceipt, buildDiagnostic } from './android-release-receipt.mjs';

const template = '    buildTypes {\n        debug {\n            signingConfig signingConfigs.debug\n        }\n        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n            minifyEnabled false\n        }\n    }';
const input = () => ({ manifest: '<manifest package="se.subtrack.app.sandbox" android:versionCode="1"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:debuggable="false" android:usesCleartextTraffic="false"/></manifest>',
  bundle: Buffer.from('c61fbc03c103191f00', 'hex'), apk: Buffer.from('synthetic-unsigned-fixture'), sourceHead: 'a'.repeat(40), signatureExit: 1,
  signatureOutput: 'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF\n' });
const receipt = () => ({ ...inspectUnsigned(input()), cleanup: 'REMOVED' });

test('actual signed inspection binds verified one-signer certificate manifest and unchanged Hermes to authenticated unsigned bytes',()=>{
  const unsigned=input(),value=inspectUnsigned(unsigned),cert='e'.repeat(64);
  const {schemaVersion,signatureVerified,...fields}=value;
  const manifest={schema:'st250-android-transfer-manifest-v1',...fields,runId:'1-1',defaultTargetHead:'b'.repeat(40),draftTag:`st250-android-stage-${value.sourceHead}-1-1`,buildScriptSha256:'c'.repeat(64),receiptModuleSha256:'d'.repeat(64)};
  const signed={manifest:unsigned.manifest,bundle:unsigned.bundle,unsignedBundle:unsigned.bundle,unsignedApk:unsigned.apk,signedApk:Buffer.from('synthetic signed APK Sig Block 42'),signatureOutput:`Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${cert}\n`,signatureExit:0,alignmentExit:0,expectedCertificateSha256:cert,unsignedManifest:manifest};
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
