import {isCanonicalDisplayName} from '@subtrack/contracts/profile';
import type {SandboxHouseholdOperation,SandboxHouseholdView} from './sandbox-household-types.ts';
export {SANDBOX_HOUSEHOLD_OPERATIONS} from './sandbox-household-types.ts';
export type {SandboxHouseholdOperation,SandboxHouseholdMember,SandboxHouseholdAssignment,SandboxHouseholdView} from './sandbox-household-types.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail=():never=>{throw new Error('household-wire');};
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return fail();
 const descriptors=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(value);
 if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key))||keys.some(key=>!descriptors[key]||!('value'in descriptors[key])||!descriptors[key].enumerable))return fail();
 return value as Record<string,unknown>;
}
function id(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))return fail();return value;}
function name(value:unknown):string{if(!isCanonicalDisplayName(value))return fail();return value;}
export function parseSandboxHouseholdRequest(operation:SandboxHouseholdOperation,value:unknown):Readonly<Record<string,unknown>>{
 if(operation==='household-read'){object(value,[]);return Object.freeze({});}
 if(operation==='household-create'||operation==='household-rename'){const v=object(value,['name']);return Object.freeze({name:name(v.name)});}
 if(operation==='dependant-add'){const v=object(value,['requestId','displayName']);return Object.freeze({requestId:id(v.requestId),displayName:name(v.displayName)});}
 if(operation==='dependant-edit'){const v=object(value,['memberId','displayName']);return Object.freeze({memberId:id(v.memberId),displayName:name(v.displayName)});}
 if(operation==='dependant-remove'){const v=object(value,['memberId']);return Object.freeze({memberId:id(v.memberId)});}
 if(operation==='household-assign'){const v=object(value,['subscriptionId','memberIds','payerMemberId']);if(!Array.isArray(v.memberIds)||v.memberIds.length>20)return fail();const ids=v.memberIds.map(id);if(new Set(ids).size!==ids.length)return fail();return Object.freeze({subscriptionId:id(v.subscriptionId),memberIds:Object.freeze(ids),payerMemberId:v.payerMemberId===null?null:id(v.payerMemberId)});}
 return fail();
}
export function parseSandboxHouseholdView(value:unknown):SandboxHouseholdView{
 const v=object(value,['household']);if(v.household===null)return Object.freeze({household:null});
 const h=object(v.household,['id','name','members','assignments']);if(!Array.isArray(h.members)||h.members.length<1||h.members.length>20)return fail();
 const members=h.members.map(value=>{const m=object(value,['id','displayName','role']);if(m.role!=='ADMIN'&&m.role!=='DEPENDANT')return fail();return Object.freeze({id:id(m.id),displayName:name(m.displayName),role:m.role});});
 if(members.filter(m=>m.role==='ADMIN').length!==1||new Set(members.map(m=>m.id)).size!==members.length)return fail();
 if(!Array.isArray(h.assignments)||h.assignments.length>100)return fail();
 const assignments=h.assignments.map(value=>{const a=object(value,['subscriptionId','memberIds','payerMemberId']);if(!Array.isArray(a.memberIds)||a.memberIds.length>20)return fail();const memberIds=a.memberIds.map(id),payerMemberId=a.payerMemberId===null?null:id(a.payerMemberId);if(new Set(memberIds).size!==memberIds.length||memberIds.some(key=>!members.some(member=>member.id===key))||payerMemberId!==null&&!members.some(member=>member.id===payerMemberId))return fail();return Object.freeze({subscriptionId:id(a.subscriptionId),memberIds:Object.freeze(memberIds),payerMemberId});});
 if(new Set(assignments.map(a=>a.subscriptionId)).size!==assignments.length)return fail();
 return Object.freeze({household:Object.freeze({id:id(h.id),name:name(h.name),members:Object.freeze(members),assignments:Object.freeze(assignments)})});
}
