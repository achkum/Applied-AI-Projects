import assert from 'node:assert/strict';
import {assertTrackingReceipt} from './private-runtime-edit-status.mjs';
export const ACCEPTED_NATIVE_BANK_SCREENSHOTS=Object.freeze(['accepted-bank-active.png','accepted-bank-retained.png','accepted-bank-purged.png']);
export function acceptedNativeBankScreenshot(name){return ACCEPTED_NATIVE_BANK_SCREENSHOTS.includes(name);}
export function assertBankReceipt(receipt){
 assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)&&Object.getPrototypeOf(receipt)===Object.prototype);
 assert.deepEqual(Reflect.ownKeys(receipt).sort(),['version','connections','accounts','transactions','generations','purged','receipts','transactionDigest'].sort());
 assert.equal(receipt.version,1);
 for(const field of ['connections','accounts','transactions','generations','purged','receipts']){assert.ok(Number.isSafeInteger(receipt[field]));assert.ok(receipt[field]>=0&&receipt[field]<=1000000);}
 assert.equal(typeof receipt.transactionDigest,'string');assert.match(receipt.transactionDigest,/^[a-f0-9]{64}$/);
}
export async function qualifyNativeBank({flow,restart,readback,tracking,phase}){
 const manual=await tracking();assertTrackingReceipt(manual);
 for(const field of ['manualEditReadback','archivedReadback','revisionSixReadback'])assert.equal(manual[field],true);
 async function read(){phase('bank-readback');const result=await readback();assertBankReceipt(result);const current=await tracking();assertTrackingReceipt(current);assert.deepEqual(current,manual);return result;}
 const zero=await read();for(const field of ['connections','accounts','transactions','generations','purged','receipts'])assert.equal(zero[field],0);
 await flow('bank-connect');const connected=await read();assert.deepEqual(connected,{...zero,connections:1,generations:1,accounts:1,receipts:1});
 await flow('bank-sync');const synced=await read();assert.ok(synced.transactions>1);assert.notEqual(synced.transactionDigest,zero.transactionDigest);assert.deepEqual(synced,{...connected,transactions:synced.transactions,transactionDigest:synced.transactionDigest,receipts:2});
 const env={MAESTRO_BANK_COUNT:String(synced.transactions)};
 await flow('bank-repeat',env);const repeated=await read();assert.deepEqual(repeated,{...synced,receipts:3});
 phase('bank-api-restart');await restart();assert.deepEqual(await read(),repeated);
 await flow('bank-retain',env);const retained=await read();assert.deepEqual(retained,{...repeated,receipts:4});
 await flow('bank-cancel',env);assert.deepEqual(await read(),retained);
 await flow('bank-purge',env);const purged=await read();assert.deepEqual(purged,{...retained,accounts:0,transactions:0,transactionDigest:zero.transactionDigest,purged:1,receipts:5});
 phase('bank-api-restart');await restart();assert.deepEqual(await read(),purged);
 await flow('bank-final');assert.deepEqual(await read(),purged);
 return Object.freeze({bankInstalledConnectUi:true,bankInstalledSyncUi:true,bankInstalledRepeatDedup:true,bankInstalledRestartReadback:true,bankInstalledRetainedDisconnectUi:true,bankInstalledCancelUnchanged:true,bankInstalledPurgeUi:true,bankInstalledPurgedRestartReadback:true,bankInstalledManualUnchanged:true,bankInstalledAcknowledgedLogoutUi:true});
}
