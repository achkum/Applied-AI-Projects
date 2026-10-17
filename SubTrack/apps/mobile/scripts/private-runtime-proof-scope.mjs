import assert from 'node:assert/strict';
export const PROFILE_SCREENSHOTS=Object.freeze(['accepted-welcome.png','accepted-signup.png','accepted-profile.png','accepted-add.png','accepted-restart.png','accepted-logout.png']);
export function proofScope(env,platform){
 const scope=env.SUBTRACK_NATIVE_PROOF_SCOPE??'full';
 assert.ok(scope==='full'||scope==='profile','Unknown native proof scope');
 if(scope==='profile')assert.ok(platform==='android'&&(env.GITHUB_EVENT_NAME==='workflow_dispatch'||env.GITHUB_EVENT_NAME==='pull_request'&&env.SUBTRACK_NATIVE_PROOF_SELECTION==='profile-allowlist-v1'),'Profile scope requires explicit Android dispatch or exact changed-path selection');
 return scope;
}
export function profileReceipt({head,platform,binaryIdentity,installedFontState,before,after}){
 assert.match(head,/^[a-f0-9]{40}$/);assert.equal(platform,'android');assert.match(binaryIdentity,/^[a-f0-9]{64}$/);assert.equal(installedFontState,'custom');assert.deepEqual(before,after);assert.equal(after.version,1);assert.match(after.markerHash,/^[a-f0-9]{64}$/);
 for(const key of ['identityCount','profileCompleteCount','justMeCount','subscriptionCount'])assert.equal(after[key],1);
 assert.match(after.subscriptionDigest,/^[a-f0-9]{64}$/);
 return Object.freeze({schema:'st253-native-profile-readback-v1',scope:'profile',head,platform,binaryIdentity,developmentSimulatorOnly:true,installedFontState,profileAndManualSave:true,appRestartReadback:true,apiRestartReadback:true,acknowledgedLogoutUi:true,subscriptionCount:1,subscriptionDigest:after.subscriptionDigest});
}
