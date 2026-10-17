import type {Pool,PoolClient,QueryResultRow} from 'pg';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import type {MobileOwner,PrivateMobilePrecommitGuard} from '../auth/mobile-private/durable-mobile-authority.js';
import {SANDBOX_BANK_STATEMENTS} from './sandbox-bank-business.js';
import {SANDBOX_HOUSEHOLD_STATEMENTS} from './sandbox-household.js';
import {PRIVATE_MOBILE_BUSINESS_STATEMENTS} from '../profile/private-mobile-business.js';
import {SandboxToken,type SandboxClaims} from './sandbox-token.js';
import {SANDBOX_EPOCH,type SandboxConfig} from './sandbox-config.js';
const SANDBOX_STATEMENTS=Object.freeze({...PRIVATE_MOBILE_BUSINESS_STATEMENTS,...SANDBOX_BANK_STATEMENTS,...SANDBOX_HOUSEHOLD_STATEMENTS});
export class SandboxError extends Error{constructor(readonly kind:'denied'|'unavailable'|'capacity'|'restart'){super('Sandbox request unavailable');}}
const fail=(kind:SandboxError['kind']='unavailable'):never=>{throw new SandboxError(kind);};
const time=(value:unknown):number=>{if(typeof value!=='string'||!/^[1-9][0-9]{0,15}$/.test(value))return fail();const now=Number(value);if(!Number.isSafeInteger(now)||now<1)return fail();return now;};
export class SandboxAuthority{
 private last=-1;
 constructor(readonly pool:Pick<Pool,'connect'>,readonly tokens:SandboxToken,readonly config:SandboxConfig,private readonly clock:()=>number=Date.now){}
 now():number{const now=this.clock();if(!Number.isSafeInteger(now)||now<0||now<this.last||now>Number.MAX_SAFE_INTEGER-2592000000)return fail();this.last=now;return now;}
 async clean(client:PoolClient){const r=await client.query("SELECT session_user::text AS login,current_user::text AS role,current_database()::text AS db,current_setting('app.user_id',true) AS one,current_setting('app.current_user_id',true) AS two");const row=r.rows[0];if(r.rowCount!==1||row.login!=='subtrack_sandbox_api_login'||row.role!=='subtrack_sandbox_api_login'||row.db!=='subtrack_sandbox'||![null,''].includes(row.one)||![null,''].includes(row.two))return fail();}
 async fence(client:PoolClient){const r=await client.query('UPDATE st250_auth.epoch SET watermark_ms=GREATEST(watermark_ms,floor(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint) WHERE id=$1::text AND manifest_h=$2::text AND active AND watermark_ms<=floor(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint AND $3::bigint<=floor(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint RETURNING watermark_ms::text',[SANDBOX_EPOCH,this.config.manifest,this.now()]);if(r.command!=='UPDATE'||r.rowCount!==1)return fail();}
 async transaction<T>(work:(client:PoolClient)=>Promise<T>,guard?:()=>void):Promise<T>{
  const started=this.now();let client:PoolClient|undefined,begun=false,commit=false,released=false;
  try{client=await this.pool.connect();await this.clean(client);await client.query('BEGIN');begun=true;await client.query('SET LOCAL statement_timeout=3000');await client.query('SET LOCAL lock_timeout=1000');await client.query('SET LOCAL idle_in_transaction_session_timeout=8000');await client.query('SET LOCAL ROLE subtrack_sandbox_auth_producer');const capacity=await client.query('SELECT id FROM st250_auth.capacity WHERE id=1 FOR UPDATE');if(capacity.command!=='SELECT'||capacity.rowCount!==1||capacity.rows[0]?.id!==1)return fail();await this.fence(client);
   const result=await work(client);await client.query('SET LOCAL ROLE subtrack_sandbox_auth_producer');await this.fence(client);
   if(this.now()-started>=8000)return fail();if(guard&&guard()!==undefined)return fail();commit=true;const committed=await client.query('COMMIT');if(committed.command!=='COMMIT')return fail();await this.clean(client);client.release();released=true;return result;
  }catch(error){let rolled=false;if(client&&begun&&!commit)try{rolled=(await client.query('ROLLBACK')).command==='ROLLBACK';}catch{/* Unknown rollback is unavailable. */}
   if(!commit&&rolled){if(error instanceof SandboxError)throw error;if(error&&typeof error==='object'&&'code'in error&&error.code==='P0250')return fail('capacity');}return fail();
  }finally{if(client&&!released)try{client.release(new Error('Sandbox connection unavailable'));}catch{/* Dirty or uncertain connection cannot be reused. */}}
 }
 async scope(client:PoolClient,owner:string){await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[owner]);const r=await client.query('SELECT st250_auth.lock_owner($1::uuid)::text AS id',[owner]);if(r.rowCount!==1||r.rows[0].id!==owner)return fail('denied');}
 async current(client:PoolClient,claims:SandboxClaims){const now=this.now();const r=await client.query('SELECT se.expires_ms::text AS session_expires,c.expires_ms::text AS capability_expires FROM st250_auth.session se JOIN st250_auth.capability c ON c.identity_id=se.identity_id WHERE se.identity_id=$1::uuid AND se.id=$2::uuid AND se.created_ms<=$3::bigint AND se.expires_ms>$3::bigint AND se.revoked_ms IS NULL AND c.created_ms<=$3::bigint AND c.expires_ms>$3::bigint AND c.revoked_ms IS NULL FOR UPDATE OF c,se',[claims.sub,claims.sid,now]);if(r.rowCount!==1)return fail('denied');return {session:time(r.rows[0].session_expires),capability:time(r.rows[0].capability_expires)};}
 async withCurrentMobileAuthority<T>(accessToken:string,action:(tx:OwnerTx,owner:MobileOwner)=>Promise<T>,beforeCommit?:PrivateMobilePrecommitGuard):Promise<T>{
  let claims:SandboxClaims;try{claims=this.tokens.verify(accessToken);}catch{return fail('denied');}let expiry:{session:number;capability:number}|undefined;
  return this.transaction(async client=>{await this.scope(client,claims.sub);expiry=await this.current(client,claims);await client.query('SET LOCAL ROLE subtrack_sandbox_runtime');let open=true,pending=0;
   const tx:OwnerTx=Object.freeze({execute:async<R extends QueryResultRow=QueryResultRow>(name:string,values:readonly unknown[])=>{if(!open||!Object.hasOwn(SANDBOX_STATEMENTS,name)||!Array.isArray(values))return fail();if(name==='manualIdMint'?values.length!==0:values[name==='manualSubscriptionInsert'?1:0]!==claims.sub)return fail();pending++;try{return await client.query<R>(SANDBOX_STATEMENTS[name as keyof typeof SANDBOX_STATEMENTS],[...values]);}finally{pending--;}}});
   let value:T;try{value=await action(tx,Object.freeze({identityId:claims.sub,sessionId:claims.sid}));}finally{open=false;}if(pending!==0)return fail();await client.query('SET LOCAL ROLE subtrack_sandbox_auth_producer');expiry=await this.current(client,claims);if(beforeCommit&&beforeCommit()!==undefined)return fail();return value;
  },()=>{let final:SandboxClaims;try{final=this.tokens.verify(accessToken);}catch{return fail('denied');}const now=this.now();if(final.sub!==claims.sub||final.sid!==claims.sid||!expiry||now>=final.exp*1000||now>=expiry.session||now>=expiry.capability)return fail('denied');});
 }
 async verifyStartup(){await this.transaction(async client=>{
  const roles=await client.query("SELECT count(*)::int4 AS n FROM pg_roles WHERE rolname IN('subtrack_sandbox_owner','subtrack_sandbox_api_login','subtrack_sandbox_runtime','subtrack_sandbox_auth_producer') AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole");if(roles.rows[0]?.n!==4)return fail();
  const migrations=await client.query('SELECT id,sha256 FROM st250_auth.migration ORDER BY id');if(migrations.rowCount!==this.config.migrationHashes.length||migrations.rows.some((r,i)=>r.id!==i+1||r.sha256!==this.config.migrationHashes[i]))return fail();
  const rls=await client.query("SELECT count(*)::int4 AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relrowsecurity AND c.relforcerowsecurity AND (n.nspname='st250_auth' AND c.relname IN('epoch','migration','capacity','capability','session','consumed_refresh','reservation') OR n.nspname='public' AND c.relname IN('identity','identity_profile','merchant','subscription','manual_subscription_create_receipt','manual_subscription_edit_receipt','bank_connection','bank_account','raw_transaction','household','household_member','household_audit','household_subscription_usage','household_subscription_plan') OR n.nspname='st248_bank' AND c.relname IN('generation','receipt') OR n.nspname='st081_detection' AND c.relname IN('candidate','source_link','scan_receipt','review_receipt','feedback'))");if(rls.rows[0]?.n!==28)return fail();return undefined;
 });}
}
