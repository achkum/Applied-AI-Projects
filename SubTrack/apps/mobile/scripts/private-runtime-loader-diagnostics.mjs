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
  if (/PluginError|Failed to resolve plugin/.test(text))
    return 'expo-plugin-resolution';
  if (/Cannot find module|Module not found|Unable to resolve module/.test(text))
    return 'module-resolution';
  if (/AUTH_RESTART_REQUIRED|Mobile server unavailable/.test(text))
    return 'server-policy-rejected';
  if (
    /42501|permission denied for (schema|table|relation)|insufficient_privilege/.test(
      text,
    )
  )
    return 'postgres-privilege';
  if (/42P01|relation .* does not exist|undefined_table/.test(text))
    return 'postgres-schema';
  if (
    /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED/.test(
      text,
    )
  )
    return 'tls-validation';
  if (/EADDRINUSE/.test(text)) return 'loopback-port-in-use';
  if (/ECONNREFUSED/.test(text)) return 'connection-refused';
  if (/EAI_AGAIN|ENOTFOUND/.test(text)) return 'network-resolution';
  if (/ETIMEDOUT|timed out/i.test(text)) return 'deadline';
  if (/CocoaPods|\[!\]/.test(text)) return 'pods-failure';
  if (/error:|BUILD FAILED|FAILURE: Build failed/.test(text))
    return 'compiler-failure';
  return 'unclassified';
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
