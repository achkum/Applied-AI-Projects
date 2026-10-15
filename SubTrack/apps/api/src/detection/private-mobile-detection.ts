import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import type {DurablePrivateMobileAuthority} from '../auth/mobile-private/durable-mobile-authority.js';
import type {PrivateMobileDetectionOperation,PrivateMobileDetectionReviewResult} from '@subtrack/contracts/private-mobile-detection';
import type {BigintTransactionSeries,RecurringCandidate} from '@subtrack/domain/detection';
import {parsePrivateMobileCursor,encodePrivateMobileCursor} from '../profile/private-mobile-cursor.js';
const runtime=createRequire(__filename);
const wire=runtime('@subtrack/contracts/private-mobile-detection') as typeof import('@subtrack/contracts/private-mobile-detection');
let domain:Promise<typeof import('@subtrack/domain/detection-runtime')>|undefined;
function loadDomain(){return domain??=import(pathToFileURL(runtime.resolve('@subtrack/domain/detection-runtime')).href) as Promise<typeof import('@subtrack/domain/detection-runtime')>;}
let lifecycle:Promise<typeof import('@subtrack/domain/subscription-lifecycle')>|undefined;
function loadLifecycle(){return lifecycle??=import(pathToFileURL(runtime.resolve('@subtrack/domain/subscription-lifecycle')).href) as Promise<typeof import('@subtrack/domain/subscription-lifecycle')>;}
const PROVIDER='SYNTHETIC',INSTITUTION='synthetic-demo-v1',FIXTURE='solberg-v1',ALGORITHM='recurring-bigint-v1';
const FORMAT='YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX=9223372036854775807n,MIN=-9223372036854775808n;
type Row=Record<string,unknown>;
export type PrivateMobileDetectionResult=Readonly<{status:200;value:object}|{status:404;code:'DETECTION_UNAVAILABLE'}|{status:409;code:'MODE_CONFLICT'|'DETECTION_STATE_CONFLICT'|'DETECTION_IDEMPOTENCY_CONFLICT'|'UNDO_EXPIRED'}>;
const fail=():never=>{throw new Error('Detection unavailable');};
function uuid(v:unknown):string{if(typeof v!=='string'||!UUID.test(v))return fail();return v;}
function revision(v:unknown):string{if(typeof v!=='string'||!/^[1-9][0-9]{0,18}$/.test(v)||BigInt(v)>MAX)return fail();return v;}
function date(v:unknown):Date{if(!(v instanceof Date)||!Number.isFinite(v.getTime()))return fail();return v;}
function digest(fields:readonly string[]):Buffer{const h=createHash('sha256');for(const value of fields){const bytes=Buffer.from(value);h.update(String(bytes.length));h.update(':');h.update(bytes);}return h.digest();}
function equal(a:unknown,b:Buffer):boolean{if(!Buffer.isBuffer(a)||a.length!==32)return fail();return timingSafeEqual(a,b);}
async function rows(tx:OwnerTx,name:string,values:readonly unknown[],command='SELECT'):Promise<Row[]>{const r=await tx.execute(name,values);if(r.command!==command||r.rowCount!==r.rows.length)return fail();return r.rows;}
async function one(tx:OwnerTx,name:string,values:readonly unknown[],command='SELECT'):Promise<Row|undefined>{const r=await rows(tx,name,values,command);if(r.length>1)return fail();return r[0];}
async function required(tx:OwnerTx,name:string,values:readonly unknown[],command:string,field:string,id:string):Promise<Row>{const r=await one(tx,name,values,command);if(r?.[field]!==id)return fail();return r;}
const conflict=():PrivateMobileDetectionResult=>({status:409,code:'DETECTION_STATE_CONFLICT'});
const missing=():PrivateMobileDetectionResult=>({status:404,code:'DETECTION_UNAVAILABLE'});
// Fixed server canonical roster for the one reviewed Synthetic generation. Never
// derive a persisted name/key from normalized raw text or a client catalogue.
const MERCHANTS=Object.freeze([
 {key:'netflix',canonicalName:'Netflix',category:'VIDEO_STREAMING',aliases:['NETFLIX','Netflix','NETFLIX*','NETFLIX.COM']},
 {key:'spotify',canonicalName:'Spotify',category:'MUSIC_AUDIO',aliases:['SPOTIFY','Spotify','SPOTIFY AB','SPOTIFY NORDIC']},
 {key:'apple-icloud',canonicalName:'iCloud',category:'CLOUD_STORAGE',aliases:['APPLE.COM/BILL','ICLOUD','APPLE ICLOUD','APPLE.COM']},
 {key:'linkedin-premium',canonicalName:'LinkedIn Premium',category:'SOFTWARE_PRODUCTIVITY',aliases:['LINKEDIN','LINKEDIN PREMIUM','LINKEDIN.COM','LINKEDIN DIGITAL']},
]);
/** Only reviewed named operations, bound to the current transaction/owner. */
export class DurableSyntheticDetectionStore{
 constructor(readonly tx:OwnerTx,readonly owner:string){}
 async scan(key:string,now:number):Promise<PrivateMobileDetectionResult>{
  const generations=await rows(this.tx,'detectionActiveGenerationLock',[this.owner,PROVIDER,INSTITUTION,FIXTURE,'ACTIVE']);if(generations.length===0)return conflict();if(generations.length!==1)return fail();
  const connection=uuid(generations[0]!.connection_id);if(generations[0]!.fixture_version!==FIXTURE)return fail();
  const keyHash=digest(['scan-key-v1',this.owner,key]),requestHash=digest(['scan-request-v1','{}']);
  const receipt=await one(this.tx,'detectionScanReceiptRead',[this.owner,keyHash]);if(receipt){if(receipt.connection_id!==connection||!equal(receipt.request_h,requestHash))return {status:409,code:'DETECTION_IDEMPOTENCY_CONFLICT'};return {status:200,value:wire.parsePrivateMobileDetectionScanResult({scan:receipt.result_status})};}
  const booked=await rows(this.tx,'detectionBookedRows',[this.owner,connection,PROVIDER,INSTITUTION,FIXTURE,'ACTIVE','BOOKED']);if(booked.length>10000)return fail();
  const core=await loadDomain(),groups=new Map<string,{series:BigintTransactionSeries;merchant:typeof MERCHANTS[number]}>();
  for(const row of booked){
   const account=uuid(row.account_id),id=uuid(row.transaction_id);
   if(typeof row.raw_description!=='string'||row.raw_description.length>500||typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency)||typeof row.transaction_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date)||typeof row.amount_minor!=='string'||!/^-[1-9][0-9]{0,18}$/.test(row.amount_minor))return fail();
   const amount=BigInt(row.amount_minor),when=new Date(`${row.transaction_date}T00:00:00.000Z`);if(amount<MIN||!Number.isFinite(when.getTime())||when.toISOString().slice(0,10)!==row.transaction_date)return fail();
   const match=core.matchMerchantDescriptor(row.raw_description,MERCHANTS);if(!match)continue;const merchant=MERCHANTS.find(x=>x.key===match.key);if(!merchant||match.canonicalName!==merchant.canonicalName)return fail();
   const groupKey=JSON.stringify([account,merchant.key,row.currency]);let group=groups.get(groupKey);
   if(!group){group={series:{ownerId:this.owner,accountId:account,merchantKey:merchant.key,currency:row.currency,categoryCode:merchant.category,transactions:[]},merchant};groups.set(groupKey,group);}
   (group.series.transactions as {id:string;accountId:string;date:Date;amountMinor:bigint;currency:string;direction:'DEBIT';pending:boolean}[]).push({id,accountId:account,date:when,amountMinor:amount,currency:row.currency,direction:'DEBIT',pending:false});
  }
  const candidates:{candidate:RecurringCandidate;merchant:typeof MERCHANTS[number];hash:Buffer}[]=[];
  for(const {series,merchant} of groups.values())for(const candidate of core.detectRecurringBigint(series)){
   const amount=candidate.amountBand.representative.minorUnits;
   if(typeof amount!=='bigint'||amount<=0n||amount>MAX||candidate.ownerId!==this.owner||candidate.accountId!==series.accountId||candidate.merchantKey!==merchant.key||candidate.currency!==series.currency)return fail();
   // Validate every output before the first persistent candidate write.
   wire.parsePrivateMobileDetectionCandidate({id:randomUUID(),revision:'1',displayName:merchant.canonicalName,categoryCode:merchant.category,cadence:candidate.cadence,expectedAmountMinor:amount.toString(),currency:candidate.currency,confidence:candidate.confidence,reasons:candidate.reasons.map(r=>r.code),status:'DETECTED'});
   candidates.push({candidate,merchant,hash:digest(['candidate-v1',this.owner,connection,series.accountId,merchant.key,candidate.currency,candidate.cadence,ALGORITHM])});
  }
  for(const {candidate,merchant,hash}of candidates){
   const old=await one(this.tx,'detectionCandidateLookup',[this.owner,connection,hash]);if(old){
    if(old.connection_id!==connection||old.account_id!==candidate.accountId||old.merchant_key!==candidate.merchantKey||old.currency!==candidate.currency||old.cadence!==candidate.cadence||old.algorithm_version!==ALGORITHM||!equal(old.candidate_h,hash))return fail();uuid(old.subscription_id);revision(old.revision);continue;
   }
   const id=randomUUID(),completed=new Date(now).toISOString();
   // The canonical STABLE visibility lookup cannot see a newly inserted row in
   // INSERT RETURNING's command snapshot. Read it in the next command, under
   // the same owner authority and transaction, without changing RLS or grants.
   const inserted=await this.tx.execute('detectionSubscriptionInsert',[this.owner,id,null,candidate.accountId,merchant.canonicalName,merchant.category,candidate.cadence,candidate.amountBand.representative.minorUnits.toString(),candidate.currency,'DETECTED','DETECTED',candidate.confidence,JSON.stringify(candidate.reasons.map(r=>r.code)),completed]);
   if(inserted.command!=='INSERT'||inserted.rowCount!==1||inserted.rows.length!==0)return fail();
   const saved=await required(this.tx,'detectionSubscriptionReadback',[this.owner,id,'DETECTED','DETECTED'],'SELECT','id',id);if(saved.revision!=='1')return fail();
   await required(this.tx,'detectionCandidateInsert',[this.owner,id,connection,candidate.accountId,merchant.key,candidate.currency,candidate.cadence,ALGORITHM,hash,PROVIDER,INSTITUTION,FIXTURE,'ACTIVE','DETECTED','DETECTED'],'INSERT','subscription_id',id);
   for(const transaction of candidate.transactionIds)await required(this.tx,'detectionSourceLinkInsert',[this.owner,id,uuid(transaction),'BOOKED',PROVIDER,INSTITUTION,FIXTURE,'ACTIVE'],'INSERT','raw_transaction_id',transaction);
  }
  await required(this.tx,'detectionScanReceiptInsert',[this.owner,connection,keyHash,requestHash,new Date(now).toISOString(),'complete'],'INSERT','connection_id',connection);
  const readback=await one(this.tx,'detectionScanReceiptRead',[this.owner,keyHash]);if(!readback||readback.connection_id!==connection||!equal(readback.request_h,requestHash))return fail();return {status:200,value:wire.parsePrivateMobileDetectionScanResult({scan:readback.result_status})};
 }
 async read(cursor?:string):Promise<PrivateMobileDetectionResult>{
  const after=parsePrivateMobileCursor(cursor),page=await rows(this.tx,'detectionInboxPage',[this.owner,'DETECTED','DETECTED',after?.createdAt??null,after?.id??null,'UTC',FORMAT]);if(page.length>51)return fail();
  const selected=page.slice(0,50),items=selected.map(r=>wire.parsePrivateMobileDetectionCandidate({id:r.id,revision:r.revision,displayName:r.display_name,categoryCode:r.category_code,cadence:r.cadence,expectedAmountMinor:r.expected_amount_minor,currency:r.currency,confidence:typeof r.confidence==='string'?Number(r.confidence):r.confidence,reasons:r.detection_reasons,status:r.status}));
  const last=selected[49],nextCursor=page.length===51?encodePrivateMobileCursor(last!.created_at,last!.id):null;return {status:200,value:wire.parsePrivateMobileDetectionReadResult({items,nextCursor})};
 }
}
function replay(receipt:Row,candidateId:string,operation:string,hash:Buffer):PrivateMobileDetectionResult{
 if(receipt.subscription_id!==candidateId||receipt.operation!==operation)return fail();if(!equal(receipt.request_h,hash))return {status:409,code:'DETECTION_IDEMPOTENCY_CONFLICT'};
 const value=wire.parsePrivateMobileDetectionReviewResult(receipt.result_response);if(value.candidateId!==candidateId||value.receiptId!==receipt.id||value.revision!==receipt.post_revision||value.status!==receipt.result_status||(operation==='undo'?value.status!=='DETECTED':operation==='confirm'?value.status!=='ACTIVE':value.status!=='REJECTED'))return fail();return {status:200,value};
}
export function createPrivateMobileDetection(authority:DurablePrivateMobileAuthority){return Object.freeze({async execute(token:string,operation:PrivateMobileDetectionOperation,body:unknown,key?:string):Promise<PrivateMobileDetectionResult>{
 let parsed:{candidateId?:string;expectedRevision?:string;receiptId?:string;cursor?:string};
 try{wire.parsePrivateMobileDetectionRequestKey(operation,key);parsed=operation==='scan'?wire.parsePrivateMobileDetectionScan(body):operation==='read'?wire.parsePrivateMobileDetectionRead(body):operation==='undo'?wire.parsePrivateMobileDetectionUndo(body):wire.parsePrivateMobileDetectionReview(body);if(operation==='read')parsePrivateMobileCursor(parsed.cursor);}catch{throw new Error('wire');}
 let deadline:number|undefined;
 return authority.withCurrentMobileAuthority(token,async(tx,owner)=>{
  const identity=owner.identityId,mode=await one(tx,'detectionModeRead',[identity]);if(mode?.profile_complete!==true||mode.onboarding_mode!=='just-me')return {status:409,code:'MODE_CONFLICT'};
  const fence=async()=>{await required(tx,'detectionFinalFence',[identity,owner.sessionId,authority.now(),'just-me'],'SELECT','identity_id',identity);};
  const store=new DurableSyntheticDetectionStore(tx,identity);
  if(operation==='scan'||operation==='read'){const result=operation==='scan'?await store.scan(key!,authority.now()):await store.read(parsed.cursor);await fence();return result;}
  let original:Row|undefined,candidateId=parsed.candidateId;
  if(operation==='undo'){original=await one(tx,'detectionReceiptLock',[identity,null,parsed.receiptId,null,null]);if(!original)return missing();if(!['confirm','reject'].includes(original.operation as string))return conflict();candidateId=uuid(original.subscription_id);}
  const id=uuid(candidateId),keyHash=digest(['review-key-v1',identity,operation,id,key!]),requestHash=digest(['review-request-v1',operation,JSON.stringify(parsed)]);
  const receipt=await one(tx,'detectionReceiptLock',[identity,id,null,operation,keyHash]);
  const candidate=await one(tx,'detectionCandidateLock',[identity,id]);if(!candidate)return missing();if(candidate.source!=='DETECTED'||candidate.always_private!==true)return fail();const current=revision(candidate.revision);
  if(receipt){const result=replay(receipt,id,operation,requestHash);await fence();return result;}
  if(operation==='undo'){
   if(original!.consumed_at!==null||current!==original!.post_revision||candidate.status!==original!.result_status)return conflict();
   deadline=date(original!.undo_until).getTime();if(authority.now()>=deadline){await fence();return {status:409,code:'UNDO_EXPIRED'};}
  }else if(candidate.status!=='DETECTED'||current!==parsed.expectedRevision)return conflict();
  const completed=new Date(authority.now()).toISOString(),post=(BigInt(current)+1n).toString();if(BigInt(post)>MAX)return fail();
  const next=operation==='undo'?'DETECTED':(await loadLifecycle()).getNextSubscriptionStatus('DETECTED',operation);
  const receiptId=randomUUID(),feedbackId=operation==='undo'?null:randomUUID(),undoUntil=operation==='undo'?null:new Date(Date.parse(completed)+10000).toISOString();
  const value:PrivateMobileDetectionReviewResult=wire.parsePrivateMobileDetectionReviewResult({candidateId:id,status:next,revision:post,receiptId,undoUntil});
  const changed=await required(tx,'detectionCompareUpdate',[identity,id,current,candidate.status,next,completed,'DETECTED'],'UPDATE','id',id);if(changed.revision!==post||changed.status!==next)return fail();
  if(operation==='undo')await required(tx,'detectionReceiptConsume',[identity,uuid(original!.id),id,completed,original!.operation],'UPDATE','id',original!.id as string);
  else await required(tx,'detectionFeedbackInsert',[identity,feedbackId,id,operation==='confirm'?'CONFIRMED_SUBSCRIPTION':'NOT_SUBSCRIPTION',completed],'INSERT','id',feedbackId!);
  await required(tx,'detectionReceiptInsert',[identity,receiptId,id,operation,keyHash,requestHash,current,post,candidate.status,next,completed,undoUntil,operation==='undo'?original!.id:null,JSON.stringify(value),feedbackId],'INSERT','id',receiptId);
  if(operation==='undo')await required(tx,'detectionFeedbackSupersede',[identity,id,receiptId,original!.id,'undo',original!.operation,original!.operation==='confirm'?'CONFIRMED_SUBSCRIPTION':'NOT_SUBSCRIPTION'],'UPDATE','id',uuid(original!.feedback_id));
  const readback=await one(tx,'detectionReceiptLock',[identity,id,null,operation,keyHash]);if(!readback)return fail();const result=replay(readback,id,operation,requestHash);await fence();return result;
 },()=>deadline===undefined?undefined:authority.now()<deadline?undefined:'UNDO_EXPIRED');
}});}
