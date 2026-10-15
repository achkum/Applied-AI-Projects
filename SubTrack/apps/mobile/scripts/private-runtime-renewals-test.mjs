import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {renewalCandidateDate,assertRenewalsReceipt,qualifyNativeRenewalsBeforeEdit,qualifyNativeRenewalsAfterEdit,acceptedNativeRenewalsScreenshot,ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS} from './private-runtime-renewals.mjs';
import {flowEnvironment} from './private-runtime-flow-env.mjs';
const receipt=(patch={})=>({version:1,markerHash:'a'.repeat(64),subscriptionCount:1,subscriptionIdentityHash:'b'.repeat(64),subscriptionDigest:'c'.repeat(64),activeSavedDateReadback:true,archivedEmptyReadback:false,...patch});
const archived=(patch={})=>receipt({subscriptionDigest:'d'.repeat(64),activeSavedDateReadback:false,archivedEmptyReadback:true,...patch});
const tracking=(patch={})=>({version:1,markerHash:'a'.repeat(64),subscriptionCount:1,subscriptionIdentityHash:'b'.repeat(64),subscriptionDigest:'d'.repeat(64),manualEditReadback:true,archivedReadback:true,revisionSixReadback:true,...patch});
test('candidate uses real UTC tomorrow only as installed agenda candidate, rejecting invalid clocks',()=>{
 assert.match(renewalCandidateDate(),/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);assert.equal(renewalCandidateDate(new Date('2026-12-31T23:59:59Z')),'2027-01-01');
 for(const value of [null,new Date('bad'),new Date('9999-12-31T00:00:00Z'),new Date('0000-01-01T00:00:00Z')])assert.throws(()=>renewalCandidateDate(value));
});
test('two new exact shots and closed receipt guard never permit raw screenshots/values',()=>{
 assert.deepEqual(ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS,['accepted-renewals.png','accepted-renewals-empty.png']);for(const name of ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS)assert.equal(acceptedNativeRenewalsScreenshot(name),true);
 for(const name of ['failed-renewals.png','accepted-renewals.png.log','../accepted-renewals.png',null])assert.equal(acceptedNativeRenewalsScreenshot(name),false);
 assertRenewalsReceipt(receipt());for(const value of [null,[],Object.assign(Object.create(null),receipt()),receipt({extra:'private'}),receipt({version:2}),receipt({subscriptionCount:2}),receipt({markerHash:undefined}),receipt({markerHash:'a'.repeat(64)+'\n'}),receipt({subscriptionDigest:'A'.repeat(64)}),receipt({activeSavedDateReadback:'true'})])assert.throws(()=>assertRenewalsReceipt(value));
});
test('positive installed agenda and refresh/logout must preserve exact original persisted receipt',async()=>{
 const events=[],values=[receipt(),receipt()];assert.deepEqual(await qualifyNativeRenewalsBeforeEdit({readback:async()=>{events.push('read');return values.shift();},flow:async name=>events.push(name),phase:name=>events.push(name)}),receipt());
 assert.deepEqual(events,['renewals-readback-before','read','renewals','read']);
 for(const changed of [receipt({activeSavedDateReadback:false}),receipt({archivedEmptyReadback:true})])await assert.rejects(qualifyNativeRenewalsBeforeEdit({readback:async()=>changed,flow:async()=>{},phase:()=>{}}));
 const altered=[receipt(),receipt({subscriptionDigest:'d'.repeat(64)})];await assert.rejects(qualifyNativeRenewalsBeforeEdit({readback:async()=>altered.shift(),flow:async()=>{},phase:()=>{}}));
 await assert.rejects(qualifyNativeRenewalsBeforeEdit({readback:async()=>receipt(),flow:async()=>{throw new Error('device window unavailable');},phase:()=>{}}));
});
test('final empty agenda is same original row and exact archived tracking digest, only then publishes flags',async()=>{
 const events=[],values=[archived(),archived()];const result=await qualifyNativeRenewalsAfterEdit({original:receipt(),readback:async()=>{events.push('read');return values.shift();},tracking:async()=>{events.push('tracking');return tracking();},flow:async name=>events.push(name),phase:name=>events.push(name)});
 assert.deepEqual(events,['renewals-archived-readback','read','tracking','renewals-empty','read']);assert.deepEqual(result,{expectedRenewalsReadback:true,expectedRenewalsAfterRestartReadback:true,archivedRenewalsEmptyReadback:true,renewalsAcknowledgedLogoutUi:true});assert.ok(Object.isFrozen(result));
 for(const patch of [{activeSavedDateReadback:true},{archivedEmptyReadback:false},{markerHash:'e'.repeat(64)},{subscriptionIdentityHash:'e'.repeat(64)}])await assert.rejects(qualifyNativeRenewalsAfterEdit({original:receipt(),readback:async()=>archived(patch),tracking:async()=>tracking(),flow:async()=>{},phase:()=>{}}));
 for(const patch of [{subscriptionDigest:'e'.repeat(64)},{manualEditReadback:false},{archivedReadback:false},{revisionSixReadback:false}])await assert.rejects(qualifyNativeRenewalsAfterEdit({original:receipt(),readback:async()=>archived(),tracking:async()=>tracking(patch),flow:async()=>{},phase:()=>{}}));
 const altered=[archived(),archived({subscriptionDigest:'e'.repeat(64)})];await assert.rejects(qualifyNativeRenewalsAfterEdit({original:receipt(),readback:async()=>altered.shift(),tracking:async()=>tracking(),flow:async()=>{},phase:()=>{}}));
 for(const failing of ['readback','tracking','flow']){const args={original:receipt(),readback:async()=>archived(),tracking:async()=>tracking(),flow:async()=>{},phase:()=>{}};args[failing]=async()=>{throw new Error('private failure');};await assert.rejects(qualifyNativeRenewalsAfterEdit(args));}
});
test('installed flows validate candidate date using actual UI/refresh and retain parent Add/Edit semantics',()=>{
 for(const locale of ['sv','en']){const env=flowEnvironment(locale);const c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding;assert.equal(env.MAESTRO_DATE,c.nativePersonal.date);assert.equal(env.MAESTRO_RENEWALS_OPEN,c.nativeRenewals.open);assert.equal(env.MAESTRO_RENEWALS_REFRESH,c.nativeRenewals.refresh);assert.equal(env.MAESTRO_RENEWALS_EMPTY,c.nativeRenewals.empty);assert.equal(env.MAESTRO_RENEWALS_TITLE,c.nativeRenewals.title);}
 const load=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8');const positive=load('renewals'),empty=load('renewals-empty');
 assert.equal((positive.match(/assertVisible: \$\{MAESTRO_RENEWAL_DATE\}/g)??[]).length,2);assert.match(positive,/MAESTRO_RENEWALS_REFRESH/);assert.match(positive,/MAESTRO_LOGOUT_CONFIRMED/);assert.match(empty,/MAESTRO_RENEWALS_EMPTY/);assert.match(empty,/MAESTRO_LOGOUT_CONFIRMED/);
 assert.match(load('enroll-add'),/inputText: \$\{MAESTRO_RENEWAL_DATE\}/);assert.match(load('edit-status'),/- scrollUntilVisible:\r?\n {4}element:\r?\n {6}id: native-subscription-date\r?\n {4}direction: DOWN\r?\n- tapOn:\r?\n {4}id: native-subscription-date\r?\n- eraseText\r?\n- hideKeyboard\r?\n- scrollUntilVisible:\r?\n {4}element: \$\{MAESTRO_SAVE_EDIT\}\r?\n {4}direction: DOWN\r?\n- tapOn: \$\{MAESTRO_SAVE_EDIT\}/);
});
