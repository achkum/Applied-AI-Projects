import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Only safe shared-library basenames may leave private loader/tool output. */
export function missingNativeLibraries(text) {
  const result = new Set();
  for (const line of text.split(/\r?\n/)) {
    const ldd = /^\s*(\S+)\s+=>\s+not found\s*$/.exec(line);
    const loader = /error while loading shared libraries:\s*(\S+):\s/.exec(
      line,
    );
    const candidate = ldd?.[1] ?? loader?.[1];
    if (
      candidate &&
      /^lib[A-Za-z0-9_.+-]{1,70}\.so(?:\.[0-9]{1,8}){0,4}$/.test(candidate)
    )
      result.add(candidate);
  }
  return [...result].slice(0, 16);
}

export function nativeFailureCategory(text) {
  return nativeFailureReasons(text)[0] ?? 'unclassified';
}

export function nativeFailureReasons(text) {
  const reasons = [];
  if (
    /Included build[^\n]*does not exist|Project directory[^\n]*does not exist/i.test(
      text,
    )
  )
    reasons.push('gradle-included-build-missing');
  if (
    /Error resolving plugin|Plugin \[[^\n]*was not found|Could not resolve plugin artifact/i.test(
      text,
    )
  )
    reasons.push('gradle-plugin-resolution');
  if (
    /Could not resolve all (files|dependencies|artifacts)|Could not find [^\n]*:|Could not resolve [^\n]*:/i.test(
      text,
    )
  )
    reasons.push('gradle-dependency-resolution');
  if (
    /A problem occurred starting process|Cannot run program[^\n]*node|Process[^\n]*node[^\n]*finished with non-zero/i.test(
      text,
    )
  )
    reasons.push('gradle-node-process');
  if (
    /Unsupported class file major version|requires Java [0-9]+|No matching toolchains found/i.test(
      text,
    )
  )
    reasons.push('gradle-java-toolchain');
  if (
    /SDK location not found|Failed to find Platform SDK|Failed to find Build Tools revision/i.test(
      text,
    )
  )
    reasons.push('gradle-sdk-location');
  if (
    /Could not compile (settings|build) file|Script compilation (error|failed)/i.test(
      text,
    )
  )
    reasons.push('gradle-script-compilation');
  if (/Could not get unknown property|Could not find method/i.test(text))
    reasons.push('gradle-script-api');
  if (/PluginError|Failed to resolve plugin/.test(text))
    reasons.push('expo-plugin-resolution');
  if (/Cannot find module|Module not found|Unable to resolve module/.test(text))
    reasons.push('module-resolution');
  if (/AUTH_RESTART_REQUIRED|Mobile server unavailable/.test(text))
    reasons.push('server-policy-rejected');
  if (
    /42501|permission denied for (schema|table|relation)|insufficient_privilege/.test(
      text,
    )
  )
    reasons.push('postgres-privilege');
  if (/42P01|relation .* does not exist|undefined_table/.test(text))
    reasons.push('postgres-schema');
  if (
    /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED/.test(
      text,
    ) ||
    /SSL_connect|SSL certificate|certificate verify failed|unable to get local issuer certificate/i.test(
      text,
    )
  )
    reasons.push('tls-validation');
  if (/EADDRINUSE/.test(text)) reasons.push('loopback-port-in-use');
  if (/ECONNREFUSED/.test(text)) reasons.push('connection-refused');
  if (/EAI_AGAIN|ENOTFOUND|Could not resolve host/i.test(text))
    reasons.push('network-resolution');
  if (/ETIMEDOUT|timed out/i.test(text)) reasons.push('deadline');
  if (/undefined (?:local variable or )?method\s+[`'‘]/i.test(text))
    reasons.push('pods-ruby-missing-method');
  if (/unknown keyword:/i.test(text)) reasons.push('pods-unknown-keyword');
  if (
    /JSON::ParserError|unexpected token at|JSON[^\n]*(parse|invalid)/i.test(
      text,
    )
  ) {
    if (/unexpected token at\s*['"]\s*['"]/i.test(text))
      reasons.push('pods-empty-json');
    reasons.push('pods-ruby-json');
  }
  if (
    /SyntaxError|syntax error|unexpected (tCONSTANT|tIDENTIFIER|end-of-input|keyword_end)/i.test(
      text,
    )
  )
    reasons.push('pods-ruby-syntax');
  if (/uninitialized constant|NameError[^\n]*constant/i.test(text))
    reasons.push('pods-ruby-missing-constant');
  if (
    /Pod::Executable|Failed to execute|command[^\n]*(failed|exit)|Invalid[^\n]{0,40}Podfile[^\n]{0,40}file:\s*exit/i.test(
      text,
    )
  )
    reasons.push('pods-command-failure');
  if (/cannot load such file|LoadError/.test(text))
    reasons.push('pods-ruby-load-error');
  if (
    /\[Codegen\][^\n]*(Error|Failed)|UnsupportedModulePropertyParserError|codegen[^\n]*(failed|error)/i.test(
      text,
    )
  )
    reasons.push('pods-codegen');
  if (
    /Verification checksum was incorrect|checksum[^\n]*(mismatch|incorrect|did not match|does not match)/i.test(
      text,
    )
  )
    reasons.push('pods-download-checksum');
  if (
    /Response code said error|requested URL returned error:\s*[45][0-9]{2}|HTTP[^\n]*\b[45][0-9]{2}\b|Failed to open TCP connection/i.test(
      text,
    )
  )
    reasons.push('pods-download-http');
  if (
    /Error (unpacking|extracting)|tar:[^\n]*(Error|invalid|Unrecognized|not[^\n]*archive)|unzip[^\n]*(error|invalid)|not in gzip format/i.test(
      text,
    )
  )
    reasons.push('pods-archive-extraction');
  if (
    /Error installing[^\n]*|Failed to download|Unable to download/i.test(text)
  )
    reasons.push('pods-download');
  if (/could not find compatible versions|version conflict/i.test(text))
    reasons.push('pods-version-conflict');
  if (/Unable to find a specification/i.test(text))
    reasons.push('pods-missing-specification');
  if (/Invalid[^\n]{0,100}\.podspec[^\n]*file/i.test(text))
    reasons.push('pods-invalid-podspec');
  if (/Invalid[^\n]{0,40}Podfile[^\n]*file/i.test(text))
    reasons.push('pods-invalid-podfile');
  if (/No [`'‘]?Podfile[`'’]? found/i.test(text))
    reasons.push('pods-missing-podfile');
  if (
    /Could not automatically select an Xcode project|Unable to find an Xcode project/i.test(
      text,
    )
  )
    reasons.push('pods-project-selection');
  if (/Unable to add a source|Unable to update[^\n]*repo/i.test(text))
    reasons.push('pods-source-unavailable');
  if (/CocoaPods|\[!\]/.test(text)) reasons.push('pods-failure');
  if (/error:|BUILD FAILED|FAILURE: Build failed/.test(text))
    reasons.push('compiler-failure');
  return reasons.slice(0, 16);
}

const knownSpecs = new Set([
  'ReactCodegen',
  'React-Core',
  'RCT-Folly',
  'boost',
  'glog',
  'hermes-engine',
  'Expo',
  'ExpoModulesCore',
  'RNReanimated',
  'RNGestureHandler',
  'RNScreens',
  'RNSVG',
  'RNCSafeAreaContext',
  'RNCAsyncStorage',
]);
const knownRubyMethods = new Set([
  'exists?',
  'present?',
  'use_native_modules!',
  'use_react_native!',
  'use_expo_modules!',
  'install_modules_dependencies',
]);
const knownRubyKeywords = new Set(['privacy_file_aggregation_enabled']);
const knownRubySources = new Set([
  'autolinking_manager.rb',
  'native_modules.rb',
  'react_native_pods.rb',
  'codegen_utils.rb',
  'local_podspec_patch.rb',
  'sandbox.rb',
  'json/common.rb',
]);
export function knownPodFailureContext(text) {
  const specs = new Set();
  const rubyMethods = new Set();
  const podfileLines = new Set();
  const rubyKeywords = new Set();
  const rubySources = new Set();
  for (const line of text.split(/\r?\n/)) {
    // Source paths stay private; only exact trusted basenames and bounded lines leave.
    for (const match of line.matchAll(
      /(?:^|[\s/\\])((?:json\/)?[A-Za-z_]+\.rb):([1-9][0-9]{0,3})(?=[:\s]|$)/g,
    ))
      if (knownRubySources.has(match[1]))
        rubySources.add(`${match[1]}:${match[2]}`);
    for (const match of line.matchAll(/\bPodfile:([1-9][0-9]{0,3})\b/g))
      podfileLines.add(Number(match[1]));
    if (
      /specification for|versions for pod|Error installing|depends on/i.test(
        line,
      )
    ) {
      for (const match of line.matchAll(/[`'"]([^`'"]+)[`'"]/g))
        if (knownSpecs.has(match[1])) specs.add(match[1]);
      const unquoted = /Error installing\s+([A-Za-z0-9_-]+)/i.exec(line);
      if (unquoted && knownSpecs.has(unquoted[1])) specs.add(unquoted[1]);
    }
    const method =
      /undefined (?:local variable or )?method\s+[`'‘]([^`'’]+)[`'’]/i.exec(
        line,
      );
    if (method && knownRubyMethods.has(method[1])) rubyMethods.add(method[1]);
    const keyword = /unknown keyword:\s*:([a-z_]+)/i.exec(line);
    if (keyword && knownRubyKeywords.has(keyword[1]))
      rubyKeywords.add(keyword[1]);
  }
  return {
    specs: [...specs],
    rubyMethods: [...rubyMethods],
    rubyKeywords: [...rubyKeywords],
    podfileLines: [...podfileLines].slice(0, 8),
    rubySources: [...rubySources].slice(0, 8),
  };
}

const buildPhases = new Set([
  'prebuild',
  'android-compile',
  'android-install',
  'android-loopback',
  'ios-toolchain',
  'ios-pods',
  'ios-compile',
  'ios-install',
  'ios-ca-trust',
  'metro',
]);
export function buildFailureDiagnostic(phaseJson, log) {
  try {
    const value = JSON.parse(phaseJson);
    if (
      Object.keys(value).sort().join(',') !== 'exitCode,phase' ||
      !buildPhases.has(value.phase) ||
      !Number.isInteger(value.exitCode) ||
      value.exitCode < 0 ||
      value.exitCode > 255
    )
      return null;
    return {
      phase: value.phase,
      exitCode: value.exitCode,
      category: nativeFailureCategory(log),
      reasons: nativeFailureReasons(log),
      ...knownPodFailureContext(log),
    };
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of missingNativeLibraries(
    process.argv
      .slice(2)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n'),
  )) {
    console.log(
      `ST244_ANDROID phase=emulator-provision event=missing-shared-library library=${name}`,
    );
  }
}
