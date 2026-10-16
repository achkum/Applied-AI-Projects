import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {qualifyNativeEditStatus,assertTrackingReceipt,acceptedNativeScreenshot,ACCEPTED_NATIVE_SCREENSHOTS,ACCEPTED_ANDROID_SETUP_SCREENSHOTS} from './private-runtime-edit-status.mjs';
import {flowEnvironment} from './private-runtime-flow-env.mjs';
const receipt=(patch={})=>({version:1,markerHash:'a'.repeat(64),subscriptionCount:1,subscriptionIdentityHash:'b'.repeat(64),subscriptionDigest:'c'.repeat(64),manualEditReadback:true,archivedReadback:true,revisionSixReadback:true,...patch});
test('preserves parent shots and excludes every unreviewed screenshot/log',()=>{
 assert.deepEqual(ACCEPTED_NATIVE_SCREENSHOTS,['accepted-add.png','accepted-restart.png','accepted-logout.png','accepted-edit.png','accepted-paused.png','accepted-archived.png','accepted-edited-restart.png','accepted-edited-api-restart.png']);
 for(const name of ACCEPTED_NATIVE_SCREENSHOTS)assert.equal(acceptedNativeScreenshot(name),true);
 for(const name of ['accepted-error.png','enrollment.png','identifier.log','accepted-edit.png.log','../accepted-edit.png',null])assert.equal(acceptedNativeScreenshot(name),false);
});
test('tracking observer receipt is closed with exact hash grammar, count, version and booleans',()=>{
 assertTrackingReceipt(receipt());
 for(const value of [null,[],Object.assign(Object.create(null),receipt()),receipt({extra:'private'}),receipt({version:2}),receipt({subscriptionCount:2}),receipt({markerHash:undefined}),receipt({markerHash:'a'.repeat(64)+'\n'}),receipt({subscriptionIdentityHash:'A'.repeat(64)}),receipt({subscriptionDigest:'bad'}),receipt({manualEditReadback:'true'})])assert.throws(()=>assertTrackingReceipt(value));
});
test('qualifies only after complete flow, fresh app login, exact restart readback and logout flow',async()=>{
 const calls=[];const original=receipt({subscriptionDigest:'d'.repeat(64),manualEditReadback:false,archivedReadback:false,revisionSixReadback:false});const values=[original,receipt(),receipt()];
 const result=await qualifyNativeEditStatus({readback:async()=>{calls.push('read');return values.shift();},flow:async name=>calls.push(name),restart:async()=>calls.push('restart'),phase:name=>calls.push(name)});
 assert.deepEqual(calls,['read','edit-status','tracking-readback-before','read','tracking-api-restart','restart','edit-status-api-restart','tracking-readback-after','read']);
 assert.deepEqual(result,{manualEditReadback:true,trackingStatusReadback:true,editedAppRestartReadback:true,editedApiRestartReadback:true,editedAcknowledgedLogoutUi:true});assert.ok(Object.isFrozen(result));
});
test('withholds native completion on wrong row/fixture/flags/restart state or failed tool',async()=>{
 for(const patch of [{markerHash:'d'.repeat(64)},{subscriptionIdentityHash:'d'.repeat(64)},{manualEditReadback:false},{archivedReadback:false},{revisionSixReadback:false}]){
  const values=[receipt(),receipt(patch)];let restarted=false;
  await assert.rejects(qualifyNativeEditStatus({readback:async()=>values.shift(),flow:async()=>{},restart:async()=>{restarted=true;},phase:()=>{}}));assert.equal(restarted,false);
 }
 const changed=[receipt(),receipt(),receipt({subscriptionDigest:'d'.repeat(64)})];await assert.rejects(qualifyNativeEditStatus({readback:async()=>changed.shift(),flow:async()=>{},restart:async()=>{},phase:()=>{}}));
 for(const failing of ['readback','flow','restart']){const callbacks={readback:async()=>receipt(),flow:async()=>{},restart:async()=>{},phase:()=>{}};callbacks[failing]=async()=>{throw new Error('private');};await assert.rejects(qualifyNativeEditStatus(callbacks));}
});
test('Maestro uses bilingual catalog labels and starts from parent logout without credentials',()=>{
 for(const locale of ['sv','en']){const environment=flowEnvironment(locale);const catalog=JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`,import.meta.url),'utf8')).onboarding;
  assert.equal(environment.MAESTRO_EDIT,catalog.nativeSubscriptionEdit.edit);assert.equal(environment.MAESTRO_SAVE_EDIT,catalog.nativeSubscriptionEdit.save);assert.equal(environment.MAESTRO_EDIT_SAVED,catalog.nativeSubscriptionEdit.saved);assert.equal(environment.MAESTRO_PAUSE,catalog.nativeSubscriptionEdit.pause);assert.equal(environment.MAESTRO_RESUME,catalog.nativeSubscriptionEdit.resume);assert.equal(environment.MAESTRO_MARK_CANCELLED,catalog.nativeSubscriptionEdit.cancelled);assert.equal(environment.MAESTRO_ARCHIVE,catalog.nativeSubscriptionEdit.archive);assert.equal(environment.MAESTRO_STATUS_SAVED,catalog.nativeSubscriptionEdit.statusSaved);
 }
 const flow=readFileSync(new URL('../e2e/private-runtime-edit-status.yaml',import.meta.url),'utf8');assert.ok(flow.indexOf('${MAESTRO_VERIFY_BANKID}')<flow.indexOf('${MAESTRO_EDIT}'));assert.match(flow,/accepted-edited-restart/);
 const restart=readFileSync(new URL('../e2e/private-runtime-edit-status-api-restart.yaml',import.meta.url),'utf8');assert.match(restart,/accepted-edited-api-restart/);assert.match(restart,/MAESTRO_LOGOUT_CONFIRMED/);
});

test('single edit save returns to exact Manage header feedback then searches persisted edited row DOWN',()=>{
 const flow=readFileSync(new URL('../e2e/private-runtime-edit-status.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.ok(flow.includes('- tapOn: ${MAESTRO_SAVE_EDIT}\n- scrollUntilVisible:\n    element:\n      id: native-personal-title\n    direction: UP\n- assertVisible:\n    id: native-personal-title\n    text: ${MAESTRO_PERSONAL_TITLE}\n- extendedWaitUntil:\n    visible: ${MAESTRO_EDIT_SAVED}\n    timeout: 30000\n- scrollUntilVisible:\n    element: Native edited restart proof\n    direction: DOWN\n- assertVisible: Native edited restart proof\n- takeScreenshot: accepted-edit'));assert.equal(flow.split('- tapOn: ${MAESTRO_SAVE_EDIT}').length-1,1);assert.match(flow,/assertNotVisible: \$\{MAESTRO_ARCHIVE\}/);
});


test('setup pixels are Android-only accepted names from established pre-input checkpoints',()=>{
 assert.deepEqual(ACCEPTED_ANDROID_SETUP_SCREENSHOTS,['accepted-welcome.png','accepted-signup.png','accepted-profile.png']);
 for(const name of ACCEPTED_ANDROID_SETUP_SCREENSHOTS){assert.equal(acceptedNativeScreenshot(name,'android'),true);for(const platform of [undefined,'ios','other'])assert.equal(acceptedNativeScreenshot(name,platform),false);}
 for(const name of ['accepted-error.png','accepted-profile.png.log','../accepted-profile.png',null])assert.equal(acceptedNativeScreenshot(name,'android'),false);
 const identifier=readFileSync(new URL('../e2e/private-runtime-identifier-android.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.ok(identifier.includes('timeout: 120000\n- takeScreenshot: accepted-welcome\n- tapOn: ${MAESTRO_CREATE_ACCOUNT}'));
 assert.ok(identifier.includes('timeout: 30000\n- takeScreenshot: accepted-signup\n- tapOn:\n    id: native-identifier-input'));
 const enrollment=readFileSync(new URL('../e2e/private-runtime-enroll-add.yaml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.ok(enrollment.includes('text: ${MAESTRO_PROFILE_TITLE}\n- takeScreenshot: accepted-profile\n- tapOn:\n    id: native-profile-name'));
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');
 assert.match(driver,/acceptedNativeScreenshot\(entry.name,platform\)/);
 assert.ok(driver.includes("platform==='android'?ACCEPTED_ANDROID_SETUP_SCREENSHOTS:[]"));
 assert.ok(driver.indexOf("markPhase('accepted-evidence')")<driver.indexOf('copyAcceptedScreenshots(privateDir)'));
});
