import {createHash} from 'node:crypto';
import type {SandboxAuthority} from './sandbox-authority.js';
import {createPrivateMobileBank} from '../banks/private-mobile-bank.js';
import {createPrivateMobileDetection} from '../detection/private-mobile-detection.js';
import {createSandboxHouseholdBusiness} from './sandbox-household.js';
import {SANDBOX_BANK_STATEMENTS} from './sandbox-bank-business.js';
import {SANDBOX_BANK_FIXTURE_VERSION,sandboxBankTransactions,sandboxBankTransactionsForAccount} from './sandbox-bank-fixture.js';
import {SWEDEN_SAMPLE,PRODUCT_SEED_NAMESPACE,PRODUCT_SEED_PERSONA,PRODUCT_SEED_MERCHANTS,PRODUCT_SEED_CONFIRMED} from './sandbox-product-seed-fixture.js';

export const SANDBOX_PRODUCT_SEED_STATEMENTS=Object.freeze({
 sandboxSeedBudget:`SELECT (SELECT count(*)::int4 FROM public.subscription WHERE identity_id=$1::uuid) AS count,(SELECT count(*)::int4 FROM public.raw_transaction WHERE identity_id=$1::uuid) AS transactions,(SELECT count(*)::int4 FROM st081_detection.source_link WHERE identity_id=$1::uuid) AS links,(SELECT count(*)::int4 FROM st081_detection.candidate WHERE identity_id=$1::uuid) AS candidates,(SELECT count(*)::int4 FROM st081_detection.scan_receipt WHERE identity_id=$1::uuid) AS scans,(SELECT count(*)::int4 FROM st081_detection.review_receipt WHERE identity_id=$1::uuid) AS reviews,(SELECT count(*)::int4 FROM st081_detection.feedback WHERE identity_id=$1::uuid) AS feedback,(SELECT count(*)::int4 FROM st248_bank.receipt WHERE identity_id=$1::uuid) AS receipts,(SELECT count(*)::int4 FROM public.bank_account WHERE identity_id=$1::uuid) AS accounts,(SELECT count(*)::int4 FROM public.household_member WHERE owner_identity_id=$1::uuid) AS members,(SELECT count(*)::int4 FROM public.household_audit WHERE actor_id=$1::uuid) AS audits`,
 sandboxSeedGenerations:`SELECT bc.id::text AS id,bc.status::text AS status,bg.purged_at FROM public.bank_connection bc JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id WHERE bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid ORDER BY bc.id FOR UPDATE OF bc,bg`,
 sandboxSeedLegacyIds:`SELECT s.id::text AS id FROM public.subscription s JOIN st081_detection.candidate c ON c.subscription_id=s.id AND c.identity_id=s.identity_id WHERE s.identity_id=$1::uuid AND c.identity_id=$1::uuid AND c.merchant_key LIKE 'product-seed-v1-%'`,
 sandboxSeedCandidates:`SELECT s.id::text AS id,s.custom_name AS name,s.revision::text AS revision,s.status::text AS status,EXISTS(SELECT 1 FROM st081_detection.review_receipt rr WHERE rr.identity_id=s.identity_id AND rr.subscription_id=s.id) AS reviewed FROM st081_detection.candidate c JOIN public.subscription s ON s.id=c.subscription_id AND s.identity_id=c.identity_id WHERE c.identity_id=$1::uuid AND s.identity_id=$1::uuid AND c.merchant_key LIKE 'sweden-seed-v2-%' ORDER BY s.id`,
 sandboxSeedDates:SANDBOX_BANK_STATEMENTS.sandboxDetectionDates.replace('SET next_charge_date=x.expected_date,','SET next_charge_date=x.expected_date,expected_amount_minor=(SELECT -rt.amount_minor FROM st081_detection.source_link sl JOIN public.raw_transaction rt ON rt.id=sl.raw_transaction_id AND rt.identity_id=sl.identity_id WHERE sl.identity_id=s.identity_id AND sl.subscription_id=s.id AND rt.status=\'BOOKED\' AND rt.amount_minor<0 AND rt.is_refund=false ORDER BY rt.transaction_date DESC,rt.id DESC LIMIT 1),').replace('AND s.next_charge_date IS NULL','').replace('WHERE s.identity_id=$1::uuid AND s.id=x.subscription_id', 'WHERE s.identity_id=$1::uuid AND s.id=ANY($3::uuid[]) AND s.id=x.subscription_id'),
});
function seedKey(namespace:string,owner:string,label:string){const h=createHash('sha256').update(`${namespace}\0${owner}\0${label}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export function productSeedKey(owner:string,label:string){return seedKey(PRODUCT_SEED_NAMESPACE,owner,label);}
export function legacyProductSeedKey(owner:string,label:string){return seedKey('product-seed-v1',owner,label);}
function legacyConfirmHash(owner:string,id:string){const key=legacyProductSeedKey(owner,`confirm-${id}`),h=createHash('sha256');for(const value of ['review-key-v1',owner,'confirm',id,key]){h.update(String(Buffer.byteLength(value)));h.update(':');h.update(value);}return h.digest('hex');}
const legacyRows=[['Cedar Video','VIDEO_STREAMING','MONTHLY'],['Birch Cinema','VIDEO_STREAMING','MONTHLY'],['Lumen Music','MUSIC_AUDIO','MONTHLY'],['Papertrail Books','AUDIOBOOKS_EBOOKS','MONTHLY'],['Morning Post','NEWS_MAGAZINES','MONTHLY'],['Playbox','GAMING','MONTHLY'],['Studio Office','SOFTWARE_PRODUCTIVITY','ANNUAL'],['Nimbus Drive','CLOUD_STORAGE','MONTHLY'],['Atlas AI','AI_TOOLS','MONTHLY'],['Evergreen Mobile','MOBILE_PLAN','MONTHLY'],['Meadow Broadband','BROADBAND_TV','QUARTERLY'],['Motion Club','FITNESS_WELLNESS','MONTHLY'],['Aurora Video','VIDEO_STREAMING','MONTHLY'],['Cinema Plus','VIDEO_STREAMING','MONTHLY'],['Soundwave','MUSIC_AUDIO','MONTHLY'],['Readly Books','AUDIOBOOKS_EBOOKS','MONTHLY'],['Daily Press','NEWS_MAGAZINES','MONTHLY'],['Pixel Play','GAMING','MONTHLY'],['Focus Suite','SOFTWARE_PRODUCTIVITY','ANNUAL'],['Cloud Vault','CLOUD_STORAGE','MONTHLY'],['Nova AI','AI_TOOLS','MONTHLY'],['Mobile One','MOBILE_PLAN','MONTHLY'],['Home Connect','BROADBAND_TV','MONTHLY'],['Move Club','FITNESS_WELLNESS','MONTHLY']];
function pristineLegacySample(row:Record<string,unknown>){return row.currency==='SEK'&&legacyRows.some(([name,category,cadence])=>row.custom_name===name&&row.category_code===category&&row.cadence===cadence);}

type Authority=Pick<SandboxAuthority,'withCurrentMobileAuthority'|'now'>;
const fail=():never=>{throw new Error('Sample initialization unavailable');};
function accepted<T>(value:Readonly<{status:200;value:T}>|Readonly<{status:number;code:string}>):T{if(value.status!==200||!('value'in value))return fail();return value.value;}
/** One locked owner transaction: accepted ingestion/review/audit cores commit with its final real sync receipt. */
export function createSandboxProductSeed(authority:Authority){return Object.freeze({async ensure(token:string){
 return authority.withCurrentMobileAuthority(token,async(tx,owner)=>{
  const mode=await tx.execute('modeRead',[owner.identityId]);if(mode.command!=='SELECT'||mode.rowCount!==1)return fail();if(mode.rows[0]?.profile_complete!==true||mode.rows[0]?.onboarding_mode!=='just-me')return;
  const marker=productSeedKey(owner.identityId,'complete'),hash=createHash('sha256').update(marker).digest(),receipt=await tx.execute('bankReceiptRead',[owner.identityId,hash]);
  if(receipt.command!=='SELECT'||receipt.rowCount!==receipt.rows.length||receipt.rowCount>1)return fail();if(receipt.rowCount===1)return;
  const generations=await tx.execute('sandboxSeedGenerations',[owner.identityId]);if(generations.command!=='SELECT'||generations.rowCount!==generations.rows.length)return fail();
  const active=generations.rows.filter(row=>row.status==='ACTIVE'&&row.purged_at===null);if(active.length>1)return fail();if(generations.rowCount>0&&active.length===0)return;
  const budget=await tx.execute('sandboxSeedBudget',[owner.identityId]);if(budget.command!=='SELECT'||budget.rowCount!==1)return fail();const capacity=budget.rows[0]!;
  for(const [key,limit]of Object.entries({count:50,transactions:5000,links:1024,candidates:1024,scans:1024,reviews:1024,feedback:1024,receipts:1024,accounts:50,members:80,audits:1000}))if(typeof capacity[key]!=='number'||!Number.isInteger(capacity[key])||capacity[key]<0||capacity[key]>limit)return fail();
  if(capacity.receipts+3>1024||capacity.scans+1>1024||active.length===0&&(generations.rowCount>=50||capacity.accounts>=50))return;
  const before=await tx.execute('sandboxSeedCandidates',[owner.identityId]);if(before.command!=='SELECT'||before.rowCount!==before.rows.length)return fail();const existing=new Set(before.rows.map(row=>row.id)),existingNames=new Set(before.rows.map(row=>row.name));
  const now=authority.now(),history=sandboxBankTransactionsForAccount('budget-only',now),allNames=new Set(PRODUCT_SEED_MERCHANTS.map(row=>row.canonicalName));let size=history.filter(row=>row.pending||row.direction==='CREDIT'||!allNames.has(row.description)).length;
  const merchants:typeof PRODUCT_SEED_MERCHANTS[number][]=[];
  let novel=0;for(const merchant of PRODUCT_SEED_MERCHANTS){const newRows=novel+(existingNames.has(merchant.canonicalName)?0:1),total=size+history.filter(row=>row.description===merchant.canonicalName).length,next=merchants.length+1,confirmed=Math.min(next,PRODUCT_SEED_CONFIRMED.length);if(capacity.count+newRows>50||capacity.candidates+newRows>1024||capacity.transactions+total>=5000||capacity.links+total>=1024||capacity.reviews+confirmed>1024||capacity.feedback+confirmed>1024)break;merchants.push(merchant);size=total;novel=newRows;}
  if(merchants.length===0)return;
  const names=new Set<string>(merchants.map(row=>row.canonicalName)),guards:(()=>unknown)[]=[];
  const nested:Authority={now:()=>now,withCurrentMobileAuthority:async(provided,work,beforeCommit)=>{if(provided!==token)return fail();const result=await work(tx,owner);if(beforeCommit)guards.push(beforeCommit);return result;}};
  const bank=createPrivateMobileBank(nested,{allowMixedRecords:true,fixtureVersion:SANDBOX_BANK_FIXTURE_VERSION,persona:{...PRODUCT_SEED_PERSONA,subscriptions:PRODUCT_SEED_PERSONA.subscriptions.filter(row=>names.has(row.merchantName))},transform:(items,at)=>sandboxBankTransactions(items,at).filter(row=>names.has(row.description)||row.pending||row.direction==='CREDIT'||!allNames.has(row.description))});
  const detection=createPrivateMobileDetection(nested,{fixtureVersion:SANDBOX_BANK_FIXTURE_VERSION,merchants});
  const h=createSandboxHouseholdBusiness(nested);
  const connected=accepted(await bank.execute(token,'connect',{institutionId:'synthetic-demo-v1'},productSeedKey(owner.identityId,'connect'))) as {connection:{connectionId:string}};
  const connectionId=connected.connection.connectionId;if(active.length&&connectionId!==active[0]!.id)return fail();
  accepted(await bank.execute(token,'sync',{connectionId},productSeedKey(owner.identityId,'ingest')));
  accepted(await detection.execute(token,'scan',{},productSeedKey(owner.identityId,'scan')));
  const linked=await tx.execute('sandboxDetectionLinkFresh',[owner.identityId,JSON.stringify(merchants)]);if(linked.command!=='INSERT'||linked.rowCount!==linked.rows.length)return fail();
  const candidates=await tx.execute('sandboxSeedCandidates',[owner.identityId]);if(candidates.command!=='SELECT'||candidates.rowCount!==candidates.rows.length)return fail();
  const fresh=candidates.rows.filter(row=>!existing.has(row.id)||row.status==='DETECTED'&&row.revision==='2'&&row.reviewed===false);const ids=fresh.map(row=>row.id);
  const confirmed:string[]=[];
  for(const row of fresh)if(PRODUCT_SEED_CONFIRMED.includes(row.name as typeof PRODUCT_SEED_CONFIRMED[number])){
   if(row.status!=='DETECTED'||!['1','2'].includes(row.revision as string)||typeof row.id!=='string')return fail();accepted(await detection.execute(token,'confirm',{candidateId:row.id,expectedRevision:row.revision},productSeedKey(owner.identityId,`confirm-${row.id}`)));confirmed.push(row.id);
  }
  if(existing.size===0&&confirmed.length<Math.min(6,merchants.length))return fail();
  const dates=await tx.execute('sandboxSeedDates',[owner.identityId,new Date(now).toISOString().slice(0,10),ids]);if(dates.command!=='UPDATE'||dates.rowCount!==dates.rows.length)return fail();
  let household=accepted(await h.execute(token,'household-read',{}));
  const createCost=household.household===null?1:0;
  const addCount=Math.min(Math.max(0,4-(household.household?.members.length??1)),80-capacity.members-createCost,Math.max(0,1000-capacity.audits-createCost-confirmed.length));
  if(capacity.members+createCost<=80&&capacity.audits+createCost+confirmed.length<=1000){
   if(household.household===null)household=accepted(await h.execute(token,'household-create',{name:'Demo family'}));
   // Append only: existing household names, members and saved assignments are never rewritten.
   let added=0;for(const name of ['Alex','Robin','Casey']){
    if(added>=addCount)break;const requestId=legacyProductSeedKey(owner.identityId,`member-${name}`),retained=await tx.execute('householdDependantRead',[owner.identityId,requestId]);if(retained.command!=='SELECT'||retained.rowCount!==retained.rows.length||retained.rowCount>1)return fail();if(retained.rowCount!==0)continue;
    household=accepted(await h.execute(token,'dependant-add',{requestId,displayName:name}));added++;
   }
   const members=household.household!.members,assigned=new Set(household.household!.assignments.map(row=>row.subscriptionId));
   for(const subscriptionId of confirmed)if(!assigned.has(subscriptionId)){const name=fresh.find(row=>row.id===subscriptionId)!.name,index=SWEDEN_SAMPLE.plans.findIndex(row=>row.name===name),plan=SWEDEN_SAMPLE.plans[index]!;accepted(await h.execute(token,'household-assign',{subscriptionId,memberIds:plan.sharedHousehold?members.map(member=>member.id):[members[index%members.length]!.id],payerMemberId:members[index%members.length]!.id}));}
  }
  // A genuine final idempotent bank sync is the durable completion marker. No flags in user profiles.
  accepted(await bank.execute(token,'sync',{connectionId},marker));
  const complete=await tx.execute('bankReceiptRead',[owner.identityId,hash]);if(complete.command!=='SELECT'||complete.rowCount!==1||complete.rows[0]?.connection_id!==connectionId||complete.rows[0]?.operation!=='sync')return fail();
  const legacy=await tx.execute('sandboxSeedLegacyIds',[owner.identityId]);if(legacy.command!=='SELECT'||legacy.rowCount!==legacy.rows.length)return fail();
  const proofs=legacy.rows.map(row=>({id:row.id,hash:legacyConfirmHash(owner.identityId,String(row.id))}));
  const retired=await tx.execute('sandboxSeedRetirable',[owner.identityId,JSON.stringify(proofs)]);if(retired.command!=='SELECT'||retired.rowCount!==retired.rows.length)return fail();
  const retireIds=retired.rows.filter(pristineLegacySample).map(row=>row.id);
  if(retireIds.length){const saved=await tx.execute('sandboxSeedRetire',[owner.identityId,hash,retireIds]);if(saved.command!=='UPDATE'||saved.rowCount!==retireIds.length||saved.rows.length!==retireIds.length)return fail();}
  for(const guard of guards)if(guard()!==undefined)return fail();
 });
}});}
