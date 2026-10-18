import {createHash} from 'node:crypto';
import type {SandboxAuthority} from './sandbox-authority.js';
import {createPrivateMobileBank} from '../banks/private-mobile-bank.js';
import {createPrivateMobileDetection} from '../detection/private-mobile-detection.js';
import {createSandboxHouseholdBusiness} from './sandbox-household.js';
import {SANDBOX_BANK_STATEMENTS} from './sandbox-bank-business.js';
import {SANDBOX_BANK_FIXTURE_VERSION} from './sandbox-bank-fixture.js';
import {PRODUCT_SEED_NAMESPACE,PRODUCT_SEED_PERSONA,PRODUCT_SEED_MERCHANTS,PRODUCT_SEED_CONFIRMED,productSeedTransactions,productSeedTransactionsForAccount} from './sandbox-product-seed-fixture.js';

export const SANDBOX_PRODUCT_SEED_STATEMENTS=Object.freeze({
 sandboxSeedBudget:`SELECT (SELECT count(*)::int4 FROM public.subscription WHERE identity_id=$1::uuid) AS count,(SELECT count(*)::int4 FROM public.raw_transaction WHERE identity_id=$1::uuid) AS transactions,(SELECT count(*)::int4 FROM st081_detection.source_link WHERE identity_id=$1::uuid) AS links,(SELECT count(*)::int4 FROM st081_detection.candidate WHERE identity_id=$1::uuid) AS candidates,(SELECT count(*)::int4 FROM st081_detection.scan_receipt WHERE identity_id=$1::uuid) AS scans,(SELECT count(*)::int4 FROM st081_detection.review_receipt WHERE identity_id=$1::uuid) AS reviews,(SELECT count(*)::int4 FROM st081_detection.feedback WHERE identity_id=$1::uuid) AS feedback,(SELECT count(*)::int4 FROM st248_bank.receipt WHERE identity_id=$1::uuid) AS receipts,(SELECT count(*)::int4 FROM public.bank_account WHERE identity_id=$1::uuid) AS accounts,(SELECT count(*)::int4 FROM public.household_member WHERE owner_identity_id=$1::uuid) AS members,(SELECT count(*)::int4 FROM public.household_audit WHERE actor_id=$1::uuid) AS audits`,
 sandboxSeedGenerations:`SELECT bc.id::text AS id,bc.status::text AS status,bg.purged_at FROM public.bank_connection bc JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id WHERE bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid ORDER BY bc.id FOR UPDATE OF bc,bg`,
 sandboxSeedCandidates:`SELECT s.id::text AS id,s.custom_name AS name,s.revision::text AS revision,s.status::text AS status FROM st081_detection.candidate c JOIN public.subscription s ON s.id=c.subscription_id AND s.identity_id=c.identity_id WHERE c.identity_id=$1::uuid AND s.identity_id=$1::uuid AND c.merchant_key LIKE 'product-seed-v1-%' ORDER BY s.id`,
 sandboxSeedDates:SANDBOX_BANK_STATEMENTS.sandboxDetectionDates.replace('WHERE s.identity_id=$1::uuid AND s.id=x.subscription_id', 'WHERE s.identity_id=$1::uuid AND s.id=ANY($3::uuid[]) AND s.id=x.subscription_id'),
});
export function productSeedKey(owner:string,label:string){const h=createHash('sha256').update(`${PRODUCT_SEED_NAMESPACE}\0${owner}\0${label}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
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
  const now=authority.now(),history=productSeedTransactionsForAccount('budget-only',now);let size=0;
  const merchants:typeof PRODUCT_SEED_MERCHANTS[number][]=[];
  for(const merchant of PRODUCT_SEED_MERCHANTS){const total=size+history.filter(row=>row.description===merchant.canonicalName).length,next=merchants.length+1,confirmed=Math.min(next,8);if(capacity.count+next>50||capacity.candidates+next>1024||capacity.transactions+total>=5000||capacity.links+total>=1024||capacity.reviews+confirmed>1024||capacity.feedback+confirmed>1024)break;merchants.push(merchant);size=total;}
  if(merchants.length===0)return;
  const names=new Set<string>(merchants.map(row=>row.canonicalName)),guards:(()=>unknown)[]=[];
  const nested:Authority={now:()=>now,withCurrentMobileAuthority:async(provided,work,beforeCommit)=>{if(provided!==token)return fail();const result=await work(tx,owner);if(beforeCommit)guards.push(beforeCommit);return result;}};
  const bank=createPrivateMobileBank(nested,{allowMixedRecords:true,fixtureVersion:SANDBOX_BANK_FIXTURE_VERSION,persona:{...PRODUCT_SEED_PERSONA,subscriptions:PRODUCT_SEED_PERSONA.subscriptions.filter(row=>names.has(row.merchantName))},transform:(items,at)=>productSeedTransactions(items,at).filter(row=>names.has(row.description))});
  const detection=createPrivateMobileDetection(nested,{fixtureVersion:SANDBOX_BANK_FIXTURE_VERSION,merchants});
  const h=createSandboxHouseholdBusiness(nested),before=await tx.execute('sandboxSeedCandidates',[owner.identityId]);if(before.command!=='SELECT'||before.rowCount!==before.rows.length)return fail();const existing=new Set(before.rows.map(row=>row.id));
  const connected=accepted(await bank.execute(token,'connect',{institutionId:'synthetic-demo-v1'},productSeedKey(owner.identityId,'connect'))) as {connection:{connectionId:string}};
  const connectionId=connected.connection.connectionId;if(active.length&&connectionId!==active[0]!.id)return fail();
  accepted(await bank.execute(token,'sync',{connectionId},productSeedKey(owner.identityId,'ingest')));
  accepted(await detection.execute(token,'scan',{},productSeedKey(owner.identityId,'scan')));
  const linked=await tx.execute('sandboxDetectionLinkFresh',[owner.identityId,JSON.stringify(merchants)]);if(linked.command!=='INSERT'||linked.rowCount!==linked.rows.length)return fail();
  const candidates=await tx.execute('sandboxSeedCandidates',[owner.identityId]);if(candidates.command!=='SELECT'||candidates.rowCount!==candidates.rows.length)return fail();
  const fresh=candidates.rows.filter(row=>!existing.has(row.id));const ids=fresh.map(row=>row.id);
  const confirmed:string[]=[];
  for(const row of fresh)if(PRODUCT_SEED_CONFIRMED.includes(row.name as typeof PRODUCT_SEED_CONFIRMED[number])){
   if(row.status!=='DETECTED'||row.revision!=='1'||typeof row.id!=='string')return fail();accepted(await detection.execute(token,'confirm',{candidateId:row.id,expectedRevision:row.revision},productSeedKey(owner.identityId,`confirm-${row.id}`)));confirmed.push(row.id);
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
    if(added>=addCount)break;const requestId=productSeedKey(owner.identityId,`member-${name}`),retained=await tx.execute('householdDependantRead',[owner.identityId,requestId]);if(retained.command!=='SELECT'||retained.rowCount!==retained.rows.length||retained.rowCount>1)return fail();if(retained.rowCount!==0)continue;
    household=accepted(await h.execute(token,'dependant-add',{requestId,displayName:name}));added++;
   }
   const members=household.household!.members,assigned=new Set(household.household!.assignments.map(row=>row.subscriptionId));
   for(const [index,subscriptionId]of confirmed.entries())if(!assigned.has(subscriptionId))accepted(await h.execute(token,'household-assign',{subscriptionId,memberIds:index%2===0?members.map(member=>member.id):[members[index%members.length]!.id],payerMemberId:members[index%members.length]!.id}));
  }
  // A genuine final idempotent bank sync is the durable completion marker. No flags in user profiles.
  accepted(await bank.execute(token,'sync',{connectionId},marker));
  const complete=await tx.execute('bankReceiptRead',[owner.identityId,hash]);if(complete.command!=='SELECT'||complete.rowCount!==1||complete.rows[0]?.connection_id!==connectionId||complete.rows[0]?.operation!=='sync')return fail();
  for(const guard of guards)if(guard()!==undefined)return fail();
 });
}});}
