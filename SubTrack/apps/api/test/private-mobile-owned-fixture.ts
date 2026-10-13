import {PrivateMobileSubjectVerifier} from '../src/auth/mobile-private/verified-subject-binding.js';
import {DevelopmentEnrollmentPersonVerifier} from '../src/auth/identity-provider/development-enrollment-person-verifier.js';
import {createOwnedOtpStartObserver} from './private-mobile-owned-fixture-observer.js';
import {privateMobileRenewalsReceipt,type PrivateMobileRenewalsReceipt} from './private-mobile-renewals-receipt.js';
import {privateMobileTrackingReceipt,type PrivateMobileTrackingReceipt} from './private-mobile-tracking-receipt.js';
import {createHash,createPrivateKey,createPublicKey,randomUUID} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {Pool} from 'pg';
import {createPrivateMobileServer,type PrivateMobileServerConfig} from '../src/auth/mobile-private/private-mobile-server.js';
import {V2AccessToken} from '../src/auth/sessions-v2/v2-access-token.js';
import {derivePrivateMobileManifest} from './private-mobile-manifest.js';

export type OwnedPrivateMobileConfig=Readonly<{
 version:1;head:string;marker:string;database:'st237_private_https_profile';host:'127.0.0.1';port:number;
 ownerPassword:string;actorPassword:string;mode:'docker'|'local';containerId:string|null;clusterDir:string|null;
 tempDir:string;caPath:string;leafKeyPath:string;leafChainPath:string;manifestHash:string;keyBundlePath:string;
}>;
export type PrivateMobileReceipt=Readonly<{version:1;markerHash:string;identityCount:number;profileCompleteCount:number;justMeCount:number;subscriptionCount:number;subscriptionDigest:string}>;
const HEX64=/^[a-f0-9]{64}$/;
async function privateFile(path:string,config:OwnedPrivateMobileConfig):Promise<Buffer>{
 if(dirname(resolve(path))!==resolve(config.tempDir)||await realpath(path)!==resolve(path))throw new Error('Fixture custody rejected');
 const stat=await lstat(path);if(!stat.isFile()||(stat.mode&0o077)!==0)throw new Error('Fixture custody rejected');
 return readFile(path);
}
/** Owned fixture observer only. Owner readback is deliberately outside the application authority graph. */
export function createOwnedPrivateMobileHarness(config:OwnedPrivateMobileConfig,options:Readonly<{onOtpIssued?:(event:Readonly<{code:string;channel:'sms'|'email';expiresAt:number}>)=>void}>={}){
 if(config.version!==1||config.database!=='st237_private_https_profile'||config.host!=='127.0.0.1'||!/^[a-f0-9]{40}$/.test(config.head)||!/^[a-f0-9]{32}$/.test(config.marker)||!HEX64.test(config.manifestHash)||!Number.isInteger(config.port)||config.port<1||config.port>65535)throw new Error('Fixture unavailable');
 const connection={host:config.host,port:config.port,database:config.database,max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:5000};
 const owner=new Pool({...connection,user:'st233a_fixture_owner',password:config.ownerPassword});
 const actor=new Pool({...connection,user:'subtrack_dev_auth_login',password:config.actorPassword});
 let fault:Readonly<{kind:'before'|'after';skip:number}>|undefined;
 // Test-only transport faults around real PostgreSQL COMMIT, never inside the production factory.
 const actorPool:Pick<Pool,'connect'>={connect:async()=>{
  const client=await actor.connect();
  return new Proxy(client,{get(target,property){
   if(property==='query')return async(...args:unknown[])=>{
    if(args[0]==='COMMIT'&&fault){
     if(fault.skip>0)fault={...fault,skip:fault.skip-1};
     else{const kind=fault.kind;fault=undefined;await target.query(kind==='before'?'ROLLBACK':'COMMIT');throw new Error('Owned commit transport uncertainty');}
    }
    return Reflect.apply(target.query,target,args);
   };
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
 }} as Pick<Pool,'connect'>;
 let graph:ReturnType<typeof createPrivateMobileServer>|undefined;let secondOwnerSubjects:PrivateMobileSubjectVerifier|undefined;let disposed=false;
 const otpObserver=createOwnedOtpStartObserver();
 async function fence():Promise<void>{
  const value=await owner.query("SELECT current_database() AS db,session_user AS role,current_setting('server_version_num')::int4 AS version,(SELECT count(*)::int4 FROM public.st233a_fixture_control WHERE task='ST-233a' AND head=$1 AND marker=$2) AS n,(SELECT count(*)::int4 FROM st244_mobile.epoch WHERE id='st244-mobile-private-v1' AND manifest_h=$3 AND active=true) AS epoch",[config.head,config.marker,config.manifestHash]);
  const r=value.rows[0];if(value.rowCount!==1||r?.db!==config.database||r.role!=='st233a_fixture_owner'||r.version<160000||r.version>=170000||r.n!==1||r.epoch!==1)throw new Error('Fixture custody rejected');
 }
 async function start():Promise<void>{
  if(disposed||graph)throw new Error('Fixture unavailable');
  const bundle:unknown=JSON.parse((await privateFile(config.keyBundlePath,config)).toString('utf8'));
  if(!bundle||typeof bundle!=='object')throw new Error('Fixture unavailable');
  if(derivePrivateMobileManifest(bundle)!==config.manifestHash)throw new Error('Fixture key manifest rejected');
  await fence();
  const record=bundle as Record<string,unknown>;const names=['otp','rate','idempotency','anonymous','subject','person','simulator','credential'];
  const decoded=names.map(name=>{const value=record[name];if(typeof value!=='string'||!HEX64.test(value))throw new Error('Fixture unavailable');return Buffer.from(value,'hex');});
  if(new Set(decoded.map(value=>value.toString('hex'))).size!==names.length||typeof record.privateKey!=='string')throw new Error('Fixture unavailable');
  const privateKey=createPrivateKey(record.privateKey);if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('Fixture unavailable');
  const keys={otp:decoded[0]!,rate:decoded[1]!,idempotency:decoded[2]!,anonymous:decoded[3]!,subject:decoded[4]!,person:decoded[5]!,simulator:decoded[6]!,credentialKeys:[decoded[7]!]};
  const serverConfig:PrivateMobileServerConfig={environment:'development',enabled:true,pool:actorPool,clock:Date.now,manifestHash:config.manifestHash,keys,
   tls:{key:await privateFile(config.leafKeyPath,config),cert:await privateFile(config.leafChainPath,config)},
   accessTokens:new V2AccessToken({environment:'development',enabled:true,privateKey,publicKey:createPublicKey(privateKey),clock:Date.now}),
   ...(options.onOtpIssued?{onSyntheticOtpIssued:options.onOtpIssued}:{})};
  const next=createPrivateMobileServer(serverConfig);
  const fixtureSubjects=new PrivateMobileSubjectVerifier(new DevelopmentEnrollmentPersonVerifier({environment:'development',enabled:true,simulatorHmacKey:keys.simulator,clock:Date.now}),Date.now,config.manifestHash,keys.subject,
   [keys.otp,keys.rate,keys.idempotency,keys.anonymous,keys.person,keys.simulator,...keys.credentialKeys],keys.person);
  otpObserver.attach(next.server);
  try{await new Promise<void>((ok,no)=>{next.server.once('error',no);next.server.listen(3443,'127.0.0.1',()=>{next.server.removeListener('error',no);ok();});});graph=next;secondOwnerSubjects=fixtureSubjects;}
  catch(error){otpObserver.stop();next.server.close();throw error;}
 }
 async function stop():Promise<void>{otpObserver.stop();const old=graph;graph=undefined;secondOwnerSubjects=undefined;if(old)await new Promise<void>((ok,no)=>{old.server.close(error=>error?no(error):ok());old.server.closeAllConnections();});}
 async function readbackReceipt():Promise<PrivateMobileReceipt>{
  if(disposed)throw new Error('Fixture unavailable');await fence();const client=await owner.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const counts=await client.query("SELECT (SELECT count(*)::int4 FROM public.identity) AS identities,(SELECT count(*)::int4 FROM public.identity_profile WHERE profile_complete) AS profiles,(SELECT count(*)::int4 FROM public.identity_profile WHERE onboarding_mode='just-me') AS modes,(SELECT count(*)::int4 FROM public.subscription) AS subscriptions");
   const rows=await client.query('SELECT id::text,identity_id::text,custom_name,category_code,cadence::text,expected_amount_minor::text,currency,status::text,source::text,next_charge_date::text,always_private FROM public.subscription ORDER BY id');
   await client.query('COMMIT');const c=counts.rows[0];
   return Object.freeze({version:1,markerHash:createHash('sha256').update(config.marker).digest('hex'),identityCount:c.identities,profileCompleteCount:c.profiles,justMeCount:c.modes,subscriptionCount:c.subscriptions,subscriptionDigest:createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function readbackTrackingReceipt():Promise<PrivateMobileTrackingReceipt>{
  if(disposed)throw new Error('Fixture unavailable');await fence();const client=await owner.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const rows=await client.query('SELECT id::text,custom_name,category_code,cadence::text,expected_amount_minor::text,currency,status::text,source::text,next_charge_date::text,always_private,revision::text FROM public.subscription ORDER BY id');
   const result=privateMobileTrackingReceipt(config.marker,rows.rows);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function readbackRenewalsReceipt(candidate:string):Promise<PrivateMobileRenewalsReceipt>{
  if(disposed)throw new Error('Fixture unavailable');await fence();const client=await owner.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const rows=await client.query('SELECT id::text,custom_name,category_code,cadence::text,expected_amount_minor::text,currency,status::text,source::text,next_charge_date::text,always_private,revision::text FROM public.subscription ORDER BY id');
   const result=privateMobileRenewalsReceipt(config.marker,rows.rows,candidate);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function readbackBankReceipt(){
  if(disposed)throw new Error('Fixture unavailable');await fence();const client=await owner.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const counts=await client.query(`SELECT (SELECT count(*)::int4 FROM public.bank_connection) AS connections,
    (SELECT count(*)::int4 FROM public.bank_account) AS accounts,(SELECT count(*)::int4 FROM public.raw_transaction) AS transactions,
    (SELECT count(*)::int4 FROM st248_bank.generation) AS generations,(SELECT count(*)::int4 FROM st248_bank.generation WHERE purged_at IS NOT NULL) AS purged,
    (SELECT count(*)::int4 FROM st248_bank.receipt) AS receipts`);
   const rows=await client.query('SELECT id::text,account_id::text,identity_id::text,provider_transaction_id,amount_minor::text,currency,transaction_date::text,status::text,raw_description,dedupe_hash FROM public.raw_transaction ORDER BY id');
   await client.query('COMMIT');return Object.freeze({version:1,...counts.rows[0],transactionDigest:createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 /** Fixture RAM only: a fixed second verified development subject; never an HTTP/persona selector or signer. */
 async function secondOwnerSession(){
  if(arguments.length!==0||disposed||!graph||!secondOwnerSubjects||process.env.NODE_ENV!=='development')throw new Error('Fixture unavailable');
  await fence();const current=graph,subjects=secondOwnerSubjects,binding=await subjects.verify('bob');subjects.validate(binding);
  await current.authority.transaction('subtrack_identity_provisioner',async client=>{
   subjects.validate(binding);
   const existing=await client.query('SELECT id::text AS id FROM public.identity WHERE external_id=$1::text',[binding.subjectHmac]);
   if(existing.rowCount!==existing.rows.length||existing.rows.length>1)throw new Error('Fixture unavailable');
   if(existing.rows.length===0){
    if(!binding.givenName||!binding.surname)throw new Error('Fixture unavailable');const id=randomUUID();
    const saved=await client.query('INSERT INTO public.identity(id,external_id,auth_method,verified_at,given_name,surname,updated_at) VALUES($1::uuid,$2::text,$3::public.auth_method,$4::timestamptz,$5::text,$6::text,pg_catalog.clock_timestamp())',[id,binding.subjectHmac,'BANKID',binding.verifiedAtIso,binding.givenName,binding.surname]);
    if(saved.command!=='INSERT'||saved.rowCount!==1)throw new Error('Fixture unavailable');
    await client.query('SET LOCAL ROLE subtrack_runtime');
    await client.query("SELECT pg_catalog.set_config('app.user_id',$1,true),pg_catalog.set_config('app.current_user_id',$1,true)",[id]);
    const profile=await client.query('INSERT INTO public.identity_profile(identity_id,display_name,avatar_color,avatar_emoji,language,theme,default_currency,profile_complete) VALUES($1::uuid,NULL,NULL,NULL,$2::text,$3::text,$4::char(3),false)',[id,'en','system','SEK']);
    if(profile.command!=='INSERT'||profile.rowCount!==1)throw new Error('Fixture unavailable');
   }
   subjects.validate(binding);
  },()=>subjects.validate(binding));
  if(graph!==current||secondOwnerSubjects!==subjects||disposed)throw new Error('Fixture unavailable');
  const verified=await current.sessions.verifyLogin('bob',randomUUID());
  return current.sessions.session(verified.loginProof,randomUUID());
 }
 /** Closed owner-specific state/receipt digests remain inside the owned proof; no raw values leave this harness. */
 async function readbackBankOwnerReceipt(identityId:string){
  if(arguments.length!==1||disposed||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(identityId))throw new Error('Fixture unavailable');
  await fence();const client=await owner.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const statements=[
    'SELECT id::text,identity_id::text,provider::text,institution_id,status::text,last_synced_at,revoked_at FROM public.bank_connection WHERE identity_id=$1::uuid ORDER BY id',
    'SELECT id::text,connection_id::text,provider_account_id,currency FROM public.bank_account WHERE identity_id=$1::uuid ORDER BY id',
    'SELECT id::text,account_id::text,provider_transaction_id,amount_minor::text,currency,transaction_date::text,status::text,raw_description,dedupe_hash FROM public.raw_transaction WHERE identity_id=$1::uuid ORDER BY id',
    'SELECT connection_id::text,fixture_version,purged_at FROM st248_bank.generation WHERE identity_id=$1::uuid ORDER BY connection_id',
    'SELECT key_h,request_h,operation,connection_id::text,status,disposition,account_count,transaction_count,last_sync_at FROM st248_bank.receipt WHERE identity_id=$1::uuid ORDER BY key_h',
   ];
   const snapshots=[];
   for(const sql of statements){const observed=await client.query(sql,[identityId]);if(observed.command!=='SELECT'||observed.rowCount!==observed.rows.length)throw new Error('Fixture unavailable');snapshots.push(observed.rows);}
   await client.query('COMMIT');return Object.freeze({version:1,connectionCount:snapshots[0]!.length,accountCount:snapshots[1]!.length,transactionCount:snapshots[2]!.length,
    bankDigest:createHash('sha256').update(JSON.stringify(snapshots.slice(0,4))).digest('hex'),receiptDigest:createHash('sha256').update(JSON.stringify(snapshots[4])).digest('hex')});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return Object.freeze({start,stop,otpStartObservation:()=>otpObserver.observation(),restart:async()=>{fault=undefined;await stop();await start();},readbackReceipt,readbackTrackingReceipt,readbackRenewalsReceipt,readbackBankReceipt,secondOwnerSession,readbackBankOwnerReceipt,
  injectCommitFault(kind:'before'|'after',skip=0){if(disposed||fault||!['before','after'].includes(kind)||!Number.isInteger(skip)||skip<0||skip>3)throw new Error('Fixture unavailable');fault={kind,skip};},
  dispose:async()=>{if(disposed)return;fault=undefined;await stop();disposed=true;await Promise.all([actor.end(),owner.end()]);}});
}
