import {createHash,randomBytes} from 'node:crypto';
import type {MobileEnrollmentIssuance} from '../proofs-v2/otp-proof-producer.js';
import type {ProofStore} from '../proofs-v2/proof-store.js';
const fail=():never=>{throw new Error('AUTH_RESTART_REQUIRED');};
const digest=(proof:string):string=>createHash('sha256').update('subtrack:private-mobile:admission:v1:').update(proof).digest('hex');
export interface PrivateMobileEnrollmentAdmissionPort{
 reserve(issuance:MobileEnrollmentIssuance):string;
 prepare(slot:string,proof:string,issuance:MobileEnrollmentIssuance):void;
 publish(slot:string):void;
 abandon(slot:string):void;
}
/** Bounded process-local prerequisite only; it never stores account/session authority. */
export class PrivateMobileEnrollmentAdmission implements PrivateMobileEnrollmentAdmissionPort{
 private readonly slots=new Map<string,Readonly<MobileEnrollmentIssuance>>();
 private readonly prepared=new Map<string,string>();
 private readonly admissions=new Map<string,Readonly<MobileEnrollmentIssuance>>();
 private lastNow=-1;
 constructor(private readonly proofs:Pick<ProofStore,'consume'>,private readonly clock:()=>number,private readonly capacity=10_000){
  if(typeof proofs?.consume!=='function'||typeof clock!=='function'||!Number.isSafeInteger(capacity)||capacity<1||capacity>10_000)fail();
 }
 private now():number{
  const now=this.clock();if(!Number.isSafeInteger(now)||now<0||now<this.lastNow)fail();this.lastNow=now;
  for(const [key,value]of this.slots)if(now>=value.expiresAt){this.slots.delete(key);this.prepared.delete(key);}
  for(const [key,value]of this.admissions)if(now>=value.expiresAt)this.admissions.delete(key);
  return now;
 }
 reserve(issuance:MobileEnrollmentIssuance):string{
  const now=this.now();
  if(issuance.transport!=='mobile'||issuance.purpose!=='enroll_identifier'||!/^[a-f0-9]{64}$/.test(issuance.identifierHash)||!['sms','email'].includes(issuance.channel)||
   !/^[A-Za-z0-9_-]{43}$/.test(issuance.challengeId)||!Number.isSafeInteger(issuance.issuedAt)||issuance.issuedAt>now||issuance.expiresAt!==issuance.issuedAt+300_000||now>=issuance.expiresAt||this.slots.size+this.admissions.size>=this.capacity)fail();
  const slot=randomBytes(32).toString('base64url');this.slots.set(slot,Object.freeze({...issuance}));return slot;
 }
 prepare(slot:string,proof:string,issuance:MobileEnrollmentIssuance):void{
  const now=this.now();const reserved=this.slots.get(slot);
  if(!reserved||JSON.stringify(reserved)!==JSON.stringify(issuance)||!/^v2\.[A-Za-z0-9_-]{43}$/.test(proof)||now>=reserved.expiresAt||this.admissions.has(digest(proof)))return fail();
  this.prepared.set(slot,digest(proof));
 }
 publish(slot:string):void{
  const now=this.now();const reserved=this.slots.get(slot),hash=this.prepared.get(slot);
  if(!reserved||!hash||now>=reserved.expiresAt||this.admissions.has(hash))return fail();
  this.slots.delete(slot);this.prepared.delete(slot);this.admissions.set(hash,reserved);
 }
 abandon(slot:string):void{this.slots.delete(slot);this.prepared.delete(slot);}
 async consume(proof:string):Promise<Readonly<MobileEnrollmentIssuance>>{
  const now=this.now();if(!/^v2\.[A-Za-z0-9_-]{43}$/.test(proof))fail();const key=digest(proof);const admission=this.admissions.get(key);
  if(!admission||now>=admission.expiresAt)return fail();this.admissions.delete(key);
  const valid=await this.proofs.consume(proof,{purpose:'enrollment',challenge:admission.challengeId,transport:'mobile',identifierHash:admission.identifierHash});
  if(valid.valid!==true||this.now()>=admission.expiresAt)fail();return admission;
 }
}
