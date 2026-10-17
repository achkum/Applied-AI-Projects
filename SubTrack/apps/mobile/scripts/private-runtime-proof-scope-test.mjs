import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {proofScope,profileReceipt,PROFILE_SCREENSHOTS} from './private-runtime-proof-scope.mjs';
test('full remains automatic/default; profile requires explicit Android dispatch and rejects unknown scope',()=>{
 assert.equal(proofScope({},'android'),'full');assert.equal(proofScope({GITHUB_EVENT_NAME:'pull_request'},'android'),'full');
 assert.equal(proofScope({GITHUB_EVENT_NAME:'workflow_dispatch',SUBTRACK_NATIVE_PROOF_SCOPE:'profile'},'android'),'profile');
 assert.equal(proofScope({GITHUB_EVENT_NAME:'pull_request',SUBTRACK_NATIVE_PROOF_SCOPE:'profile',SUBTRACK_NATIVE_PROOF_SELECTION:'profile-allowlist-v1'},'android'),'profile');
 assert.throws(()=>proofScope({GITHUB_EVENT_NAME:'pull_request',SUBTRACK_NATIVE_PROOF_SCOPE:'profile',SUBTRACK_NATIVE_PROOF_SELECTION:'unrecognized'},'android'));
 for(const env of [{SUBTRACK_NATIVE_PROOF_SCOPE:'profile'},{GITHUB_EVENT_NAME:'pull_request',SUBTRACK_NATIVE_PROOF_SCOPE:'profile'},{SUBTRACK_NATIVE_PROOF_SCOPE:'bad'}])assert.throws(()=>proofScope(env,'android'));
 assert.throws(()=>proofScope({GITHUB_EVENT_NAME:'workflow_dispatch',SUBTRACK_NATIVE_PROOF_SCOPE:'profile'},'ios'));
});
test('scoped receipt requires unchanged real readback and never claims edit/bank/calendar coverage',()=>{
 const before={version:1,markerHash:'e'.repeat(64),identityCount:1,profileCompleteCount:1,justMeCount:1,subscriptionCount:1,subscriptionDigest:'a'.repeat(64)},input={head:'b'.repeat(40),platform:'android',binaryIdentity:'c'.repeat(64),installedFontState:'custom',before,after:{...before}};
 const receipt=profileReceipt(input);assert.equal(receipt.scope,'profile');assert.equal(receipt.schema,'st253-native-profile-readback-v1');assert.equal(receipt.apiRestartReadback,true);
 for(const key of ['manualEditReadback','trackingStatusReadback','bankReadback','billingMonthReadback'])assert.equal(key in receipt,false);
 assert.throws(()=>profileReceipt({...input,after:{...before,subscriptionDigest:'d'.repeat(64)}}));assert.throws(()=>profileReceipt({...input,after:{...before,subscriptionCount:0}}));assert.throws(()=>profileReceipt({...input,installedFontState:'fallback'}));
 assert.deepEqual(PROFILE_SCREENSHOTS,['accepted-welcome.png','accepted-signup.png','accepted-profile.png','accepted-add.png','accepted-restart.png','accepted-logout.png']);
});
test('profile exits only after original real app/API restart and exact readback; full portfolio stays intact',()=>{
 const source=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8'),start=source.indexOf("if(scope==='profile')"),full=source.indexOf('const originalRenewals=await qualifyNativeRenewalsBeforeEdit');
 assert.ok(source.indexOf("await flow('enroll-add'")<start);assert.ok(source.indexOf("await flow('restart')")<start);assert.ok(source.indexOf('assert.deepEqual(before, after)')<start);assert.ok(start<full);
 const scoped=source.slice(start,full);assert.ok(scoped.includes('installed-native-profile-receipt.json'));assert.ok(scoped.includes('return;'));assert.ok(!scoped.includes('installed-native-receipt.json'));
 assert.ok(source.includes('await qualifyNativeBank('));assert.ok(source.includes('await qualifyNativeEditStatus('));assert.ok(source.includes('await harness.dispose()'));
});
