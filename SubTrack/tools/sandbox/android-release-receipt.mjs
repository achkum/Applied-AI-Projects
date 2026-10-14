import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateManifest, dataField, inspectApkRuntime, apkAssets } from './android-transfer-receipt.mjs';

const unavailable = () => { throw new Error('Sandbox Android preparation unavailable'); };
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fields = ['schemaVersion', 'sourceHead', 'unsignedSha256', 'applicationId', 'versionCode', 'variant', 'origin', 'buildType', 'debuggable', 'privateCaIncluded', 'hermesBundled', 'runtimeEnabled', 'bytes', 'signatureVerified', 'zipAligned', 'cleanup'];

export function buildDiagnostic(text) {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) return 'ST250_ANDROID_BUILD_FAILURE task=OTHER category=UNKNOWN';
  const failedTask = text.match(/Execution failed for task '(:[^'\r\n]{1,160})'\./)?.[1] ?? '';
  const task = /compile\w*Kotlin/.test(failedTask) ? 'KOTLIN' :
    /compile\w*JavaWithJavac/.test(failedTask) ? 'JAVA' : /bundleReleaseJsAndAssets/.test(failedTask) ? 'JS_BUNDLE' :
      /(?:CMake|externalNativeBuild)/.test(failedTask) ? 'NATIVE' : 'OTHER';
  const category = /(?:OutOfMemoryError|heap space)/i.test(text) ? 'MEMORY' :
    /(?:Could not resolve|Could not find|Could not GET|Could not HEAD)/.test(text) ? 'DEPENDENCY' :
      /(?:Unresolved reference|cannot find symbol|Compilation error|compilation failed)/i.test(text) ? 'COMPILER' : 'UNKNOWN';
  return `ST250_ANDROID_BUILD_FAILURE task=${task} category=${category}`;
}

export function validateReceipt(value, signed = false) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) unavailable();
  const active=dataField(value,'schemaVersion')===2;const keys = [...fields,...(signed?['signedSha256','signerCertificateSha256']:[]),...(active?['embeddedConfigSha256','hermesSha256']:[])];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !descriptors[key] || !('value' in descriptors[key]) || descriptors[key].enumerable !== true)) unavailable();
  if (value.schemaVersion !== (active?2:1) || typeof value.sourceHead !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceHead) || !hex(value.unsignedSha256) ||
      value.applicationId !== 'se.subtrack.app.sandbox' || !Number.isSafeInteger(value.versionCode) || value.versionCode < 1 ||
      value.variant !== 'sandbox' || value.origin !== 'https://198.44.116.159' || value.buildType !== 'release' ||
      value.debuggable !== false || value.privateCaIncluded !== false || value.hermesBundled !== true || value.runtimeEnabled !== active || (active&&(!hex(value.embeddedConfigSha256)||!hex(value.hermesSha256))) ||
      !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 200 * 1024 * 1024 ||
      value.signatureVerified !== signed || value.zipAligned !== true || value.cleanup !== 'REMOVED' ||
      (signed && (!hex(value.signedSha256) || !hex(value.signerCertificateSha256) || value.signedSha256 === value.unsignedSha256))) unavailable();
  return Object.freeze({ ...value });
}

export function unsignedTemplate(source) {
  if (typeof source !== 'string') unavailable();
  const marker = '        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n';
  if (source.split(marker).length !== 2 || source.match(/signingConfig signingConfigs\.debug/g)?.length !== 2 ||
      !source.includes('        debug {\n            signingConfig signingConfigs.debug\n        }') ||
      source.includes('signingConfig null')) unavailable();
  return source.replace(marker, marker.replace('signingConfig signingConfigs.debug', 'signingConfig null'));
}

export function inspectUnsigned({ manifest, bundle, apk, signatureOutput, signatureExit, sourceHead, runtimeEnabled=false }) {
  if (typeof manifest !== 'string' || manifest.length > 1024 * 1024 || manifest.match(/<manifest\b/g)?.length !== 1 ||
      !/\bpackage="se\.subtrack\.app\.sandbox"/.test(manifest) ||
      /android:debuggable="true"|android:usesCleartextTraffic="true"|android:networkSecurityConfig=/.test(manifest) ||
      /private-runtime|localhost:3443|PRIVATE_CA|EXDevLauncher|expo\.modules\.updates\.ENABLED/i.test(manifest)) unavailable();
  const version = manifest.match(/\bandroid:versionCode="([1-9][0-9]*)"/);
  if (!version || !/android:targetSdkVersion="36"/.test(manifest) || !/android:minSdkVersion="24"/.test(manifest)) unavailable();
  if (!Buffer.isBuffer(bundle) || bundle.length < 8 || !bundle.subarray(0, 8).equals(Buffer.from('c61fbc03c103191f', 'hex')) ||
      !Buffer.isBuffer(apk) || apk.length < 1 || apk.length > 200 * 1024 * 1024 || apk.includes(Buffer.from('APK Sig Block 42')) ||
      signatureExit !== 1 || typeof signatureOutput !== 'string' || signatureOutput.length > 16384 ||
      !/DOES NOT VERIFY/.test(signatureOutput) || !/ERROR: Missing META-INF\/MANIFEST\.MF/.test(signatureOutput)) unavailable();
  const measured=inspectApkRuntime(apk,Number(version[1]),runtimeEnabled);if(!apkAssets(apk).hermes.equals(bundle))unavailable();return { schemaVersion: runtimeEnabled?2:1, ...(runtimeEnabled?measured:{}), sourceHead, unsignedSha256: createHash('sha256').update(apk).digest('hex'),
    applicationId: 'se.subtrack.app.sandbox', versionCode: Number(version[1]), variant: 'sandbox', origin: 'https://198.44.116.159',
    buildType: 'release', debuggable: false, privateCaIncluded: false, hermesBundled: true, runtimeEnabled,
    bytes: apk.length, signatureVerified: false, zipAligned: true };
}

export function inspectSigned({manifest,bundle,unsignedBundle,unsignedApk,signedApk,signatureOutput,signatureExit,alignmentExit,expectedCertificateSha256,unsignedManifest}) {
  validateManifest(unsignedManifest,'apk');
  // The authenticated unsigned manifest binds source/runtime intent; actual signed
  // manifest and unchanged Hermes bytes prove that signing did not replace them.
  if (!unsignedManifest || unsignedManifest.applicationId !== 'se.subtrack.app.sandbox' ||
    !hex(expectedCertificateSha256) || !Buffer.isBuffer(unsignedApk) || !Buffer.isBuffer(signedApk) ||
    createHash('sha256').update(unsignedApk).digest('hex') !== unsignedManifest.unsignedSha256 || unsignedApk.length !== unsignedManifest.bytes ||
    signedApk.length < 1 || signedApk.length > 200*1024*1024 || !signedApk.includes(Buffer.from('APK Sig Block 42')) || signedApk.equals(unsignedApk) || !Buffer.isBuffer(bundle) || !Buffer.isBuffer(unsignedBundle) || !bundle.equals(unsignedBundle) ||
    bundle.length < 8 || !bundle.subarray(0,8).equals(Buffer.from('c61fbc03c103191f','hex')) || signatureExit !== 0 || alignmentExit !== 0 ||
    typeof signatureOutput !== 'string' || signatureOutput.length > 16384 || !/^Verifies\s*$/m.test(signatureOutput) ||
    (signatureOutput.match(/^Number of signers: 1$/gm)?.length !== 1) || (signatureOutput.match(/^Signer #[0-9]+ certificate SHA-256 digest: /gm)?.length !== 1) ||
    !/^Verified using v2 scheme \(APK Signature Scheme v2\): true$/m.test(signatureOutput)) unavailable();
  const cert = signatureOutput.match(/^Signer #1 certificate SHA-256 digest: ([A-Fa-f0-9]{64})$/m)?.[1]?.toLowerCase();
  if (cert !== expectedCertificateSha256 || /CN=Android Debug|DOES NOT VERIFY|^Signer #[2-9]/mi.test(signatureOutput) ||
    typeof manifest !== 'string' || manifest.length > 1024*1024 || manifest.match(/<manifest\b/g)?.length !== 1 ||
    !/\bpackage="se\.subtrack\.app\.sandbox"/.test(manifest) || !/android:targetSdkVersion="36"/.test(manifest) || !/android:minSdkVersion="24"/.test(manifest) ||
    /android:debuggable="true"|android:usesCleartextTraffic="true"|android:networkSecurityConfig=|private-runtime|localhost:3443|PRIVATE_CA|EXDevLauncher|expo\.modules\.updates\.ENABLED/i.test(manifest) ||
    Number(manifest.match(/\bandroid:versionCode="([1-9][0-9]*)"/)?.[1]) !== unsignedManifest.versionCode) unavailable();
  const active=unsignedManifest.runtimeEnabled===true,measured=inspectApkRuntime(signedApk,unsignedManifest.versionCode,active),prior=inspectApkRuntime(unsignedApk,unsignedManifest.versionCode,active);if(!apkAssets(signedApk).manifest.equals(apkAssets(unsignedApk).manifest)||!apkAssets(signedApk).hermes.equals(bundle)||!apkAssets(unsignedApk).hermes.equals(unsignedBundle))unavailable();if(active&&['embeddedConfigSha256','hermesSha256'].some(k=>measured[k]!==unsignedManifest[k]||prior[k]!==unsignedManifest[k]))unavailable();return {schemaVersion:active?2:1,...(active?measured:{}),sourceHead:unsignedManifest.sourceHead,unsignedSha256:unsignedManifest.unsignedSha256,applicationId:'se.subtrack.app.sandbox',versionCode:unsignedManifest.versionCode,
    variant:'sandbox',origin:'https://198.44.116.159',buildType:'release',debuggable:false,privateCaIncluded:false,hermesBundled:true,runtimeEnabled:active,bytes:signedApk.length,
    signatureVerified:true,zipAligned:true,signedSha256:createHash('sha256').update(signedApk).digest('hex'),signerCertificateSha256:cert};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'template' && args.length === 1) {
      if (!lstatSync(args[0]).isFile() || lstatSync(args[0]).isSymbolicLink()) unavailable();
      writeFileSync(args[0], unsignedTemplate(readFileSync(args[0], 'utf8')));
    } else if (mode === 'inspect' && args.length === 6) {
      const [manifestFile, bundleFile, apkFile, signatureFile, signatureExit, sourceHead] = args;
      const result = inspectUnsigned({ manifest: readFileSync(manifestFile, 'utf8'), bundle: readFileSync(bundleFile), apk: readFileSync(apkFile),
        signatureOutput: readFileSync(signatureFile, 'utf8'), signatureExit: Number(signatureExit), sourceHead,runtimeEnabled:process.env.SUBTRACK_SANDBOX_RUNTIME_ENABLED==='true' });
      if (!/^[a-f0-9]{40}$/.test(sourceHead)) unavailable();
      process.stdout.write(JSON.stringify(result));
    } else if (mode === 'build-diagnostic' && args.length === 1) {
      const stat = lstatSync(args[0]);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) unavailable();
      process.stdout.write(buildDiagnostic(readFileSync(args[0], 'utf8')) + '\n');
    } else if (mode === 'inspect-signed' && args.length === 10) {
      const [manifest,bundle,unsignedBundle,unsignedApk,signedApk,signature,signatureExit,alignmentExit,certificate,unsignedManifest]=args;
      process.stdout.write(JSON.stringify(inspectSigned({manifest:readFileSync(manifest,'utf8'),bundle:readFileSync(bundle),unsignedBundle:readFileSync(unsignedBundle),unsignedApk:readFileSync(unsignedApk),signedApk:readFileSync(signedApk),signatureOutput:readFileSync(signature,'utf8'),signatureExit:Number(signatureExit),alignmentExit:Number(alignmentExit),expectedCertificateSha256:certificate,unsignedManifest:JSON.parse(readFileSync(unsignedManifest,'utf8'))})));
    } else if (mode === 'close' && args.length === 1) {
      process.stdout.write(JSON.stringify(validateReceipt({ ...JSON.parse(readFileSync(args[0], 'utf8')), cleanup: 'REMOVED' })) + '\n');
    } else unavailable();
  } catch { process.stderr.write('Sandbox Android preparation unavailable\n'); process.exitCode = 1; }
}
