export function staticBundleArguments(platform, versions, outputDir) {
  if (
    !['android', 'ios'].includes(platform) ||
    versions?.native !== '0.74.5' ||
    versions?.babel !== '11.0.15' ||
    typeof outputDir !== 'string' ||
    !outputDir
  )
    throw new Error('Static bundle policy rejected');
  return [
    'export',
    '--platform',
    platform,
    '--dev',
    '--no-minify',
    '--no-bytecode',
    '--max-workers',
    '2',
    '--output-dir',
    outputDir,
  ];
}

export function staticBundleEnvironment(env, preload) {
  if (
    env.CI !== 'true' ||
    env.SUBTRACK_PRIVATE_DEVICE_PROOF !== 'true' ||
    !env.SUBTRACK_PRIVATE_FIXTURE_CONFIG ||
    !env.SUBTRACK_PRIVATE_CA_CERT
  )
    throw new Error('Owned graph context required');
  return {
    ...env,
    CI: 'true',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED: 'true',
    EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL: 'https://localhost:3443',
    // Existing owned fixture supplies real public CA before graph/native build.
    SUBTRACK_PRIVATE_DEVICE_PROOF: 'true',
    NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${preload}`,
  };
}

export function graphFailureCategory(log) {
  if (/Unable to resolve module|Cannot find module|Module not found/i.test(log))
    return 'module-resolution';
  if (/SyntaxError|TransformError|Unsupported param type/i.test(log))
    return 'syntax-transform';
  if (/ENOENT|asset.*not found/i.test(log)) return 'asset-io';
  if (/EADDRINUSE/.test(log)) return 'loopback-port-in-use';
  if (/ECONNREFUSED/.test(log)) return 'connection-refused';
  return 'withheld';
}

export function ownedGraphCertificateContext(facts) {
  return (
    Number.isInteger(facts.configMode) &&
    facts.configMode >= 0 &&
    (facts.configMode & 0o077) === 0 &&
    facts.configVersion === 1 &&
    facts.caPathsMatch === true &&
    facts.publicCa === true &&
    facts.privateKeyPresent === false
  );
}

export function graphStatus(text, platform) {
  if (typeof text !== 'string' || !['ios', 'android'].includes(platform))
    return null;
  if (text.includes('ST244_JS result=private-cleanup-failed category=withheld'))
    return { result: 'private-cleanup-failed', category: 'withheld' };
  const lines = text.split(/\r?\n/);
  const records = lines
    .map((line) =>
      /^ST244_JS platform=(ios|android) result=(passed|compiler-failed|child-start-failed|child-stop-failed|deadline|interrupted|preflight-failed) category=(none|withheld|module-resolution|syntax-transform|asset-io|loopback-port-in-use|connection-refused)$/.exec(
        line,
      ),
    )
    .filter(Boolean);
  if (records.length !== 1 || records[0][1] !== platform) return null;
  return { result: records[0][2], category: records[0][3] };
}

/** Owned child/process group only; deadline is a tool bound, never an app timeout. */
export function boundedBundleChild(child, { schedule, cancel, signal }) {
  return new Promise((resolve) => {
    let active = true;
    let expired = null;
    let grace;
    const finish = (result) => {
      if (!active) return;
      active = false;
      cancel(deadline);
      if (grace !== undefined) cancel(grace);
      resolve(result);
    };
    const stop = (kind) => {
      if (!active) return;
      if (!signal(kind)) finish('child-stop-failed');
    };
    const expire = (reason) => {
      if (!active || expired) return;
      expired = reason;
      grace = schedule(() => stop('SIGKILL'), 15000);
      stop('SIGTERM');
    };
    const deadline = schedule(() => expire('deadline'), 600000);
    child.once('proof-abort', () => expire('interrupted'));
    child.once('error', () => finish('child-start-failed'));
    child.once('exit', (code) =>
      finish(expired ?? (code === 0 ? 'passed' : 'compiler-failed')),
    );
  });
}
