import assert from 'node:assert/strict';
import {assertRenewalsReceipt} from './private-runtime-renewals.mjs';
import {assertTrackingReceipt} from './private-runtime-edit-status.mjs';
export const ACCEPTED_NATIVE_MONTH_SCREENSHOTS=Object.freeze(['accepted-billing-month-detail.png','accepted-billing-month-empty.png']);
export function acceptedNativeMonthScreenshot(name){return ACCEPTED_NATIVE_MONTH_SCREENSHOTS.includes(name);}
export async function qualifyNativeMonthBeforeEdit({original,readback,flow,phase}){
 assertRenewalsReceipt(original);assert.equal(original.activeSavedDateReadback,true);assert.equal(original.archivedEmptyReadback,false);
 phase('billing-month-readback-before');const before=await readback();assertRenewalsReceipt(before);assert.deepEqual(before,original);
 // Only installed UI establishes local calendar membership; the receipt is unchanged authority evidence.
 await flow('billing-month');const after=await readback();assertRenewalsReceipt(after);assert.deepEqual(after,original);
}
export async function qualifyNativeMonthAfterEdit({original,readback,tracking,flow,phase}){
 assertRenewalsReceipt(original);phase('billing-month-archived-readback');const before=await readback();assertRenewalsReceipt(before);
 assert.equal(before.activeSavedDateReadback,false);assert.equal(before.archivedEmptyReadback,true);
 assert.equal(before.markerHash,original.markerHash);assert.equal(before.subscriptionIdentityHash,original.subscriptionIdentityHash);
 const edited=await tracking();assertTrackingReceipt(edited);
 for(const field of ['markerHash','subscriptionIdentityHash','subscriptionDigest'])assert.equal(before[field],edited[field]);
 for(const field of ['manualEditReadback','archivedReadback','revisionSixReadback'])assert.equal(edited[field],true);
 await flow('billing-month-empty');const after=await readback();assertRenewalsReceipt(after);assert.deepEqual(after,before);
 return Object.freeze({billingMonthInstalledDetailUi:true,billingMonthArchivedEmptyUi:true,billingMonthUnchangedReadback:true,billingMonthAcknowledgedLogoutUi:true});
}
