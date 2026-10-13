import {parsePrivateManualEdit} from '@subtrack/contracts/private-onboarding';
export const PRIVATE_MOBILE_PATHS = Object.freeze({
 complete:'/v2/private/mobile/enrollment/complete',verifyLogin:'/v2/private/mobile/login/verify',session:'/v2/private/mobile/session',
 refresh:'/v2/private/mobile/refresh',logout:'/v2/private/mobile/logout',profileRead:'/v2/private/mobile/profile/read',
 profile:'/v2/private/mobile/profile',modeRead:'/v2/private/mobile/mode/read',mode:'/v2/private/mobile/mode',
 manualEdit:'/v2/private/mobile/subscriptions/owner/manual/edit',status:'/v2/private/mobile/subscriptions/owner/status',
 ownerRead:'/v2/private/mobile/subscriptions/owner/read',manual:'/v2/private/mobile/subscriptions/owner/manual',
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('mobile-shape');
 const names=Reflect.ownKeys(value);const descriptors=Object.getOwnPropertyDescriptors(value);
 if(required.some(key=>!Object.prototype.hasOwnProperty.call(value,key))||names.some(key=>typeof key!=='string'||![...required,...optional].includes(key)||!('value'in descriptors[key]!)))throw new Error('mobile-shape');
 return value as Record<string,unknown>;
}
function proof(value:unknown):value is string{return typeof value==='string'&&/^v2\.[A-Za-z0-9_-]{43}$/.test(value);}
export function parsePrivateMobileEnrollmentComplete(value:unknown):Readonly<{transport:'mobile';enrollmentProof:string;locale?:'sv'|'en'}>{
 const v=object(value,['transport','enrollmentProof'],['locale']);
 if(v.transport!=='mobile'||!proof(v.enrollmentProof)||Object.prototype.hasOwnProperty.call(v,'locale')&&!['sv','en'].includes(v.locale as string))throw new Error('mobile-completion');
 return {transport:'mobile',enrollmentProof:v.enrollmentProof,...(v.locale===undefined?{}:{locale:v.locale as 'sv'|'en'})};
}
export function parsePrivateMobileLoginVerify(value:unknown):Readonly<{transport:'mobile'}>{
 const v=object(value,['transport']);if(v.transport!=='mobile')throw new Error('mobile-login');
 return {transport:'mobile'};
}
export function parsePrivateMobileSessionRequest(value:unknown):Readonly<{transport:'mobile';loginProof:string}>{
 const v=object(value,['transport','loginProof']);if(v.transport!=='mobile'||!proof(v.loginProof))throw new Error('mobile-session');
 return {transport:'mobile',loginProof:v.loginProof};
}
export function parsePrivateMobileLoginVerified(value:unknown):Readonly<{transport:'mobile';loginProof:string;status:'verified'}>{
 const v=object(value,['transport','loginProof','status']);if(v.transport!=='mobile'||!proof(v.loginProof)||v.status!=='verified')throw new Error('mobile-login-result');
 return {transport:'mobile',loginProof:v.loginProof,status:'verified'};
}
export function parsePrivateMobileSessionResponse(value:unknown):Readonly<{transport:'mobile';sessionId:string;accessToken:string;refreshToken:string}>{
 const v=object(value,['transport','sessionId','accessToken','refreshToken']);
 if(v.transport!=='mobile'||typeof v.sessionId!=='string'||!UUID.test(v.sessionId)||typeof v.accessToken!=='string'||v.accessToken.length>4096||
  !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v.accessToken)||typeof v.refreshToken!=='string'||!/^v2r\.[A-Za-z0-9_-]{43}$/.test(v.refreshToken))throw new Error('mobile-session-result');
 return {transport:'mobile',sessionId:v.sessionId,accessToken:v.accessToken,refreshToken:v.refreshToken};
}

export function parsePrivateMobileManualEdit(value:unknown):ReturnType<typeof parsePrivateManualEdit>&Readonly<{id:string}>{
 const v=object(value,['id','customName','categoryCode','cadence','expectedAmountMinor','nextChargeDate','expectedRevision']);
 if(typeof v.id!=='string'||!UUID.test(v.id))throw new Error('mobile-edit');
 const {id,...fields}=v;return {id,...parsePrivateManualEdit(fields)};
}
export function parsePrivateMobileStatus(value:unknown):Readonly<{id:string;status:'ACTIVE'|'PAUSED'|'CANCELLED'|'ARCHIVED'}>{
 const v=object(value,['id','status']);
 if(typeof v.id!=='string'||!UUID.test(v.id)||!['ACTIVE','PAUSED','CANCELLED','ARCHIVED'].includes(v.status as string))throw new Error('mobile-status');
 return {id:v.id,status:v.status as 'ACTIVE'|'PAUSED'|'CANCELLED'|'ARCHIVED'};
}
