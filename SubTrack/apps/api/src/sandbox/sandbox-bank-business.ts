import {SANDBOX_SAMPLE_RETIREMENT_STATEMENTS} from './sandbox-sample-retirement.js';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createPrivateMobileBank} from '../banks/private-mobile-bank.js';
import {PRIVATE_MOBILE_BANK_STATEMENTS} from '../banks/private-mobile-bank-statements.js';
import {createPrivateMobileDetection} from '../detection/private-mobile-detection.js';
import {PRIVATE_MOBILE_LIFECYCLE_STATEMENTS} from '../subscriptions/private-mobile-lifecycle.js';
import {PRIVATE_MOBILE_DETECTION_STATEMENTS} from '../detection/private-mobile-detection-statements.js';
import type {SandboxAuthority} from './sandbox-authority.js';
import {SANDBOX_BANK_FIXTURE_VERSION,SANDBOX_BANK_PERSONA,SANDBOX_DETECTION_MERCHANTS,sandboxBankTransactions} from './sandbox-bank-fixture.js';
type SandboxBankHistory=Readonly<{items:readonly Readonly<{id:string;subscriptionId:string|null;displayName:string;date:string;amountMinor:string;currency:'SEK'}>[];nextCursor:null}>;
const {parseSandboxBankHistory}=createRequire(__filename)('@subtrack/contracts/sandbox-mobile') as {parseSandboxBankHistory(value:unknown):SandboxBankHistory};
export const SANDBOX_BANK_STATEMENTS=Object.freeze({
 ...Object.fromEntries(Object.entries(PRIVATE_MOBILE_BANK_STATEMENTS).map(([name,sql])=>[name,sql.replaceAll("'solberg-v1'","'showcase-v2'")])),
 ...PRIVATE_MOBILE_DETECTION_STATEMENTS,
 ...SANDBOX_SAMPLE_RETIREMENT_STATEMENTS,
 manualEditTargetLock:PRIVATE_MOBILE_LIFECYCLE_STATEMENTS.manualEditTargetLock.replace('source=$3::public.subscription_source',"(source=$3::public.subscription_source OR (source='DETECTED' AND status IN('ACTIVE','PAUSED','CANCELLED','ARCHIVED')))"),
 manualEditCompareUpdate:PRIVATE_MOBILE_LIFECYCLE_STATEMENTS.manualEditCompareUpdate.replace('source=$9::public.subscription_source',"(source=$9::public.subscription_source OR (source='DETECTED' AND status IN('ACTIVE','PAUSED','CANCELLED','ARCHIVED')))"),
 mobileStatusLock:PRIVATE_MOBILE_LIFECYCLE_STATEMENTS.mobileStatusLock.replace('source=$3::public.subscription_source',"(source=$3::public.subscription_source OR (source='DETECTED' AND status IN('ACTIVE','PAUSED','CANCELLED','ARCHIVED')))"),
 // Current sandbox session fence; production's st244_mobile namespace is never installed or queried.
 detectionFinalFence:`SELECT i.id::text AS identity_id FROM public.identity i JOIN public.identity_profile p ON p.identity_id=i.id JOIN st250_auth.session se ON se.identity_id=i.id AND se.id=$2::uuid WHERE i.id=$1::uuid AND p.identity_id=$1::uuid AND se.identity_id=$1::uuid AND i.deleted_at IS NULL AND public.subtrack_principal_matches($1::uuid) AND p.profile_complete=true AND p.onboarding_mode=$4::varchar(16) AND se.revoked_ms IS NULL AND se.created_ms<=$3::bigint AND se.expires_ms>$3::bigint`,
 sandboxDetectionDates:`UPDATE public.subscription s SET next_charge_date=x.expected_date,updated_at=clock_timestamp() FROM (SELECT history.subscription_id,forecast.expected_date FROM (SELECT c.subscription_id,s.cadence,max(rt.transaction_date) AS last_date FROM st081_detection.candidate c JOIN public.subscription s ON s.id=c.subscription_id AND s.identity_id=c.identity_id JOIN st081_detection.source_link l ON l.identity_id=c.identity_id AND l.subscription_id=c.subscription_id JOIN public.raw_transaction rt ON rt.identity_id=l.identity_id AND rt.id=l.raw_transaction_id WHERE c.identity_id=$1::uuid AND s.identity_id=$1::uuid AND l.identity_id=$1::uuid AND rt.identity_id=$1::uuid GROUP BY c.subscription_id,s.cadence) history CROSS JOIN LATERAL (SELECT min((history.last_date+make_interval(months=>n*CASE history.cadence WHEN 'ANNUAL' THEN 12 WHEN 'SEMIANNUAL' THEN 6 WHEN 'QUARTERLY' THEN 3 ELSE 1 END))::date) AS expected_date FROM generate_series(1,36) n WHERE (history.last_date+make_interval(months=>n*CASE history.cadence WHEN 'ANNUAL' THEN 12 WHEN 'SEMIANNUAL' THEN 6 WHEN 'QUARTERLY' THEN 3 ELSE 1 END))::date >= $2::date) forecast) x WHERE s.identity_id=$1::uuid AND s.id=x.subscription_id AND s.source='DETECTED' AND s.next_charge_date IS NULL AND x.expected_date IS NOT NULL RETURNING s.id::text AS id`,
 sandboxDetectionLinkFresh:`INSERT INTO st081_detection.source_link(identity_id,subscription_id,raw_transaction_id) SELECT c.identity_id,c.subscription_id,rt.id FROM st081_detection.candidate c JOIN public.bank_account ba ON ba.id=c.account_id AND ba.identity_id=c.identity_id JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id JOIN public.raw_transaction rt ON rt.account_id=ba.id AND rt.identity_id=ba.identity_id JOIN jsonb_array_elements($2::jsonb) merchant ON merchant->>'key'=c.merchant_key WHERE c.identity_id=$1::uuid AND ba.identity_id=$1::uuid AND bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid AND rt.identity_id=$1::uuid AND bg.fixture_version='showcase-v2' AND bg.purged_at IS NULL AND bc.status='ACTIVE' AND bc.revoked_at IS NULL AND rt.status='BOOKED' AND rt.amount_minor<0 AND rt.is_refund=false AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(merchant->'aliases') alias WHERE alias.value=rt.raw_description) ON CONFLICT(identity_id,subscription_id,raw_transaction_id) DO NOTHING RETURNING raw_transaction_id::text AS id`,
 sandboxBankHistory:`SELECT rt.id::text AS id,l.subscription_id::text AS subscription_id,COALESCE(s.custom_name,rt.raw_description) AS display_name,rt.transaction_date::text AS date,rt.amount_minor::text AS amount_minor,rt.currency FROM public.raw_transaction rt LEFT JOIN LATERAL (SELECT sl.subscription_id FROM st081_detection.source_link sl JOIN public.subscription ss ON ss.id=sl.subscription_id AND ss.identity_id=sl.identity_id WHERE sl.identity_id=rt.identity_id AND sl.raw_transaction_id=rt.id ORDER BY CASE ss.cadence WHEN 'MONTHLY' THEN 0 WHEN 'ANNUAL' THEN 1 ELSE 2 END,sl.subscription_id LIMIT 1) l ON true LEFT JOIN public.subscription s ON s.id=l.subscription_id AND s.identity_id=rt.identity_id WHERE rt.identity_id=$1::uuid AND rt.status='BOOKED' ORDER BY rt.transaction_date DESC,rt.id DESC LIMIT 400`,
});
function derivedKey(key:string,label:string){const hex=createHash('sha256').update(label+'\0'+key).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
export function createSandboxBankBusiness(authority:SandboxAuthority){
 const bank=createPrivateMobileBank(authority,{allowMixedRecords:true,fixtureVersion:SANDBOX_BANK_FIXTURE_VERSION,persona:SANDBOX_BANK_PERSONA,transform:sandboxBankTransactions});
 const detection=createPrivateMobileDetection(authority,{fixtureVersion:SANDBOX_BANK_FIXTURE_VERSION,merchants:SANDBOX_DETECTION_MERCHANTS});
 async function scan(token:string,key:string){
  const result=await detection.execute(token,'scan',{},key);if('code'in result)return result;
  await authority.withCurrentMobileAuthority(token,async(tx,owner)=>{const linked=await tx.execute('sandboxDetectionLinkFresh',[owner.identityId,JSON.stringify(SANDBOX_DETECTION_MERCHANTS)]);if(linked.command!=='INSERT'||linked.rowCount!==linked.rows.length)throw new Error('Sandbox source readback unavailable');const saved=await tx.execute('sandboxDetectionDates',[owner.identityId,new Date(authority.now()).toISOString().slice(0,10)]);if(saved.command!=='UPDATE'||saved.rowCount!==saved.rows.length)throw new Error('Sandbox detection readback unavailable');});
  return result;
 }
 return Object.freeze({async execute(token:string,operation:string,body:object,key?:string){
  if(operation==='bank-history')return authority.withCurrentMobileAuthority(token,async(tx,owner)=>{
   const mode=await tx.execute('modeRead',[owner.identityId]);if(mode.rowCount!==1||mode.rows[0]?.profile_complete!==true||mode.rows[0]?.onboarding_mode!=='just-me')return {status:409 as const,code:'MODE_CONFLICT' as const};const result=await tx.execute('sandboxBankHistory',[owner.identityId]);if(result.command!=='SELECT'||result.rowCount!==result.rows.length)throw new Error('Sandbox history unavailable');
   return {status:200 as const,value:parseSandboxBankHistory({items:result.rows.map(row=>({id:row.id,subscriptionId:row.subscription_id,displayName:row.display_name,date:row.date,amountMinor:row.amount_minor,currency:row.currency})),nextCursor:null})};
  });
  if(operation.startsWith('bank-')){
   const op=operation.slice(5) as 'read'|'connect'|'sync'|'disconnect';const result=await bank.execute(token,op,body,key);
   if('code'in result||op==='read'||op==='disconnect')return result;
   const connection=(result.value as {connection:{connectionId:string}}).connection;
   if(op==='connect'){const synced=await bank.execute(token,'sync',{connectionId:connection.connectionId},derivedKey(key!,'connect-sync'));if('code'in synced)return synced;}
   const scanned=await scan(token,derivedKey(key!,'bank-scan'));if('code'in scanned)return scanned;
   // UI rereads the committed bank summary and inbox; never return invented candidate cards.
   return result;
  }
  const op=operation.slice(10) as 'read'|'scan'|'confirm'|'reject'|'undo';
  return op==='scan'?scan(token,key!):detection.execute(token,op,body,key);
 }});
}
