import {getRandomBytesAsync} from 'expo-crypto';
import {getPrivateRuntime} from '@/config/privateRuntime';
import {readNativeProfile,readNativeMode,readNativeSubscriptions,PrivateMobileRequestError} from './privateMobileApi';
import {PRIVATE_MOBILE_DETECTION_PATHS,parsePrivateMobileDetectionRequestKey,parsePrivateMobileDetectionRead,parsePrivateMobileDetectionReview,parsePrivateMobileDetectionUndo,parsePrivateMobileDetectionReadResult,parsePrivateMobileDetectionReviewResult,parsePrivateMobileDetectionScanResult,type PrivateMobileDetectionCandidate,type PrivateMobileDetectionReviewResult} from '@subtrack/contracts/private-mobile-detection';
export type DetectionConflict=Readonly<{conflict:'MODE_CONFLICT'|'DETECTION_STATE_CONFLICT'|'DETECTION_IDEMPOTENCY_CONFLICT'|'UNDO_EXPIRED'}>;
export type DetectionIntent=Readonly<{operation:'scan'}|{operation:'confirm'|'reject';candidateId:string;expectedRevision:string}|{operation:'undo';receiptId:string;candidateId:string}>;
export async function detectionRequestKey(){const bytes=await getRandomBytesAsync(16);if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw new PrivateMobileRequestError();const key=Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');parsePrivateMobileDetectionRequestKey('scan',key);return key;}
function conflict(value:unknown):DetectionConflict{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new PrivateMobileRequestError();const r=value as Record<string,unknown>;
 if(Object.keys(r).length!==4||r.type!=='about:blank'||r.title!=='Conflict'||r.status!==409||!['MODE_CONFLICT','DETECTION_STATE_CONFLICT','DETECTION_IDEMPOTENCY_CONFLICT','UNDO_EXPIRED'].includes(r.code as string))throw new PrivateMobileRequestError();return {conflict:r.code as DetectionConflict['conflict']};
}
async function request<T>(operation:keyof typeof PRIVATE_MOBILE_DETECTION_PATHS,body:object,token:string,signal:AbortSignal,decode:(v:unknown)=>T,key?:string):Promise<T|DetectionConflict>{
 const runtime=getPrivateRuntime();if(!runtime||signal.aborted||!/^[A-Za-z0-9_.-]{1,4096}$/.test(token))throw new PrivateMobileRequestError();parsePrivateMobileDetectionRequestKey(operation,key);
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);
 try{const response=await fetch(runtime.apiBaseUrl+PRIVATE_MOBILE_DETECTION_PATHS[operation],{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(key===undefined?{}:{'Idempotency-Key':key})},body:JSON.stringify(body)});
  if(signal.aborted||controller.signal.aborted||response.headers.get('cache-control')!=='no-store'||![200,409].includes(response.status)||response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!==(response.status===409?'application/problem+json':'application/json'))throw new PrivateMobileRequestError();
  const text=await response.text();if(signal.aborted||controller.signal.aborted||text.length>(response.status===409?4096:131072))throw new PrivateMobileRequestError();const value:unknown=JSON.parse(text);return response.status===409?conflict(value):decode(value);
 }catch{throw new PrivateMobileRequestError();}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
export async function readNativeDetections(token:string,signal:AbortSignal,cursor?:string){
 if(signal.aborted)throw new PrivateMobileRequestError();const profile=await readNativeProfile(token,signal),mode=await readNativeMode(token,signal);if(signal.aborted)throw new PrivateMobileRequestError();if(!profile.profileComplete||mode.mode!=='just-me')return {kind:'setup-required'} as const;
 const page=await request('read',parsePrivateMobileDetectionRead(cursor===undefined?{}:{cursor}),token,signal,parsePrivateMobileDetectionReadResult);if('conflict'in page){if(page.conflict!=='MODE_CONFLICT')throw new PrivateMobileRequestError();return {kind:'setup-required'} as const;}return {kind:'ready',...page} as const;
}
export async function mutateNativeDetection(intent:DetectionIntent,key:string,token:string,signal:AbortSignal):Promise<PrivateMobileDetectionReviewResult|Readonly<{scan:'complete'}>|DetectionConflict>{
 const body=intent.operation==='scan'?{}:intent.operation==='undo'?parsePrivateMobileDetectionUndo({receiptId:intent.receiptId}):parsePrivateMobileDetectionReview({candidateId:intent.candidateId,expectedRevision:intent.expectedRevision});
 return request(intent.operation,body,token,signal,value=>{if(intent.operation==='scan')return parsePrivateMobileDetectionScanResult(value);const result=parsePrivateMobileDetectionReviewResult(value);if(result.candidateId!==intent.candidateId||result.status!==(intent.operation==='confirm'?'ACTIVE':intent.operation==='reject'?'REJECTED':'DETECTED'))throw new PrivateMobileRequestError();return result;},key);
}
/** Read the entire current owner projection; no local status is an acknowledgement. */
export async function readDetectionOwnerRows(token:string,signal:AbortSignal){
 const rows:Awaited<ReturnType<typeof readNativeSubscriptions>>['items'][number][]=[],ids=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined;
 for(;;){if(signal.aborted)throw new PrivateMobileRequestError();const page=await readNativeSubscriptions(token,signal,cursor);if(signal.aborted)throw new PrivateMobileRequestError();for(const row of page.items){if(ids.has(row.id))throw new PrivateMobileRequestError();ids.add(row.id);rows.push(row);}if(page.nextCursor===null)return rows;if(cursors.has(page.nextCursor))throw new PrivateMobileRequestError();cursors.add(page.nextCursor);cursor=page.nextCursor;}
}
export type {PrivateMobileDetectionCandidate,PrivateMobileDetectionReviewResult};
