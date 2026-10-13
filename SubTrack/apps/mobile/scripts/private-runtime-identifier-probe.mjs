const roster = [
  ['request-unavailable', 'MAESTRO_REQUEST_UNAVAILABLE'],
  ['loading', 'MAESTRO_IDENTIFIER_LOADING'],
  ['email-field', 'MAESTRO_EMAIL_LABEL'],
  ['otp-field', 'MAESTRO_OTP_LABEL'],
];

/** Only a completed single assertion can establish a negative observation. */
export function probeResult({ exitCode, timedOut, log }) {
  if (timedOut || typeof log !== 'string' || log.length > 4_000_000)
    return 'unavailable';
  if (exitCode === 0) return 'visible';
  if (exitCode !== 1) return 'unavailable';
  // eslint-disable-next-line no-control-regex
  const clean = log.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // The complete known negative must be clean; added/unknown tool text is
  // inconclusive rather than evidence that an element is absent.
  if (
    lines.length !== 2 ||
    !/^Assert that .+ is visible.*FAILED$/i.test(lines[0]) ||
    !/^Assertion is false: .+ is visible$/i.test(lines[1])
  ) return 'unavailable';
  return 'not-confirmed';
}

/** Sequential observations, not a simultaneous screen-state claim. */
export async function identifierProbes({ phase, issued, labels, run }) {
  if (phase !== 'flow-identifier' || issued !== true) return null;
  if (
    !labels ||
    !roster.every(([, key]) => typeof labels[key] === 'string' && labels[key].length > 0)
  ) return null;
  const results = {};
  for (const [name, key] of roster) {
    try {
      results[name] = probeResult(await run(name, labels[key]));
    } catch {
      results[name] = 'unavailable';
    }
  }
  return results;
}
