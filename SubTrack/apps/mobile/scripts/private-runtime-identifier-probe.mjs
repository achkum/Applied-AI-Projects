import { spawn as nodeSpawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as nodeSetTimeout, clearTimeout as nodeClearTimeout } from 'node:timers';

const roster = [
  ['welcome-create-account', 'MAESTRO_CREATE_ACCOUNT'],
  ['request-unavailable', 'MAESTRO_REQUEST_UNAVAILABLE'],
  ['loading', 'MAESTRO_IDENTIFIER_LOADING'],
  ['email-field', 'MAESTRO_EMAIL_LABEL'],
  ['otp-field', 'MAESTRO_OTP_LABEL'],
];

/** Only a completed single assertion can establish a negative observation. */
export function probeResult({ exitCode, timedOut, log }) {
  if (timedOut === true) return 'timeout';
  if (exitCode === null) return 'launch-error';
  if (typeof log !== 'string' || log.length > 4_000_000) return 'negative-unparsed';
  if (exitCode === 0) return 'visible';
  if (exitCode !== 1) return 'exit-other';
  // eslint-disable-next-line no-control-regex
  const clean = log.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // The complete known negative must be clean; added/unknown tool text is
  // inconclusive rather than evidence that an element is absent.
  if (
    lines.length !== 2 ||
    !/^Assert that .+ is visible.*FAILED$/i.test(lines[0]) ||
    !/^Assertion is false: .+ is visible$/i.test(lines[1])
  ) return 'negative-unparsed';
  return 'not-confirmed';
}

/** Sequential observations, not a simultaneous screen-state claim. */
export async function identifierProbes({ phase, issued, labels, run }) {
  if (phase !== 'flow-identifier' || (issued !== true && issued !== false)) return null;
  if (
    !labels ||
    !roster.every(([, key]) => typeof labels[key] === 'string' && labels[key].length > 0)
  ) return null;
  const results = {};
  for (const [name, key] of roster) {
    try {
      results[name] = probeResult(await run(name, labels[key]));
    } catch {
      results[name] = 'launch-error';
    }
  }
  return results;
}

/** One private assertion child; only its successfully spawned owned process group may be signalled. */
export function runIdentifierProbe(args, options, {
  spawn = nodeSpawn, kill = process.kill, platform = process.platform,
  parentPid = process.pid, schedule = nodeSetTimeout, cancel = nodeClearTimeout,
} = {}) {
  return new Promise((resolve) => {
    const group = platform !== 'win32';
    let complete = false, timedOut = false, ownedPid = null, deadline, grace;
    let closed = false, exitCode = -1;
    const finish = (code) => {
      if (complete) return;
      complete = true;
      cancel(deadline); cancel(grace);
      resolve({ exitCode: code, timedOut });
    };
    const signalOwned = (signal) => {
      if (ownedPid === null) return;
      try { kill(group ? -ownedPid : ownedPid, signal); }
      catch { /* An already-ended owned group is not a screen observation. */ }
    };
    let child;
    try { child = spawn('maestro', args, { ...options, detached: group }); }
    catch { finish(null); return; }
    child.once('spawn', () => {
      if (complete) return;
      const pid = child.pid;
      if (!Number.isSafeInteger(pid) || pid <= 1 || pid === parentPid) { finish(null); return; }
      ownedPid = pid;
    });
    child.on('error', () => {
      if (complete) return;
      if (!timedOut) { signalOwned('SIGKILL'); finish(null); }
      // A timeout retains the owned group until the mandatory KILL cleanup.
    });
    child.once('close', (code) => {
      if (complete) return;
      if (ownedPid === null && !timedOut) { finish(null); return; }
      closed = true;
      exitCode = Number.isInteger(code) && code >= 0 && code <= 255 ? code : -1;
      if (!timedOut || !group) finish(exitCode);
    });
    deadline = schedule(() => {
      if (complete) return;
      timedOut = true;
      signalOwned('SIGTERM');
      if (complete) return;
      grace = schedule(() => {
        if (complete) return;
        signalOwned('SIGKILL');
        finish(closed ? exitCode : -1);
      }, 5000);
    }, 20000);
  });
}
