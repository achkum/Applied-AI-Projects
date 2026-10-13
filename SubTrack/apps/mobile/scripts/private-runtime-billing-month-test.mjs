import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {ACCEPTED_NATIVE_MONTH_SCREENSHOTS,acceptedNativeMonthScreenshot,qualifyNativeMonthBeforeEdit,qualifyNativeMonthAfterEdit} from './private-runtime-billing-month.mjs';
import {flowEnvironment} from './private-runtime-flow-env.mjs';
const original=(patch={})=>({version:1,markerHash:'a'.repeat(64),subscriptionCount:1,subscriptionIdentityHash:'b'.repeat(64),subscriptionDigest:'c'.repeat(64),activeSavedDateReadback:true,archivedEmptyReadback:false,...patch});
const archived=(patch={})=>original({subscriptionDigest:'d'.repeat(64),activeSavedDateReadback:false,archivedEmptyReadback:true,...patch});
const tracking=(patch={})=>({version:1,markerHash:'a'.repeat(64),subscriptionCount:1,subscriptionIdentityHash:'b'.repeat(64),subscriptionDigest:'d'.repeat(64),manualEditReadback:true,archivedReadback:true,revisionSixReadback:true,...patch});
test('only two exact successful month shots are publishable',()=>{
 assert.deepEqual(ACCEPTED_NATIVE_MONTH_SCREENSHOTS,['accepted-billing-month-detail.png','accepted-billing-month-empty.png']);
 for(const name of ACCEPTED_NATIVE_MONTH_SCREENSHOTS)assert.equal(acceptedNativeMonthScreenshot(name),true);
 for(const name of [null,'failed.png','../accepted-billing-month-detail.png','accepted-billing-month-detail.png.log'])assert.equal(acceptedNativeMonthScreenshot(name),false);
});
test('installed detail flow is sandwiched by exact unchanged original active receipt',async()=>{
 const events=[];await qualifyNativeMonthBeforeEdit({original:original(),readback:async()=>{events.push('read');return original();},flow:async name=>events.push(name),phase:name=>events.push(name)});
 assert.deepEqual(events,['billing-month-readback-before','read','billing-month','read']);
 for(const patch of [{activeSavedDateReadback:false},{archivedEmptyReadback:true},{subscriptionDigest:'e'.repeat(64)},{subscriptionCount:2}])await assert.rejects(qualifyNativeMonthBeforeEdit({original:original(),readback:async()=>original(patch),flow:async()=>{},phase:()=>{}}));
 for(const patch of [{activeSavedDateReadback:false},{archivedEmptyReadback:true}])await assert.rejects(qualifyNativeMonthBeforeEdit({original:original(patch),readback:async()=>original(),flow:async()=>{},phase:()=>{}}));
 const values=[original(),original({subscriptionDigest:'e'.repeat(64)})];await assert.rejects(qualifyNativeMonthBeforeEdit({original:original(),readback:async()=>values.shift(),flow:async()=>{},phase:()=>{}}));
 for(const failing of ['readback','flow']){const args={original:original(),readback:async()=>original(),flow:async()=>{},phase:()=>{}};args[failing]=async()=>{throw new Error('private failure');};await assert.rejects(qualifyNativeMonthBeforeEdit(args));}
});
test('archived empty flow preserves identity and exact revision-six restart tracking digest',async()=>{
 const events=[];const result=await qualifyNativeMonthAfterEdit({original:original(),readback:async()=>{events.push('read');return archived();},tracking:async()=>{events.push('tracking');return tracking();},flow:async name=>events.push(name),phase:name=>events.push(name)});
 assert.deepEqual(events,['billing-month-archived-readback','read','tracking','billing-month-empty','read']);assert.deepEqual(result,{billingMonthInstalledDetailUi:true,billingMonthArchivedEmptyUi:true,billingMonthUnchangedReadback:true,billingMonthAcknowledgedLogoutUi:true});assert.ok(Object.isFrozen(result));
 for(const patch of [{activeSavedDateReadback:true},{archivedEmptyReadback:false},{markerHash:'e'.repeat(64)},{subscriptionIdentityHash:'e'.repeat(64)}])await assert.rejects(qualifyNativeMonthAfterEdit({original:original(),readback:async()=>archived(patch),tracking:async()=>tracking(),flow:async()=>{},phase:()=>{}}));
 for(const patch of [{markerHash:'e'.repeat(64)},{subscriptionIdentityHash:'e'.repeat(64)},{subscriptionDigest:'e'.repeat(64)},{manualEditReadback:false},{archivedReadback:false},{revisionSixReadback:false}])await assert.rejects(qualifyNativeMonthAfterEdit({original:original(),readback:async()=>archived(),tracking:async()=>tracking(patch),flow:async()=>{},phase:()=>{}}));
 const values=[archived(),archived({subscriptionDigest:'e'.repeat(64)})];await assert.rejects(qualifyNativeMonthAfterEdit({original:original(),readback:async()=>values.shift(),tracking:async()=>tracking(),flow:async()=>{},phase:()=>{}}));
 for(const failing of ['readback','tracking','flow']){const args={original:original(),readback:async()=>archived(),tracking:async()=>tracking(),flow:async()=>{},phase:()=>{}};args[failing]=async()=>{throw new Error('private failure');};await assert.rejects(qualifyNativeMonthAfterEdit(args));}
});
test('normal native month navigation/detail/refresh/logout uses trusted bilingual labels',()=>{
 for(const locale of ['en','sv']){const env=flowEnvironment(locale),c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8'));for(const [key,field] of [['OPEN','open'],['TITLE','title'],['NEXT','next'],['REFRESH','refresh'],['EMPTY','empty'],['DAY_TEMPLATE','day'],['SAVED_DATE_TEMPLATE','savedDate'],['MANUAL','manual']])assert.equal(env[`MAESTRO_MONTH_${key}`],c.onboarding.billingMonth[field]);assert.equal(env.MAESTRO_MONTH_DETAIL,c.onboarding.billingMonth.details.replace('%{name}','Native restart proof'));assert.equal(env.MAESTRO_MONTH_CLOSE,c.actions.close);assert.equal(env.MAESTRO_MONTH_AMOUNT,'129,90\\s+SEK');}
 const load=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8');const positive=load('billing-month'),empty=load('billing-month-empty');
 assert.equal((positive.match(/tapOn: \$\{MAESTRO_MONTH_NEXT\}/g)??[]).length,1);assert.match(positive,/when:\r?\n {6}notVisible: \$\{MAESTRO_MONTH_DAY\}/);assert.equal((positive.match(/tapOn: \$\{MAESTRO_MONTH_DAY\}/g)??[]).length,2);assert.equal((positive.match(/assertVisible: \$\{MAESTRO_RENEWAL_DATE\}/g)??[]).length,2);assert.match(positive,/MAESTRO_MONTH_DETAIL/);assert.match(positive,/MAESTRO_MONTH_SAVED_DATE/);assert.match(positive,/takeScreenshot: accepted-billing-month-detail/);assert.match(empty,/MAESTRO_MONTH_EMPTY/);assert.match(empty,/takeScreenshot: accepted-billing-month-empty/);
 for(const flow of [positive,empty]){assert.match(flow,/MAESTRO_MONTH_REFRESH/);assert.match(flow,/MAESTRO_LOGOUT_CONFIRMED/);assert.match(flow,/assertNotVisible: Native/);assert.doesNotMatch(flow,/inputText|clearState|setDate|MAESTRO_PRIVATE_OTP/);}
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');for(const value of ['flow-billing-month','flow-billing-month-empty','billing-month-readback-before','billing-month-archived-readback'])assert.ok(driver.includes(`'${value}'`));assert.match(driver,/ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS,\.\.\.ACCEPTED_NATIVE_MONTH_SCREENSHOTS/);
});
