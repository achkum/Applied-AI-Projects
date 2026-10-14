import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const expoRequire = createRequire(require.resolve('expo/package.json'));
const { getConfig } = expoRequire('@expo/config');
const staticConfig = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const names = ['SUBTRACK_APP_VARIANT', 'SUBTRACK_SANDBOX_HTTPS_ORIGIN', 'SUBTRACK_PRIVATE_DEVICE_PROOF',
  'SUBTRACK_PRIVATE_CA_CERT', 'SUBTRACK_PRIVATE_FIXTURE_CONFIG', 'EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC',
  'EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED', 'EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL'];
function configured(env) {
  const before = new Map(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, env);
    return getConfig(root, { skipSDKVersionRequirement: true }).exp;
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}
const sandbox = { SUBTRACK_APP_VARIANT: 'sandbox', SUBTRACK_SANDBOX_HTTPS_ORIGIN: 'https://198.44.116.159' };

test('actual locked ExpoSDK54 config loader preserves existing default configuration', () => {
  assert.equal(require('expo/package.json').version,'54.0.37');
  const config = configured({});
  for (const [key, value] of Object.entries(staticConfig)) assert.deepEqual(config[key], value);
  assert.equal(config.extra?.subtrackSandbox, undefined);
  // Preserve the existing private plugin's missing-certificate failure as well.
  assert.throws(() => configured({ SUBTRACK_PRIVATE_DEVICE_PROOF: 'true' }), /absolute CA certificate path/);
});
test('actual sandbox variant separates identifiers and excludes private plugin', () => {
  const config = configured(sandbox);
  assert.equal(config.name, 'SubTrack Sandbox');
  assert.equal(config.slug, 'subtrack-sandbox');
  assert.equal(config.scheme, 'subtrack-sandbox');
  assert.equal(config.ios.bundleIdentifier, 'se.subtrack.app.sandbox');
  assert.equal(config.android.package, 'se.subtrack.app.sandbox');
  assert.deepEqual(config.plugins, ['expo-router', 'expo-secure-store']);
  assert.deepEqual(config.extra.subtrackSandbox, { variant: 'sandbox', apiBaseUrl: sandbox.SUBTRACK_SANDBOX_HTTPS_ORIGIN,
    runtimeEnabled: false, publicationEnabled: false, privateDiagnosticsEnabled: false });
  for (const key of ['version', 'orientation', 'icon', 'splash', 'assetBundlePatterns', 'web']) assert.deepEqual(config[key], staticConfig[key]);
});
test('unknown variants and noncanonical origins fail before build intent is accepted', () => {
  for (const variant of ['', 'production', 'development', 'Sandbox']) assert.throws(() => configured({ ...sandbox, SUBTRACK_APP_VARIANT: variant }), /App variant rejected/);
  for (const origin of ['', 'http://198.44.116.159', 'https://198.44.116.159/', 'https://198.44.116.159/path',
    'https://198.44.116.159?key=value', 'https://198.44.116.159#fragment', 'https://user:password@198.44.116.159',
    'https://198.44.116.159:443', 'HTTPS://198.44.116.159', ' https://198.44.116.159',
    'https://198.44.116.159\n', 'https://localhost:3443', 'https://api.subtrack.app', 'https://other.example']) {
    assert.throws(() => configured({ ...sandbox, SUBTRACK_SANDBOX_HTTPS_ORIGIN: origin }), /Sandbox origin rejected/);
  }
  assert.throws(() => configured({ SUBTRACK_APP_VARIANT: 'sandbox' }), /Sandbox origin rejected/);
});
test('sandbox build rejects private CA/enrollment/diagnostic configuration contamination', () => {
  for (const name of names.slice(2)) for (const value of ['true', 'false', '']) {
    assert.throws(() => configured({ ...sandbox, [name]: value }), /Sandbox private configuration rejected/);
  }
});
