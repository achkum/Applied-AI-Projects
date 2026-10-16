import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { failedSaveObservations } from './private-runtime-save-probe.mjs';
import { podParserPresence } from './private-runtime-loader-diagnostics.mjs';
import { flowEnvironment } from './private-runtime-flow-env.mjs';

const fields=['invalid-name','invalid-category','invalid-cadence','invalid-amount','invalid-date'];
const fieldKeys=['MAESTRO_SAVE_INVALID_NAME','MAESTRO_SAVE_INVALID_CATEGORY','MAESTRO_SAVE_INVALID_CADENCE','MAESTRO_SAVE_INVALID_AMOUNT','MAESTRO_SAVE_INVALID_DATE'];
const labels = Object.fromEntries(['MAESTRO_SAVED', 'MAESTRO_SAVE_INVALID', 'MAESTRO_SAVE_UNAVAILABLE', 'MAESTRO_READBACK_UNAVAILABLE', 'MAESTRO_PERSONAL_LOADING', 'MAESTRO_VERIFY_BANKID', 'MAESTRO_PERSONAL_TITLE',...fieldKeys].map(key => [key, 'Trusted label']));
const diagnostic = { withheld: null, targets: ['subscription-saved'], commands: ['wait-visible'], reasons: ['assertion'] };
const receipt = n => ({ version: 1, identityCount: 1, profileCompleteCount: 1, justMeCount: 1, subscriptionCount: n, markerHash: 'a'.repeat(64), subscriptionDigest: 'b'.repeat(64) });
const success = { exitCode: 0, timedOut: false, log: 'private-canary' };
const negative={exitCode:1,timedOut:false,log:'Assert that trusted is visible FAILED\nAssertion is false: trusted is visible\n'};
const options = { phase: 'flow-enroll-add', diagnostic, labels, observe: async () => receipt(1), run: async () => success, scroll: async () => success };

test('enrollment flow asserts Save is enabled immediately before its single tap', () => {
  const flow = readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml', import.meta.url), 'utf8');
  assert.match(flow, /- assertVisible:\r?\n {4}text: \$\{MAESTRO_SAVE_SUBSCRIPTION\}\r?\n {4}enabled: true\r?\n- tapOn: \$\{MAESTRO_SAVE_SUBSCRIPTION\}/);
  assert.equal(flow.match(/- tapOn: \$\{MAESTRO_SAVE_SUBSCRIPTION\}/g)?.length, 1);
});

test('failure phase, exact trusted target and clean diagnostic gate every observation', async () => {
  const never = () => { throw Error('Must not call'); };
  for (const overrides of [
    { phase: 'native-build' }, { diagnostic: null }, { diagnostic: { ...diagnostic, withheld: 'unknown' } },
    { diagnostic: { ...diagnostic, targets: ['subscription-saved', 'otp'] } },
    { diagnostic: { ...diagnostic, commands: ['tap'] } }, { diagnostic: { ...diagnostic, reasons: ['assertion', 'unknown'] } },
    { labels: {} }, { labels: { ...labels, MAESTRO_PERSONAL_TITLE: '' } },
    ...fieldKeys.flatMap(key=>[{labels:{...labels,[key]:''}},{labels:{...labels,[key]:null}}]),
  ]) assert.equal(await failedSaveObservations({ ...options, observe: never, run: never, scroll: never, ...overrides }), null);
});

test('one observer call, sequential before/header/after and fixed output only', async () => {
  const calls = [];
  const result = await failedSaveObservations({ ...options,
    observe: async () => { calls.push('observer'); return receipt(1); },
    run: async (stage, name) => { calls.push(`${stage}:${name}`); return fields.includes(name)?negative:success; },
    scroll: async () => { calls.push('header'); return success; },
  });
  assert.equal(calls.filter(x => x === 'observer').length, 1);
  const ordered=[...fields,'saved','invalid','unavailable','readback-unavailable','loading','verify'];
  assert.deepEqual(calls,['observer',...ordered.map(name=>`before-scroll:${name}`),'header',...ordered.map(name=>`after-scroll:${name}`)]);
  assert.equal(result.count, 'one');
  assert.equal(result.header, 'visible');
  assert.equal(JSON.stringify(result).includes('private-canary'), false);
});

test('invalid receipts and failed tools stay unavailable; unsuccessful header never implies a screen state', async () => {
  for (const value of [null, {}, receipt(-1), receipt(1.5), { ...receipt(1), version: 2 }, { ...receipt(1), unexpected: 'private-canary' }, { ...receipt(1), markerHash: 'bad' }]) {
    const result = await failedSaveObservations({ ...options, observe: async () => value });
    assert.equal(result.count, 'unavailable');
  }
  for (const n of [0, 1, 2]) assert.equal((await failedSaveObservations({ ...options, observe: async () => receipt(n) })).count, ['zero', 'one', 'multiple'][n]);
  const result = await failedSaveObservations({ ...options,
    observe: async () => { throw Error('Bearer private-canary'); },
    run: async () => { throw Error('private-canary'); },
    scroll: async () => ({ ...success, timedOut: true }),
  });
  assert.equal(result.count, 'unavailable');
  assert.deepEqual(Object.values(result.before), Array(11).fill('launch-error'));
  assert.equal(result.after, null);
  assert.equal(result.header, 'timeout');
  const brokenScroll = await failedSaveObservations({ ...options, scroll: async () => { throw Error('private-canary'); } });
  assert.equal(brokenScroll.header, 'launch-error');
  assert.equal(brokenScroll.after, null);
});
test('specific existing field labels come from the bilingual catalogs without new draft or locale inputs',()=>{
  for(const locale of ['en','sv']){const env=flowEnvironment(locale),catalog=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding.manualSubscription;for(const [i,name] of ['invalidName','invalidCategory','invalidCadence','invalidAmount','invalidDate'].entries())assert.equal(env[fieldKeys[i]],catalog[name]);}
});
test('confirmed field feedback stops the stage without treating unrun generic or field probes as absence',async()=>{
  for(const [index,target] of fields.entries()){
    const calls=[];let observed=0;
    const result=await failedSaveObservations({...options,observe:async()=>{observed++;return receipt(0);},run:async(stage,name)=>{calls.push(`${stage}:${name}`);return name===target?success:negative;},scroll:async()=>{calls.push('header');return success;}});
    const visited=fields.slice(0,index+1);assert.deepEqual(calls,[...visited.map(name=>`before-scroll:${name}`),'header']);assert.equal(observed,1);assert.equal(result.count,'zero');assert.equal(result.header,'visible');assert.deepEqual(Object.keys(result.before),visited);assert.equal(result.after,null);assert.equal(result.before[target],'visible');assert.equal(Object.hasOwn(result.before,'saved'),false);assert.equal(JSON.stringify(result).includes('private-canary'),false);
  }
});
test('inconclusive field probes retain their taxonomy and fall back to the complete generic stage',async()=>{
  const calls=[];
  const result=await failedSaveObservations({...options,run:async(stage,name)=>{calls.push(`${stage}:${name}`);return fields.includes(name)?{...success,timedOut:true}:success;},scroll:async()=>negative});
  assert.deepEqual(Object.keys(result.before),[...fields,'saved','invalid','unavailable','readback-unavailable','loading','verify']);for(const name of fields)assert.equal(result.before[name],'timeout');assert.equal(result.before.saved,'visible');assert.equal(result.header,'not-confirmed');assert.equal(result.after,null);assert.equal(calls.length,11);
});
test('after-scroll can confirm one field when none was confirmed before, without later generic probes',async()=>{
  const calls=[];const result=await failedSaveObservations({...options,run:async(stage,name)=>{calls.push(`${stage}:${name}`);return stage==='after-scroll'&&name==='invalid-category'?success:negative;}});
  assert.equal(result.header,'visible');assert.deepEqual(result.after,{'invalid-name':'not-confirmed','invalid-category':'visible'});assert.equal(calls.filter(call=>call.startsWith('before-scroll:')).length,11);assert.deepEqual(calls.filter(call=>call.startsWith('after-scroll:')),['after-scroll:invalid-name','after-scroll:invalid-category']);
});

test('pods presence is guarded and matches exact class/source only without private text', () => {
  const input = { nativeBuild: true, phaseJson: JSON.stringify({ phase: 'ios-pods', exitCode: 1 }), log: '\u001b[31mJSON::ParserError - private-canary\u001b[0m\n/private-canary/json/common.rb:216:in parse\n/private/autolinking_manager.rb:170:in parse\n/private/native_modules.rb:20\n/private/Podfile:12' };
  assert.deepEqual(Object.values(podParserPresence(input)), Array(5).fill(true));
  assert.equal(JSON.stringify(podParserPresence(input)).includes('private-canary'), false);
  for (const overrides of [{ nativeBuild: false }, { phaseJson: 'invalid JSON' }, { phaseJson: '{}' }, { phaseJson: JSON.stringify({ phase: 'ios-compile', exitCode: 1 }) }, { phaseJson: JSON.stringify({ phase: 'ios-pods', exitCode: 0 }) }, { log: null }, { log: 'x'.repeat(4_000_001) }]) assert.equal(podParserPresence({ ...input, ...overrides }), null);
  for (const log of ['PrivateJSON::ParserError - secret', 'JSON::ParserErrorPrivate - secret', 'unexpected token at secret', '/private/notjson/common.rb:216', '/private/notnative_modules.rb:20']) assert.deepEqual(Object.values(podParserPresence({ ...input, log })), Array(5).fill(false));
});


test('exact structured saved-header failure enables existing observations despite withheld legacy prose', async () => {
  const metadata = { metadata: 'AVAILABLE', command: 'SCROLL_UNTIL_VISIBLE', target: 'personal-title', occurrence: 'SAVED_HEADER', errorClass: 'UNKNOWN' };
  const withheld = { withheld: 'unknown-tool-diagnostic' };
  for (const diagnostic of [withheld, null]) {
    const result = await failedSaveObservations({ ...options, diagnostic, metadata });
    assert.equal(result.count, 'one');
    assert.equal(result.header, 'visible');
  }
  for (const invalid of [null, {}, { ...metadata, extra: 'private-canary' },
    ...Object.keys(metadata).filter(key => key !== 'errorClass').map(key => ({ ...metadata, [key]: 'UNKNOWN' })),
    { ...metadata, occurrence: 'ENTRY_HEADER' }, { ...metadata, metadata: 'INVALID' }, { ...metadata, errorClass: 'private-canary' }]) {
    let calls = 0;
    const never = () => { calls++; throw Error('private-canary'); };
    const result = await failedSaveObservations({ ...options, diagnostic: withheld, metadata: invalid, observe: never, run: never, scroll: never });
    assert.equal(result, null); assert.equal(calls, 0);
  }
  assert.equal(await failedSaveObservations({ ...options, diagnostic: withheld, metadata, phase: 'native-build' }), null);
  assert.equal(await failedSaveObservations({ ...options, diagnostic: withheld, metadata, labels: {} }), null);
  const driver = readFileSync(new URL('./private-runtime-device.mjs', import.meta.url), 'utf8');
  assert.match(driver, /metadata: platform === 'android' \? metadata : null, labels/);
});
