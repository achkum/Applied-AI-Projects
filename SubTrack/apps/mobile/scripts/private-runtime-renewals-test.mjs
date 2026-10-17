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
 for(const locale of ['sv','en']){const env=flowEnvironment(locale);const c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding;assert.equal(env.MAESTRO_DATE,c.nativePersonal.date);assert.equal(env.MAESTRO_RENEWALS_OPEN,c.productNav.upcoming);assert.equal(env.MAESTRO_RENEWALS_REFRESH,c.nativeRenewals.refresh);assert.equal(env.MAESTRO_RENEWALS_EMPTY,c.nativeRenewals.empty);assert.equal(env.MAESTRO_RENEWALS_TITLE,c.nativeRenewals.title);}
 const load=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8');const positive=load('renewals'),empty=load('renewals-empty');
 assert.equal((positive.match(/assertVisible: \$\{MAESTRO_RENEWAL_DATE\}/g)??[]).length,2);for(const flow of [positive,empty]){assert.match(flow,/- swipe:\r?\n {4}from:\r?\n {6}id: native-renewals-scroll\r?\n {4}direction: DOWN\r?\n {4}duration: 700/);assert.doesNotMatch(flow,/MAESTRO_RENEWALS_REFRESH/);}assert.match(positive,/MAESTRO_LOGOUT_CONFIRMED/);assert.match(empty,/MAESTRO_RENEWALS_EMPTY/);assert.match(empty,/MAESTRO_LOGOUT_CONFIRMED/);
 assert.match(load('enroll-add'),/runFlow: private-runtime-pick-renewal-date.yaml/);assert.match(load('edit-status'),/- scrollUntilVisible:\r?\n {4}element:\r?\n {6}id: native-subscription-date\r?\n {4}direction: DOWN\r?\n- tapOn:\r?\n {4}id: native-subscription-date\r?\n- extendedWaitUntil:\r?\n {4}visible: \$\{MAESTRO_DATE_CLEAR\}\r?\n {4}timeout: 30000\r?\n- tapOn: \$\{MAESTRO_DATE_CLEAR\}\r?\n- extendedWaitUntil:\r?\n {4}notVisible: \$\{MAESTRO_DATE_CLEAR\}\r?\n {4}timeout: 30000\r?\n- scrollUntilVisible:\r?\n {4}element: \$\{MAESTRO_SAVE_EDIT\}\r?\n {4}direction: DOWN\r?\n- tapOn: \$\{MAESTRO_SAVE_EDIT\}/);
});

test('Upcoming uses shared catalog navigation and returns to the exact ready Manage header before logout',()=>{
 for(const locale of ['en','sv']){const env=flowEnvironment(locale),c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding;assert.equal(env.MAESTRO_MANAGE,c.productNav.manage);assert.equal(env.MAESTRO_PERSONAL_TITLE,c.productNav.manage);assert.equal(env.MAESTRO_PROFILE_TITLE,c.profile.title);}
 for(const name of ['renewals','renewals-empty']){const flow=readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.equal(flow.split('- tapOn: ${MAESTRO_RENEWALS_OPEN}').length-1,1);assert.ok(flow.includes('- tapOn:\n    id: native-nav-manage\n- extendedWaitUntil:\n    visible:\n      id: native-personal-title\n      text: ${MAESTRO_PERSONAL_TITLE}\n    timeout: 30000\n- runFlow: private-runtime-open-profile.yaml\n- scrollUntilVisible:\n    element: ${MAESTRO_LOGOUT}\n    direction: DOWN\n- tapOn: ${MAESTRO_LOGOUT}'));assert.equal(flow.split('- tapOn:\n    id: native-nav-manage').length-1,1);}
});

test('agenda row waits stay on Upcoming and never wait for a Manage-only heading',()=>{
 const flow=readFileSync(new URL('../e2e/private-runtime-renewals.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const agenda=flow.slice(flow.indexOf('- tapOn: ${MAESTRO_RENEWALS_OPEN}'),flow.lastIndexOf('- tapOn:\n    id: native-nav-manage'));
 assert.ok(agenda.includes('${MAESTRO_RENEWALS_TITLE}'));assert.ok(!agenda.includes('native-personal-title'));assert.ok(!agenda.includes('${MAESTRO_PERSONAL_TITLE}'));
 assert.equal(agenda.split('- assertVisible: ${MAESTRO_EXPECTED_AMOUNT}').length-1,2);
});

test('native Upcoming pull refresh remains a real owner read without a normal refresh button',()=>{
 const source=readFileSync(new URL('../src/components/home/NativePersonalRenewalsScreen.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('testID="native-renewals-scroll"'));assert.ok(source.includes('refreshControl={<RefreshControl'));
 assert.ok(source.includes("enabled={session.phase==='active'}"));assert.ok(source.includes('onRefresh={()=>{void load();}}'));
 assert.ok(source.includes("state==='error'?button(t('actions.retry')"));assert.ok(!source.includes("button(t('onboarding.nativeRenewals.refresh')"));
 for(const name of ['renewals','renewals-empty']){const flow=readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8');assert.ok(flow.indexOf('element: ${MAESTRO_RENEWALS_TITLE}')<flow.indexOf('id: native-renewals-scroll'));assert.ok(flow.indexOf('id: native-renewals-scroll')<flow.indexOf('- takeScreenshot: accepted-renewals'));}
});
