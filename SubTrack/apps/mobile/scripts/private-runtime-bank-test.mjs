import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {assertBankReceipt,acceptedNativeBankScreenshot,ACCEPTED_NATIVE_BANK_SCREENSHOTS,qualifyNativeBank} from './private-runtime-bank.mjs';
import {flowEnvironment} from './private-runtime-flow-env.mjs';
const zero=()=>({version:1,connections:0,accounts:0,transactions:0,generations:0,purged:0,receipts:0,transactionDigest:'a'.repeat(64)});
const manual=()=>({version:1,markerHash:'a'.repeat(64),subscriptionCount:1,subscriptionIdentityHash:'b'.repeat(64),subscriptionDigest:'c'.repeat(64),manualEditReadback:true,archivedReadback:true,revisionSixReadback:true});
function journey(){const connected={...zero(),connections:1,generations:1,accounts:1,receipts:1},synced={...connected,transactions:500,transactionDigest:'b'.repeat(64),receipts:2},repeated={...synced,receipts:3},retained={...repeated,receipts:4},purged={...retained,accounts:0,transactions:0,transactionDigest:zero().transactionDigest,purged:1,receipts:5};return [zero(),connected,synced,repeated,{...repeated},retained,{...retained},purged,{...purged},{...purged}];}
function args(rows=journey()){return {flow:async()=>{},restart:async()=>{},readback:async()=>rows.shift(),tracking:async()=>manual(),phase:()=>{}};}
test('closed bounded private receipt and exact success-only screenshot allowlist',()=>{
 assertBankReceipt(zero());assertBankReceipt({...zero(),transactions:1000000});
 for(const value of [null,1,[],Object.assign(Object.create(null),zero()),{...zero(),extra:true},{...zero(),version:2},{...zero(),transactionDigest:1},{...zero(),transactionDigest:'private'},...['connections','accounts','transactions','generations','purged','receipts'].flatMap(field=>[-1,1.5,1000001,'1'].map(value=>({...zero(),[field]:value})))])assert.throws(()=>assertBankReceipt(value));
 assert.deepEqual(ACCEPTED_NATIVE_BANK_SCREENSHOTS,['accepted-bank-active.png','accepted-bank-retained.png','accepted-bank-purged.png']);
 for(const name of ACCEPTED_NATIVE_BANK_SCREENSHOTS)assert.equal(acceptedNativeBankScreenshot(name),true);
 for(const name of [null,'failed.png','../accepted-bank-active.png','accepted-bank-active.png.log'])assert.equal(acceptedNativeBankScreenshot(name),false);
});
test('installed UI only journey asserts dedup, two real restarts, cancel, purge and manual preservation',async()=>{
 const events=[],a=args();a.flow=async(name,env)=>events.push([name,env]);a.restart=async()=>events.push(['restart']);a.phase=name=>events.push([name]);
 const receipt=await qualifyNativeBank(a);assert.ok(Object.isFrozen(receipt));assert.equal(Object.keys(receipt).length,10);for(const value of Object.values(receipt))assert.equal(value,true);
 assert.deepEqual(events.filter(([name])=>name.startsWith('bank-')&&!['bank-readback','bank-api-restart'].includes(name)).map(([name])=>name),['bank-connect','bank-sync','bank-repeat','bank-retain','bank-cancel','bank-purge','bank-final']);
 assert.equal(events.filter(([name])=>name==='restart').length,2);for(const name of ['bank-repeat','bank-retain','bank-cancel','bank-purge'])assert.deepEqual(events.find(([value])=>value===name)[1],{MAESTRO_BANK_COUNT:'500'});
});
test('every incorrect state/readback/manual value and uncertain action fails without retry',async()=>{
 for(let index=0;index<10;index++){const rows=journey();rows[index]={...rows[index],receipts:99};await assert.rejects(qualifyNativeBank(args(rows)));}
 for(const change of [{transactions:1},{transactionDigest:'a'.repeat(64)},{connections:2},{accounts:2},{generations:2}]){const rows=journey();rows[2]={...rows[2],...change};await assert.rejects(qualifyNativeBank(args(rows)));}
 for(const flag of ['manualEditReadback','archivedReadback','revisionSixReadback'])await assert.rejects(qualifyNativeBank({...args(),tracking:async()=>({...manual(),[flag]:false})}));
 for(let index=1;index<=10;index++){let reads=0;await assert.rejects(qualifyNativeBank({...args(),tracking:async()=>++reads===index+1?{...manual(),subscriptionDigest:'d'.repeat(64)}:manual()}));}
 for(const field of ['flow','restart','readback','tracking']){let calls=0;const a=args();a[field]=async()=>{calls++;throw new Error('private uncertainty');};await assert.rejects(qualifyNativeBank(a));assert.equal(calls,1);}
});
test('real UI flow labels, status/lastsync/count assertions, cancel and exact parent publication survive wiring',()=>{
 for(const locale of ['en','sv']){const env=flowEnvironment(locale),catalog=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding.nativeBank;for(const [key,value] of Object.entries(catalog))assert.equal(env[`MAESTRO_BANK_${key.replace(/([A-Z])/g,'_$1').toUpperCase()}`],value);assert.equal(env.MAESTRO_BANK_LAST_SYNC_NEVER,catalog.lastSync.replace('%{date}',catalog.never));assert.equal(env.MAESTRO_BANK_LAST_SYNC_PRESENT,catalog.lastSync.replace('%{date}','.+'));}
 const load=name=>readFileSync(new URL(`../e2e/private-runtime-bank-${name}.yaml`,import.meta.url),'utf8');
 for(const name of ['connect','sync','repeat','retain','cancel','purge','final']){const flow=load(name);assert.doesNotMatch(flow,/inputText|clearState|setDate|MAESTRO_PRIVATE_OTP/);}
 for(const name of ['repeat','retain','cancel','purge']){const flow=load(name);assert.match(flow,/MAESTRO_BANK_COUNT/);assert.match(flow,/MAESTRO_BANK_LAST_SYNC_PRESENT/);assert.match(flow,/MAESTRO_LOGOUT_CONFIRMED/);assert.match(flow,/assertNotVisible: \$\{MAESTRO_BANK_TRANSACTIONS\}/);}
 assert.match(load('connect'),/MAESTRO_BANK_EMPTY/);assert.match(load('connect'),/MAESTRO_BANK_LAST_SYNC_NEVER/);assert.match(load('sync'),/assertNotVisible: \$\{MAESTRO_BANK_LAST_SYNC_NEVER\}/);
 assert.match(load('retain'),/MAESTRO_BANK_REVOKED/);assert.match(load('retain'),/MAESTRO_BANK_DISCONNECT/);assert.match(load('cancel'),/MAESTRO_BANK_CANCEL_PURGE/);assert.doesNotMatch(load('cancel'),/tapOn: \$\{MAESTRO_BANK_CONFIRM_PURGE\}/);assert.match(load('purge'),/MAESTRO_BANK_CONFIRM_PURGE/);assert.match(load('purge'),/MAESTRO_BANK_PURGED/);
 for(const [flow,name] of [['repeat','active'],['retain','retained'],['purge','purged']])assert.match(load(flow),new RegExp(`takeScreenshot: accepted-bank-${name}`));
 for(const name of ['retain','cancel','final'])assert.match(load(name),/stopApp\r?\n- launchApp/);
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');assert.match(driver,/ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS,\.\.\.ACCEPTED_NATIVE_MONTH_SCREENSHOTS,\.\.\.ACCEPTED_NATIVE_BANK_SCREENSHOTS/);assert.match(driver,/readback:\(\)=>harness.readbackBankReceipt\(\)/);assert.doesNotMatch(driver,/mutateNativeBank|secondOwnerSession|banks\/synthetic\//);assert.ok(driver.indexOf('const bank=await qualifyNativeBank')>driver.indexOf('const billingMonth=await qualifyNativeMonthAfterEdit'));
});
