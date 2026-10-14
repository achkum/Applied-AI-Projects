import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsignedTemplate, inspectUnsigned, validateReceipt } from './android-release-receipt.mjs';

const template = '    buildTypes {\n        debug {\n            signingConfig signingConfigs.debug\n        }\n        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n            minifyEnabled false\n        }\n    }';
const input = () => ({ manifest: '<manifest package="se.subtrack.app.sandbox" android:versionCode="1"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:debuggable="false" android:usesCleartextTraffic="false"/></manifest>',
  bundle: Buffer.from('c61fbc03c103191f00', 'hex'), apk: Buffer.from('synthetic-unsigned-fixture'), sourceHead: 'a'.repeat(40), signatureExit: 1,
  signatureOutput: 'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF\n' });
const receipt = () => ({ ...inspectUnsigned(input()), cleanup: 'REMOVED' });

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
