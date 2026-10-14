import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {createRequire} from 'node:module';
import {SandboxAuthority,SandboxError} from './sandbox-authority.js';
export type SandboxSessionCredentials=Readonly<{transport:'sandbox-mobile';sessionId:string;accessToken:string;refreshToken:string;sessionExpiresAt:number}>;
const wire=createRequire(__filename)('@subtrack/contracts/sandbox-mobile') as {
 parseSandboxRequestKey(value:unknown):string;parseSandboxSecret(value:unknown,kind:'capability'|'refresh'):string;
 parseSandboxBootstrap(value:unknown):Readonly<{transport:'sandbox-mobile';locale:'sv'|'en'}>;parseSandboxTransport(value:unknown):Readonly<{transport:'sandbox-mobile'}>;
 parseSandboxCredentials(value:unknown,bootstrap:false):SandboxSessionCredentials;parseSandboxCredentials(value:unknown,bootstrap:true):SandboxSessionCredentials&Readonly<{installationCapability:string}>;
};
const fail=(kind:SandboxError['kind']='unavailable'):never=>{throw new SandboxError(kind);};
function millis(value:unknown):number{if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(value))return fail();const n=Number(value);if(!Number.isSafeInteger(n)||n<0)return fail();return n;}
export class SandboxSession{
 constructor(private readonly authority:SandboxAuthority,private readonly entropy:(size:number)=>Buffer=randomBytes,private readonly uuid:()=>string=randomUUID){}
 private digest(kind:'capability'|'refresh'|'admission',domain:string,value:string):string{const key=kind==='capability'?this.authority.config.capabilityKey:kind==='refresh'?this.authority.config.refreshKey:this.authority.config.admissionKey;return createHmac('sha256',key).update(`st250-${domain}-v1\0`).update(value).digest('hex');}
 private opaque(kind:'capability'|'refresh'):string{const bytes=this.entropy(32);if(!Buffer.isBuffer(bytes)||bytes.length!==32)return fail();return `${kind==='capability'?'s250c':'s250r'}.${bytes.toString('base64url')}`;}
 private guardIssued(value:SandboxSessionCredentials,owner:string){const claims=this.authority.tokens.verify(value.accessToken),now=this.authority.now();if(claims.sub!==owner||claims.sid!==value.sessionId||now>=claims.exp*1000||now>=value.sessionExpiresAt)return fail('denied');}
 private async reserve(client:PoolClient,operation:'bootstrap'|'resume'|'refresh',body:object,key:string,principal=''){
  const keyHash=this.digest('admission','request-key',wire.parseSandboxRequestKey(key)),requestHash=this.digest('admission','request',JSON.stringify({operation,body,principal}));const r=await client.query("INSERT INTO st250_auth.reservation(key_h,request_h,operation,transport,created_ms) VALUES($1::text,$2::text,$3::text,$4::text,$5::bigint) ON CONFLICT(key_h) DO NOTHING RETURNING key_h",[keyHash,requestHash,operation,'sandbox-mobile',this.authority.now()]);if(r.command!=='INSERT'||r.rowCount!==r.rows.length||r.rows.length>1)return fail();return r.rowCount===1;
 }
 private async capability(client:PoolClient,digest:string){
  const lookup=await client.query('SELECT identity_id::text AS owner FROM st250_auth.capability WHERE digest_h=$1::text',[digest]);if(lookup.rowCount!==1)return fail('denied');const owner=lookup.rows[0].owner as string;await this.authority.scope(client,owner);
  const r=await client.query('SELECT digest_h,expires_ms::text FROM st250_auth.capability WHERE identity_id=$1::uuid AND digest_h=$2::text AND created_ms<=$3::bigint AND expires_ms>$3::bigint AND revoked_ms IS NULL FOR UPDATE',[owner,digest,this.authority.now()]);if(r.rowCount!==1||typeof r.rows[0].digest_h!=='string'||!timingSafeEqual(Buffer.from(r.rows[0].digest_h,'hex'),Buffer.from(digest,'hex')))return fail('denied');return {owner,expires:millis(r.rows[0].expires_ms)};
 }
 private async newSession(client:PoolClient,owner:string,capabilityExpires:number){
  const now=this.authority.now(),expires=Math.min(now+86400000,capabilityExpires),id=this.uuid(),family=this.uuid(),refresh=this.opaque('refresh');if(expires<=now)return fail('denied');
  const r=await client.query('INSERT INTO st250_auth.session(id,identity_id,family_id,refresh_h,created_ms,expires_ms) VALUES($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint,$6::bigint) RETURNING id::text',[id,owner,family,this.digest('refresh','refresh',refresh),now,expires]);if(r.command!=='INSERT'||r.rowCount!==1||r.rows[0].id!==id)return fail();return wire.parseSandboxCredentials({transport:'sandbox-mobile',sessionId:id,accessToken:this.authority.tokens.issue(owner,id,expires),refreshToken:refresh,sessionExpiresAt:expires},false);
 }
 async bootstrap(body:unknown,key:string){
  const parsed=wire.parseSandboxBootstrap(body);const admitted=await this.authority.transaction(client=>this.reserve(client,'bootstrap',parsed,key));if(!admitted)return fail('restart');
  const capability=this.opaque('capability'),owner=this.uuid();let expiry=0,issued:SandboxSessionCredentials|undefined;
  return this.authority.transaction(async client=>{const now=this.authority.now();expiry=now+2592000000;
   const identity=await client.query('INSERT INTO public.identity(id,auth_method) VALUES($1::uuid,$2::public.auth_method) RETURNING id::text',[owner,'MOCK']);if(identity.command!=='INSERT'||identity.rowCount!==1||identity.rows[0].id!==owner)return fail();await this.authority.scope(client,owner);
   const cap=await client.query('INSERT INTO st250_auth.capability(identity_id,digest_h,created_ms,expires_ms) VALUES($1::uuid,$2::text,$3::bigint,$4::bigint) RETURNING identity_id::text',[owner,this.digest('capability','capability',capability),now,expiry]);if(cap.rowCount!==1)return fail();
   const profile=await client.query('INSERT INTO public.identity_profile(identity_id,display_name,avatar_color,avatar_emoji,language,theme,default_currency,profile_complete,onboarding_mode) VALUES($1::uuid,NULL,NULL,NULL,$2::text,$3::text,$4::char(3),false,NULL)',[owner,parsed.locale,'system','SEK']);if(profile.command!=='INSERT'||profile.rowCount!==1)return fail();issued=await this.newSession(client,owner,expiry);return wire.parseSandboxCredentials({...issued,installationCapability:capability},true);
  },()=>{if(this.authority.now()>=expiry)return fail('denied');this.guardIssued(issued!,owner);});
 }
 async resume(body:unknown,raw:string,key:string){
  const parsed=wire.parseSandboxTransport(body),capability=wire.parseSandboxSecret(raw,'capability'),digest=this.digest('capability','capability',capability);let expires=0,resumedOwner='',issued:SandboxSessionCredentials|undefined;
  const admitted=await this.authority.transaction(async client=>{const current=await this.capability(client,digest);expires=current.expires;return this.reserve(client,'resume',parsed,key,digest);},()=>{if(this.authority.now()>=expires)return fail('denied');});if(!admitted)return fail('restart');
  return this.authority.transaction(async client=>{const current=await this.capability(client,digest);expires=current.expires;resumedOwner=current.owner;issued=await this.newSession(client,current.owner,current.expires);return issued;},()=>{if(this.authority.now()>=expires)return fail('denied');this.guardIssued(issued!,resumedOwner);});
 }
 async refresh(raw:string,key:string){
  const refresh=wire.parseSandboxSecret(raw,'refresh'),digest=this.digest('refresh','refresh',refresh);wire.parseSandboxRequestKey(key);let expiry=0,mintedOwner='',issued:SandboxSessionCredentials|undefined;
  const outcome=await this.authority.transaction(async client=>{
   const resolved=await client.query('SELECT id::text AS id,identity_id::text AS owner FROM st250_auth.session WHERE refresh_h=$1::text UNION ALL SELECT session_id::text AS id,identity_id::text AS owner FROM st250_auth.consumed_refresh WHERE digest_h=$1::text LIMIT 2',[digest]);if(resolved.rowCount!==1)return fail('denied');const {owner,id}=resolved.rows[0] as {owner:string;id:string};await this.authority.scope(client,owner);
   const cap=await client.query('SELECT expires_ms::text FROM st250_auth.capability WHERE identity_id=$1::uuid AND created_ms<=$2::bigint AND expires_ms>$2::bigint AND revoked_ms IS NULL FOR UPDATE',[owner,this.authority.now()]);if(cap.rowCount!==1)return fail('denied');
   const session=await client.query('SELECT family_id::text,refresh_h,generation::text,expires_ms::text FROM st250_auth.session WHERE identity_id=$1::uuid AND id=$2::uuid AND created_ms<=$3::bigint AND expires_ms>$3::bigint AND revoked_ms IS NULL FOR UPDATE',[owner,id,this.authority.now()]);if(session.rowCount!==1)return fail('denied');expiry=Math.min(millis(cap.rows[0].expires_ms),millis(session.rows[0].expires_ms));
   const consumed=await client.query('SELECT session_id::text AS id FROM st250_auth.consumed_refresh WHERE digest_h=$1::text AND identity_id=$2::uuid AND session_id=$3::uuid',[digest,owner,id]);
   if(consumed.rowCount===1){const revoked=await client.query('UPDATE st250_auth.session SET revoked_ms=$3::bigint WHERE identity_id=$1::uuid AND family_id=$2::uuid AND revoked_ms IS NULL',[owner,session.rows[0].family_id,this.authority.now()]);if(revoked.rowCount!==1)return fail();return {kind:'restart' as const};}
   if(consumed.rowCount!==0||!timingSafeEqual(Buffer.from(session.rows[0].refresh_h,'hex'),Buffer.from(digest,'hex')))return fail('denied');if(!await this.reserve(client,'refresh',{transport:'sandbox-mobile'},key,digest))return {kind:'restart' as const};
   const next=this.opaque('refresh'),nextDigest=this.digest('refresh','refresh',next);if(nextDigest===digest)return fail();const collisions=await client.query('SELECT digest_h FROM st250_auth.consumed_refresh WHERE digest_h=$1::text',[nextDigest]);if(collisions.rowCount!==0)return fail();
   const saved=await client.query('INSERT INTO st250_auth.consumed_refresh(digest_h,identity_id,session_id) VALUES($1::text,$2::uuid,$3::uuid)',[digest,owner,id]);if(saved.command!=='INSERT'||saved.rowCount!==1)return fail();const updated=await client.query('UPDATE st250_auth.session SET refresh_h=$3::text,generation=generation+1 WHERE identity_id=$1::uuid AND id=$2::uuid AND refresh_h=$4::text RETURNING id::text',[owner,id,nextDigest,digest]);if(updated.rowCount!==1||updated.rows[0].id!==id)return fail();mintedOwner=owner;issued=wire.parseSandboxCredentials({transport:'sandbox-mobile',sessionId:id,accessToken:this.authority.tokens.issue(owner,id,expiry),refreshToken:next,sessionExpiresAt:expiry},false);return {kind:'credentials' as const,value:issued};
  },()=>{if(this.authority.now()>=expiry)return fail('denied');if(issued)this.guardIssued(issued,mintedOwner);});if(outcome.kind==='restart')return fail('restart');return outcome.value;
 }
 async logout(token:string){let claims;try{claims=this.authority.tokens.verify(token);}catch{return fail('denied');}let expiry=0;
  await this.authority.transaction(async client=>{await this.authority.scope(client,claims.sub);const current=await this.authority.current(client,claims);expiry=Math.min(current.session,current.capability);const now=this.authority.now();const cap=await client.query('UPDATE st250_auth.capability SET revoked_ms=$2::bigint WHERE identity_id=$1::uuid AND revoked_ms IS NULL',[claims.sub,now]);if(cap.rowCount!==1)return fail('denied');const sessions=await client.query('UPDATE st250_auth.session SET revoked_ms=$2::bigint WHERE identity_id=$1::uuid AND revoked_ms IS NULL',[claims.sub,now]);if(sessions.rowCount===null||sessions.rowCount<1)return fail();return undefined;},()=>{const current=this.authority.tokens.verify(token),now=this.authority.now();if(current.sub!==claims.sub||current.sid!==claims.sid||now>=current.exp*1000||now>=expiry)return fail('denied');});
 }
}
