import {PRIVATE_BANK_PURGE_STATEMENTS} from '../../banks/private-mobile-bank-statements.js';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import type {V2AccessToken} from '../sessions-v2/v2-access-token.js';
import type {OwnerTx} from '../sessions-v2/durable-current-web-authority.js';
const DB='st237_private_https_profile';
const EPOCH='st244-mobile-private-v1';
const denied=new WeakSet<Error>();
export class PrivateMobileAuthorityError extends Error{
 constructor(readonly kind:'denied'|'unavailable'){super('Mobile authority unavailable');}
}
function deny():never{const error=new PrivateMobileAuthorityError('denied');denied.add(error);throw error;}
function unavailable():never{throw new PrivateMobileAuthorityError('unavailable');}
export type MobileOwner=Readonly<{identityId:string;sessionId:string}>;
export class DurablePrivateMobileAuthority{
 private readonly statements:Readonly<Record<string,string>>;
 private readonly pool:Pick<Pool,'connect'>;
 private lastNow=-1;
 constructor(pool:Pick<Pool,'connect'>,private readonly tokens:Pick<V2AccessToken,'verify'>,private readonly clock:()=>number,private readonly manifestHash:string,statements:Readonly<Record<string,string>>,enabled=false){
  if(enabled!==true||process.env.NODE_ENV!=='development'||typeof pool?.connect!=='function'||typeof tokens?.verify!=='function'||typeof clock!=='function'||!/^[a-f0-9]{64}$/.test(manifestHash))unavailable();
  const copy:Record<string,string>={};
  for(const [name,sql]of Object.entries(statements)){const reserved=Object.hasOwn(PRIVATE_BANK_PURGE_STATEMENTS,name);const purge=reserved&&sql===PRIVATE_BANK_PURGE_STATEMENTS[name as keyof typeof PRIVATE_BANK_PURGE_STATEMENTS];if(reserved&&!purge)unavailable();if(!purge&&(!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name)||typeof sql!=='string'||!/^(SELECT|INSERT|UPDATE)\b/.test(sql)||/;|--|["'`]|\b(?:commit|rollback|set_config|set_role)\b/i.test(sql)))unavailable();copy[name]=sql;}
  this.statements=Object.freeze(copy);this.pool=Object.freeze({connect:pool.connect.bind(pool)});this.tokens=Object.freeze({verify:tokens.verify.bind(tokens)});
 }
 now():number{const value=this.clock();if(process.env.NODE_ENV!=='development'||!Number.isSafeInteger(value)||value<0||value<this.lastNow||value>Number.MAX_SAFE_INTEGER-86400000)unavailable();this.lastNow=value;return value;}
 async assertClean(client:PoolClient):Promise<void>{
  const result=await client.query('SELECT session_user::text AS login,current_user::text AS role,current_database()::text AS db,current_setting($1,true) AS one,current_setting($2,true) AS two',['app.user_id','app.current_user_id']);
  const row=result.rows[0];if(result.rowCount!==1||row?.login!=='subtrack_dev_auth_login'||row.role!=='subtrack_dev_auth_login'||row.db!==DB||!(row.one===null||row.one==='')||!(row.two===null||row.two===''))unavailable();
  const roles=await client.query('SELECT count(*)::text AS n FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]) AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole',[['subtrack_dev_auth_login','subtrack_runtime','subtrack_auth_producer','subtrack_identity_provisioner']]);if(roles.rowCount!==1||roles.rows[0]?.n!=='4')unavailable();
 }
 async fence(client:PoolClient):Promise<void>{
  const observed=this.now();
  const result=await client.query('UPDATE st244_mobile.epoch SET watermark_ms=GREATEST(watermark_ms,pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000)::bigint) WHERE id=$1::text AND manifest_h=$2::text AND active=true AND watermark_ms<=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000)::bigint AND $3::bigint<=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000)::bigint RETURNING watermark_ms::text AS now',[EPOCH,this.manifestHash,observed]);
  if(result.command!=='UPDATE'||result.rowCount!==1)unavailable();
 }
 async transaction<T>(role:'subtrack_runtime'|'subtrack_auth_producer'|'subtrack_identity_provisioner',work:(client:PoolClient)=>Promise<T>,beforeCommit?:()=>void|Promise<void>):Promise<T>{
  this.now();let client:PoolClient|undefined;let begun=false,commitAttempted=false,released=false;
  try{
   client=await this.pool.connect();await this.assertClean(client);await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');begun=true;
   await client.query(`SET LOCAL ROLE ${role}`);if(role!=='subtrack_identity_provisioner')await this.fence(client);
   const value=await work(client);
   await client.query('SET LOCAL ROLE subtrack_auth_producer');await this.fence(client);
   await beforeCommit?.();
   commitAttempted=true;const result=await client.query('COMMIT');if(result.command!=='COMMIT')unavailable();await this.assertClean(client);client.release();released=true;return value;
  }catch(error){
   let rollbackFailed=false;if(client&&begun&&!commitAttempted)try{if((await client.query('ROLLBACK')).command!=='ROLLBACK')rollbackFailed=true;}catch{rollbackFailed=true;}
   if(!commitAttempted&&!rollbackFailed&&error instanceof Error&&denied.has(error))deny();return unavailable();
  }finally{if(client&&!released)try{client.release(new Error('Mobile authority unavailable'));}catch{/* Unknown or dirty connection is never reused. */}}
 }
 private async check(client:PoolClient,accessToken:string,owner:MobileOwner):Promise<void>{
  try{const claims=this.tokens.verify(accessToken);if(claims.sub!==owner.identityId||claims.sid!==owner.sessionId)deny();}catch{return deny();}
  const row=await client.query('SELECT id::text AS id FROM st244_mobile.session WHERE identity_id=$1::uuid AND id=$2::uuid AND revoked_ms IS NULL AND created_ms<=$3::bigint AND expires_ms>$3::bigint FOR UPDATE',[owner.identityId,owner.sessionId,this.now()]);
  if(row.rowCount!==1||row.rows[0]?.id!==owner.sessionId)deny();
 }
 async withCurrentMobileAuthority<T>(accessToken:string,action:(tx:OwnerTx,owner:MobileOwner)=>Promise<T>):Promise<T>{
  let owner:MobileOwner;try{const claims=this.tokens.verify(accessToken);owner=Object.freeze({identityId:claims.sub,sessionId:claims.sid});}catch{return deny();}
  return this.transaction('subtrack_runtime',async client=>{
   await client.query("SELECT pg_catalog.set_config('app.user_id',$1,true),pg_catalog.set_config('app.current_user_id',$1,true)",[owner.identityId]);
   const active=await client.query('SELECT id::text AS id FROM public.identity WHERE id=$1::uuid AND deleted_at IS NULL FOR UPDATE',[owner.identityId]);if(active.rowCount!==1||active.rows[0]?.id!==owner.identityId)deny();
   await this.check(client,accessToken,owner);let open=true,pending=0;
   const tx:OwnerTx=Object.freeze({execute:async<R extends QueryResultRow=QueryResultRow>(name:string,values:readonly unknown[])=>{
    if(!open||!Object.hasOwn(this.statements,name)||!Array.isArray(values))unavailable();
    if(Object.hasOwn(PRIVATE_BANK_PURGE_STATEMENTS,name)&&(values.length!==2||values[0]!==owner.identityId||typeof values[1]!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(values[1])))unavailable();pending++;
    try{return await client.query<R>(this.statements[name]!,[...values]);}finally{pending--;}
   }});
   let value:T;try{value=await action(tx,owner);}catch{return unavailable();}finally{open=false;}
   if(pending!==0)unavailable();await this.check(client,accessToken,owner);return value;
  },()=>{try{this.tokens.verify(accessToken);}catch{return deny();}});
 }
 async logout(accessToken:string):Promise<void>{
  let owner:MobileOwner;try{const claims=this.tokens.verify(accessToken);owner={identityId:claims.sub,sessionId:claims.sid};}catch{return deny();}
  await this.transaction('subtrack_runtime',async client=>{
   await client.query("SELECT pg_catalog.set_config('app.user_id',$1,true),pg_catalog.set_config('app.current_user_id',$1,true)",[owner.identityId]);
   const active=await client.query('SELECT id FROM public.identity WHERE id=$1::uuid AND deleted_at IS NULL FOR UPDATE',[owner.identityId]);if(active.rowCount!==1)deny();await this.check(client,accessToken,owner);
   const result=await client.query('UPDATE st244_mobile.session SET revoked_ms=$3::bigint WHERE identity_id=$1::uuid AND id=$2::uuid AND revoked_ms IS NULL',[owner.identityId,owner.sessionId,this.now()]);if(result.rowCount!==1)deny();
  },()=>{try{this.tokens.verify(accessToken);}catch{return deny();}});
 }
}
