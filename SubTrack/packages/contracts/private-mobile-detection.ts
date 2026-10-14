import {parsePrivateManualCreate,parsePrivateOwnerPageRequest} from '@subtrack/contracts/private-onboarding';
export const PRIVATE_MOBILE_DETECTION_PATHS=Object.freeze({scan:'/v2/private/mobile/detections/scan',read:'/v2/private/mobile/detections/read',confirm:'/v2/private/mobile/detections/confirm',reject:'/v2/private/mobile/detections/reject',undo:'/v2/private/mobile/detections/undo'});
export type PrivateMobileDetectionOperation=keyof typeof PRIVATE_MOBILE_DETECTION_PATHS;
export type PrivateMobileDetectionCandidate=Readonly<{id:string;revision:string;displayName:string;categoryCode:string;cadence:'WEEKLY'|'MONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'ANNUAL';expectedAmountMinor:string;currency:string;confidence:number;reasons:readonly string[];status:'DETECTED'}>;
export type PrivateMobileDetectionReadResult=Readonly<{items:readonly PrivateMobileDetectionCandidate[];nextCursor:string|null}>;
export type PrivateMobileDetectionReviewResult=Readonly<{candidateId:string;status:'ACTIVE'|'REJECTED'|'DETECTED';revision:string;receiptId:string;undoUntil:string|null}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX=9223372036854775807n;
const REASONS=['MERCHANT_RESOLVED','CADENCE_MATCHED','MIN_OCCURRENCES_MET','DATE_PATTERN_STABLE','AMOUNT_WITHIN_BAND','SUBSCRIPTION_CATEGORY_PRIOR'];
function bad():never{throw new Error('detection-shape');}
function record(v:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return bad();
 const descriptors=Object.getOwnPropertyDescriptors(v);
 if(required.some(k=>!Object.prototype.hasOwnProperty.call(v,k))||Reflect.ownKeys(v).some(k=>typeof k!=='string'||![...required,...optional].includes(k)||!('value'in descriptors[k]!)))return bad();return v as Record<string,unknown>;
}
function uuid(v:unknown):string{if(typeof v!=='string'||!UUID.test(v))return bad();return v;}
function revision(v:unknown):string{if(typeof v!=='string'||!/^[1-9][0-9]{0,18}$/.test(v)||BigInt(v)>MAX)return bad();return v;}
function array(v:unknown,max:number):unknown[]{
 if(!Array.isArray(v)||v.length>max||Object.getPrototypeOf(v)!==Array.prototype)return bad();const d=Object.getOwnPropertyDescriptors(v);
 if(Reflect.ownKeys(v).length!==v.length+1||Array.from({length:v.length},(_,i)=>d[String(i)]).some(x=>!x||!('value'in x)))return bad();return v;
}
function time(v:unknown):string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||v.startsWith('0000')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)return bad();return v;}
export function parsePrivateMobileDetectionRequestKey(operation:PrivateMobileDetectionOperation,v:unknown):string|null{
 if(operation==='read'){if(v!==undefined)return bad();return null;}
 // eslint-disable-next-line no-control-regex -- Accepted private mutation key grammar.
 if(!['scan','confirm','reject','undo'].includes(operation)||typeof v!=='string'||!/^[\x21-\x7e]{16,255}$/.test(v))return bad();return v;
}
export function parsePrivateMobileDetectionScan(v:unknown):Readonly<Record<string,never>>{record(v,[]);return {};}
export function parsePrivateMobileDetectionRead(v:unknown):Readonly<{cursor?:string}>{record(v,[],['cursor']);return parsePrivateOwnerPageRequest(v);}
export function parsePrivateMobileDetectionReview(v:unknown):Readonly<{candidateId:string;expectedRevision:string}>{const r=record(v,['candidateId','expectedRevision']);return {candidateId:uuid(r.candidateId),expectedRevision:revision(r.expectedRevision)};}
export function parsePrivateMobileDetectionUndo(v:unknown):Readonly<{receiptId:string}>{return {receiptId:uuid(record(v,['receiptId']).receiptId)};}
export function parsePrivateMobileDetectionScanResult(v:unknown):Readonly<{scan:'complete'}>{if(record(v,['scan']).scan!=='complete')return bad();return {scan:'complete'};}
export function parsePrivateMobileDetectionCandidate(v:unknown):PrivateMobileDetectionCandidate{
 const r=record(v,['id','revision','displayName','categoryCode','cadence','expectedAmountMinor','currency','confidence','reasons','status']);
 const fields=parsePrivateManualCreate({customName:r.displayName,categoryCode:r.categoryCode,cadence:r.cadence,expectedAmountMinor:r.expectedAmountMinor});
 if(fields.customName!==r.displayName||typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency)||r.status!=='DETECTED'||typeof r.confidence!=='number'||!Number.isFinite(r.confidence)||r.confidence<0||r.confidence>1||Object.is(r.confidence,-0))return bad();
 const reasons=array(r.reasons,REASONS.length);if(reasons.length===0||reasons.some(x=>typeof x!=='string'||!REASONS.includes(x))||new Set(reasons).size!==reasons.length)return bad();
 return {id:uuid(r.id),revision:revision(r.revision),displayName:fields.customName,categoryCode:fields.categoryCode,cadence:fields.cadence,expectedAmountMinor:fields.expectedAmountMinor,currency:r.currency,confidence:r.confidence,reasons:reasons as string[],status:'DETECTED'};
}
export function parsePrivateMobileDetectionReadResult(v:unknown):PrivateMobileDetectionReadResult{
 const r=record(v,['items','nextCursor']),items=array(r.items,50).map(parsePrivateMobileDetectionCandidate);
 if(new Set(items.map(x=>x.id)).size!==items.length)return bad();if(r.nextCursor!==null){parsePrivateOwnerPageRequest({cursor:r.nextCursor});if(items.length!==50)return bad();}
 return {items,nextCursor:r.nextCursor as string|null};
}
export function parsePrivateMobileDetectionReviewResult(v:unknown):PrivateMobileDetectionReviewResult{
 const r=record(v,['candidateId','status','revision','receiptId','undoUntil']);if(!['ACTIVE','REJECTED','DETECTED'].includes(r.status as string))return bad();
 if(r.status==='DETECTED'?r.undoUntil!==null:r.undoUntil===null)return bad();return {candidateId:uuid(r.candidateId),status:r.status as PrivateMobileDetectionReviewResult['status'],revision:revision(r.revision),receiptId:uuid(r.receiptId),undoUntil:r.undoUntil===null?null:time(r.undoUntil)};
}
