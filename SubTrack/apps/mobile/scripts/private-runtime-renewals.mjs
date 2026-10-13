import assert from 'node:assert/strict';
import {assertTrackingReceipt} from './private-runtime-edit-status.mjs';
export const ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS=Object.freeze(['accepted-renewals.png','accepted-renewals-empty.png']);
export function acceptedNativeRenewalsScreenshot(name){return ACCEPTED_NATIVE_RENEWAL_SCREENSHOTS.includes(name);}
export function renewalCandidateDate(now=new Date()){
 assert.ok(now instanceof Date&&Number.isFinite(now.getTime()));const date=new Date(now.getTime());date.setUTCDate(date.getUTCDate()+1);const value=date.toISOString().slice(0,10);
 assert.equal(value.length,10);assert.match(value,/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);assert.ok(!value.startsWith('0000'));return value;
}
export function assertRenewalsReceipt(receipt){
 assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)&&Object.getPrototypeOf(receipt)===Object.prototype);
 assert.deepEqual(Reflect.ownKeys(receipt).sort(),['version','markerHash','subscriptionCount','subscriptionIdentityHash','subscriptionDigest','activeSavedDateReadback','archivedEmptyReadback'].sort());
 assert.equal(receipt.version,1);assert.equal(receipt.subscriptionCount,1);
 for(const field of ['markerHash','subscriptionIdentityHash','subscriptionDigest']){assert.equal(typeof receipt[field],'string');assert.equal(receipt[field].length,64);assert.match(receipt[field],/^[a-f0-9]{64}$/);}
 for(const field of ['activeSavedDateReadback','archivedEmptyReadback'])assert.equal(typeof receipt[field],'boolean');
}
export async function qualifyNativeRenewalsBeforeEdit({readback,flow,phase}){
 phase('renewals-readback-before');const before=await readback();assertRenewalsReceipt(before);assert.equal(before.activeSavedDateReadback,true);assert.equal(before.archivedEmptyReadback,false);
 // The installed real-local-clock agenda must show exact candidate date/name/amount.
 await flow('renewals');const after=await readback();assertRenewalsReceipt(after);assert.deepEqual(after,before);return before;
}
export async function qualifyNativeRenewalsAfterEdit({original,readback,tracking,flow,phase}){
 assertRenewalsReceipt(original);phase('renewals-archived-readback');const before=await readback();assertRenewalsReceipt(before);
 assert.equal(before.activeSavedDateReadback,false);assert.equal(before.archivedEmptyReadback,true);assert.equal(before.markerHash,original.markerHash);assert.equal(before.subscriptionIdentityHash,original.subscriptionIdentityHash);
 const edited=await tracking();assertTrackingReceipt(edited);for(const field of ['markerHash','subscriptionIdentityHash','subscriptionDigest'])assert.equal(before[field],edited[field]);
 for(const field of ['manualEditReadback','archivedReadback','revisionSixReadback'])assert.equal(edited[field],true);
 await flow('renewals-empty');const after=await readback();assertRenewalsReceipt(after);assert.deepEqual(after,before);
 return Object.freeze({expectedRenewalsReadback:true,expectedRenewalsAfterRestartReadback:true,archivedRenewalsEmptyReadback:true,renewalsAcknowledgedLogoutUi:true});
}
