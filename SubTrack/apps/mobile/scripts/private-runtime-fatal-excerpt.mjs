import {selectPodsFatal} from './private-runtime-pods-fatal.mjs';
// Build-time diagnostics only. No API, harness, Metro or device-flow logs.
const childLogs = Object.freeze({
  prebuild: 'prebuild.log',
  'android-compile': 'build.log',
  'android-install': 'install.log',
  'ios-pods': 'pods.log',
  'ios-compile': 'build.log',
});

export function failingBuildLog(phaseJson) {
  try {
    const value = JSON.parse(phaseJson);
    if (
      !value ||
      Object.keys(value).sort().join(',') !== 'exitCode,phase' ||
      !Number.isInteger(value.exitCode) ||
      value.exitCode < 1 ||
      value.exitCode > 255 ||
      !Object.hasOwn(childLogs, value.phase)
    )
      return null;
    return childLogs[value.phase];
  } catch {
    return null;
  }
}

export function fixtureDiagnosticSecrets(config, bundle) {
  if (
    !config ||
    !bundle ||
    typeof bundle !== 'object' ||
    Array.isArray(bundle) ||
    typeof config.ownerPassword !== 'string' ||
    config.ownerPassword.length < 8 ||
    typeof config.actorPassword !== 'string' ||
    config.actorPassword.length < 8 ||
    typeof bundle.privateKey !== 'string' ||
    !bundle.privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
    ![
      'otp',
      'rate',
      'idempotency',
      'anonymous',
      'subject',
      'person',
      'simulator',
      'credential',
    ].every(
      (name) =>
        typeof bundle[name] === 'string' && /^[a-f0-9]{64}$/.test(bundle[name]),
    )
  )
    return null;
  const strings = [config.ownerPassword, config.actorPassword];
  const seen = new Set();
  function collect(value) {
    if (typeof value === 'string') {
      if (!value) throw new Error('Unavailable secret');
      strings.push(value);
    } else if (value && typeof value === 'object') {
      if (seen.has(value)) throw new Error('Cyclic secret input');
      seen.add(value);
      for (const child of Object.values(value)) collect(child);
    } else if (
      value !== null &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new Error('Unavailable secret');
    }
  }
  try {
    collect(bundle);
    return [...new Set(strings)].sort((a, b) => b.length - a.length);
  } catch {
    return null;
  }
}

function sanitize(text, secrets) {
  // Strip terminal ANSI escapes before any diagnostic selection is published.
  // eslint-disable-next-line no-control-regex
  let safe = text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  for (const secret of secrets) safe = safe.split(secret).join('[secret]');
  safe = safe
    // A truncated PEM consumes the remainder; never preserve partial key material.
    .replace(
      /-----BEGIN [A-Z ]*(?:KEY|CERTIFICATE)-----[\s\S]*?(?:-----END [A-Z ]*(?:KEY|CERTIFICATE)-----|$)/g,
      '[pem]',
    )
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[credential]')
    .replace(
      /\b(?:access[_-]?token|refresh[_-]?token|(?:login|enrollment|mobile)?[_-]?proof|password|authorization|secret|credential)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      '[credential]',
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g,
      '[credential]',
    )
    .replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>"']+/g, '[url]')
    .replace(
      /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      '[email]',
    )
    .replace(/(["'])(?:[A-Za-z]:[\\/]|\\\\|\/)[^\r\n]*?\1/g, '[path]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\r\n]*/g, '[path]')
    .replace(/(^|[\s("'=])\/[^\r\n]*/gm, '$1[path]')
    .replace(/\b[A-Za-z0-9_+/-]{24,}(?:={0,2})\b/g, '[opaque]')
    .replace(/[^\x20-\x7e\n\r\t]/g, ' ');
  return safe;
}

export function fatalBuildExcerpt({ nativeBuild, phaseJson, log, secrets }) {
  const withheld = (reason) => ({ withheld: reason, lines: [] });
  if (nativeBuild !== true) return withheld('outside-build');
  if (!failingBuildLog(phaseJson)) return withheld('unsupported-build-phase');
  if (
    !Array.isArray(secrets) ||
    !secrets.length ||
    secrets.some((s) => typeof s !== 'string' || !s)
  )
    return withheld('secret-input-unavailable');
  if (typeof log !== 'string' || log.length > 4_000_000)
    return withheld('child-log-unavailable');
  const pods=JSON.parse(phaseJson).phase==='ios-pods';
  const selected=pods?selectPodsFatal(log):null;
  if(pods&&selected===null)return withheld('fatal-block-unavailable');
  const lines = (selected??log).split(/\r?\n/);
  // Positive fatal blocks only: no raw-tail fallback or unrelated output.
  // CocoaPods may print its generic support footer before the structured
  // exception report. Select the exact parser class block first, not its footer.
  const parserStart = lines.findIndex((line) => {
    // eslint-disable-next-line no-control-regex
    const plain = line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
    return /^\s*JSON::ParserError(?:\s*[-:]|\s*$)/.test(plain);
  });
  const genericStart = lines.findIndex((line) =>
    /^\s*(?:\* What went wrong:|\[!\]|(?:fatal )?error:|FAILURE: Build failed)/i.test(
      line,
    ),
  );
  const start = selected!==null?0:parserStart >= 0 ? parserStart : genericStart;
  if (start < 0) return withheld('fatal-block-unavailable');
  const block = [];
  for (const line of lines.slice(start, start + 12)) {
    if (
      /^\s*(?:\* Try:|\* Get more help|BUILD (?:FAILED|SUCCESSFUL)|Analyzing dependencies|Downloading dependencies)/.test(
        line,
      )
    )
      break;
    block.push(line);
  }
  const safe = sanitize(block.join('\n'), secrets);
  if (secrets.some((secret) => safe.includes(secret)))
    return withheld('redaction-check-failed');
  const result = safe
    .split('\n')
    .map((line) => line.trim().slice(0, 240))
    .filter(Boolean);
  // Per-line and total caps are applied only AFTER redaction, never to raw secrets.
  let remaining = 1800;
  const capped = [];
  for (const line of result) {
    if (remaining <= 0) break;
    const value = line.slice(0, remaining);
    capped.push(value);
    remaining -= value.length;
  }
  return { withheld: null, lines: capped };
}
