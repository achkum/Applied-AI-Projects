import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {V2AccessToken} from '../sessions-v2/v2-access-token.js';
import type {PrivateMobileEnrollmentAdmission} from './enrollment-admission.js';
import {DurablePrivateMobileAuthority} from './durable-mobile-authority.js';
import {PrivateMobileSubjectVerifier,type VerifiedMobileSubjectBinding} from './verified-subject-binding.js';
const fail=():never=>{throw new Error('AUTH_RESTART_REQUIRED');};
const proofHash=(value:string):string=>createHash('sha256').update('subtrack:auth-proof:v2:').update(value).digest('hex');
const refreshHash=(value:string):string=>createHash('sha256').update('subtrack:auth-refresh:v2:').update(value).digest('hex');
const requestHash=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function hasCapacity(result:{command:string;rowCount:number|null;rows:Record<string,unknown>[]}):boolean{
 const value=result.rows[0]?.n;if(result.command!=='SELECT'||result.rowCount!==1||result.rows.length!==1||typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,18})$/.test(value))return fail();return BigInt(value)<10000n;
}
export type PrivateMobileCredentials=Readonly<{transport:'mobile';sessionId:string;accessToken:string;refreshToken:string}>;
export class DurablePrivateMobileSessions{
 constructor(private readonly authority:DurablePrivateMobileAuthority,private readonly subjects:PrivateMobileSubjectVerifier,private readonly admission:PrivateMobileEnrollmentAdmission,private readonly tokens:Pick<V2AccessToken,'issue'>){
  if(typeof tokens?.issue!=='function')return fail();this.tokens=Object.freeze({issue:tokens.issue.bind(tokens)});
 }
 private async reserve(binding:VerifiedMobileSubjectBinding,operation:'complete-enrollment'|'verify-login'|'create-session',key:string,body:unknown):Promise<void>{
  const input=this.subjects.reserveInput(binding,operation,key,requestHash(body));
  const admitted=await this.authority.transaction('subtrack_auth_producer',async client=>{
   this.subjects.validate(binding);await client.query('SELECT pg_catalog.pg_advisory_xact_lock(244,1)');
   await client.query('DELETE FROM st244_mobile.reservation WHERE expires_ms<=$1::bigint',[this.authority.now()]);
   const capacity=await client.query('SELECT count(*)::text AS n FROM st244_mobile.reservation');if(!hasCapacity(capacity))return fail();
   const result=await client.query("INSERT INTO st244_mobile.reservation(key_h,authority_h,request_h,operation,epoch,manifest_h,verified_ms,expires_ms,authority_kind) VALUES($1,$2,$3,$4,$5,$6,$7::bigint,$8::bigint,'verified-mobile-subject') ON CONFLICT DO NOTHING",[input.keyDigest,binding.authorityDigest,input.requestDigest,operation,binding.epoch,binding.manifestHash,binding.verifiedAt,this.authority.now()+86400000]);
   if(result.command!=='INSERT'||(result.rowCount!==0&&result.rowCount!==1))return fail();this.subjects.validate(binding);return result.rowCount===1;
  },()=>this.subjects.validate(binding));
  if(!admitted)return fail();
 }
 private async scope(client:PoolClient,id:string):Promise<void>{
  await client.query('SET LOCAL ROLE subtrack_runtime');await client.query("SELECT pg_catalog.set_config('app.user_id',$1,true),pg_catalog.set_config('app.current_user_id',$1,true)",[id]);
  const active=await client.query('SELECT id::text AS id FROM public.identity WHERE id=$1::uuid AND deleted_at IS NULL FOR UPDATE',[id]);if(active.rowCount!==1||active.rows[0]?.id!==id)return fail();
 }
 private async createSession(client:PoolClient,identityId:string):Promise<PrivateMobileCredentials>{
  const sessionId=randomUUID(),familyId=randomUUID(),refreshToken=`v2r.${randomBytes(32).toString('base64url')}`,now=this.authority.now();
  const accessToken=this.tokens.issue(identityId,sessionId);
  await client.query('SET LOCAL ROLE subtrack_auth_producer');await client.query('DELETE FROM st244_mobile.session WHERE expires_ms<=$1::bigint',[now]);
  const count=await client.query('SELECT count(*)::text AS n FROM st244_mobile.session');if(!hasCapacity(count))return fail();await client.query('SET LOCAL ROLE subtrack_runtime');
  const result=await client.query('INSERT INTO st244_mobile.session(id,identity_id,family_id,generation,refresh_h,created_ms,expires_ms) VALUES($1::uuid,$2::uuid,$3::uuid,0,$4,$5::bigint,$6::bigint)',[sessionId,identityId,familyId,refreshHash(refreshToken),now,now+86400000]);
  if(result.rowCount!==1)return fail();return Object.freeze({transport:'mobile',sessionId,accessToken,refreshToken});
 }
 async complete(enrollmentProof:string,locale:'sv'|'en',key:string):Promise<PrivateMobileCredentials|Readonly<{loginRequired:true}>>{
  const admitted=await this.admission.consume(enrollmentProof);
  const binding=await this.subjects.verify();
  await this.reserve(binding,'complete-enrollment',key,{transport:'mobile',enrollmentProof,locale});
  return this.authority.transaction('subtrack_auth_producer',async client=>{
   this.subjects.validate(binding);await client.query('SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,244))',[binding.subjectHmac]);
   await client.query('SET LOCAL ROLE subtrack_identity_provisioner');
   const existing=await client.query('SELECT id::text AS id FROM public.identity WHERE external_id=$1::text',[binding.subjectHmac]);
   if(existing.rowCount===1){await this.scope(client,existing.rows[0]!.id as string);return {loginRequired:true} as const;}
   if(existing.rowCount!==0)return fail();
   const identityId=randomUUID();
   if(!binding.givenName||!binding.surname)return fail();
   const inserted=await client.query("INSERT INTO public.identity(id,external_id,auth_method,verified_at,given_name,surname,updated_at) VALUES($1::uuid,$2::text,'BANKID',$3::timestamptz,$4::text,$5::text,pg_catalog.clock_timestamp())",[identityId,binding.subjectHmac,binding.verifiedAtIso,binding.givenName,binding.surname]);if(inserted.rowCount!==1)return fail();
   await this.scope(client,identityId);
   const profile=await client.query("INSERT INTO public.identity_profile(identity_id,display_name,avatar_color,avatar_emoji,language,theme,default_currency,profile_complete) VALUES($1::uuid,NULL,NULL,NULL,$2::text,'system','SEK',false)",[identityId,locale]);if(profile.rowCount!==1)return fail();
   // Keep the owner-scoped runtime role: its existing principal function grant enforces contact insertion.
   // The identifier remains a private verified hash; it never supplies the person identity.
   const linked=await client.query('INSERT INTO st244_mobile.verified_contact(identity_id,identifier_h,channel) VALUES($1::uuid,$2::text,$3::text)',[identityId,admitted.identifierHash,admitted.channel]);if(linked.rowCount!==1)return fail();
   const result=await this.createSession(client,identityId);this.subjects.validate(binding);return result;
  },()=>this.subjects.validate(binding));
 }
 async verifyLogin(demoIdentity:'alice'|'bob',key:string):Promise<Readonly<{transport:'mobile';loginProof:string;status:'verified'}>>{
  const binding=await this.subjects.verify(demoIdentity);await this.reserve(binding,'verify-login',key,{transport:'mobile',demoIdentity});
  return this.authority.transaction('subtrack_auth_producer',async client=>{
   this.subjects.validate(binding);await client.query('SET LOCAL ROLE subtrack_identity_provisioner');const owner=await client.query('SELECT id::text AS id FROM public.identity WHERE external_id=$1',[binding.subjectHmac]);if(owner.rowCount!==1)return fail();
   const identityId=owner.rows[0]!.id as string;await this.scope(client,identityId);await client.query('SET LOCAL ROLE subtrack_auth_producer');
   await client.query('DELETE FROM st244_mobile.login_proof WHERE expires_ms<=$1::bigint',[this.authority.now()]);
   const count=await client.query('SELECT count(*)::text AS n FROM st244_mobile.login_proof');if(!hasCapacity(count))return fail();
   const loginProof=`v2.${randomBytes(32).toString('base64url')}`;
   const saved=await client.query('INSERT INTO st244_mobile.login_proof(proof_h,identity_id,subject_h,authority_h,epoch,manifest_h,verified_ms,expires_ms) VALUES($1,$2::uuid,$3,$4,$5,$6,$7::bigint,$8::bigint)',[proofHash(loginProof),identityId,binding.subjectHmac,binding.authorityDigest,binding.epoch,binding.manifestHash,binding.verifiedAt,binding.expiresAt]);if(saved.rowCount!==1)return fail();this.subjects.validate(binding);
   return {transport:'mobile',loginProof,status:'verified'};
  },()=>this.subjects.validate(binding));
 }
 async session(loginProof:string,key:string):Promise<PrivateMobileCredentials>{
  if(!/^v2\.[A-Za-z0-9_-]{43}$/.test(loginProof)||!/^[\x21-\x7e]{16,255}$/.test(key))return fail();
  // Read the certified proof under the producer role; raw client data cannot construct a binding.
  const record=await this.authority.transaction('subtrack_auth_producer',async client=>{
   const result=await client.query('SELECT identity_id::text AS identity_id,subject_h,authority_h,epoch,manifest_h,verified_ms::text AS verified_ms,expires_ms::text AS expires_ms FROM st244_mobile.login_proof WHERE proof_h=$1',[proofHash(loginProof)]);
   if(result.command!=='SELECT'||result.rowCount!==result.rows.length||result.rows.length>1)return fail();return result.rows[0]??null;
  });
  if(record===null)return fail();const binding=this.subjects.fromStoredProof(record);
  await this.reserve(binding,'create-session',key,{transport:'mobile',loginProof});
  // Accepted issuer semantics: a known-consumed proof cannot be restored by session mutation rollback.
  const admitted=await this.authority.transaction('subtrack_auth_producer',async client=>{
   this.subjects.validate(binding);const consumed=await client.query('DELETE FROM st244_mobile.login_proof WHERE proof_h=$1 AND identity_id=$2::uuid AND authority_h=$3 AND expires_ms>$4::bigint AND subject_h=$5 AND epoch=$6 AND manifest_h=$7 AND verified_ms=$8::bigint AND expires_ms=$9::bigint RETURNING identity_id::text AS identity_id',[proofHash(loginProof),record.identity_id,binding.authorityDigest,this.authority.now(),binding.subjectHmac,binding.epoch,binding.manifestHash,binding.verifiedAt,binding.expiresAt]);
   if(consumed.command!=='DELETE'||consumed.rowCount!==consumed.rows.length||consumed.rows.length>1)return fail();if(consumed.rows.length===0)return false;if(consumed.rows[0]?.identity_id!==record.identity_id)return fail();return true;
  },()=>this.subjects.validate(binding));
  if(!admitted)return fail();
  return this.authority.transaction('subtrack_auth_producer',async client=>{
   this.subjects.validate(binding);await client.query('SET LOCAL ROLE subtrack_identity_provisioner');const bound=await client.query('SELECT id::text AS id FROM public.identity WHERE id=$1::uuid AND external_id=$2::text',[record.identity_id,binding.subjectHmac]);if(bound.rowCount!==1)return fail();
   await this.scope(client,record.identity_id as string);const credentials=await this.createSession(client,record.identity_id as string);this.subjects.validate(binding);return credentials;
  },()=>this.subjects.validate(binding));
 }
 async refresh(refreshToken:string,key:string):Promise<PrivateMobileCredentials>{
  if(!/^v2r\.[A-Za-z0-9_-]{43}$/.test(refreshToken)||!/^[\x21-\x7e]{16,255}$/.test(key))return fail();
  const hash=refreshHash(refreshToken);let finalCheck:(()=>Promise<void>)|undefined;
  const result=await this.authority.transaction('subtrack_auth_producer',async client=>{
   await client.query('SELECT pg_catalog.pg_advisory_xact_lock(244,2)');const now=this.authority.now();
   await client.query('DELETE FROM st244_mobile.consumed_refresh WHERE expires_ms<=$1::bigint',[now]);
   const prior=await client.query('SELECT session_id::text AS id FROM st244_mobile.consumed_refresh WHERE refresh_h=$1',[hash]);
   if(prior.rowCount===1){await client.query('UPDATE st244_mobile.session SET revoked_ms=$2::bigint WHERE id=$1::uuid AND revoked_ms IS NULL',[prior.rows[0]!.id,now]);return null;}
   const session=await client.query('SELECT id::text AS id,identity_id::text AS identity_id,family_id::text AS family_id,generation::text AS generation,expires_ms::text AS expires_ms FROM st244_mobile.session WHERE refresh_h=$1 AND revoked_ms IS NULL AND expires_ms>$2::bigint FOR UPDATE',[hash,now]);if(session.rowCount!==1)return null;
   const owner=session.rows[0]!;await this.scope(client,owner.identity_id as string);await client.query('SET LOCAL ROLE subtrack_auth_producer');
   await client.query('DELETE FROM st244_mobile.reservation WHERE expires_ms<=$1::bigint',[now]);
   const reservations=await client.query('SELECT count(*)::text AS n FROM st244_mobile.reservation');if(!hasCapacity(reservations))return fail();
   const burned=await client.query("INSERT INTO st244_mobile.reservation(key_h,authority_h,request_h,operation,epoch,manifest_h,verified_ms,expires_ms,authority_kind) SELECT $1,$2,$3,'refresh',id,manifest_h,$4::bigint,$5::bigint,'verified-mobile-principal' FROM st244_mobile.epoch WHERE id='st244-mobile-private-v1' AND active=true ON CONFLICT DO NOTHING",[this.subjects.keyDigest(key),hash,requestHash({transport:'mobile',refreshHash:hash}),now,now+86400000]);if(burned.command!=='INSERT'||(burned.rowCount!==0&&burned.rowCount!==1))return fail();if(burned.rowCount===0)return null;
   const count=await client.query('SELECT count(*)::text AS n FROM st244_mobile.consumed_refresh');if(!hasCapacity(count))return fail();
   const inserted=await client.query('INSERT INTO st244_mobile.consumed_refresh(refresh_h,session_id,identity_id,expires_ms) VALUES($1,$2::uuid,$3::uuid,$4::bigint)',[hash,owner.id,owner.identity_id,owner.expires_ms]);if(inserted.rowCount!==1)return fail();
   const next=`v2r.${randomBytes(32).toString('base64url')}`;const nextHash=refreshHash(next);const updated=await client.query('UPDATE st244_mobile.session SET refresh_h=$2,generation=generation+1 WHERE id=$1::uuid AND refresh_h=$3 AND revoked_ms IS NULL',[owner.id,nextHash,hash]);if(updated.rowCount!==1)return fail();
   finalCheck=async()=>{
    await this.scope(client,owner.identity_id as string);await client.query('SET LOCAL ROLE subtrack_auth_producer');
    const current=await client.query('SELECT id::text AS id FROM st244_mobile.session WHERE id=$1::uuid AND identity_id=$2::uuid AND family_id=$3::uuid AND refresh_h=$4 AND generation=$5::bigint AND revoked_ms IS NULL AND expires_ms>$6::bigint FOR UPDATE',[owner.id,owner.identity_id,owner.family_id,nextHash,(BigInt(owner.generation as string)+1n).toString(),this.authority.now()]);
    if(current.rowCount!==1||current.rows[0]?.id!==owner.id)return fail();
    if(this.authority.now()>=Number(owner.expires_ms))return fail();
   };
   return {transport:'mobile' as const,sessionId:owner.id as string,accessToken:this.tokens.issue(owner.identity_id as string,owner.id as string),refreshToken:next};
  },async()=>{await finalCheck?.();});
  if(result===null)return fail();return result;
 }
}
