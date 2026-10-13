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
  [
    'unknown keyword: :privacy_file_aggregation_enabled',
    'pods-unknown-keyword',
  ],
  ['JSON::ParserError unexpected token at private-canary', 'pods-ruby-json'],
  [
    'SyntaxError syntax error unexpected keyword_end private-canary',
    'pods-ruby-syntax',
  ],
  ['uninitialized constant PrivateCanary', 'pods-ruby-missing-constant'],
  ['Pod::Executable command failed private-canary', 'pods-command-failure'],
  [
    "undefined local variable or method `use_expo_modules!'",
    'pods-ruby-missing-method',
  ],
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
    rubyKeywords: [],
    podfileLines: [],
    rubySources: [],
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
  {
    specs: ['boost', 'RCT-Folly', 'ReactCodegen'],
    rubyMethods: ['exists?'],
    rubyKeywords: [],
    podfileLines: [],
    rubySources: [],
  },
);
const privateLog =
  "Error installing private-canary\nUnable to find a specification for `/private/secret-path`\nundefined method `private-canary'\nprivate-password-token";
assert.deepEqual(knownPodFailureContext(privateLog), {
  specs: [],
  rubyMethods: [],
  rubyKeywords: [],
  podfileLines: [],
  rubySources: [],
});
assert.deepEqual(
  knownPodFailureContext(
    "Error installing boost_private\nundefined method `exists?private'",
  ),
  {
    specs: [],
    rubyMethods: [],
    rubyKeywords: [],
    podfileLines: [],
    rubySources: [],
  },
);
assert.deepEqual(
  knownPodFailureContext(
    'from /private/canary/Podfile:43\nfrom Podfile:43\nunknown keyword: :privacy_file_aggregation_enabled',
  ),
  {
    specs: [],
    rubyMethods: [],
    rubyKeywords: ['privacy_file_aggregation_enabled'],
    podfileLines: [43],
    rubySources: [],
  },
);
assert.deepEqual(
  knownPodFailureContext(
    'from MyPodfile:12\nPodfile:0\nPodfile:10000\nPodfile:-1\nunknown keyword: :privacy_file_aggregation_enabled_private\nunknown keyword: :private_canary',
  ),
  {
    specs: [],
    rubyMethods: [],
    rubyKeywords: [],
    podfileLines: [],
    rubySources: [],
  },
);
assert.equal(
  knownPodFailureContext(
    Array.from({ length: 20 }, (_, i) => `Podfile:${i + 1}`).join('\n'),
  ).podfileLines.length,
  8,
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
for (const [log, reason] of [
  [
    "Included build '/private/canary' does not exist",
    'gradle-included-build-missing',
  ],
  ['Error resolving plugin private-canary', 'gradle-plugin-resolution'],
  [
    'Could not resolve all files for configuration private-canary',
    'gradle-dependency-resolution',
  ],
  [
    "Process 'command node' finished with non-zero exit value 1",
    'gradle-node-process',
  ],
  ['Unsupported class file major version 65', 'gradle-java-toolchain'],
  ['SDK location not found', 'gradle-sdk-location'],
  [
    'Could not compile settings file private-canary',
    'gradle-script-compilation',
  ],
  ['Could not get unknown property private-canary', 'gradle-script-api'],
  ["JSON::ParserError unexpected token at ''", 'pods-empty-json'],
]) {
  assert.equal(nativeFailureCategory(log), reason);
  assert.equal(
    JSON.stringify(nativeFailureReasons(log)).includes('private-canary'),
    false,
  );
}
assert.deepEqual(
  knownPodFailureContext(
    '/private/canary/autolinking_manager.rb:170:in parse\n/private/canary/json/common.rb:216:in parse',
  ).rubySources,
  ['autolinking_manager.rb:170', 'json/common.rb:216'],
);
assert.deepEqual(
  knownPodFailureContext(
    '/private/canary/secret.rb:12\n/private/canary/not_autolinking_manager.rb:170\nautolinking_manager.rb:10000\nautolinking_manager.rb:0\nautolinking_manager.rb:170private-canary',
  ).rubySources,
  [],
);
const sourceDiagnostic = buildFailureDiagnostic(
  '{"phase":"ios-pods","exitCode":1}',
  '/private/password-canary/autolinking_manager.rb:170:in parse\nJSON::ParserError',
);
assert.equal(
  JSON.stringify(sourceDiagnostic).includes('password-canary'),
  false,
);
assert.equal(
  knownPodFailureContext(
    Array.from({ length: 20 }, (_, i) => `codegen_utils.rb:${i + 1}`).join(
      '\n',
    ),
  ).rubySources.length,
  8,
);
console.log(
  'Native loader diagnostics: missing libraries only, deduplication, private path/canary rejection and bounded output PASS',
);
