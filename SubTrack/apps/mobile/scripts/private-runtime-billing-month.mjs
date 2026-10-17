import assert from 'node:assert/strict';
import {assertRenewalsReceipt} from './private-runtime-renewals.mjs';
import {assertTrackingReceipt} from './private-runtime-edit-status.mjs';
export const ACCEPTED_NATIVE_MONTH_SCREENSHOTS=Object.freeze(['accepted-billing-month-detail.png','accepted-billing-month-empty.png']);
export function acceptedNativeMonthScreenshot(name){return ACCEPTED_NATIVE_MONTH_SCREENSHOTS.includes(name);}
export async function qualifyNativeMonthBeforeEdit({original,readback,flow,phase}){
 assertRenewalsReceipt(original);assert.equal(original.activeSavedDateReadback,true);assert.equal(original.archivedEmptyReadback,false);
 phase('billing-month-readback-before');const before=await readback();assertRenewalsReceipt(before);assert.deepEqual(before,original);
 // Exact installed month headings establish membership; the receipt remains unchanged authority evidence.
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

/** Exact native month headings; no host clock or element visibility decides membership. */
export function fixtureMonthLabels(date,locale='en'){
 assert.equal(typeof date,'string');assert.match(date,/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);assert.ok(locale==='en'||locale==='sv');
 const instant=new Date(date+'T00:00:00.000Z');assert.ok(Number.isFinite(instant.getTime()));assert.equal(instant.toISOString().slice(0,10),date);assert.ok(instant.getUTCFullYear()>=1);
 const previous=new Date(instant);previous.setUTCDate(1);previous.setUTCMonth(previous.getUTCMonth()-1);assert.ok(previous.getUTCFullYear()>=1);
 const format=new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-SE',{month:'long',year:'numeric',timeZone:'UTC'});
 return Object.freeze({MAESTRO_MONTH_TARGET:format.format(instant),MAESTRO_MONTH_PREVIOUS:format.format(previous)});
}
