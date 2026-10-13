import { probeResult } from './private-runtime-identifier-probe.mjs';

const roster = [
  ['saved', 'MAESTRO_SAVED'], ['invalid', 'MAESTRO_SAVE_INVALID'],
  ['unavailable', 'MAESTRO_SAVE_UNAVAILABLE'],
  ['readback-unavailable', 'MAESTRO_READBACK_UNAVAILABLE'],
  ['loading', 'MAESTRO_PERSONAL_LOADING'],
];

export async function failedSaveObservations({ phase, diagnostic, labels, observe, run, scroll }) {
  if (phase !== 'flow-enroll-add' || !diagnostic || diagnostic.withheld ||
      diagnostic.targets?.length !== 1 || diagnostic.targets[0] !== 'subscription-saved' ||
      diagnostic.commands?.length !== 1 || diagnostic.commands[0] !== 'wait-visible' ||
      diagnostic.reasons?.length !== 1 || diagnostic.reasons[0] !== 'assertion' ||
      !labels || !roster.every(([, key]) => typeof labels[key] === 'string' && labels[key].length > 0) ||
      typeof labels.MAESTRO_PERSONAL_TITLE !== 'string' || !labels.MAESTRO_PERSONAL_TITLE) return null;
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
  async function probes(stage) {
    const results = {};
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
  const after = header === 'visible' ? await probes('after-scroll') : null;
  return { count, before, header, after };
}
