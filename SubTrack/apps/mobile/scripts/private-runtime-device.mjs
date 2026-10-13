import {qualifyNativeMonthBeforeEdit,qualifyNativeMonthAfterEdit,acceptedNativeMonthScreenshot,ACCEPTED_NATIVE_MONTH_SCREENSHOTS} from './private-runtime-billing-month.mjs';
import {renewalCandidateDate,qualifyNativeRenewalsBeforeEdit,qualifyNativeRenewalsAfterEdit,acceptedNativeRenewalsScreenshot,ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS} from './private-runtime-renewals.mjs';
import {qualifyNativeEditStatus,acceptedNativeScreenshot,ACCEPTED_NATIVE_SCREENSHOTS} from './private-runtime-edit-status.mjs';
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
  podParserPresence,
} from './private-runtime-loader-diagnostics.mjs';
import {
  failingBuildLog,
  fixtureDiagnosticSecrets,
  fatalBuildExcerpt,
} from './private-runtime-fatal-excerpt.mjs';
import {
  identifierToolDiagnostic,
  enrollmentToolDiagnostic,
} from './private-runtime-identifier-diagnostic.mjs';
import { initialIdentifierFlow } from './private-runtime-flow-policy.mjs';
import { graphStatus } from './private-runtime-bundle-policy.mjs';
import { identifierProbes } from './private-runtime-identifier-probe.mjs';
import { failedSaveObservations } from './private-runtime-save-probe.mjs';

let currentPhase = 'runtime-preconditions';
const driverPhases = new Set([
  'fixture-bundle',
  'fixture-construction',
  'https-start',
  'startup-graph',
  'native-build',
  'flow-identifier',
  'flow-enroll-add',
  'readback-before',
  'api-restart',
  'flow-restart',
  'readback-after',
  'flow-edit-status',
  'flow-edit-status-api-restart',
  'tracking-readback-before',
  'tracking-api-restart',
  'tracking-readback-after',
  'flow-renewals',
  'flow-renewals-empty',
  'renewals-readback-before',
  'renewals-archived-readback',
  'flow-billing-month',
  'flow-billing-month-empty',
  'billing-month-readback-before',
  'billing-month-archived-readback',
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
  const renewalDate=renewalCandidateDate();
  const labels = {...flowEnvironment(),MAESTRO_RENEWAL_DATE:renewalDate};
  labels.MAESTRO_MONTH_DAY=labels.MAESTRO_MONTH_DAY_TEMPLATE.replace('%{date}',renewalDate);
  labels.MAESTRO_MONTH_SAVED_DATE=labels.MAESTRO_MONTH_SAVED_DATE_TEMPLATE.replace('%{date}',renewalDate);
  async function flow(name, extraEnv = {}) {
    markPhase(`flow-${name}`);
    await run(
      'maestro',
      [
        'test',
        '--test-output-dir',
        join(privateDir, name),
        join(
          app,
          'e2e',
          name === 'identifier'
            ? initialIdentifierFlow(platform)
            : `private-runtime-${name}.yaml`,
        ),
      ],
      name,
      { ...labels, ...extraEnv },
    );
  }
  function copyAcceptedScreenshots(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) copyAcceptedScreenshots(file);
      else if (acceptedNativeScreenshot(entry.name)||acceptedNativeRenewalsScreenshot(entry.name)||acceptedNativeMonthScreenshot(entry.name))
        copyFileSync(file, join(publicDir, entry.name));
    }
  }

  try {
    markPhase('https-start');
    await harness.start();
    markPhase('startup-graph');
    await run(
      'node',
      ['scripts/private-runtime-bundle-preflight.mjs', platform],
      'startup-graph',
      { SUBTRACK_PRIVATE_CA_CERT: config.caPath },
    );
    assert.equal(code, null, 'Static graph does not request synthetic OTP');
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
    const originalRenewals=await qualifyNativeRenewalsBeforeEdit({flow,readback:()=>harness.readbackRenewalsReceipt(renewalDate),phase:markPhase});
    await qualifyNativeMonthBeforeEdit({original:originalRenewals,flow,readback:()=>harness.readbackRenewalsReceipt(renewalDate),phase:markPhase});
    const editedTracking=await qualifyNativeEditStatus({flow,restart:()=>harness.restart(),readback:()=>harness.readbackTrackingReceipt(),phase:markPhase});
    const renewals=await qualifyNativeRenewalsAfterEdit({original:originalRenewals,flow,readback:()=>harness.readbackRenewalsReceipt(renewalDate),tracking:()=>harness.readbackTrackingReceipt(),phase:markPhase});
    const billingMonth=await qualifyNativeMonthAfterEdit({original:originalRenewals,flow,readback:()=>harness.readbackRenewalsReceipt(renewalDate),tracking:()=>harness.readbackTrackingReceipt(),phase:markPhase});
    markPhase('accepted-evidence');
    copyAcceptedScreenshots(privateDir);
    for (const name of [...ACCEPTED_NATIVE_SCREENSHOTS,...ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS,...ACCEPTED_NATIVE_MONTH_SCREENSHOTS]) {
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
          ...editedTracking,
          ...renewals,
          ...billingMonth,
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
      const phaseJson = readPrivate('build-phase.json');
      const childLog = failingBuildLog(phaseJson);
      const log = childLog ? readPrivate(childLog) : '';
      const diagnostic = buildFailureDiagnostic(phaseJson, log);
      const parserPresence = podParserPresence({ nativeBuild: currentPhase === 'native-build', phaseJson, log });
      if (parserPresence)
        for (const [pattern, present] of Object.entries(parserPresence))
          console.error(`ST244_NATIVE pods_pattern=${pattern} present=${present}`);
      if (diagnostic)
        console.error(
          `ST244_NATIVE build_phase=${diagnostic.phase} event=failed exit_code=${diagnostic.exitCode} category=${diagnostic.category} reason_list=${diagnostic.reasons.join(',') || 'none'} known_specs=${diagnostic.specs.join(',') || 'none'} known_ruby_methods=${diagnostic.rubyMethods.join(',') || 'none'} known_ruby_keywords=${diagnostic.rubyKeywords.join(',') || 'none'} podfile_lines=${diagnostic.podfileLines.join(',') || 'none'} known_ruby_sources=${diagnostic.rubySources.join(',') || 'none'}`,
        );
      let secrets = null;
      try {
        if ((statSync(config.keyBundlePath).mode & 0o077) === 0) {
          secrets = fixtureDiagnosticSecrets(
            config,
            JSON.parse(readFileSync(config.keyBundlePath, 'utf8')),
          );
        }
      } catch {
        // Missing/malformed actual secrets withhold diagnostics, never use guessed values.
      }
      const excerpt = fatalBuildExcerpt({
        nativeBuild: currentPhase === 'native-build',
        phaseJson,
        log,
        secrets,
      });
      if (excerpt.withheld)
        console.error(
          `ST244_NATIVE fatal_excerpt=withheld reason=${excerpt.withheld}`,
        );
      else
        for (const line of excerpt.lines)
          console.error(`ST244_NATIVE fatal_excerpt=${line}`);
    }
    if (currentPhase === 'startup-graph') {
      let status = null;
      try {
        status = graphStatus(
          readFileSync(join(privateDir, 'startup-graph.log'), 'utf8'),
          platform,
        );
      } catch {
        /* No raw fallback. */
      }
      console.error(
        `ST244_NATIVE phase=startup-graph result=${status?.result ?? 'metadata-withheld'} category=${status?.category ?? 'withheld'}`,
      );
    }
    if (currentPhase === 'flow-identifier') {
      const syntheticOtpIssued = code !== null;
      const requestObservation = harness.otpStartObservation();
      console.error(`ST244_NATIVE identifier_request_arrivals=${requestObservation.arrivals} accepted202=${requestObservation.accepted202} rejected4xx=${requestObservation.rejected4xx} failed5xx=${requestObservation.failed5xx} other=${requestObservation.other} incomplete=${requestObservation.incomplete}`);
      console.error(`ST244_NATIVE identifier_otp_issued=${syntheticOtpIssued}`);
      const observations = await identifierProbes({
        phase: currentPhase,
        issued: syntheticOtpIssued,
        labels,
        run: async (name, label) => {
          const logPath = join(privateDir, `identifier-probe-${name}.log`);
          const fd = openSync(logPath, 'w', 0o600);
          let exitCode = null;
          let timedOut = false;
          try {
            await new Promise((accept) => {
              const child = spawn('timeout', [
                '--signal=TERM', '--kill-after=5s', '20s',
                'maestro', 'test', '--test-output-dir',
                join(privateDir, `identifier-probe-${name}`),
                join(app, 'e2e/private-runtime-identifier-probe.yaml'),
              ], {
                cwd: app,
                env: { ...process.env, MAESTRO_IDENTIFIER_PROBE_LABEL: label },
                stdio: ['ignore', fd, fd],
              });
              child.on('error', () => accept());
              child.on('close', (status) => {
                exitCode = status;
                timedOut = status === 124 || status === 137;
                accept();
              });
            });
          } finally {
            closeSync(fd);
          }
          return { exitCode, timedOut, log: readFileSync(logPath, 'utf8') };
        },
      });
      if (observations)
        for (const [target, result] of Object.entries(observations))
          console.error(`ST244_NATIVE identifier_probe=${target} observation=${result}`);
      const readTool = (name) => {
        try {
          return readFileSync(join(privateDir, name), 'utf8');
        } catch {
          return '';
        }
      };
      // Fixed first-flow child-tool files only. Never API/other-flow output,
      // excerpts, failed screenshots or arbitrary artifact discovery.
      const diagnostic = identifierToolDiagnostic({
        phase: currentPhase,
        identifier: readTool('identifier.log'),
        metro: readTool('metro.log'),
        labels: {
          createAccount: labels.MAESTRO_CREATE_ACCOUNT,
          otp: labels.MAESTRO_OTP_LABEL,
        },
      });
      if (diagnostic.withheld)
        console.error(
          `ST244_NATIVE identifier_diagnostic=withheld reason=${diagnostic.withheld}`,
        );
      else
        console.error(
          `ST244_NATIVE identifier_diagnostic=fixed commands=${diagnostic.commands.join(',') || 'none'} reasons=${diagnostic.reasons.join(',') || 'none'} targets=${diagnostic.targets.join(',') || 'none'} metro=${diagnostic.metro.join(',') || 'none'} modules=${diagnostic.modules.join(',') || 'none'}`,
        );
    }
    if (currentPhase === 'flow-enroll-add') {
      const readTool = (name) => {
        try {
          return readFileSync(join(privateDir, name), 'utf8');
        } catch {
          return '';
        }
      };
      // Only the exact enrollment child tool log and Metro. Never API output,
      // other flows, raw excerpts, typed values or failed screenshots.
      const diagnostic = enrollmentToolDiagnostic({
        phase: currentPhase,
        enrollment: readTool('enroll-add.log'),
        metro: readTool('metro.log'),
        labels: {
          otp: labels.MAESTRO_OTP_LABEL,
          verifyOtp: labels.MAESTRO_VERIFY_OTP,
          verifyBankId: labels.MAESTRO_VERIFY_BANKID,
          profileName: labels.MAESTRO_PROFILE_NAME,
          saveProfile: labels.MAESTRO_SAVE_PROFILE,
          justMe: labels.MAESTRO_JUST_ME,
          add: labels.MAESTRO_ADD,
          subscriptionName: labels.MAESTRO_SUBSCRIPTION_NAME,
          category: labels.MAESTRO_CATEGORY,
          amount: labels.MAESTRO_AMOUNT,
          saveSubscription: labels.MAESTRO_SAVE_SUBSCRIPTION,
          saved: labels.MAESTRO_SAVED,
        },
      });
      if (diagnostic.withheld)
        console.error(
          `ST244_NATIVE enrollment_diagnostic=withheld reason=${diagnostic.withheld}`,
        );
      else
        console.error(
          `ST244_NATIVE enrollment_diagnostic=fixed commands=${diagnostic.commands.join(',') || 'none'} reasons=${diagnostic.reasons.join(',') || 'none'} targets=${diagnostic.targets.join(',') || 'none'} metro=${diagnostic.metro.join(',') || 'none'} modules=${diagnostic.modules.join(',') || 'none'}`,
        );
      const saveProbe = async (label, header, fileName) => {
        const logPath = join(privateDir, `${fileName}.log`);
        const fd = openSync(logPath, 'w', 0o600);
        let exitCode = null;
        let timedOut = false;
        try {
          await new Promise((accept) => {
            const child = spawn('timeout', [
              '--signal=TERM', '--kill-after=5s', '20s',
              'maestro', 'test', '--test-output-dir', join(privateDir, fileName),
              join(app, header ? 'e2e/private-runtime-save-header.yaml' : 'e2e/private-runtime-save-probe.yaml'),
            ], { cwd: app, env: { ...process.env, MAESTRO_SAVE_PROBE_LABEL: label, MAESTRO_PERSONAL_TITLE: labels.MAESTRO_PERSONAL_TITLE }, stdio: ['ignore', fd, fd] });
            child.on('error', () => accept());
            child.on('close', status => { exitCode = status; timedOut = status === 124 || status === 137; accept(); });
          });
        } finally { closeSync(fd); }
        return { exitCode, timedOut, log: readFileSync(logPath, 'utf8') };
      };
      const saveObservations = await failedSaveObservations({
        phase: currentPhase, diagnostic, labels,
        observe: () => harness.readbackReceipt(),
        run: (stage, name, label) => saveProbe(label, false, `save-probe-${stage}-${name}`),
        scroll: label => saveProbe(label, true, 'save-probe-header'),
      });
      if (saveObservations) {
        console.error(`ST244_NATIVE failed_save_count=${saveObservations.count} header=${saveObservations.header}`);
        for (const stage of ['before', 'after'])
          for (const [target, observation] of Object.entries(saveObservations[stage] ?? {}))
            console.error(`ST244_NATIVE failed_save_probe=${target} stage=${stage} observation=${observation}`);
      }
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
