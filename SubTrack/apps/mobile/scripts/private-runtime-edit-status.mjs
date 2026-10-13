import assert from 'node:assert/strict';
export const ACCEPTED_NATIVE_SCREENSHOTS=Object.freeze(['accepted-add.png','accepted-restart.png','accepted-logout.png','accepted-edit.png','accepted-paused.png','accepted-archived.png','accepted-edited-restart.png','accepted-edited-api-restart.png']);
export const EDITED_TRACKING_RECEIPT_KEYS=Object.freeze(['version','markerHash','subscriptionCount','subscriptionIdentityHash','subscriptionDigest','manualEditReadback','archivedReadback','revisionSixReadback']);
export function acceptedNativeScreenshot(name){return ACCEPTED_NATIVE_SCREENSHOTS.includes(name);}
export function assertTrackingReceipt(receipt){
 assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)&&Object.getPrototypeOf(receipt)===Object.prototype);
 assert.deepEqual(Reflect.ownKeys(receipt).sort(),[...EDITED_TRACKING_RECEIPT_KEYS].sort());
 assert.equal(receipt.version,1);assert.equal(receipt.subscriptionCount,1);
 for(const name of ['markerHash','subscriptionIdentityHash','subscriptionDigest']){assert.equal(typeof receipt[name],'string');assert.equal(receipt[name].length,64);assert.match(receipt[name],/^[a-f0-9]{64}$/);}
 for(const name of ['manualEditReadback','archivedReadback','revisionSixReadback'])assert.equal(typeof receipt[name],'boolean');
}
export async function qualifyNativeEditStatus({flow,restart,readback,phase}){
 const original=await readback();assertTrackingReceipt(original);
 await flow('edit-status');phase('tracking-readback-before');
 const before=await readback();assertTrackingReceipt(before);
 assert.equal(before.markerHash,original.markerHash);assert.equal(before.subscriptionIdentityHash,original.subscriptionIdentityHash);
 for(const name of ['manualEditReadback','archivedReadback','revisionSixReadback'])assert.equal(before[name],true);
 phase('tracking-api-restart');await restart();await flow('edit-status-api-restart');phase('tracking-readback-after');
 const after=await readback();assertTrackingReceipt(after);assert.deepEqual(after,before);
 return Object.freeze({manualEditReadback:true,trackingStatusReadback:true,editedAppRestartReadback:true,editedApiRestartReadback:true,editedAcknowledgedLogoutUi:true});
}
