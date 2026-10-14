/* global module, require, process */
/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load as CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const { X509Certificate } = require('node:crypto');
const { withDangerousMod } = require('expo/config-plugins');

function writeDebugTrust(projectRoot, certificatePath) {
  const certificate = fs.readFileSync(certificatePath, 'utf8');
  const parsed = new X509Certificate(certificate);
  if (!parsed.ca || certificate.includes('PRIVATE KEY'))
    throw new Error('Expected public development CA certificate');
  const root = path.join(projectRoot, 'app/src/debug');
  fs.mkdirSync(path.join(root, 'res/raw'), { recursive: true });
  fs.mkdirSync(path.join(root, 'res/xml'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'res/raw/subtrack_private_ca.pem'),
    certificate,
  );
  fs.writeFileSync(
    path.join(root, 'res/xml/subtrack_private_network.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">localhost</domain><domain includeSubdomains="false">127.0.0.1</domain></domain-config><debug-overrides><trust-anchors><certificates src="@raw/subtrack_private_ca" /></trust-anchors></debug-overrides></network-security-config>\n',
  );
  const manifestPath = path.join(root, 'AndroidManifest.xml');
  let manifest = fs.existsSync(manifestPath)
    ? fs.readFileSync(manifestPath, 'utf8')
    : '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>\n';
  if (!manifest.includes('<application'))
    throw new Error('Missing debug application manifest');
  if (manifest.includes('android:networkSecurityConfig'))
    throw new Error('Conflicting debug network security configuration');
  // Only debug manifest/resources change. Main and release trust remain untouched.
  manifest = manifest.replace(
    '<application',
    '<application android:networkSecurityConfig="@xml/subtrack_private_network"',
  );
  fs.writeFileSync(manifestPath, manifest);
}

function privateRuntimeCa(config) {
  if (process.env.SUBTRACK_PRIVATE_DEVICE_PROOF !== 'true') return config;
  const certificatePath = process.env.SUBTRACK_PRIVATE_CA_CERT;
  if (!certificatePath || !path.isAbsolute(certificatePath))
    throw new Error(
      'Private device proof requires an absolute CA certificate path',
    );
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      writeDebugTrust(mod.modRequest.platformProjectRoot, certificatePath);
      return mod;
    },
  ]);
}
module.exports = privateRuntimeCa;
module.exports.writeDebugTrust = writeDebugTrust;
