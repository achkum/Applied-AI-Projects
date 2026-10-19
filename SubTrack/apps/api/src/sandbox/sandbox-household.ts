import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import type {SandboxAuthority} from './sandbox-authority.js';
import type {SandboxHouseholdOperation,SandboxHouseholdView} from '@subtrack/contracts/sandbox-household-types';
const {parseSandboxHouseholdRequest,parseSandboxHouseholdView}=createRequire(__filename)('@subtrack/contracts/sandbox-household') as {
 parseSandboxHouseholdRequest(operation:SandboxHouseholdOperation,value:unknown):Readonly<Record<string,unknown>>;
 parseSandboxHouseholdView(value:unknown):SandboxHouseholdView;
};

/** Every statement takes the authenticated owner first. Targets never grant authority. */
export const SANDBOX_HOUSEHOLD_STATEMENTS=Object.freeze({
 householdSetup:`SELECT profile_complete,onboarding_mode,display_name FROM public.identity_profile WHERE identity_id=$1::uuid`,
 householdRead:`SELECT id::text,name FROM public.household WHERE created_by=$1::uuid AND deleted_at IS NULL`,
 householdMembers:`SELECT m.id::text,CASE WHEN m.role='ADMIN' THEN p.display_name ELSE m.display_name END AS display_name,m.role FROM public.household_member m JOIN public.household h ON h.id=m.household_id LEFT JOIN public.identity_profile p ON p.identity_id=m.identity_id WHERE h.created_by=$1::uuid AND h.deleted_at IS NULL AND m.left_at IS NULL ORDER BY m.joined_at,m.id`,
 householdCreate:`WITH h AS (INSERT INTO public.household(id,name,created_by) VALUES($2::uuid,$3::text,$1::uuid) ON CONFLICT(created_by) DO NOTHING RETURNING id) INSERT INTO public.household_member(id,household_id,identity_id,owner_identity_id,display_name,role) SELECT $4::uuid,id,$1::uuid,$1::uuid,NULL,'ADMIN' FROM h RETURNING id::text`,
 householdRename:`UPDATE public.household SET name=$2::text,updated_at=clock_timestamp() WHERE created_by=$1::uuid AND deleted_at IS NULL RETURNING id::text`,
 householdDependantRead:`SELECT m.id::text,m.display_name,m.left_at IS NULL AS active FROM public.household_member m JOIN public.household h ON h.id=m.household_id WHERE h.created_by=$1::uuid AND h.deleted_at IS NULL AND m.id=$2::uuid AND m.role='DEPENDANT'`,
 householdDependantAdd:`INSERT INTO public.household_member(id,household_id,identity_id,owner_identity_id,display_name,role) SELECT $2::uuid,id,NULL,$1::uuid,$3::text,'DEPENDANT' FROM public.household WHERE created_by=$1::uuid AND deleted_at IS NULL RETURNING id::text`,
 householdDependantEdit:`UPDATE public.household_member SET display_name=$3::text WHERE owner_identity_id=$1::uuid AND id=$2::uuid AND role='DEPENDANT' AND left_at IS NULL RETURNING id::text`,
 householdDependantRemove:`UPDATE public.household_member SET left_at=clock_timestamp() WHERE owner_identity_id=$1::uuid AND id=$2::uuid AND role='DEPENDANT' AND left_at IS NULL RETURNING id::text`,
 householdAssignments:`SELECT p.subscription_id::text,p.payer_member_id::text,COALESCE(array_agg(a.member_id::text ORDER BY a.member_id) FILTER(WHERE a.member_id IS NOT NULL),'{}'::text[]) AS member_ids FROM public.household_subscription_plan p LEFT JOIN public.household_subscription_usage a ON a.identity_id=p.identity_id AND a.subscription_id=p.subscription_id WHERE p.identity_id=$1::uuid GROUP BY p.subscription_id,p.payer_member_id ORDER BY p.subscription_id`,
 householdPlanSave:`INSERT INTO public.household_subscription_plan(identity_id,subscription_id,payer_member_id) VALUES($1::uuid,$2::uuid,$3::uuid) ON CONFLICT(identity_id,subscription_id) DO UPDATE SET payer_member_id=EXCLUDED.payer_member_id RETURNING subscription_id::text`,
 householdPayerMemberClear:`UPDATE public.household_subscription_plan SET payer_member_id=NULL WHERE identity_id=$1::uuid AND payer_member_id=$2::uuid RETURNING subscription_id::text`,
 householdSubscription:`SELECT id::text FROM public.subscription WHERE identity_id=$1::uuid AND id=$2::uuid`,
 householdAssignmentClear:`DELETE FROM public.household_subscription_usage WHERE identity_id=$1::uuid AND subscription_id=$2::uuid RETURNING subscription_id::text`,
 householdAssignmentMemberClear:`DELETE FROM public.household_subscription_usage WHERE identity_id=$1::uuid AND member_id=$2::uuid RETURNING subscription_id::text`,
 householdAssignmentInsert:`INSERT INTO public.household_subscription_usage(identity_id,subscription_id,member_id) VALUES($1::uuid,$2::uuid,$3::uuid) RETURNING subscription_id::text`,
 householdAuditLast:`SELECT hash FROM public.household_audit WHERE actor_id=$1::uuid ORDER BY ordinal DESC LIMIT 1`,
 householdAuditWrite:`INSERT INTO public.household_audit(actor_id,event_type,target_id,prev_hash,hash) VALUES($1::uuid,$2::text,$3::uuid,$4::text,$5::text) RETURNING hash`,
});
type Authority=Pick<SandboxAuthority,'withCurrentMobileAuthority'>;
type Result=Readonly<{status:200;value:SandboxHouseholdView}|{status:409;code:'HOUSEHOLD_CONFLICT'}|{status:404;code:'HOUSEHOLD_MEMBER_NOT_FOUND'}>;
const unavailable=():never=>{throw new Error('Household unavailable');};
async function rows(tx:OwnerTx,key:keyof typeof SANDBOX_HOUSEHOLD_STATEMENTS,values:readonly unknown[],command='SELECT'){
 const result=await tx.execute(key,values);if(result.command!==command||result.rowCount!==result.rows.length)return unavailable();return result.rows;
}
async function read(tx:OwnerTx,owner:string):Promise<SandboxHouseholdView>{
 const h=await rows(tx,'householdRead',[owner]);if(h.length===0)return parseSandboxHouseholdView({household:null});if(h.length!==1)return unavailable();
 const members=await rows(tx,'householdMembers',[owner]),assignments=await rows(tx,'householdAssignments',[owner]);return parseSandboxHouseholdView({household:{id:h[0]!.id,name:h[0]!.name,members:members.map(m=>({id:m.id,displayName:m.display_name,role:m.role})),assignments:assignments.map(a=>({subscriptionId:a.subscription_id,memberIds:a.member_ids,payerMemberId:a.payer_member_id}))}});
}
async function audit(tx:OwnerTx,owner:string,event:string,target:unknown){
 if(typeof target!=='string')return unavailable();
 const previous=await rows(tx,'householdAuditLast',[owner]);if(previous.length>1)return unavailable();const prior=previous[0]?.hash??'0'.repeat(64);if(typeof prior!=='string'||!/^[a-f0-9]{64}$/.test(prior))return unavailable();
 const hash=createHash('sha256').update(JSON.stringify(['sandbox-household-v1',owner,event,target,prior])).digest('hex');
 const inserted=await rows(tx,'householdAuditWrite',[owner,event,target,prior,hash],'INSERT');if(inserted.length!==1||inserted[0]!.hash!==hash)return unavailable();
}
export function createSandboxHouseholdBusiness(authority:Authority){return Object.freeze({async execute(token:string,operation:SandboxHouseholdOperation,body:unknown):Promise<Result>{
 const parsed=parseSandboxHouseholdRequest(operation,body);
 return authority.withCurrentMobileAuthority(token,async(tx,owner)=>{
  const identity=owner.identityId,setup=await rows(tx,'householdSetup',[identity]);if(setup.length!==1||setup[0]!.profile_complete!==true)return {status:409,code:'HOUSEHOLD_CONFLICT'};
  const before=await read(tx,identity);
  if(operation==='household-read')return {status:200,value:before};
  if(operation==='household-create'){
   if(before.household)return {status:200,value:before};
   const h=randomUUID(),admin=randomUUID(),created=await rows(tx,'householdCreate',[identity,h,parsed.name,admin],'INSERT');if(created.length!==1)return unavailable();await audit(tx,identity,'household_created',h);
  }else{
   if(!before.household)return {status:409,code:'HOUSEHOLD_CONFLICT'};
   if(operation==='household-rename'){
    const changed=await rows(tx,'householdRename',[identity,parsed.name],'UPDATE');if(changed.length!==1)return unavailable();await audit(tx,identity,'household_renamed',before.household.id);
   }else if(operation==='household-assign'){
    const ids=parsed.memberIds as readonly string[];if(ids.some(id=>!before.household!.members.some(m=>m.id===id))||parsed.payerMemberId!==null&&!before.household.members.some(m=>m.id===parsed.payerMemberId))return {status:409,code:'HOUSEHOLD_CONFLICT'};
    const subscription=await rows(tx,'householdSubscription',[identity,parsed.subscriptionId]);if(subscription.length!==1)return {status:409,code:'HOUSEHOLD_CONFLICT'};
    const planned=await rows(tx,'householdPlanSave',[identity,parsed.subscriptionId,parsed.payerMemberId],'INSERT');if(planned.length!==1)return unavailable();
    await rows(tx,'householdAssignmentClear',[identity,parsed.subscriptionId],'DELETE');
    for(const memberId of [...ids].sort()){const saved=await rows(tx,'householdAssignmentInsert',[identity,parsed.subscriptionId,memberId],'INSERT');if(saved.length!==1)return unavailable();}
    await audit(tx,identity,'household_usage_changed',parsed.subscriptionId);
   }else if(operation==='dependant-add'){
    const existing=await rows(tx,'householdDependantRead',[identity,parsed.requestId]);
    if(existing.length>1)return unavailable();
    if(existing.length===1)return existing[0]!.active===true&&existing[0]!.display_name===parsed.displayName?{status:200,value:before}:{status:409,code:'HOUSEHOLD_CONFLICT'};
    if(before.household.members.length>=20)return {status:409,code:'HOUSEHOLD_CONFLICT'};
    const added=await rows(tx,'householdDependantAdd',[identity,parsed.requestId,parsed.displayName],'INSERT');if(added.length!==1)return unavailable();await audit(tx,identity,'dependant_added',parsed.requestId!);
   }else{
    const existing=before.household.members.find(member=>member.id===parsed.memberId&&member.role==='DEPENDANT');if(!existing)return {status:404,code:'HOUSEHOLD_MEMBER_NOT_FOUND'};
    const edit=operation==='dependant-edit';if(!edit){await rows(tx,'householdAssignmentMemberClear',[identity,parsed.memberId],'DELETE');await rows(tx,'householdPayerMemberClear',[identity,parsed.memberId],'UPDATE');}const changed=await rows(tx,edit?'householdDependantEdit':'householdDependantRemove',edit?[identity,parsed.memberId,parsed.displayName]:[identity,parsed.memberId],'UPDATE');if(changed.length!==1)return unavailable();await audit(tx,identity,edit?'dependant_edited':'dependant_removed',parsed.memberId);
   }
  }
  return {status:200,value:await read(tx,identity)};
 });
}});}
