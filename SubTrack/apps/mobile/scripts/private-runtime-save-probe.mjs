import { probeResult } from './private-runtime-identifier-probe.mjs';

const fieldRoster = [
  ['invalid-name', 'MAESTRO_SAVE_INVALID_NAME'], ['invalid-category', 'MAESTRO_SAVE_INVALID_CATEGORY'],
  ['invalid-cadence', 'MAESTRO_SAVE_INVALID_CADENCE'], ['invalid-amount', 'MAESTRO_SAVE_INVALID_AMOUNT'],
  ['invalid-date', 'MAESTRO_SAVE_INVALID_DATE'],
];
const roster = [
  ['saved', 'MAESTRO_SAVED'], ['invalid', 'MAESTRO_SAVE_INVALID'],
  ['unavailable', 'MAESTRO_SAVE_UNAVAILABLE'],
  ['readback-unavailable', 'MAESTRO_READBACK_UNAVAILABLE'],
  ['loading', 'MAESTRO_PERSONAL_LOADING'],
  ['verify', 'MAESTRO_VERIFY_BANKID'],
];

export async function failedSaveObservations({ phase, diagnostic, metadata, labels, observe, run, scroll }) {
  const structured = metadata !== null && typeof metadata === 'object' &&
    Object.keys(metadata).sort().join(',') === 'command,errorClass,metadata,occurrence,target';
  const legacy = target => diagnostic && !diagnostic.withheld &&
    diagnostic.targets?.length === 1 && diagnostic.targets[0] === target &&
    diagnostic.commands?.length === 1 && diagnostic.commands[0] === 'wait-visible' &&
    diagnostic.reasons?.length === 1 && diagnostic.reasons[0] === 'assertion';
  const savedHeader = structured &&
    metadata.metadata === 'AVAILABLE' && metadata.command === 'SCROLL_UNTIL_VISIBLE' &&
    metadata.target === 'personal-title' && metadata.occurrence === 'SAVED_HEADER' && metadata.errorClass === 'UNKNOWN';
  const amountFailure = structured && metadata.metadata === 'AVAILABLE' &&
    metadata.command === 'ASSERT_CONDITION' && metadata.target === 'UNKNOWN' &&
    metadata.occurrence === 'UNKNOWN' && metadata.errorClass === 'UNKNOWN' && legacy('expected-amount');
  if (phase !== 'flow-enroll-add' || (!savedHeader && !legacy('subscription-saved') && !amountFailure) ||
      !labels || ![...fieldRoster,...roster].every(([, key]) => typeof labels[key] === 'string' && labels[key].length > 0) ||
      typeof labels.MAESTRO_PERSONAL_TITLE !== 'string' || !labels.MAESTRO_PERSONAL_TITLE ||
      (amountFailure && (typeof labels.MAESTRO_EXPECTED_AMOUNT_LABEL !== 'string' || !labels.MAESTRO_EXPECTED_AMOUNT_LABEL))) return null;
  let count = 'unavailable';
  try {
    const receipt = await observe();
    const n = receipt?.subscriptionCount;
    if (receipt?.version === 1 &&
        Object.keys(receipt).sort().join(',') === 'identityCount,justMeCount,markerHash,profileCompleteCount,subscriptionCount,subscriptionDigest,version' &&
        ['identityCount', 'profileCompleteCount', 'justMeCount', 'subscriptionCount'].every(key => Number.isSafeInteger(receipt[key]) && receipt[key] >= 0) &&
        typeof receipt.markerHash === 'string' && /^[a-f0-9]{64}$/.test(receipt.markerHash) &&
        typeof receipt.subscriptionDigest === 'string' && /^[a-f0-9]{64}$/.test(receipt.subscriptionDigest)) count = n === 0 ? 'zero' : n === 1 ? 'one' : 'multiple';
  } catch { /* No observer errors or rows escape. */ }
  if (amountFailure) {
    const label = labels.MAESTRO_EXPECTED_AMOUNT_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const variants = [
      ['code-prefix-dot', String.raw`${label}:[ \u00a0\u202f]*SEK[ \u00a0\u202f]*129\.90`],
      ['code-suffix-dot', String.raw`${label}:[ \u00a0\u202f]*129\.90[ \u00a0\u202f]+SEK`],
      ['code-prefix-comma', String.raw`${label}:[ \u00a0\u202f]*SEK[ \u00a0\u202f]*129,90`],
      ['code-suffix-comma', String.raw`${label}:[ \u00a0\u202f]*129,90[ \u00a0\u202f]+SEK`],
      ['symbol-suffix-comma', String.raw`${label}:[ \u00a0\u202f]*129,90[ \u00a0\u202f]+kr`],
      ['symbol-suffix-dot', String.raw`${label}:[ \u00a0\u202f]*129\.90[ \u00a0\u202f]+kr`],
    ];
    const amount = {};
    for (const [name, pattern] of variants) {
      try { amount[name] = probeResult(await run('amount-display', name, pattern)); }
      catch { amount[name] = 'launch-error'; }
      if (amount[name] === 'visible') break;
    }
    return { count, before: {}, header: 'unavailable', after: null, amount };
  }
  async function probes(stage) {
    const results = {};
    for (const [name,key] of fieldRoster) {
      try { results[name] = probeResult(await run(stage,name,labels[key])); }
      catch { results[name] = 'launch-error'; }
      if (results[name] === 'visible') return results;
    }
    for (const [name, key] of roster) {
      try { results[name] = probeResult(await run(stage, name, labels[key])); }
      catch { results[name] = 'launch-error'; }
    }
    return results;
  }
  const before = await probes('before-scroll');
  let header = 'unavailable';
  try {
    const result = await scroll(labels.MAESTRO_PERSONAL_TITLE);
    header = probeResult(result);
  } catch { header = 'launch-error'; }
  const fieldConfirmed = fieldRoster.some(([name]) => before[name] === 'visible');
  const after = header === 'visible' && !fieldConfirmed ? await probes('after-scroll') : null;
  return { count, before, header, after };
}
