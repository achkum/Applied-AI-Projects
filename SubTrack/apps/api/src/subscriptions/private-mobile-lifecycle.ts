import {getNextSubscriptionStatus,type SubscriptionLifecycleStatus,type SubscriptionLifecycleAction} from '@subtrack/domain/subscription-lifecycle';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createRequire} from 'node:module';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import {PRIVATE_MANUAL_EDIT_STATEMENTS} from './private-manual-edit-statements.js';
const {parsePrivateManualEdited,parsePrivateLifecycleResult}=createRequire(__filename)('@subtrack/contracts/private-onboarding') as {
 parsePrivateManualEdited(v:unknown):{id:string;revision:string};parsePrivateLifecycleResult(v:unknown):{id:string;status:string};
};
export const PRIVATE_MOBILE_LIFECYCLE_STATEMENTS=Object.freeze({...PRIVATE_MANUAL_EDIT_STATEMENTS,
 mobileStatusLock:`SELECT id::text AS id,status::text AS status FROM public.subscription WHERE identity_id=$1::uuid AND id=$2::uuid AND source=$3::public.subscription_source AND currency=$4::char(3) FOR UPDATE`,
 mobileStatusUpdate:`UPDATE public.subscription SET status=$4::public.subscription_status,updated_at=pg_catalog.clock_timestamp() WHERE identity_id=$1::uuid AND id=$2::uuid AND status=$3::public.subscription_status RETURNING id::text AS id,status::text AS status`,
});
export type MobileLifecycleResult={status:200;value:object}|{status:404|409;code:'SUBSCRIPTION_NOT_FOUND'|'MANUAL_EDIT_IDEMPOTENCY_CONFLICT'|'MANUAL_EDIT_CONFLICT'|'LIFECYCLE_CONFLICT'};
const cadences=['WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL'];
async function one(tx:OwnerTx,name:string,values:readonly unknown[],command='SELECT'){
 const r=await tx.execute(name,values);if(r.command!==command||r.rowCount!==r.rows.length||r.rows.length>1)throw new Error('Mobile lifecycle unavailable');return r.rows[0];
}
export async function executeMobileEdit(tx:OwnerTx,owner:string,body:Record<string,unknown>,key:string):Promise<MobileLifecycleResult>{
 const id=body.id as string;const keyHash=createHash('sha256').update(key,'utf8').digest();
 const hash=createHash('sha256').update(JSON.stringify({v:'manual-edit-v1',id,expectedRevision:body.expectedRevision,customName:body.customName,categoryCode:body.categoryCode,cadence:body.cadence,expectedAmountMinor:body.expectedAmountMinor,nextChargeDate:body.nextChargeDate}),'utf8').digest();
 const receipt=await one(tx,'manualEditReceiptRead',[owner,keyHash]);
 if(receipt){
  if(!Buffer.isBuffer(receipt.request_hash)||receipt.request_hash.length!==32)throw new Error('Mobile lifecycle unavailable');
  const value=parsePrivateManualEdited({id:receipt.subscription_id,revision:receipt.result_revision});
  return timingSafeEqual(receipt.request_hash,hash)?{status:200,value}:{status:409,code:'MANUAL_EDIT_IDEMPOTENCY_CONFLICT'};
 }
 const row=await one(tx,'manualEditTargetLock',[owner,id,'MANUAL','SEK',cadences]);
 if(!row)return {status:404,code:'SUBSCRIPTION_NOT_FOUND'};
 const target=parsePrivateManualEdited(row);
 if(target.id!==id)throw new Error('Mobile lifecycle unavailable');
 if(target.revision!==body.expectedRevision)return {status:409,code:'MANUAL_EDIT_CONFLICT'};
 const updated=await one(tx,'manualEditCompareUpdate',[owner,id,body.expectedRevision,body.customName,body.categoryCode,body.cadence,body.expectedAmountMinor,body.nextChargeDate,'MANUAL','SEK',cadences],'UPDATE');
 const value=parsePrivateManualEdited(updated);
 if(value.id!==id||BigInt(value.revision)!==BigInt(body.expectedRevision as string)+1n)throw new Error('Mobile lifecycle unavailable');
 const saved=await one(tx,'manualEditReceiptInsert',[owner,keyHash,hash,id,value.revision],'INSERT');
 if(saved?.subscription_id!==id||saved.result_revision!==value.revision)throw new Error('Mobile lifecycle unavailable');
 return {status:200,value};
}
export async function executeMobileStatus(tx:OwnerTx,owner:string,body:Record<string,unknown>):Promise<MobileLifecycleResult>{
 const row=await one(tx,'mobileStatusLock',[owner,body.id,'MANUAL','SEK']);if(!row)return {status:404,code:'SUBSCRIPTION_NOT_FOUND'};
 if(row.id!==body.id)throw new Error('Mobile lifecycle unavailable');
 const actions:Record<string,SubscriptionLifecycleAction>={ACTIVE:'resume',PAUSED:'pause',CANCELLED:'cancel',ARCHIVED:'archive'};
 if(!['ACTIVE','PAUSED','CANCELLED'].includes(row.status as string))return {status:409,code:'LIFECYCLE_CONFLICT'};
 try{getNextSubscriptionStatus(row.status as SubscriptionLifecycleStatus,actions[body.status as string]!);}catch{return {status:409,code:'LIFECYCLE_CONFLICT'};}
 const updated=await one(tx,'mobileStatusUpdate',[owner,body.id,row.status,body.status],'UPDATE');
 const value=parsePrivateLifecycleResult(updated);if(value.id!==body.id||value.status!==body.status)throw new Error('Mobile lifecycle unavailable');
 return {status:200,value};
}
