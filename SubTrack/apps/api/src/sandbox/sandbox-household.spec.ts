import {describe,it,expect,vi} from 'vitest';
import type {QueryResultRow} from 'pg';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import {createSandboxHouseholdBusiness} from './sandbox-household.js';
const owner='123e4567-e89b-42d3-a456-426614174000',household='123e4567-e89b-42d3-a456-426614174001',admin='123e4567-e89b-42d3-a456-426614174002',child='123e4567-e89b-42d3-a456-426614174003',subscription='123e4567-e89b-42d3-a456-426614174004';
const memberRows=()=>[{id:admin,display_name:'Example parent',role:'ADMIN'},{id:child,display_name:'Example child',role:'DEPENDANT'}];
function fixture({exists=true,complete=true,members=memberRows()}={}){
 let householdRows:Record<string,unknown>[]=exists?[{id:household,name:'Example family'}]:[],memberState=members,assignments:Record<string,unknown>[]=[],hash:string|undefined;
 const calls:{name:string;values:readonly unknown[]}[]=[];
 const execute=vi.fn(async(name:string,values:readonly unknown[])=>{
  calls.push({name,values});if(values[0]!==owner)throw new Error('Unscoped');let rows:Record<string,unknown>[]=[],command='SELECT';
  switch(name){
   case 'householdSetup':rows=[{profile_complete:complete,onboarding_mode:'just-me',display_name:'Example parent'}];break;
   case 'householdRead':rows=householdRows;break;
   case 'householdMembers':rows=memberState;break;
   case 'householdAssignments':rows=assignments;break;
   case 'householdCreate':command='INSERT';householdRows=[{id:values[1],name:values[2]}];memberState=[{id:values[3] as string,display_name:'Example parent',role:'ADMIN'}];rows=[{id:values[3]}];break;
   case 'householdRename':command='UPDATE';householdRows=[{...householdRows[0],name:values[1]}];rows=[{id:household}];break;
   case 'householdDependantRead':rows=memberState.filter(m=>m.id===values[1]&&m.role==='DEPENDANT').map(m=>({...m,active:true}));break;
   case 'householdDependantAdd':command='INSERT';memberState=[...memberState,{id:values[1] as string,display_name:values[2] as string,role:'DEPENDANT'}];rows=[{id:values[1]}];break;
   case 'householdDependantEdit':command='UPDATE';memberState=memberState.map(m=>m.id===values[1]?{...m,display_name:values[2] as string}:m);rows=[{id:values[1]}];break;
   case 'householdDependantRemove':command='UPDATE';memberState=memberState.filter(m=>m.id!==values[1]);rows=[{id:values[1]}];break;
   case 'householdSubscription':rows=values[1]===subscription?[{id:subscription}]:[];break;
   case 'householdPlanSave':command='INSERT';assignments=[{subscription_id:subscription,member_ids:assignments[0]?.member_ids??[],payer_member_id:values[2]}];rows=[{subscription_id:subscription}];break;
   case 'householdPayerMemberClear':command='UPDATE';assignments=assignments.map(a=>({...a,payer_member_id:a.payer_member_id===values[1]?null:a.payer_member_id}));break;
   case 'householdAssignmentClear':command='DELETE';assignments=assignments.map(a=>({...a,member_ids:[]}));break;
   case 'householdAssignmentMemberClear':command='DELETE';assignments=assignments.map(a=>({...a,member_ids:(a.member_ids as string[]).filter(id=>id!==values[1])}));break;
   case 'householdAssignmentInsert':command='INSERT';assignments=[{...assignments[0],subscription_id:subscription,member_ids:[...(assignments[0]!.member_ids as string[]),values[2]]}];rows=[{subscription_id:subscription}];break;
   case 'householdAuditLast':rows=hash?[{hash}]:[];break;
   case 'householdAuditWrite':command='INSERT';hash=values[4] as string;rows=[{hash}];break;
   default:throw new Error('Unexpected statement');
  }return {command,rowCount:rows.length,rows,oid:0,fields:[]};
 });
 type Authority=Parameters<typeof createSandboxHouseholdBusiness>[0];
 const tx:OwnerTx={execute:async<R extends QueryResultRow=QueryResultRow>(name:string,values:readonly unknown[])=>{const result=await execute(name,values);return {...result,rows:result.rows as R[]};}};
 const entered=vi.fn();
 const withCurrentMobileAuthority:Authority['withCurrentMobileAuthority']=async(token,work)=>{entered(token);return work(tx,{identityId:owner,sessionId:admin});};
 const authority={withCurrentMobileAuthority};
 return {business:createSandboxHouseholdBusiness(authority),calls,execute,authority,entered};
}
describe('isolated household business',()=>{
 it('creates one owner household/admin and returns authoritative readback; repeating create never inserts another',async()=>{
  const f=fixture({exists:false,members:[]});const first=await f.business.execute('token','household-create',{name:'Example family'});expect(first.status).toBe(200);if('value'in first)expect(first.value.household?.members).toHaveLength(1);
  await f.business.execute('token','household-create',{name:'Changed retry'});expect(f.calls.filter(c=>c.name==='householdCreate')).toHaveLength(1);expect(f.calls.every(c=>c.values[0]===owner)).toBe(true);expect(f.calls.some(c=>c.name==='householdAuditWrite')).toBe(true);
 });
 it('adds a non-login profile, deduplicates same request, rejects changed replay and edits/removes only dependants',async()=>{
  const f=fixture({members:memberRows().slice(0,1)});expect((await f.business.execute('token','dependant-add',{requestId:child,displayName:'Example child'})).status).toBe(200);
  await f.business.execute('token','dependant-add',{requestId:child,displayName:'Example child'});expect(f.calls.filter(c=>c.name==='householdDependantAdd')).toHaveLength(1);
  expect(await f.business.execute('token','dependant-add',{requestId:child,displayName:'Changed'})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});
  const edited=await f.business.execute('token','dependant-edit',{memberId:child,displayName:'Renamed child'});if('value'in edited)expect(edited.value.household?.members[1]?.displayName).toBe('Renamed child');
  expect(await f.business.execute('token','dependant-remove',{memberId:admin})).toEqual({status:404,code:'HOUSEHOLD_MEMBER_NOT_FOUND'});
  const removed=await f.business.execute('token','dependant-remove',{memberId:child});if('value'in removed)expect(removed.value.household?.members).toHaveLength(1);
  expect(f.calls.findIndex(c=>c.name==='householdAssignmentMemberClear')).toBeLessThan(f.calls.findIndex(c=>c.name==='householdDependantRemove'));
 });
 it('writes only owned subscription/current member usage and readbacks exact assignment; clear is explicit',async()=>{
  const f=fixture();expect(await f.business.execute('token','household-assign',{subscriptionId:admin,memberIds:[child],payerMemberId:null})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});
  expect(await f.business.execute('token','household-assign',{subscriptionId:subscription,memberIds:[household],payerMemberId:null})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});
  expect(await f.business.execute('token','household-assign',{subscriptionId:subscription,memberIds:[child],payerMemberId:household})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});
  const saved=await f.business.execute('token','household-assign',{subscriptionId:subscription,memberIds:[child,admin],payerMemberId:child});if('value'in saved)expect(saved.value.household?.assignments).toEqual([{subscriptionId:subscription,memberIds:[admin,child],payerMemberId:child}]);
  const clear=await f.business.execute('token','household-assign',{subscriptionId:subscription,memberIds:[],payerMemberId:null});if('value'in clear)expect(clear.value.household?.assignments).toEqual([{subscriptionId:subscription,memberIds:[],payerMemberId:null}]);
 });
 it('refuses incomplete profile and household mutations without a household; strict input fails before authority',async()=>{
  const incomplete=fixture({complete:false});expect(await incomplete.business.execute('token','household-read',{})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});
  const absent=fixture({exists:false,members:[]});expect(await absent.business.execute('token','household-read',{})).toEqual({status:200,value:{household:null}});expect(await absent.business.execute('token','dependant-remove',{memberId:child})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});
  const f=fixture();await expect(f.business.execute('token','household-create',{name:'Example',ownerId:admin})).rejects.toThrow();expect(f.entered).not.toHaveBeenCalled();
 });
 it('keeps audit metadata free of names and propagates failed writes instead of claiming success',async()=>{
  const f=fixture();await f.business.execute('token','household-rename',{name:'Renamed example'});const audit=f.calls.find(c=>c.name==='householdAuditWrite')!;expect(audit.values).not.toContain('Renamed example');expect(audit.values[4]).toMatch(/^[a-f0-9]{64}$/);
  f.execute.mockImplementationOnce(async()=>({command:'SELECT',rowCount:2,rows:[],oid:0,fields:[]}));await expect(f.business.execute('token','household-read',{})).rejects.toThrow();
 });
 it('keeps the twenty-member abuse bound before insertion',async()=>{
  const members=[memberRows()[0]!,...Array.from({length:19},(_,index)=>({id:`123e4567-e89b-42d3-a456-${String(index+10).padStart(12,'0')}`,display_name:'Example dependant',role:'DEPENDANT'}))];
  const f=fixture({members});expect(await f.business.execute('token','dependant-add',{requestId:child,displayName:'Another example'})).toEqual({status:409,code:'HOUSEHOLD_CONFLICT'});expect(f.calls.some(c=>c.name==='householdDependantAdd')).toBe(false);
 });
});
