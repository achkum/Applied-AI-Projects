import {AssertionError} from 'node:assert';
export const PRIVATE_BANK_PROOF_PHASES=Object.freeze(['START','CONNECT','SYNC','RESTART','TWO_OWNER','EXPIRED_SESSION','RETAIN','RECONNECT','DEPENDENCY','PURGE','RLS_NEGATIVE','UNCERTAINTY','LOGOUT'] as const);
export type PrivateBankProofPhase=typeof PRIVATE_BANK_PROOF_PHASES[number];
export const PRIVATE_BANK_TWO_OWNER_STEPS=Object.freeze([
 'A_SNAPSHOT','B_SESSION','B_DISTINCT','B_PROFILE_GATE','B_PROFILE_PATCH','B_MODE','B_EMPTY_READ','PUBLIC_SELECTOR','B_EMPTY_SNAPSHOT',
 'B_TO_A_SYNC','B_TO_A_SYNC_SNAPSHOT','B_TO_A_RETAIN','B_TO_A_RETAIN_SNAPSHOT','B_TO_A_PURGE','B_TO_A_PURGE_SNAPSHOT',
 'B_CONNECT','B_SYNC','B_POSITIVE_READ','A_POSITIVE_READ','B_POSITIVE_SNAPSHOT',
 'A_TO_B_SYNC','A_TO_B_SYNC_SNAPSHOT','A_TO_B_RETAIN','A_TO_B_RETAIN_SNAPSHOT','A_TO_B_PURGE','A_TO_B_PURGE_SNAPSHOT',
 'B_PURGE','B_EMPTY_AFTER_PURGE','B_LOGOUT','B_LOGOUT_DENIED','A_FINAL_SNAPSHOT','TWO_OWNER_COUNTS',
] as const);
export type PrivateBankTwoOwnerStep=typeof PRIVATE_BANK_TWO_OWNER_STEPS[number];
const SQL_CATEGORIES=Object.freeze({
 '42501':'PERMISSION','42703':'UNDEFINED_COLUMN','42P01':'UNDEFINED_TABLE','23503':'FOREIGN_KEY','23505':'UNIQUE','23514':'CHECK',
 '23502':'NOT_NULL','42804':'TYPE_MISMATCH','22P02':'INVALID_INPUT','22003':'NUMERIC_RANGE','40001':'SERIALIZATION','40P01':'DEADLOCK',
} as const);
type SqlCategory=typeof SQL_CATEGORIES[keyof typeof SQL_CATEGORIES];
export type PrivateBankFailureCategory=SqlCategory|'ASSERTION'|'OTHER';
const CATEGORIES=Object.freeze([...Object.values(SQL_CATEGORIES),'ASSERTION','OTHER']);
const legacy=new RegExp(`^ST248_BANK_PROOF_FAILURE phase=(${PRIVATE_BANK_PROOF_PHASES.join('|')})$`);
const expanded=new RegExp(`^ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=(${PRIVATE_BANK_TWO_OWNER_STEPS.join('|')}) category=(${CATEGORIES.join('|')})$`);
function isStep(value:unknown):value is PrivateBankTwoOwnerStep{return typeof value==='string'&&(PRIVATE_BANK_TWO_OWNER_STEPS as readonly string[]).includes(value);}
/** Inspect only an actual Error's own data-property code; accessors/proxies and unknown codes disclose nothing. */
function knownSqlCategory(error:unknown):SqlCategory|null{
 try{
  if(!(error instanceof Error))return null;
  const descriptor=Object.getOwnPropertyDescriptor(error,'code');
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string'||!Object.hasOwn(SQL_CATEGORIES,descriptor.value))return null;
  return SQL_CATEGORIES[descriptor.value as keyof typeof SQL_CATEGORIES];
 }catch{return null;}
}
export function privateBankFailureCategory(error:unknown):PrivateBankFailureCategory{
 try{if(error instanceof AssertionError)return 'ASSERTION';}catch{return 'OTHER';}
 return knownSqlCategory(error)??'OTHER';
}
export function safePrivateBankFailure(value:unknown):value is string{return typeof value==='string'&&!value.includes('\n')&&!value.includes('\r')&&(legacy.test(value)||expanded.test(value));}
export function privateBankFailureLabel(phase:PrivateBankProofPhase,step:unknown,category:unknown):string{
 const fallback=`ST248_BANK_PROOF_FAILURE phase=${phase}`;
 if(!(PRIVATE_BANK_PROOF_PHASES as readonly string[]).includes(phase))throw new Error('Bank proof diagnostic unavailable');
 return phase==='TWO_OWNER'&&isStep(step)&&typeof category==='string'&&CATEGORIES.includes(category as PrivateBankFailureCategory)
  ?`ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=${step} category=${category}`:fallback;
}
/** Owned fixture RAM only; frames contain a fixed step, opaque graph generation and at most one recognized enum. */
export class OwnedPrivateBankDiagnostics{
 private generation:symbol|null=null;
 private frame:Readonly<{generation:symbol;step:PrivateBankTwoOwnerStep}>|null=null;
 private first:SqlCategory|null=null;
 startGraph():void{this.generation=Symbol();this.clearStep();}
 stopGraph():void{this.generation=null;this.clearStep();}
 clearStep():void{this.frame=null;this.first=null;}
 beginStep(step:PrivateBankTwoOwnerStep):void{
  if(this.generation===null||!isStep(step))throw new Error('Bank proof diagnostic unavailable');
  this.frame=Object.freeze({generation:this.generation,step});this.first=null;
 }
 captureQueryFailure():((error:unknown)=>void){
  const frame=this.frame;
  return error=>{
   if(frame===null||frame!==this.frame||frame.generation!==this.generation||this.first!==null)return;
   const category=knownSqlCategory(error);if(category!==null)this.first=category;
  };
 }
 async observedQuery<T>(query:()=>Promise<T>|T):Promise<T>{
  const observe=this.captureQueryFailure();try{return await query();}catch(error){observe(error);throw error;}
 }
 failureCategory(step:PrivateBankTwoOwnerStep):SqlCategory|null{return this.frame?.step===step?this.first:null;}
}
