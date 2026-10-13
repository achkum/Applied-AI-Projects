const commands = [
  ['launch', /launch app/i],
  ['wait-visible', /wait until|assert.*visible/i],
  ['tap', /tap on/i],
  ['input', /input text/i],
  ['hide-keyboard', /hide keyboard/i],
];
const toolReasons = [
  ['assertion', /assertion is false|assertion failed/i],
  ['element-not-found', /element.*not found|no.*matching.*element/i],
  ['launch', /failed to launch|unable to launch/i],
  ['device-unavailable', /no devices found|device.*not found|device.*offline/i],
  [
    'tool-config',
    /invalid command|unknown command|invalid.*yaml|unable to parse/i,
  ],
  ['connection', /connection refused|failed to connect|unable to connect/i],
];
const metroReasons = [
  [
    'module-resolution',
    /unable to resolve module|cannot find module|module not found/i,
  ],
  ['syntax-transform', /SyntaxError|TransformError|unexpected token/i],
  ['asset', /asset.*not found|unable to resolve.*asset/i],
  ['connection', /ECONNREFUSED|EADDRINUSE|ENOTFOUND/],
];
const moduleRoster = new Set([
  'expo-router',
  'expo',
  'react',
  'react-native',
  '@babel/runtime',
  '@react-native/assets-registry/registry',
  'expo-font',
  'expo-secure-store',
  'expo-crypto',
  'react-native-reanimated',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  '@subtrack/config',
  '@subtrack/contracts',
  '@subtrack/i18n',
  '@subtrack/ui-tokens',
]);

/** Closed enums only; never excerpts or dynamic values from device/tool output. */
export function identifierToolDiagnostic({ phase, identifier, metro, labels }) {
  const unavailable = (reason) => ({ withheld: reason });
  if (phase !== 'flow-identifier') return unavailable('outside-identifier');
  if (
    typeof identifier !== 'string' ||
    typeof metro !== 'string' ||
    identifier.length > 4_000_000 ||
    metro.length > 4_000_000
  )
    return unavailable('tool-input-unavailable');
  if (
    !labels ||
    typeof labels.createAccount !== 'string' ||
    !labels.createAccount ||
    typeof labels.otp !== 'string' ||
    !labels.otp
  )
    return unavailable('trusted-target-unavailable');
  // ANSI escapes affect matching only; no original characters are returned.
  // eslint-disable-next-line no-control-regex
  const tool = identifier.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const failedLines = tool
    .split(/\r?\n/)
    .filter((line) => /FAILED|ERROR|assertion is false|not found/i.test(line));
  const failedCommands = commands
    .filter(([, pattern]) => failedLines.some((line) => pattern.test(line)))
    .map(([name]) => name);
  const reasons = toolReasons
    .filter(([, pattern]) => pattern.test(tool))
    .map(([name]) => name);
  const targets = [];
  if (failedLines.some((line) => line.includes(labels.createAccount)))
    targets.push('welcome-create-account');
  if (failedLines.some((line) => line.includes(labels.otp)))
    targets.push('otp-field');
  const bundler = metroReasons
    .filter(([, pattern]) => pattern.test(metro))
    .map(([name]) => name);
  const knownModules = new Set();
  for (const line of metro.split(/\r?\n/)) {
    if (
      /unable to resolve module|cannot find module|module not found/i.test(line)
    )
      for (const match of line.matchAll(/["'`]([^"'`\s]+)["'`]/g))
        if (moduleRoster.has(match[1])) knownModules.add(match[1]);
  }
  if (
    !failedCommands.length &&
    !reasons.length &&
    !targets.length &&
    !bundler.length
  )
    return unavailable('unknown-tool-diagnostic');
  return {
    withheld: null,
    commands: failedCommands,
    reasons,
    targets,
    metro: bundler,
    modules: [...knownModules].slice(0, 8),
  };
}
