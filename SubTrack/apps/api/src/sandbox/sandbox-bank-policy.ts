import {types} from 'node:util';
import {PRIVATE_MOBILE_BUSINESS_STATEMENTS} from '../profile/private-mobile-business.js';
import {PRIVATE_MOBILE_BANK_STATEMENTS,PRIVATE_BANK_PURGE_STATEMENTS} from '../banks/private-mobile-bank-statements.js';
export const SANDBOX_BANK_OPERATIONS=Object.freeze({'bank-read':'read','bank-connect':'connect','bank-sync':'sync','bank-disconnect':'disconnect'} as const);
export function isSandboxBankOperation(name:string):name is keyof typeof SANDBOX_BANK_OPERATIONS{return Object.hasOwn(SANDBOX_BANK_OPERATIONS,name);}
const statements=Object.freeze({...PRIVATE_MOBILE_BUSINESS_STATEMENTS,...PRIVATE_MOBILE_BANK_STATEMENTS});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail=():never=>{throw new Error('Sandbox statement unavailable');};
/** Fixed source-owned SQL only. No SQL text or owner selector is supplied by the public request. */
export function sandboxStatement(name:string,values:readonly unknown[],owner:string):Readonly<{sql:string;values:readonly unknown[]}>{
 if(typeof owner!=='string'||!uuid.test(owner)||typeof name!=='string'||!Object.hasOwn(statements,name)||!Array.isArray(values)||types.isProxy(values)||Object.getPrototypeOf(values)!==Array.prototype)return fail();
 const descriptors=Object.getOwnPropertyDescriptors(values),length=Object.getOwnPropertyDescriptor(values,'length')!.value as number;
 if(Reflect.ownKeys(descriptors).length!==length+1)return fail();
 const copy:unknown[]=[];
 for(let i=0;i<length;i++){
  const d=descriptors[String(i)];if(!d||!('value'in d)||!d.enumerable)return fail();
  const value:unknown=d.value;
  if(value!==null&&typeof value==='object'&&types.isProxy(value))return fail();
  if(value!==null&&typeof value!=='string'&&typeof value!=='boolean'&&typeof value!=='bigint'&&!(typeof value==='number'&&Number.isSafeInteger(value))&&!Buffer.isBuffer(value))return fail();
  copy.push(value);
 }
 if(name==='manualIdMint'?length!==0:copy[name==='manualSubscriptionInsert'?1:0]!==owner)return fail();
 const sql=statements[name as keyof typeof statements];
 if(Object.hasOwn(PRIVATE_BANK_PURGE_STATEMENTS,name)){
  if(sql!==PRIVATE_BANK_PURGE_STATEMENTS[name as keyof typeof PRIVATE_BANK_PURGE_STATEMENTS]||length!==2||typeof copy[1]!=='string'||!uuid.test(copy[1]))return fail();
 }
 return Object.freeze({sql,values:Object.freeze(copy)});
}
