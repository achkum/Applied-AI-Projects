import {getRandomBytesAsync} from 'expo-crypto';
import {parseSandboxHouseholdRequest,parseSandboxHouseholdView,type SandboxHouseholdOperation,type SandboxHouseholdView} from '@subtrack/contracts/sandbox-household';
import {sandboxMobileApi} from './sandboxMobileApi';

export type SandboxHouseholdIntent =
 | Readonly<{operation:'household-create'|'household-rename';name:string}>
 | Readonly<{operation:'dependant-add';requestId:string;displayName:string}>
 | Readonly<{operation:'dependant-edit';memberId:string;displayName:string}>
 | Readonly<{operation:'dependant-remove';memberId:string}>
 | Readonly<{operation:'household-assign';subscriptionId:string;memberIds:readonly string[];payerMemberId:string|null}>;
export type HouseholdTransport=(operation:SandboxHouseholdOperation,body:object,token:string,signal:AbortSignal,decode:(value:unknown)=>SandboxHouseholdView)=>Promise<SandboxHouseholdView>;
export function createSandboxHouseholdApi(transport:HouseholdTransport){
 return Object.freeze({
  read:(token:string,signal:AbortSignal)=>transport('household-read',{},token,signal,parseSandboxHouseholdView),
  mutate:(intent:SandboxHouseholdIntent,token:string,signal:AbortSignal)=>{
   const {operation,...body}=intent;return transport(operation,parseSandboxHouseholdRequest(operation,body),token,signal,parseSandboxHouseholdView);
  },
 });
}
export async function householdRequestId(entropy:(size:number)=>Promise<Uint8Array>=getRandomBytesAsync):Promise<string>{
 const bytes=await entropy(16);if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw new Error('Household unavailable');
 const copy=Uint8Array.from(bytes);copy[6]=(copy[6]!&15)|64;copy[8]=(copy[8]!&63)|128;
 const hex=Array.from(copy,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const sandboxHouseholdApi=createSandboxHouseholdApi((...args)=>sandboxMobileApi.householdBusiness(...args));
export type SandboxHouseholdApi=ReturnType<typeof createSandboxHouseholdApi>;
