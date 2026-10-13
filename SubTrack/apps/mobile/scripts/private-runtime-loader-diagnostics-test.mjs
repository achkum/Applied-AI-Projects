import assert from 'node:assert/strict';
import console from 'node:console';
import {
  missingNativeLibraries,
  nativeFailureCategory,
  buildFailureDiagnostic,
} from './private-runtime-loader-diagnostics.mjs';

assert.deepEqual(
  missingNativeLibraries(
    'libpulse.so.0 => not found\n/path/tool: error while loading shared libraries: libpulse.so.0: cannot open shared object file\nlibQt6Core.so.6 => /private/path/lib.so (0x1234)',
  ),
  ['libpulse.so.0'],
);
assert.deepEqual(
  missingNativeLibraries(
    'private-canary-password\n/private/libsecret.so.1 => not found\nlibbad;inject.so.1 => not found\nlibbad.so.credential => not found',
  ),
  [],
);
assert.deepEqual(missingNativeLibraries(''), []);
assert.equal(
  missingNativeLibraries(
    Array.from(
      { length: 30 },
      (_, index) => `libtest${index}.so.1 => not found`,
    ).join('\n'),
  ).length,
  16,
);
for (const [text, category] of [
  [
    'PluginError: Failed to resolve plugin private-canary',
    'expo-plugin-resolution',
  ],
  ["Cannot find module '/private/secret-path'", 'module-resolution'],
  ['AUTH_RESTART_REQUIRED private-canary', 'server-policy-rejected'],
  ['42501 permission denied for schema private-canary', 'postgres-privilege'],
  ['42P01 relation private-canary does not exist', 'postgres-schema'],
  ['ERR_TLS_CERT_ALTNAME_INVALID private-canary', 'tls-validation'],
  ['EADDRINUSE private-canary', 'loopback-port-in-use'],
  ['ECONNREFUSED private-canary', 'connection-refused'],
  ['ENOTFOUND private-canary', 'network-resolution'],
  ['ETIMEDOUT private-canary', 'deadline'],
  ['[!] CocoaPods private-canary', 'pods-failure'],
  ['BUILD FAILED private-canary', 'compiler-failure'],
  ['private-canary-password-with-no-known-error', 'unclassified'],
])
  assert.equal(nativeFailureCategory(text), category);
assert.deepEqual(
  buildFailureDiagnostic(
    '{"phase":"ios-pods","exitCode":1}',
    '[!] private-canary',
  ),
  { phase: 'ios-pods', exitCode: 1, category: 'pods-failure' },
);
for (const json of [
  'null',
  'not-json',
  '{"phase":"private-canary","exitCode":1}',
  '{"phase":"prebuild","exitCode":-1}',
  '{"phase":"prebuild","exitCode":256}',
  '{"phase":"prebuild","exitCode":1.5}',
  '{"phase":"prebuild","exitCode":1,"secret":"private-canary"}',
])
  assert.equal(buildFailureDiagnostic(json, 'private-canary'), null);
console.log(
  'Native loader diagnostics: missing libraries only, deduplication, private path/canary rejection and bounded output PASS',
);
