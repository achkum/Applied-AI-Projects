import assert from 'node:assert/strict';
import console from 'node:console';
import {
  missingNativeLibraries,
  nativeFailureCategory,
  buildFailureDiagnostic,
  nativeFailureReasons,
  knownPodFailureContext,
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
const classificationCases = [
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
  [
    "[!] Invalid 'Podfile' file: undefined method `exists?' for File:Class",
    'pods-ruby-missing-method',
  ],
  [
    '[!] Invalid Podfile file: LoadError cannot load such file -- private-canary',
    'pods-ruby-load-error',
  ],
  [
    '[Codegen] Error: UnsupportedModulePropertyParserError private-canary',
    'pods-codegen',
  ],
  [
    'Verification checksum was incorrect, expected private-canary',
    'pods-download-checksum',
  ],
  ['curl: (22) The requested URL returned error: 404', 'pods-download-http'],
  [
    'tar: Error is not in gzip format private-canary',
    'pods-archive-extraction',
  ],
  ['[!] Error installing boost', 'pods-download'],
  [
    '[!] CocoaPods could not find compatible versions for pod "ReactCodegen"',
    'pods-version-conflict',
  ],
  [
    '[!] Unable to find a specification for `RCT-Folly`',
    'pods-missing-specification',
  ],
  [
    "[!] Invalid 'RNReanimated.podspec' file: private-canary",
    'pods-invalid-podspec',
  ],
  ['[!] Invalid Podfile file: private-canary', 'pods-invalid-podfile'],
  [
    '[!] No Podfile found in project directory private-canary',
    'pods-missing-podfile',
  ],
  [
    '[!] Could not automatically select an Xcode project private-canary',
    'pods-project-selection',
  ],
  [
    '[!] Unable to add a source with url private-canary',
    'pods-source-unavailable',
  ],
  ['SSL_connect: certificate verify failed private-canary', 'tls-validation'],
];
for (const [text, category] of classificationCases)
  assert.equal(nativeFailureCategory(text), category);
assert.equal(
  nativeFailureReasons(classificationCases.map(([text]) => text).join('\n'))
    .length,
  16,
);
assert.deepEqual(
  buildFailureDiagnostic(
    '{"phase":"ios-pods","exitCode":1}',
    '[!] private-canary',
  ),
  {
    phase: 'ios-pods',
    exitCode: 1,
    category: 'pods-failure',
    reasons: ['pods-failure'],
    specs: [],
    rubyMethods: [],
  },
);
assert.deepEqual(
  nativeFailureReasons(
    "[!] Invalid Podfile file: undefined method `exists?' for File:Class",
  ),
  ['pods-ruby-missing-method', 'pods-invalid-podfile', 'pods-failure'],
);
assert.deepEqual(
  knownPodFailureContext(
    'Error installing boost\nUnable to find a specification for `RCT-Folly`\nCocoaPods could not find compatible versions for pod "ReactCodegen"\nundefined method `exists?\' for File:Class',
  ),
  { specs: ['boost', 'RCT-Folly', 'ReactCodegen'], rubyMethods: ['exists?'] },
);
const privateLog =
  "Error installing private-canary\nUnable to find a specification for `/private/secret-path`\nundefined method `private-canary'\nprivate-password-token";
assert.deepEqual(knownPodFailureContext(privateLog), {
  specs: [],
  rubyMethods: [],
});
assert.deepEqual(
  knownPodFailureContext(
    "Error installing boost_private\nundefined method `exists?private'",
  ),
  { specs: [], rubyMethods: [] },
);
assert.equal(
  JSON.stringify(
    buildFailureDiagnostic('{"phase":"ios-pods","exitCode":1}', privateLog),
  ).includes('private-canary'),
  false,
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
