// Local installed-device qualification only. No EAS, cloud Maestro or store upload.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import {
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowEnvironment } from './private-runtime-flow-env.mjs';
import {
  nativeFailureCategory,
  buildFailureDiagnostic,
} from './private-runtime-loader-diagnostics.mjs';

let currentPhase = 'runtime-preconditions';
const driverPhases = new Set([
  'fixture-bundle',
  'fixture-construction',
  'https-start',
  'native-build',
  'flow-identifier',
  'flow-enroll-add',
  'readback-before',
  'api-restart',
  'flow-restart',
  'readback-after',
  'accepted-evidence',
  'fixture-dispose',
]);
function markPhase(phase) {
  assert.ok(driverPhases.has(phase));
  currentPhase = phase;
  console.log(`ST244_NATIVE phase=${phase} event=started`);
}

async function main() {
  assert.equal(process.env.NODE_ENV, 'development');
  const platform = process.argv[2];
  assert.ok(platform === 'android' || platform === 'ios');
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mobileRequire = createRequire(join(app, 'package.json'));
  const installedNativeVersion = mobileRequire(
    'react-native/package.json',
  ).version;
  assert.equal(installedNativeVersion, '0.74.5');
  const repo = resolve(app, '../..');
  const root = join(process.env.RUNNER_TEMP, 'subtrack-native-proof');
  const privateDir = join(root, 'private');
  const publicDir = join(root, 'public');
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  mkdirSync(publicDir, { recursive: true });
  const configPath = process.env.SUBTRACK_PRIVATE_FIXTURE_CONFIG;
  assert.ok(configPath && (statSync(configPath).mode & 0o077) === 0);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim();
  assert.equal(config.head, head);
  assert.equal(config.version, 1);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.database, 'st237_private_https_profile');

  async function run(command, args, label, extraEnv = {}, cwd = app) {
    const fd = openSync(join(privateDir, `${label}.log`), 'w', 0o600);
    try {
      await new Promise((accept, reject) => {
        const child = spawn(command, args, {
          cwd,
          env: { ...process.env, ...extraEnv },
          stdio: ['ignore', fd, fd],
        });
        child.on('error', () =>
          reject(new Error(`Private qualification ${label} could not start`)),
        );
        child.on('exit', (code) =>
          code === 0
            ? accept()
            : reject(new Error(`Private qualification ${label} failed`)),
        );
      });
    } finally {
      closeSync(fd);
    }
  }

  markPhase('fixture-bundle');
  const apiRequire = createRequire(join(repo, 'apps/api/package.json'));
  const vite = apiRequire.resolve('vite');
  const esbuild = apiRequire(apiRequire.resolve('esbuild', { paths: [vite] }));
  assert.equal(esbuild.version, '0.28.2');
  const fixturePath = join(privateDir, 'fixture.cjs');
  esbuild.buildSync({
    entryPoints: [join(repo, 'apps/api/test/private-mobile-owned-fixture.ts')],
    outfile: fixturePath,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
    nodePaths: [join(repo, 'apps/api/node_modules')],
    logLevel: 'silent',
  });
  // External dependencies resolve next to this owned bundle without copies or installs.
  process.env.NODE_PATH = join(repo, 'apps/api/node_modules');
  apiRequire('node:module').Module._initPaths();
  const { createOwnedPrivateMobileHarness } = apiRequire(fixturePath);
  let code = null;
  markPhase('fixture-construction');
  const harness = await createOwnedPrivateMobileHarness(config, {
    onOtpIssued: (event) => {
      if (event.channel === 'email' && /^[0-9]{6}$/.test(event.code))
        code = event.code;
    },
  });
  const labels = flowEnvironment();
  async function flow(name, extraEnv = {}) {
    markPhase(`flow-${name}`);
    await run(
      'maestro',
      [
        'test',
        '--test-output-dir',
        join(privateDir, name),
        join(app, 'e2e', `private-runtime-${name}.yaml`),
      ],
      name,
      { ...labels, ...extraEnv },
    );
  }
  function copyAcceptedScreenshots(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) copyAcceptedScreenshots(file);
      else if (/^accepted-(add|restart|logout)\.png$/.test(entry.name))
        copyFileSync(file, join(publicDir, entry.name));
    }
  }

  try {
    markPhase('https-start');
    await harness.start();
    markPhase('native-build');
    await run(
      'bash',
      ['scripts/private-runtime-build.sh', platform],
      'compile-install',
      {
        SUBTRACK_PRIVATE_CA_CERT: config.caPath,
      },
    );
    await flow('identifier');
    assert.ok(
      code,
      'Synthetic OTP must have been issued to the private in-memory callback',
    );
    await flow('enroll-add', { MAESTRO_PRIVATE_OTP: code });
    code = null;
    markPhase('readback-before');
    const before = await harness.readbackReceipt();
    markPhase('api-restart');
    await harness.restart();
    await flow('restart');
    markPhase('readback-after');
    const after = await harness.readbackReceipt();
    // Counts and canonical persisted-row digest are closed fixture-owned evidence.
    assert.deepEqual(before, after);
    for (const receipt of [before, after]) {
      assert.equal(receipt.version, 1);
      for (const field of [
        'identityCount',
        'profileCompleteCount',
        'justMeCount',
        'subscriptionCount',
      ])
        assert.equal(receipt[field], 1);
      assert.match(receipt.markerHash, /^[a-f0-9]{64}$/);
      assert.match(receipt.subscriptionDigest, /^[a-f0-9]{64}$/);
    }
    markPhase('accepted-evidence');
    copyAcceptedScreenshots(privateDir);
    for (const name of [
      'accepted-add.png',
      'accepted-restart.png',
      'accepted-logout.png',
    ]) {
      assert.ok(statSync(join(publicDir, name)).size > 0);
    }
    const apk = join(app, 'android/app/build/outputs/apk/debug/app-debug.apk');
    const binaryIdentity =
      platform === 'android'
        ? createHash('sha256').update(readFileSync(apk)).digest('hex')
        : createHash('sha256')
            .update(
              readFileSync(
                join(
                  privateDir,
                  'derived/Build/Products/Debug-iphonesimulator/SubTrack.app/SubTrack',
                ),
              ),
            )
            .digest('hex');
    writeFileSync(
      join(publicDir, 'installed-native-receipt.json'),
      JSON.stringify(
        {
          version: 1,
          head,
          platform,
          bundleId: 'se.subtrack.app',
          binaryIdentity,
          expo: '51',
          reactNative: installedNativeVersion,
          developmentSimulatorOnly: true,
          freshLoginAfterStartup: true,
          appRestartReadback: true,
          apiRestartReadback: true,
          subscriptionCount: 1,
          acknowledgedLogoutUi: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `Installed ${platform} synthetic workflow and restart readback PASS`,
    );
  } catch (error) {
    console.error(
      `ST244_NATIVE phase=${currentPhase} event=failed category=${nativeFailureCategory(String(error))}`,
    );
    if (currentPhase === 'native-build') {
      // Project fixed enums only. Raw tool/API output remains in owned private TEMP.
      const readPrivate = (name) => {
        try {
          return readFileSync(join(privateDir, name), 'utf8');
        } catch {
          return '';
        }
      };
      const log = [
        'prebuild.log',
        'pods.log',
        'build.log',
        'install.log',
        'metro.log',
        'compile-install.log',
      ]
        .map(readPrivate)
        .join('\n');
      const diagnostic = buildFailureDiagnostic(
        readPrivate('build-phase.json'),
        log,
      );
      if (diagnostic)
        console.error(
          `ST244_NATIVE build_phase=${diagnostic.phase} event=failed exit_code=${diagnostic.exitCode} category=${diagnostic.category} reason_list=${diagnostic.reasons.join(',') || 'none'} known_specs=${diagnostic.specs.join(',') || 'none'} known_ruby_methods=${diagnostic.rubyMethods.join(',') || 'none'} known_ruby_keywords=${diagnostic.rubyKeywords.join(',') || 'none'} podfile_lines=${diagnostic.podfileLines.join(',') || 'none'}`,
        );
    }
    // Raw API/tool errors can contain credentials: retain privately, never print them.
    console.error(
      `Installed ${platform} qualification failed; sanitized success evidence was not published`,
    );
    process.exitCode = 1;
  } finally {
    markPhase('fixture-dispose');
    await harness.dispose();
  }
}
main().catch((error) => {
  console.error(
    `ST244_NATIVE phase=${currentPhase} event=failed category=${nativeFailureCategory(String(error))}`,
  );
  console.error(
    'Native fixture setup failed; private configuration and raw errors were not published',
  );
  process.exitCode = 1;
});
