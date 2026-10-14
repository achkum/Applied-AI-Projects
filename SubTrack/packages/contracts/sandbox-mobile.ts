import {parseProfilePatch,parseJustMeChoice} from '@subtrack/contracts/profile';
import {parsePrivateOwnerPageRequest,parsePrivateManualCreate} from '@subtrack/contracts/private-onboarding';
import {parsePrivateMobileManualEdit,parsePrivateMobileStatus} from '@subtrack/contracts/private-mobile';
export const SANDBOX_MOBILE_PATHS=Object.freeze({bootstrap:'/v2/sandbox/mobile/bootstrap',resume:'/v2/sandbox/mobile/resume',refresh:'/v2/sandbox/mobile/refresh',logout:'/v2/sandbox/mobile/logout',business:'/v2/sandbox/mobile/business'});
export const SANDBOX_BUSINESS_OPERATIONS=Object.freeze(['profile-read','profile','mode-read','mode','owner-read','manual','manual-edit','status'] as const);
export type SandboxBusinessOperation=typeof SANDBOX_BUSINESS_OPERATIONS[number];
export type SandboxCredentials=Readonly<{transport:'sandbox-mobile';sessionId:string;accessToken:string;refreshToken:string;sessionExpiresAt:number}>;
export type SandboxBootstrapCredentials=SandboxCredentials&Readonly<{installationCapability:string}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail=():never=>{throw new Error('sandbox-wire');};
export function sandboxObject(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return fail();
 const own=Reflect.ownKeys(value),desc=Object.getOwnPropertyDescriptors(value);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k))||keys.some(k=>!desc[k]||!('value'in desc[k])||!desc[k].enumerable))return fail();return value as Record<string,unknown>;
}
export function parseSandboxRequestKey(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))return fail();return value;}
export function parseSandboxSecret(value:unknown,kind:'capability'|'refresh'):string{
 if(!['capability','refresh'].includes(kind))return fail();
 const prefix=kind==='capability'?'s250c.':'s250r.';if(typeof value!=='string'||!value.startsWith(prefix)||!/^[-_A-Za-z0-9]{42}[AEIMQUYcgkosw048]$/.test(value.slice(prefix.length)))return fail();return value;
}
export function parseSandboxBootstrap(value:unknown):Readonly<{transport:'sandbox-mobile';locale:'sv'|'en'}>{const v=sandboxObject(value,['transport','locale']);if(v.transport!=='sandbox-mobile'||!['sv','en'].includes(v.locale as string))return fail();return Object.freeze({transport:'sandbox-mobile',locale:v.locale as 'sv'|'en'});}
export function parseSandboxTransport(value:unknown):Readonly<{transport:'sandbox-mobile'}>{if(sandboxObject(value,['transport']).transport!=='sandbox-mobile')return fail();return Object.freeze({transport:'sandbox-mobile'});}
export function parseSandboxBusiness(value:unknown):Readonly<{operation:SandboxBusinessOperation;body:object}>{
 const v=sandboxObject(value,['operation','body']);if(!SANDBOX_BUSINESS_OPERATIONS.includes(v.operation as SandboxBusinessOperation))return fail();const operation=v.operation as SandboxBusinessOperation;let body:object;
 if(operation==='profile')body=parseProfilePatch(v.body);
 else if(operation==='mode')body=parseJustMeChoice(v.body);
 else if(operation==='manual')body=parsePrivateManualCreate(v.body);
 else if(operation==='manual-edit')body=parsePrivateMobileManualEdit(v.body);
 else if(operation==='status')body=parsePrivateMobileStatus(v.body);
 else if(operation==='owner-read')body=parsePrivateOwnerPageRequest(v.body);
 else body=sandboxObject(v.body,[]);
 return Object.freeze({operation,body:Object.freeze(body)});
}
export function parseSandboxCredentials(value:unknown,bootstrap:false):SandboxCredentials;
export function parseSandboxCredentials(value:unknown,bootstrap:true):SandboxBootstrapCredentials;
export function parseSandboxCredentials(value:unknown,bootstrap:boolean):SandboxCredentials|SandboxBootstrapCredentials{
 if(typeof bootstrap!=='boolean')return fail();
 const keys=['transport','sessionId','accessToken','refreshToken','sessionExpiresAt',...(bootstrap?['installationCapability']:[])],v=sandboxObject(value,keys);
 if(v.transport!=='sandbox-mobile'||typeof v.sessionId!=='string'||!UUID.test(v.sessionId)||typeof v.accessToken!=='string'||v.accessToken.length>4096||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(v.accessToken)||typeof v.sessionExpiresAt!=='number'||!Number.isSafeInteger(v.sessionExpiresAt)||v.sessionExpiresAt<=0)return fail();
 const result={transport:'sandbox-mobile' as const,sessionId:v.sessionId,accessToken:v.accessToken,refreshToken:parseSandboxSecret(v.refreshToken,'refresh'),sessionExpiresAt:v.sessionExpiresAt};return Object.freeze(bootstrap?{...result,installationCapability:parseSandboxSecret(v.installationCapability,'capability')}:result);
}
export const SANDBOX_PROBLEM_CODES=Object.freeze({400:['INVALID_SANDBOX_REQUEST'],401:['SANDBOX_AUTHENTICATION_REQUIRED'],404:['SUBSCRIPTION_NOT_FOUND'],409:['SANDBOX_RESTART_REQUIRED','MODE_CONFLICT','MANUAL_IDEMPOTENCY_CONFLICT','MANUAL_EDIT_IDEMPOTENCY_CONFLICT','MANUAL_EDIT_CONFLICT','LIFECYCLE_CONFLICT'],429:['SANDBOX_CAPACITY_EXHAUSTED'],500:['SANDBOX_UNAVAILABLE']} as const);
export function parseSandboxProblem(value:unknown):Readonly<{type:'about:blank';title:'Sandbox request unavailable';status:400|401|404|409|429|500;code:string}>{const v=sandboxObject(value,['type','title','status','code']);if(v.type!=='about:blank'||v.title!=='Sandbox request unavailable'||typeof v.status!=='number'||!Object.prototype.hasOwnProperty.call(SANDBOX_PROBLEM_CODES,v.status)||typeof v.code!=='string'||!(SANDBOX_PROBLEM_CODES[v.status as keyof typeof SANDBOX_PROBLEM_CODES] as readonly string[]).includes(v.code))return fail();return Object.freeze(v) as ReturnType<typeof parseSandboxProblem>;}
