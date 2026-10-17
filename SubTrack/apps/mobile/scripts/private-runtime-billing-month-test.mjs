import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {createRequire} from 'node:module';
import {fixtureMonthLabels,ACCEPTED_NATIVE_MONTH_SCREENSHOTS,acceptedNativeMonthScreenshot,qualifyNativeMonthBeforeEdit,qualifyNativeMonthAfterEdit} from './private-runtime-billing-month.mjs';
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
 for(const locale of ['en','sv']){const env=flowEnvironment(locale),c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8'));for(const [key,field] of [['NEXT','next'],['REFRESH','refresh'],['EMPTY','empty'],['DAY_TEMPLATE','day'],['MANUAL','manual']])assert.equal(env[`MAESTRO_MONTH_${key}`],c.onboarding.billingMonth[field]);assert.equal(env.MAESTRO_MONTH_SAVED_DATE_TEMPLATE,'%{date}');assert.equal(env.MAESTRO_MONTH_TITLE,c.onboarding.productNav.home);assert.equal(env.MAESTRO_MONTH_DETAIL,c.onboarding.billingMonth.details.replace('%{name}','Example streaming'));assert.equal(env.MAESTRO_MONTH_CLOSE,c.actions.close);assert.equal(env.MAESTRO_MONTH_AMOUNT,String.raw`129,90[ \u00a0\u202f]+SEK`);}
 const load=name=>readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8');const positive=load('billing-month'),empty=load('billing-month-empty');
 assert.equal((positive.match(/tapOn: \$\{MAESTRO_MONTH_NEXT\}/g)??[]).length,1);assert.match(positive,/when:\r?\n {6}visible: \$\{MAESTRO_MONTH_PREVIOUS\}/);assert.equal((positive.match(/private-runtime-month-day.yaml/g)??[]).length,2);assert.match(positive,/MAESTRO_MONTH_DETAIL/);assert.match(positive,/MAESTRO_MONTH_SAVED_DATE/);assert.match(positive,/takeScreenshot: accepted-billing-month-detail/);assert.match(empty,/MAESTRO_MONTH_EMPTY/);assert.match(empty,/takeScreenshot: accepted-billing-month-empty/);
 for(const flow of [positive,empty]){assert.match(flow,/id: native-month-scroll/);assert.doesNotMatch(flow,/- tapOn: \$\{MAESTRO_MONTH_REFRESH\}/);assert.match(flow,/MAESTRO_LOGOUT_CONFIRMED/);assert.match(flow,/assertNotVisible: Example streaming/);assert.doesNotMatch(flow,/inputText|clearState|setDate|MAESTRO_PRIVATE_OTP/);}
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');for(const value of ['flow-billing-month','flow-billing-month-empty','billing-month-readback-before','billing-month-archived-readback'])assert.ok(driver.includes(`'${value}'`));assert.match(driver,/ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS,\.\.\.ACCEPTED_NATIVE_MONTH_SCREENSHOTS/);
});

test('Month uses shared catalog navigation and exact Manage header return without skipping acceptance',()=>{
 for(const locale of ['en','sv']){const env=flowEnvironment(locale),c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding;assert.equal(env.MAESTRO_MONTH_OPEN,c.productNav.home);assert.equal(env.MAESTRO_MANAGE,c.productNav.manage);}
 for(const name of ['billing-month','billing-month-empty']){const flow=readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.equal(flow.split('- tapOn:\n    id: native-nav-month').length-1,1);assert.ok(flow.includes('- tapOn:\n    id: native-nav-manage\n- extendedWaitUntil:\n    visible:\n      id: native-personal-title\n      text: ${MAESTRO_PERSONAL_TITLE}\n    timeout: 30000\n- runFlow: private-runtime-open-profile.yaml\n- scrollUntilVisible:\n    element: ${MAESTRO_LOGOUT}\n    direction: DOWN\n- tapOn: ${MAESTRO_LOGOUT}'));assert.equal(flow.split('- tapOn:\n    id: native-nav-manage').length-1,1);}
});

test('fixture month headers use actual native locales and valid dates independently of offscreen day position',()=>{
 const first=fixtureMonthLabels('2026-10-01'),offscreen=fixtureMonthLabels('2026-10-28');assert.deepEqual(first,offscreen);assert.deepEqual(offscreen,{MAESTRO_MONTH_TARGET:'October 2026',MAESTRO_MONTH_PREVIOUS:'September 2026'});assert.ok(Object.isFrozen(first));
 assert.deepEqual(fixtureMonthLabels('2027-01-01','en'),{MAESTRO_MONTH_TARGET:'January 2027',MAESTRO_MONTH_PREVIOUS:'December 2026'});assert.deepEqual(fixtureMonthLabels('2024-02-29','sv'),{MAESTRO_MONTH_TARGET:'februari 2024',MAESTRO_MONTH_PREVIOUS:'januari 2024'});assert.match(fixtureMonthLabels('9999-12-31').MAESTRO_MONTH_TARGET,/9999/);assert.match(fixtureMonthLabels('0001-02-01').MAESTRO_MONTH_PREVIOUS,/1$/);
 for(const date of [null,{},'2026-2-01','2026-02-29','2024-02-30','2026-13-01','2026-01-00','0000-02-01','0001-01-01','10000-01-01','2026-01-01T00:00:00Z'])assert.throws(()=>fixtureMonthLabels(date));for(const locale of [null,'fr','EN'])assert.throws(()=>fixtureMonthLabels('2026-10-28',locale));
});
test('actual month source permits one Next only for exact previous header and fails unknown membership before calendar selection',()=>{
 const labels=fixtureMonthLabels('2026-10-28');
 for(const name of ['billing-month','billing-month-empty']){const flow=readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');const block='- runFlow:\n    when:\n      visible: ${MAESTRO_MONTH_PREVIOUS}\n    commands:\n      - tapOn: ${MAESTRO_MONTH_NEXT}\n- extendedWaitUntil:\n    visible: ${MAESTRO_MONTH_TARGET}\n    timeout: 30000';assert.ok(flow.includes(block));assert.ok(flow.indexOf(block)<flow.indexOf('- runFlow: private-runtime-month-day.yaml'));assert.equal(flow.split('tapOn: ${MAESTRO_MONTH_NEXT}').length-1,1);assert.doesNotMatch(flow,/notVisible: \$\{MAESTRO_MONTH_DAY\}|MAESTRO_MONTH_DAY.*\|/);
 // Exercise the exact source-selected condition against current/adjacent/foreign headers.
 const token=/when:\n {6}visible: \$\{(MAESTRO_MONTH_PREVIOUS)\}/.exec(flow)[1];for(const [heading,next,accepted] of [[labels.MAESTRO_MONTH_TARGET,false,true],[labels.MAESTRO_MONTH_PREVIOUS,true,true],['August 2026',false,false]]){const wouldAdvance=heading===labels[token];assert.equal(wouldAdvance,next);assert.equal(wouldAdvance||heading===labels.MAESTRO_MONTH_TARGET,accepted);}}
});
test('actual calendar picker selects the exact fixture date before and after empty-state refresh',()=>{
 const helper=readFileSync(new URL('../e2e/private-runtime-month-day.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.ok(helper.includes('- scrollUntilVisible:\n    element:\n      id: native-home-calendar\n    direction: UP\n- tapOn:\n    id: native-home-calendar'));
 assert.ok(helper.includes('- extendedWaitUntil:\n    visible:\n      id: native-date-${MAESTRO_MONTH_ISO}\n    timeout: 30000\n- tapOn:\n    id: native-date-${MAESTRO_MONTH_ISO}'));
 assert.ok(helper.includes('- extendedWaitUntil:\n    visible:\n      id: native-month-selected-date\n      text: ${MAESTRO_MONTH_ISO}\n    timeout: 30000'));
 assert.ok(helper.endsWith('- assertVisible:\n    id: native-month-selected-date\n    text: ${MAESTRO_MONTH_ISO}\n'));
 assert.equal(helper.split('- tapOn:').length-1,2);assert.doesNotMatch(helper,/optional:|inputText|clearState|setDate|swipe:|repeat:|notVisible:/);
 const empty=readFileSync(new URL('../e2e/private-runtime-billing-month-empty.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.equal(empty.split('- assertNotVisible: ${MAESTRO_MONTH_DAY_EMPTY}').length-1,2);assert.equal(empty.split('- runFlow: private-runtime-month-day.yaml\n- assertNotVisible: ${MAESTRO_MONTH_DAY_EMPTY}').length-1,2);assert.equal(empty.split('visible: ${MAESTRO_MONTH_EMPTY}\n    timeout: 30000').length-1,2);assert.ok(empty.indexOf('MAESTRO_MONTH_DAY_EMPTY')<empty.indexOf('- swipe:'));
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');assert.ok(driver.includes('labels.MAESTRO_MONTH_ISO=renewalDate;'));assert.ok(driver.includes("(name==='billing-month'||name==='billing-month-empty')?fixtureMonthLabels(renewalDate):{}"));assert.ok(driver.includes('{ ...labels, ...calendarEnv, ...extraEnv }'));
 for(const locale of ['en','sv']){const env=flowEnvironment(locale),c=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8'));assert.equal(env.MAESTRO_MONTH_DAY_EMPTY,c.onboarding.billingMonth.dayEmpty);}
});

test('detail date proof matches its standalone ISO value and remains absent after acknowledged logout',()=>{
 const flow=readFileSync(new URL('../e2e/private-runtime-billing-month.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const source=readFileSync(new URL('../src/components/billing/NativeBillingMonthScreen.tsx',import.meta.url),'utf8');
 const wrapper=readFileSync(new URL('../src/components/billing/NativeSubscriptionDetail.tsx',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../src/components/billing/NativeSubscriptionDetailContent.tsx',import.meta.url),'utf8');
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("session.phase==='active'&&detail?<NativeSubscriptionDetail session={session} reader={overviewReader} now={now} item={detail}"));
 assert.ok(wrapper.includes("if(session.phase!=='active')return null;"));
 assert.ok(wrapper.includes('<NativeSubscriptionDetailContent {...detail}/>'));
 assert.ok(wrapper.includes('<NativeSubscriptionDetailContent {...detail} metadataFields={fields} history='));
 assert.ok(wrapper.includes('row.id===detail.item.id&&row.revision===detail.item.revision'));
 assert.ok(detail.includes("[t('nativeProductDetails.nextRenewal'),item.nextChargeDate??"));
 assert.ok(detail.includes('>{value}</Text>'));assert.ok(!detail.includes("t('onboarding.billingMonth.savedDate'"));
 assert.ok(driver.includes("labels.MAESTRO_MONTH_SAVED_DATE=labels.MAESTRO_MONTH_SAVED_DATE_TEMPLATE.replace('%{date}',renewalDate)"));
 for(const locale of ['en','sv']){
  const env=flowEnvironment(locale),date='2026-10-28',exact=env.MAESTRO_MONTH_SAVED_DATE_TEMPLATE.replace('%{date}',date);assert.equal(exact,date);assert.notEqual(exact,'2026-10-27');assert.equal(new RegExp(`^(?:${exact})$`).test('Saved expected date: '+date),false);
 }
 assert.ok(flow.includes('- extendedWaitUntil:\n    visible: ${MAESTRO_MONTH_SAVED_DATE}\n    timeout: 30000'));
 assert.ok(flow.includes('- assertNotVisible: ${MAESTRO_MONTH_SAVED_DATE}'));
 assert.ok(flow.indexOf('- assertNotVisible: ${MAESTRO_MONTH_SAVED_DATE}')>flow.indexOf('visible: ${MAESTRO_LOGOUT_CONFIRMED}'));
});

test('actual normal and empty Home flows perform one bounded pull gesture between unchanged exact-date assertions',()=>{
 const mobile=createRequire(new URL('../package.json',import.meta.url)),yaml=createRequire(mobile.resolve('expo/package.json'))('yaml');
 for(const name of ['billing-month','billing-month-empty']){
  const [,rows]=yaml.parseAllDocuments(readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8')).map(document=>document.toJSON());
  const swipes=rows.flatMap((step,index)=>step.swipe?[index]:[]);assert.equal(swipes.length,1,name);const at=swipes[0];
  assert.deepEqual(rows[at],{swipe:{from:{id:'native-month-scroll'},direction:'DOWN',duration:700}});
  assert.deepEqual(rows[at-1],{scrollUntilVisible:{element:'${MAESTRO_MONTH_TITLE}',direction:'UP',centerElement:true}});
  const picks=rows.flatMap((step,index)=>step.runFlow==='private-runtime-month-day.yaml'?[index]:[]);assert.equal(picks.length,2);assert.ok(picks[0]<at&&picks[1]>at);
  assert.equal(rows.filter(step=>step.tapOn==='${MAESTRO_MONTH_REFRESH}').length,0);
  assert.equal(rows.filter(step=>step.tapOn==='${MAESTRO_LOGOUT}').length,1);
  assert.ok(rows.some(step=>step.extendedWaitUntil?.visible==='${MAESTRO_LOGOUT_CONFIRMED}'));
  assert.ok(rows.some(step=>step.assertNotVisible==='${MAESTRO_MONTH_SAVED_DATE}'));
 }
});
