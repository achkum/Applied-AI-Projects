const commands = [
  ['launch', /launch app/i],
  ['wait-visible', /wait until|assert.*visible/i],
  ['tap', /tap on/i],
  ['input', /input text/i],
  ['hide-keyboard', /hide keyboard/i],
  ['scroll', /scroll until|scroll (?:up|down)|scrollUntilVisible|no visible element found/i],
];
const toolReasons = [
  ['assertion', /assertion is false|assertion failed/i],
  ['element-not-found', /element.*not found|no.*matching.*element|no visible element found/i],
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

/** Original owned driver text only; reuse the accepted tool patterns, never return excerpts. */
export function originalDriverToolDiagnostic(text){
 const result=closedToolDiagnostic(text,'',[]);
 return Object.freeze(result.withheld===null&&result.reasons.length?[...result.reasons]:['UNKNOWN']);
}

/** Closed enums only; never excerpts or dynamic values from device/tool output. */
export function identifierToolDiagnostic({ phase, identifier, metro, labels }) {
  const unavailable = (reason) => ({ withheld: reason });
  if (phase !== 'flow-identifier') return unavailable('outside-identifier');
  if (
    !labels ||
    typeof labels.createAccount !== 'string' ||
    !labels.createAccount ||
    typeof labels.otp !== 'string' ||
    !labels.otp ||
    typeof labels.email !== 'string' ||
    !labels.email
  )
    return unavailable('trusted-target-unavailable');
  return closedToolDiagnostic(identifier, metro, [
    ['welcome-create-account', labels.createAccount],
    ['otp-field', labels.otp],
    ['otp-field', 'native-registration-otp'],
    ['email-field', labels.email],
    ['email-field', 'native-identifier-input'],
  ]);
}

const enrollmentRoster = [
  ['otp-field', 'otp'],
  ['otp-verify', 'verifyOtp'],
  ['bankid-verify', 'verifyBankId'],
  ['profile-name', 'profileName'],
  ['profile-save', 'saveProfile'],
  ['just-me', 'justMe'],
  ['add-open', 'add'],
  ['subscription-name', 'subscriptionName'],
  ['subscription-category', 'category'],
  ['subscription-amount', 'amount'],
  ['subscription-save', 'saveSubscription'],
  ['subscription-saved', 'saved'],
  ['date-field', 'date'],
  ['personal-title', 'personalTitle'],
  ['expected-amount', 'expectedAmount'],
];
const fixedInputIds=new Set(['native-identifier-input','native-registration-otp','native-profile-name','native-subscription-name','native-subscription-amount','native-subscription-date']);

export function enrollmentToolDiagnostic({ phase, enrollment, metro, labels }) {
  if (phase !== 'flow-enroll-add') return { withheld: 'outside-enrollment' };
  if (
    !labels ||
    !enrollmentRoster.every(
      ([, key]) => typeof labels[key] === 'string' && labels[key].length > 0,
    )
  )
    return { withheld: 'trusted-target-unavailable' };
  return closedToolDiagnostic(
    enrollment,
    metro,
    [...enrollmentRoster.map(([name, key]) => [name, labels[key]]),
      ['otp-field', 'native-registration-otp'], ['profile-name', 'native-profile-name'],
      ['subscription-name', 'native-subscription-name'], ['subscription-amount', 'native-subscription-amount'],
      ['date-field', 'native-subscription-date'], ['saved-row', 'Example streaming']],
  );
}

const restartRoster=[['welcome-create-account','createAccount'],['bankid-verify','verifyBankId'],['expected-amount','expectedAmount'],['logout','logout'],['logout-confirmed','logoutConfirmed'],['edit','edit'],['save-edit','saveEdit'],['edit-saved','editSaved'],['pause','pause'],['resume','resume'],['cancelled','cancelled'],['archive','archive']];
/** Original restart-family child output only; no new tool invocation or UI capture. */
export function restartToolDiagnostic({phase,restart,metro,labels}){
 if(!['flow-restart','flow-edit-status','flow-edit-status-api-restart'].includes(phase))return {withheld:'outside-restart'};
 if(!labels||!restartRoster.every(([,key])=>typeof labels[key]==='string'&&labels[key].length>0))return {withheld:'trusted-target-unavailable'};
 return closedToolDiagnostic(restart,metro,[...restartRoster.map(([name,key])=>[name,labels[key]]),['edited-row','Example streaming Plus'],['saved-row','Example streaming'],['subscription-name','native-subscription-name'],['date-field','native-subscription-date']]);
}

const billingMonthRoster=[['bankid-verify','login'],['personal-title','personalTitle'],['profile-title','profileTitle'],['home-title','home'],['next-month','nextMonth'],['month-target','monthTarget'],['month-previous','monthPrevious'],['month-empty','monthEmpty'],['subscription-detail','detail'],['expected-amount','amount'],['detail-price','detailPrice'],['manual-source','manual'],['close','close'],['logout','logout'],['logout-confirmed','logoutConfirmed']];
/** Original billing child output only. Target values are caller-owned catalog/date labels; none are emitted. */
export function billingMonthToolDiagnostic({phase,billingMonth,metro,labels}){
 if(!['flow-billing-month','flow-billing-month-empty'].includes(phase))return {withheld:'outside-billing-month'};
 const keys=[...billingMonthRoster.map(([,key])=>key),'date'];
 if(!labels||Object.getPrototypeOf(labels)!==Object.prototype)return {withheld:'trusted-target-unavailable'};
 const descriptors=Object.getOwnPropertyDescriptors(labels);
 if(Reflect.ownKeys(labels).length!==keys.length||keys.some(key=>{const d=descriptors[key];return !d||!('value'in d)||!d.enumerable||typeof d.value!=='string'||d.value.length<1||d.value.length>500||/[\p{Cc}]/u.test(d.value);}))return {withheld:'trusted-target-unavailable'};
 const date=descriptors.date.value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.startsWith('0000')||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)return {withheld:'trusted-target-unavailable'};
 return closedToolDiagnostic(billingMonth,metro,[...billingMonthRoster.map(([name,key])=>[name,labels[key],true]),
  ['bankid-verify','native-personal-login',true],['personal-title','native-personal-title',true],['home-title','native-nav-month',true],['home-title','native-home-overview',true],['home-title','native-home-title',true],
  ['saved-row',phase==='flow-billing-month'?'Example streaming':'Example streaming Plus',true],['date-picker','native-home-calendar',true],['date-cell',`native-date-${date}`,true],['selected-date','native-month-selected-date',true],['expected-date',date,true],['close','native-subscription-detail-close',true]]);
}

/** One exact enrollment invocation owns the event latch. No process values escape. */
export function createEnrollmentExecution(label) {
  if (label !== 'enroll-add') return null;
  let terminal = null;
  return Object.freeze({
    record(event, code, signal) {
      if (terminal !== null || !['error', 'exit', 'close'].includes(event)) return;
      if (event === 'error') {
        terminal = Object.freeze({ outcome: 'launch-error', code: 'unavailable', signal: 'none', timeout: 'not-applicable' });
        return;
      }
      const codeBucket = Number.isInteger(code) && code >= 0 && code <= 255
        ? code === 0 ? 'zero' : code === 1 ? 'one' : 'other-nonzero'
        : 'unavailable';
      const signalBucket = signal === null || signal === undefined
        ? 'none' : signal === 'SIGTERM' ? 'TERM' : signal === 'SIGKILL' ? 'KILL' : 'other';
      terminal = Object.freeze({ outcome: signalBucket !== 'none' ? 'signal' : codeBucket === 'zero' ? 'completed' : 'exit-nonzero', code: codeBucket, signal: signalBucket, timeout: 'not-applicable' });
    },
    snapshot() { return terminal; },
  });
}

/** Failure-only projection; log size is never emitted, read, or retained here. */
export function enrollmentExecutionDiagnostic({ phase, execution, logSize }) {
  if (phase !== 'flow-enroll-add' || !execution || typeof execution !== 'object' || Array.isArray(execution) || execution.outcome === 'completed') return null;
  // Records come only from the invocation latch; reject malformed external inputs.
  if (Object.getPrototypeOf(execution) !== Object.prototype ||
      Reflect.ownKeys(execution).some(key => typeof key !== 'string') || Reflect.ownKeys(execution).sort().join(',') !== 'code,outcome,signal,timeout' ||
      !['launch-error', 'exit-nonzero', 'signal'].includes(execution.outcome) ||
      !['zero', 'one', 'other-nonzero', 'unavailable'].includes(execution.code) ||
      !['none', 'TERM', 'KILL', 'other'].includes(execution.signal) || execution.timeout !== 'not-applicable') return null;
  const log = Number.isSafeInteger(logSize) && logSize >= 0 && logSize <= 4_000_000 ? logSize === 0 ? 'empty' : 'nonempty' : 'unavailable';
  return Object.freeze({ ...execution, log });
}

function closedToolDiagnostic(identifier, metro, targetRoster) {
  const unavailable = (reason) => ({ withheld: reason });
  if (
    typeof identifier !== 'string' ||
    typeof metro !== 'string' ||
    identifier.length > 4_000_000 ||
    metro.length > 4_000_000
  )
    return unavailable('tool-input-unavailable');
  // ANSI escapes affect matching only; no original characters are returned.
  // eslint-disable-next-line no-control-regex
  const tool = identifier.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const failedLines = tool
    .split(/\r?\n/)
    .filter((line) => /FAILED|ERROR|assertion is false|not found|no visible element found/i.test(line));
  const failedCommands = commands
    .filter(([, pattern]) => failedLines.some((line) => pattern.test(line)))
    .map(([name]) => name);
  const reasons = toolReasons
    .filter(([, pattern]) => pattern.test(tool))
    .map(([name]) => name);
  const targets = new Set();
  const sortedTargets = targetRoster.toSorted(
    (a, b) => b[1].length - a[1].length,
  );
  for (const line of failedLines) {
    const target = sortedTargets.find(([name, label, exact=false]) => exact||fixedInputIds.has(label)||name==='email-field'?new RegExp(`(^|[^\\w-])${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\w-])`).test(line):line.includes(label));
    if (target) targets.add(target[0]);
  }
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
    !targets.size &&
    !bundler.length
  )
    return unavailable('unknown-tool-diagnostic');
  return {
    withheld: null,
    commands: failedCommands,
    reasons,
    targets: [...targets],
    metro: bundler,
    modules: [...knownModules].slice(0, 8),
  };
}
