import process from 'node:process';
import console from 'node:console';
import { X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  mkdtempSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  rmSync,
  statSync,
  realpathSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  staticBundleArguments,
  staticBundleEnvironment,
  boundedBundleChild,
  graphFailureCategory,
  ownedGraphCertificateContext,
} from './private-runtime-bundle-policy.mjs';

let platform = 'unvalidated';
let owned;
async function main() {
  platform = process.argv[2];
  if (
    !['ios', 'android'].includes(platform) ||
    process.env.CI !== 'true' ||
    !process.env.RUNNER_TEMP ||
    !process.env.SUBTRACK_PRIVATE_FIXTURE_CONFIG ||
    !process.env.SUBTRACK_PRIVATE_CA_CERT ||
    process.env.SUBTRACK_PRIVATE_DEVICE_PROOF !== 'true'
  )
    throw new Error('Static preconditions rejected');
  const fixturePath = process.env.SUBTRACK_PRIVATE_FIXTURE_CONFIG;
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const publicCa = readFileSync(process.env.SUBTRACK_PRIVATE_CA_CERT, 'utf8');
  if (
    !ownedGraphCertificateContext({
      configMode: statSync(fixturePath).mode,
      configVersion: fixture.version,
      caPathsMatch:
        realpathSync(fixture.caPath) ===
        realpathSync(process.env.SUBTRACK_PRIVATE_CA_CERT),
      publicCa: new X509Certificate(publicCa).ca,
      privateKeyPresent: publicCa.includes('PRIVATE KEY'),
    })
  )
    throw new Error('Owned graph certificate context rejected');
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const req = createRequire(join(app, 'package.json'));
  const versions = {
    native: req('react-native/package.json').version,
    babel: req('babel-preset-expo/package.json').version,
  };
  const privateRoot = join(
    resolve(process.env.RUNNER_TEMP),
    'subtrack-native-proof/private',
  );
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  owned = mkdtempSync(join(privateRoot, 'startup-'));
  const log = join(owned, 'compiler.log');
  const fd = openSync(log, 'wx', 0o600);
  let result;
  try {
    const args = staticBundleArguments(
      platform,
      versions,
      join(owned, 'export'),
    );
    const preload = pathToFileURL(
      join(app, 'scripts/private-runtime-loopback.mjs'),
    ).href;
    // Use the existing pnpm Expo shim and its declared-dependency resolution.
    const child = spawn('pnpm', ['exec', 'expo', ...args], {
      cwd: app,
      detached: true,
      stdio: ['ignore', fd, fd],
      env: staticBundleEnvironment(process.env, preload),
    });
    const abort = () => child.emit('proof-abort');
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    result = await boundedBundleChild(child, {
      schedule: setTimeout,
      cancel: clearTimeout,
      signal: (signal) => {
        try {
          if (
            child.exitCode === null &&
            child.signalCode === null &&
            Number.isInteger(child.pid)
          )
            process.kill(-child.pid, signal);
          return true;
        } catch {
          return false;
        }
      },
    });
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  } finally {
    closeSync(fd);
  }
  const category =
    result === 'compiler-failed'
      ? graphFailureCategory(readFileSync(log, 'utf8'))
      : 'none';
  console.log(
    `ST244_JS platform=${platform} result=${result} category=${category}`,
  );
  if (result !== 'passed') process.exitCode = 1;
}
main()
  .catch(() => {
    console.error(
      `ST244_JS platform=${['ios', 'android'].includes(platform) ? platform : 'unvalidated'} result=preflight-failed category=withheld`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      if (owned) rmSync(owned, { recursive: true, force: true });
    } catch {
      console.error('ST244_JS result=private-cleanup-failed category=withheld');
      process.exitCode = 1;
    }
  });
