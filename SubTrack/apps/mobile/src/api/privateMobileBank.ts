import {getRandomBytesAsync} from 'expo-crypto';
import {getPrivateRuntime} from '@/config/privateRuntime';
import {readNativeProfile,readNativeMode,PrivateMobileRequestError} from './privateMobileApi';
import {PRIVATE_MOBILE_BANK_PATHS,parsePrivateMobileBankConnect,parsePrivateMobileBankSync,parsePrivateMobileBankDisconnect,
 parsePrivateMobileBankReadResult,parsePrivateMobileBankMutationResult,parsePrivateMobileBankRequestKey,type PrivateMobileBankMutationResult} from '@subtrack/contracts/private-mobile-bank';

export type BankConflict=Readonly<{conflict:'MODE_CONFLICT'|'BANK_STATE_CONFLICT'|'BANK_IDEMPOTENCY_CONFLICT'}>;
export type BankIntent=Readonly<{operation:'connect';institutionId:'synthetic-demo-v1'}|{operation:'sync';connectionId:string}|{operation:'disconnect';connectionId:string;purge:boolean}>;
export async function bankRequestKey():Promise<string>{
 const bytes=await getRandomBytesAsync(16);if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw new PrivateMobileRequestError();
 bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 const key=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 parsePrivateMobileBankRequestKey('connect',key);return key;
}
function conflict(value:unknown):BankConflict{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new PrivateMobileRequestError();const record=value as Record<string,unknown>;
 if(Object.keys(record).length!==4||record.type!=='about:blank'||record.title!=='Conflict'||record.status!==409||!['MODE_CONFLICT','BANK_STATE_CONFLICT','BANK_IDEMPOTENCY_CONFLICT'].includes(record.code as string))throw new PrivateMobileRequestError();
 return {conflict:record.code as BankConflict['conflict']};
}
async function request<T>(operation:keyof typeof PRIVATE_MOBILE_BANK_PATHS,body:object,token:string,signal:AbortSignal,decode:(value:unknown)=>T,requestKey?:string):Promise<T|BankConflict>{
 const runtime=getPrivateRuntime();if(!runtime||signal.aborted||!/^[A-Za-z0-9_.-]{1,4096}$/.test(token))throw new PrivateMobileRequestError();
 parsePrivateMobileBankRequestKey(operation,requestKey);const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});const deadline=setTimeout(abort,15000);
 try{
  const response=await fetch(runtime.apiBaseUrl+PRIVATE_MOBILE_BANK_PATHS[operation],{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(requestKey===undefined?{}:{'Idempotency-Key':requestKey})},body:JSON.stringify(body)});
  if(signal.aborted||controller.signal.aborted||response.headers.get('cache-control')!=='no-store')throw new PrivateMobileRequestError();
  const content=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if(response.status!==200&&response.status!==409)throw new PrivateMobileRequestError();
  if(content!==(response.status===409?'application/problem+json':'application/json'))throw new PrivateMobileRequestError();
  const raw=await response.text();if(signal.aborted||controller.signal.aborted||raw.length>(response.status===409?4096:131072))throw new PrivateMobileRequestError();
  const value:unknown=JSON.parse(raw);return response.status===409?conflict(value):decode(value);
 }catch{throw new PrivateMobileRequestError();}finally{clearTimeout(deadline);signal.removeEventListener('abort',abort);}
}
export async function readNativeBank(token:string,signal:AbortSignal){
 if(signal.aborted)throw new PrivateMobileRequestError();const profile=await readNativeProfile(token,signal),mode=await readNativeMode(token,signal);
 if(signal.aborted)throw new PrivateMobileRequestError();if(!profile.profileComplete||mode.mode!=='just-me')return {kind:'setup-required'} as const;
 const result=await request('read',{},token,signal,parsePrivateMobileBankReadResult);
 if('conflict' in result){if(result.conflict!=='MODE_CONFLICT')throw new PrivateMobileRequestError();return {kind:'setup-required'} as const;}
 return {kind:'ready',connections:result.connections} as const;
}
export async function mutateNativeBank(intent:BankIntent,requestKey:string,token:string,signal:AbortSignal):Promise<PrivateMobileBankMutationResult|BankConflict>{
 let body:object;
 if(intent.operation==='connect')body=parsePrivateMobileBankConnect({institutionId:intent.institutionId});
 else if(intent.operation==='sync')body=parsePrivateMobileBankSync({connectionId:intent.connectionId});
 else body=parsePrivateMobileBankDisconnect({connectionId:intent.connectionId,purge:intent.purge});
 return request(intent.operation,body,token,signal,value=>{
  const result=parsePrivateMobileBankMutationResult(value);if(result.operation!==intent.operation||('connectionId' in intent&&result.connection.connectionId!==intent.connectionId)||
   (intent.operation==='disconnect'&&intent.purge&&result.connection.disposition!=='purged'))throw new PrivateMobileRequestError();return result;
 },requestKey);
}
