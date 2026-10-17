import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:https';
import {PRIVATE_MOBILE_DETECTION_STATEMENTS} from '../src/detection/private-mobile-detection-statements.js';
import {types} from 'node:util';
import {privateBankFailureCategory} from './private-mobile-bank-diagnostics.js';

export const INITIAL_SCAN_OPERATIONS=Object.freeze(['SET_CONTEXT','GENERATION_LOCK','BOOKED_READ','SUBSCRIPTION_READ','CANDIDATE_WRITE','SOURCE_LINK_WRITE','SCAN_RECEIPT_WRITE','UNKNOWN'] as const);
export const INITIAL_SCAN_SQL_CATEGORIES=Object.freeze(['PERMISSION','UNDEFINED_COLUMN','UNDEFINED_TABLE','FOREIGN_KEY','UNIQUE','CHECK','NOT_NULL','TYPE_MISMATCH','INVALID_INPUT','NUMERIC_RANGE','SERIALIZATION','DEADLOCK','OTHER'] as const);
type ScanOperation=typeof INITIAL_SCAN_OPERATIONS[number];
type ScanSqlCategory=typeof INITIAL_SCAN_SQL_CATEGORIES[number];
export type InitialScanObservation=Readonly<{operation:ScanOperation;sqlCategory:ScanSqlCategory}|{lastOperation:ScanOperation}>;
const initialScanOperations:Readonly<Record<string,ScanOperation>>=Object.freeze({detectionModeRead:'UNKNOWN',detectionActiveGenerationLock:'GENERATION_LOCK',detectionBookedRows:'BOOKED_READ',detectionCandidateLookup:'SUBSCRIPTION_READ',detectionSubscriptionInsert:'CANDIDATE_WRITE',detectionCandidateInsert:'CANDIDATE_WRITE',detectionSourceLinkInsert:'SOURCE_LINK_WRITE',detectionScanReceiptInsert:'SCAN_RECEIPT_WRITE'});
export function safeInitialScanObservation(value:unknown):value is InitialScanObservation{
 try{
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(value),fields=Object.getOwnPropertyDescriptors(value);
  if(keys.some(key=>typeof key!=='string'||!('value'in fields[key]!)))return false;
  return keys.length===1&&keys[0]==='lastOperation'&&(INITIAL_SCAN_OPERATIONS as readonly unknown[]).includes(fields.lastOperation!.value)
   ||keys.length===2&&keys.includes('operation')&&keys.includes('sqlCategory')&&(INITIAL_SCAN_OPERATIONS as readonly unknown[]).includes(fields.operation!.value)&&(INITIAL_SCAN_SQL_CATEGORIES as readonly unknown[]).includes(fields.sqlCategory!.value);
 }catch{return false;}
}
function initialScanSqlCategory(error:unknown):ScanSqlCategory{
 if(types.isProxy(error)||!types.isNativeError(error))return 'OTHER';
 const descriptor=Object.getOwnPropertyDescriptor(error,'code');
 if(!descriptor||!('value'in descriptor)||typeof descriptor.value!=='string')return 'OTHER';
 // Reuse the existing closed mapper on a fresh Error, never on hostile prototypes.
 const safe=new Error();Object.defineProperty(safe,'code',{value:descriptor.value});
 const category=privateBankFailureCategory(safe);return (INITIAL_SCAN_SQL_CATEGORIES as readonly string[]).includes(category)?category as ScanSqlCategory:'OTHER';
}
/** Only fixed enums survive a single owned initial request; results and errors pass through unchanged. */
export class OwnedInitialDetectionScanObserver{
 private frame:Readonly<{generation:symbol;lastOperation:ScanOperation;first?:Readonly<{operation:ScanOperation;sqlCategory:ScanSqlCategory}>}>|undefined;
 begin():void{if(this.frame)throw new Error('Owned scan observation unavailable');this.frame={generation:Symbol(),lastOperation:'UNKNOWN'};}
 clear():void{this.frame=undefined;}
 observation():InitialScanObservation|undefined{return this.frame?Object.freeze(this.frame.first?{...this.frame.first}:{lastOperation:this.frame.lastOperation}):undefined;}
 query<T>(sql:unknown,work:()=>Promise<T>):Promise<T>{
  const frame=this.frame;if(!frame)return work();
  const name=typeof sql==='string'?Object.entries(PRIVATE_MOBILE_DETECTION_STATEMENTS).find(([,text])=>text===sql)?.[0]:undefined;
  const operation=name?initialScanOperations[name]??'UNKNOWN':undefined;
  if(!frame||!operation)return work();
  return (async()=>{
  try{const result=await work();if(frame&&this.frame?.generation===frame.generation&&operation)this.frame={...this.frame,lastOperation:operation};return result;}
  catch(error){
   if(frame&&this.frame?.generation===frame.generation&&operation&&!this.frame.first){
    this.frame={...this.frame,first:Object.freeze({operation,sqlCategory:initialScanSqlCategory(error)})};
   }
   throw error;
  }
  })();
 }
}

export const OWNED_DETECTION_SCENARIOS=Object.freeze(['undo-equality-entry','undo-expiry-after-final-fence','undo-expiry-after-epoch','undo-expiry-beforecommit-microtask','undo-expiry-finalverify-sync','undo-finalverify-microtask-order','undo-expiry-rollback-before','undo-expiry-rollback-after','review-commit-before','review-commit-after'] as const);
export type OwnedDetectionScenario=typeof OWNED_DETECTION_SCENARIOS[number];
export const OWNED_DETECTION_BOUNDARIES=Object.freeze([...Object.keys(PRIVATE_MOBILE_DETECTION_STATEMENTS),'authorityEpochAfterWork','authorityTokenBeforeCommit','authorityTokenFinalGuard','commitDispatch','rollbackDispatch']);
const EPOCH_SQL="UPDATE st244_mobile.epoch SET watermark_ms=GREATEST(watermark_ms,pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000)::bigint) WHERE id=$1::text AND manifest_h=$2::text AND active=true AND watermark_ms<=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000)::bigint AND $3::bigint<=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000)::bigint RETURNING watermark_ms::text AS now";
const failure=():never=>{throw new Error('Owned detection qualification unavailable');};
/** Internal owned-fixture controller. No HTTP selector, row replacement or application registration. */
export class OwnedDetectionController{
 private current:number|undefined;private limit=0;private scenario:OwnedDetectionScenario|undefined;private deadline=0;
 private verifies=0;private epochs=0;private fired=false;private tick=false;private commitBeforeTick=false;private discarded=false;private armedOwner='';private armedSession='';private generation=0;
 private verifiedSession:string|undefined;
 private armedCandidate='';private armedReceipt='';private targetBound=false;
 private counts:Record<string,number>=Object.fromEntries(OWNED_DETECTION_BOUNDARIES.map(name=>[name,0]));
 private original:Readonly<{owner:string;session:string;receipt:string;candidate:string;deadline:number}>|undefined;
 private pending:typeof this.original;
 now():number{return this.current??Date.now();}
 enabled():boolean{return this.current!==undefined;}
 enable(pgNow:number):void{if(this.enabled()||!Number.isSafeInteger(pgNow)||pgNow<3600000)return failure();this.limit=pgNow;this.current=pgNow-3600000;}
 binding(){return this.original;}
 arm(value:OwnedDetectionScenario,pgNow:number):void{
  if(!this.enabled()||this.scenario||!OWNED_DETECTION_SCENARIOS.includes(value)||!this.original||!Number.isSafeInteger(pgNow)||pgNow<this.limit||this.original.deadline<this.now()||this.original.deadline>pgNow)return failure();
  this.limit=pgNow;this.deadline=this.original.deadline;this.armedOwner=this.original.owner;this.armedSession=this.original.session;this.armedCandidate=this.original.candidate;this.armedReceipt=this.original.receipt;this.targetBound=false;this.counts=Object.fromEntries(OWNED_DETECTION_BOUNDARIES.map(name=>[name,0]));this.original=undefined;this.scenario=value;this.verifies=0;this.epochs=0;this.fired=false;this.tick=false;this.commitBeforeTick=false;this.discarded=false;
 }
 private advance():void{this.current=this.deadline;this.fired=true;this.tick=true;}
 private reject():never{this.clear();this.fired=false;return failure();}
 private count(name:string,max=1):void{this.counts[name]!++;if(this.counts[name]!>max)this.reject();}
 private queryBinding(sql:string,values:readonly unknown[]|undefined):void{
  const name=Object.entries(PRIVATE_MOBILE_DETECTION_STATEMENTS).find(([,text])=>text===sql)?.[0];if(!name)return;
  if(!Array.isArray(values)||values[0]!==this.armedOwner)return this.reject();
  if(name==='detectionModeRead'){if(values.length!==1)return this.reject();}
  else if(name==='detectionReceiptLock'){
   if(values.length!==5)return this.reject();
   if(this.counts.detectionReceiptLock===0){if(values[1]!==null||values[2]!==this.armedReceipt||values[3]!==null||values[4]!==null)return this.reject();}
   else if(values[2]!==null||values[1]!==this.armedCandidate||values[3]!=='undo'||!Buffer.isBuffer(values[4])||values[4].length!==32||(this.counts.detectionReceiptLock===2&&!this.targetBound))return this.reject();
  }else if(name==='detectionCandidateLock'){if(values.length!==2||values[1]!==this.armedCandidate||this.counts.detectionReceiptLock!==2)return this.reject();this.targetBound=true;}
  else if(name==='detectionFinalFence'){if(values.length!==4||values[1]!==this.armedSession||!this.targetBound)return this.reject();}
  else if(name==='detectionCompareUpdate'){if(values[1]!==this.armedCandidate||!this.targetBound)return this.reject();}
  else if(name==='detectionReceiptConsume'){if(values[1]!==this.armedReceipt||values[2]!==this.armedCandidate||!this.targetBound)return this.reject();}
  else if(name==='detectionReceiptInsert'){if(values[2]!==this.armedCandidate||values[3]!=='undo'||values[12]!==this.armedReceipt||!this.targetBound)return this.reject();}
  else if(name==='detectionFeedbackSupersede'){if(values[1]!==this.armedCandidate||values[3]!==this.armedReceipt||!this.targetBound)return this.reject();}
  else return this.reject();
  this.count(name,name==='detectionReceiptLock'?3:1);
 }
 private queueAdvance():void{const ticket=this.generation;queueMicrotask(()=>{if(ticket===this.generation)this.advance();});this.fired=true;}
 verified(owner:string,session:string):void{
  this.verifiedSession=session;
  if(!this.scenario)return;this.verifies++;if(this.verifies>5)return failure();
  if(owner!==this.armedOwner||session!==this.armedSession)return this.reject();
  if(this.verifies>=3&&!this.targetBound)return this.reject();
  if(this.verifies===4)this.count('authorityTokenBeforeCommit');
  if(this.verifies===5)this.count('authorityTokenFinalGuard');
  if(this.verifies===4&&this.scenario==='undo-expiry-beforecommit-microtask')this.queueAdvance();
  if(this.verifies===5&&this.scenario==='undo-expiry-finalverify-sync')this.advance();
  if(this.verifies===5&&this.scenario==='undo-finalverify-microtask-order')this.queueAdvance();
 }
 async query<T extends {command:string;rowCount:number|null}>(sql:string,values:readonly unknown[]|undefined,execute:(sql:string)=>Promise<T>):Promise<T>{
  if(this.scenario)this.queryBinding(sql,values);
  if(sql==='BEGIN ISOLATION LEVEL READ COMMITTED'){this.epochs=0;this.pending=undefined;}
  if(this.scenario&&sql==='COMMIT'){
   if(!this.targetBound)return this.reject();this.count('commitDispatch');
   if(this.scenario==='review-commit-before'){this.count('rollbackDispatch');this.fired=true;await execute('ROLLBACK');return failure();}
   if(this.scenario==='review-commit-after'){const result=await execute(sql);this.promote();this.fired=true;void result;return failure();}
   if(this.scenario==='undo-finalverify-microtask-order')this.commitBeforeTick=!this.tick;
  }
  if(this.scenario&&sql==='ROLLBACK'){
   this.count('rollbackDispatch');
   if(this.scenario==='undo-expiry-rollback-before'){if(!this.targetBound||!this.fired)return this.reject();return failure();}
   if(this.scenario==='undo-expiry-rollback-after'){if(!this.targetBound||!this.fired)return this.reject();await execute(sql);return failure();}
  }
  const result=await execute(sql);
  if(this.scenario&&sql===PRIVATE_MOBILE_DETECTION_STATEMENTS.detectionCandidateLock){if(result.command!=='SELECT'||result.rowCount!==1)return this.reject();if(this.scenario==='undo-equality-entry')this.advance();}
  if(this.enabled()&&sql===PRIVATE_MOBILE_DETECTION_STATEMENTS.detectionReceiptInsert&&result.command==='INSERT'&&result.rowCount===1&&values&&['confirm','reject'].includes(values[3] as string)){
   const [owner,receipt,candidate]=values;const deadline=Date.parse(values[11] as string);
   if([owner,receipt,candidate,this.verifiedSession].some(x=>typeof x!=='string')||!Number.isSafeInteger(deadline))return failure();
   this.pending=Object.freeze({owner:owner as string,session:this.verifiedSession!,receipt:receipt as string,candidate:candidate as string,deadline});
  }
  if(sql==='COMMIT')this.promote();
  if(sql==='ROLLBACK')this.pending=undefined;
  if(this.scenario&&sql===PRIVATE_MOBILE_DETECTION_STATEMENTS.detectionFinalFence&&['undo-expiry-after-final-fence','undo-expiry-rollback-before','undo-expiry-rollback-after'].includes(this.scenario))this.advance();
  if(sql===EPOCH_SQL){this.epochs++;if(this.scenario&&this.epochs>=2){if(!this.targetBound)return this.reject();this.count('authorityEpochAfterWork');if(this.scenario==='undo-expiry-after-epoch')this.advance();}}
  return result;
 }
 private promote(){if(this.pending){this.original=this.pending;this.pending=undefined;}}
 released(error:boolean):void{if(this.scenario&&error)this.discarded=true;}
 observation(){return Object.freeze({fired:this.fired,commitBeforeTick:this.commitBeforeTick,discarded:this.discarded,verifies:this.verifies,boundaries:Object.freeze({...this.counts})});}
 clear():void{this.generation++;this.scenario=undefined;this.pending=undefined;this.verifies=0;this.epochs=0;}
}

type Bucket = 'zero' | 'one' | 'multiple';
type Status = 'accepted202' | 'rejected4xx' | 'failed5xx' | 'other' | 'incomplete';
export type OwnedOtpStartObservation = Readonly<Record<Status | 'arrivals', Bucket>>;
type OtpStatus='400'|'409'|'429'|'OTHER';
type OtpCode='INVALID_MOBILE_REQUEST'|'AUTH_RESTART_REQUIRED'|'OTHER';
type OtpResponse=Readonly<{state:'unavailable'|'incomplete'|'complete';status:OtpStatus;code:OtpCode}>;
const otpStatus=(status:number):OtpStatus=>status===400?'400':status===409?'409':status===429?'429':'OTHER';
function otpCode(status:OtpStatus,body:unknown):OtpCode{
  if(status==='OTHER'||typeof body!=='string'||body.length>4096)return 'OTHER';
  const title=status==='400'?'Bad Request':status==='409'?'Conflict':'Too Many Requests';
  for(const code of ['INVALID_MOBILE_REQUEST','AUTH_RESTART_REQUIRED'] as const)
    if(body===JSON.stringify({type:'about:blank',title,status:Number(status),code}))return code;
  return 'OTHER';
}
/** Only the owned adapter's canonical single-string end is classified; all other forms stay opaque. */
function observeOtpEnd(response:ServerResponse,active:()=>boolean,record:(status:OtpStatus,code:OtpCode)=>void):()=>void{
  const own=Object.getOwnPropertyDescriptor(response,'end');
  if(own&&(!('value'in own)||!own.configurable))return()=>{};
  const original=own?own.value:response.end;
  if(typeof original!=='function'||!Object.isExtensible(response))return()=>{};
  let attempted=false;
  function end(this:ServerResponse,...args:unknown[]){
    if(this===response&&active()){
      const status=otpStatus(response.statusCode);
      record(status,!attempted&&!response.headersSent&&args.length===1?otpCode(status,args[0]):'OTHER');attempted=true;
    }
    try{return Reflect.apply(original,this,args);}
    catch(error){if(this===response&&active())record('OTHER','OTHER');throw error;}
  }
  Object.defineProperty(response,'end',{configurable:true,writable:true,enumerable:own?.enumerable??false,value:end});
  return()=>{if(own)Object.defineProperty(response,'end',own);else Reflect.deleteProperty(response,'end');};
}
const bucket = (count: number): Bucket => count === 0 ? 'zero' : count === 1 ? 'one' : 'multiple';

/** Passive owned-fixture diagnostics only. Never reads bodies, headers or identifiers. */
export function createOwnedOtpStartObserver() {
  let generation = 0;
  let server: Server | undefined;
  let requestListener: ((input: IncomingMessage, response: ServerResponse) => void) | undefined;
  let arrivals = 0;
  let firstResponse:OtpResponse=Object.freeze({state:'unavailable',status:'OTHER',code:'OTHER'});
  const counts: Record<Status, number> = { accepted202: 0, rejected4xx: 0, failed5xx: 0, other: 0, incomplete: 0 };
  // Response handles exist solely to remove these two listeners during teardown.
  const pending = new Map<ServerResponse, () => void>();
  function stop() {
    generation++;
    if (server && requestListener) server.removeListener('request', requestListener);
    requestListener = undefined;
    server = undefined;
    for (const remove of pending.values()) remove();
    pending.clear();
    arrivals = 0;
    firstResponse=Object.freeze({state:'unavailable',status:'OTHER',code:'OTHER'});
    for (const status of Object.keys(counts) as Status[]) counts[status] = 0;
  }
  function request(ticket: number, input: IncomingMessage, response: ServerResponse) {
    if (!server || ticket !== generation || input.method !== 'POST' || input.url !== '/v2/auth/otp/start') return;
    const first=arrivals===0;let status:OtpStatus='OTHER',code:OtpCode='OTHER',restoreEnd=()=>{};
    arrivals++;
    if(first)firstResponse=Object.freeze({state:'incomplete',status:'OTHER',code:'OTHER'});
    const active=()=>!!server&&ticket===generation&&pending.has(response);
    function remove() {
      restoreEnd();
      response.removeListener('finish', finish);
      response.removeListener('close', close);
    }
    function record(status: Status) {
      if (!server || ticket !== generation || !pending.has(response)) return;
      remove();
      pending.delete(response);
      counts[status]++;
    }
    function finish() {
      const observed = response.statusCode;
      if(first&&active())firstResponse=Object.freeze({state:'complete',status:otpStatus(observed),code:otpStatus(observed)===status?code:'OTHER'});
      record(observed === 202 ? 'accepted202' : observed >= 400 && observed <= 499 ? 'rejected4xx' : observed >= 500 && observed <= 599 ? 'failed5xx' : 'other');
    }
    function close() { record('incomplete'); }
    pending.set(response, remove);
    if(first)restoreEnd=observeOtpEnd(response,active,(nextStatus,nextCode)=>{status=nextStatus;code=nextCode;});
    response.on('finish', finish);
    response.on('close', close);
  }
  return Object.freeze({
    attach(next: Server) {
      stop(); server = next; const ticket = generation;
      requestListener = (input, response) => request(ticket, input, response);
      server.on('request', requestListener);
    },
    stop,
    firstResponse():OtpResponse{return firstResponse;},
    observation(): OwnedOtpStartObservation {
      return Object.freeze({ arrivals: bucket(arrivals), accepted202: bucket(counts.accepted202), rejected4xx: bucket(counts.rejected4xx), failed5xx: bucket(counts.failed5xx), other: bucket(counts.other), incomplete: bucket(counts.incomplete + pending.size) });
    },
  });
}

type ManualStatus = 'finished201' | 'rejected4xx' | 'failed5xx' | 'other' | 'incomplete';
export type OwnedManualSaveObservation = Readonly<Record<ManualStatus | 'arrivals', Bucket>>;

/** Passive owned-fixture diagnostics only. Never reads bodies, headers or identifiers. */
export function createOwnedManualSaveObserver() {
  let generation = 0;
  let server: Server | undefined;
  let requestListener: ((input: IncomingMessage, response: ServerResponse) => void) | undefined;
  let arrivals = 0;
  const counts: Record<ManualStatus, number> = { finished201: 0, rejected4xx: 0, failed5xx: 0, other: 0, incomplete: 0 };
  // Response handles exist solely to remove these two listeners during teardown.
  const pending = new Map<ServerResponse, () => void>();
  function stop() {
    generation++;
    if (server && requestListener) server.removeListener('request', requestListener);
    requestListener = undefined;
    server = undefined;
    for (const remove of pending.values()) remove();
    pending.clear();
    arrivals = 0;
    for (const status of Object.keys(counts) as ManualStatus[]) counts[status] = 0;
  }
  function request(ticket: number, input: IncomingMessage, response: ServerResponse) {
    if (!server || ticket !== generation || input.method !== 'POST' || input.url !== '/v2/private/mobile/subscriptions/owner/manual') return;
    arrivals = Math.min(2, arrivals + 1);
    function remove() {
      response.removeListener('finish', finish);
      response.removeListener('close', close);
    }
    function record(status: ManualStatus) {
      if (!server || ticket !== generation || !pending.has(response)) return;
      remove();
      pending.delete(response);
      counts[status] = Math.min(2, counts[status] + 1);
    }
    function finish() {
      const status = response.statusCode;
      record(status === 201 ? 'finished201' : status >= 400 && status <= 499 ? 'rejected4xx' : status >= 500 && status <= 599 ? 'failed5xx' : 'other');
    }
    function close() { record('incomplete'); }
    pending.set(response, remove);
    response.on('finish', finish);
    response.on('close', close);
  }
  return Object.freeze({
    attach(next: Server) {
      stop(); server = next; const ticket = generation;
      requestListener = (input, response) => request(ticket, input, response);
      server.on('request', requestListener);
    },
    stop,
    observation(): OwnedManualSaveObservation {
      return Object.freeze({ arrivals: bucket(arrivals), finished201: bucket(counts.finished201), rejected4xx: bucket(counts.rejected4xx), failed5xx: bucket(counts.failed5xx), other: bucket(counts.other), incomplete: bucket(counts.incomplete + pending.size) });
    },
  });
}

/** All owned HTTP requests since the initial graph, without reading any request/response field. */
export function createOwnedAllApiObserver(){
 let attached:Server|undefined,listener:(()=>void)|undefined,attachments=0,count=0,generation=0;
 function stop(){generation++;const old=attached,callback=listener;attached=undefined;listener=undefined;try{if(old&&callback)old.removeListener('request',callback);}catch{/* Unavailable observation cannot change server cleanup. */}}
 function attach(server:Server){stop();attachments++;attached=server;const ticket=generation;listener=()=>{if(attached===server&&generation===ticket)count=Math.min(2,count+1);};try{server.prependListener('request',listener);}catch{stop();}}
 return Object.freeze({attach,stop,observation:()=>Object.freeze({state:attached&&attachments===1?'active':'unavailable',arrivals:bucket(count)})});
}
