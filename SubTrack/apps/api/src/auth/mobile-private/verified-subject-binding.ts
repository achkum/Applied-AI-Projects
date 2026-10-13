import {createHmac,timingSafeEqual} from 'node:crypto';
import {DevelopmentEnrollmentPersonVerifier} from '../identity-provider/development-enrollment-person-verifier.js';
const TTL=300_000;
const EPOCH='st244-mobile-private-v1';
const HEX=/^[a-f0-9]{64}$/;
const fail=():never=>{throw new Error('AUTH_RESTART_REQUIRED');};
export type VerifiedMobileSubjectBinding=Readonly<{
 kind:'verified-mobile-subject';verifiedAtIso:string;givenName:string|null;surname:string|null;subjectHmac:string;authorityDigest:string;verifiedAt:number;expiresAt:number;epoch:typeof EPOCH;manifestHash:string;
}>;
export type VerifiedSubjectReservation=Readonly<{
 kind:'verified-mobile-subject-reservation';operation:'complete-enrollment'|'verify-login'|'create-session';
 keyDigest:string;requestDigest:string;binding:VerifiedMobileSubjectBinding;
}>;
/** Separate trusted-subject namespace; deliberately not an anonymous OTP or established-principal core cast. */
export class PrivateMobileSubjectVerifier{
 private readonly key:Buffer;
 private readonly personKey:Buffer;
 private readonly issued=new WeakSet<object>();
 private lastNow=-1;
 constructor(private readonly verifier:DevelopmentEnrollmentPersonVerifier,private readonly clock:()=>number,private readonly manifestHash:string,key:Uint8Array,separateKeys:readonly Uint8Array[],personKey:Uint8Array){
  if(!(verifier instanceof DevelopmentEnrollmentPersonVerifier)||typeof clock!=='function'||!HEX.test(manifestHash)||!(key instanceof Uint8Array)||key.byteLength<32||!Array.isArray(separateKeys)||!(personKey instanceof Uint8Array)||personKey.byteLength<32)fail();
  this.key=Buffer.from(key);this.personKey=Buffer.from(personKey);
  if(this.key.length===this.personKey.length&&timingSafeEqual(this.key,this.personKey))fail();
  for(const other of separateKeys){if(!(other instanceof Uint8Array)||other.byteLength<32)fail();const bytes=Buffer.from(other);if(bytes.length===this.key.length&&timingSafeEqual(bytes,this.key))fail();}
 }
 private now():number{
  const now=this.clock();if(process.env.NODE_ENV!=='development'||!Number.isSafeInteger(now)||now<0||now<this.lastNow||now>Number.MAX_SAFE_INTEGER-TTL)fail();
  this.lastNow=now;return now;
 }
 async verify(demoIdentity:'alice'|'bob'='alice'):Promise<VerifiedMobileSubjectBinding>{
  const started=this.now();const evidence=await this.verifier.verify(demoIdentity);const now=this.now();
  const verifiedAt=Date.parse(evidence.verifiedAt);
  if(evidence.method!=='BANKID'||!HEX.test(evidence.personnummerHmac)||!Number.isSafeInteger(verifiedAt)||verifiedAt<started||verifiedAt>now||now-verifiedAt>=TTL||new Date(verifiedAt).toISOString()!==evidence.verifiedAt)fail();
  // Preserve the accepted enrollment/returning-login subject derivation across native and web.
  const canonical=['subject',evidence.personnummerHmac].map(value=>`${Buffer.byteLength(value,'utf8')}:${value}`).join('');
  const subjectHmac=createHmac('sha256',this.personKey).update(canonical,'utf8').digest('hex');
  const frame=JSON.stringify(['subtrack:private-mobile:verified-subject:v1','mobile',EPOCH,this.manifestHash,subjectHmac,String(verifiedAt)]);
  const binding=Object.freeze({kind:'verified-mobile-subject' as const,verifiedAtIso:evidence.verifiedAt,givenName:evidence.givenName,surname:evidence.surname,subjectHmac,authorityDigest:createHmac('sha256',this.key).update(frame).digest('hex'),verifiedAt,expiresAt:verifiedAt+TTL,epoch:EPOCH,manifestHash:this.manifestHash});
  this.issued.add(binding);return binding;
 }
 validate(binding:VerifiedMobileSubjectBinding):void{
  const now=this.now();if(!this.issued.has(binding)||binding.kind!=='verified-mobile-subject'||binding.epoch!==EPOCH||binding.manifestHash!==this.manifestHash||now<binding.verifiedAt||now>=binding.expiresAt)fail();
 }
 keyDigest(key:string):string{
  if(!/^[\x21-\x7e]{16,255}$/.test(key))return fail();
  return createHmac('sha256',this.key).update(JSON.stringify(['subtrack:private-mobile:reservation-key:v1',key])).digest('hex');
 }
 fromStoredProof(row:Record<string,unknown>):VerifiedMobileSubjectBinding{
  const now=this.now();const verifiedAt=Number(row.verified_ms),expiresAt=Number(row.expires_ms);
  if(typeof row.subject_h!=='string'||!HEX.test(row.subject_h)||typeof row.authority_h!=='string'||!HEX.test(row.authority_h)||row.epoch!==EPOCH||row.manifest_h!==this.manifestHash||
   !Number.isSafeInteger(verifiedAt)||verifiedAt<0||verifiedAt>now||expiresAt!==verifiedAt+TTL||now>=expiresAt)return fail();
  const expected=createHmac('sha256',this.key).update(JSON.stringify(['subtrack:private-mobile:verified-subject:v1','mobile',EPOCH,this.manifestHash,row.subject_h,String(verifiedAt)])).digest('hex');
  if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(row.authority_h,'hex')))return fail();
  const binding=Object.freeze({kind:'verified-mobile-subject' as const,verifiedAtIso:new Date(verifiedAt).toISOString(),givenName:null,surname:null,subjectHmac:row.subject_h,authorityDigest:expected,verifiedAt,expiresAt,epoch:EPOCH,manifestHash:this.manifestHash});this.issued.add(binding);return binding;
 }
 reserveInput(binding:VerifiedMobileSubjectBinding,operation:VerifiedSubjectReservation['operation'],key:string,requestDigest:string):VerifiedSubjectReservation{
  this.validate(binding);
  if(!['complete-enrollment','verify-login','create-session'].includes(operation)||!/^[-\x21-\x7e]{16,255}$/.test(key)||!HEX.test(requestDigest))fail();
  return Object.freeze({kind:'verified-mobile-subject-reservation',operation,keyDigest:this.keyDigest(key),requestDigest,binding});
 }
}
