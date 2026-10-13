import {createHash,createPrivateKey,createPublicKey} from 'node:crypto';
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
 let graph:ReturnType<typeof createPrivateMobileServer>|undefined;let disposed=false;
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
  try{await new Promise<void>((ok,no)=>{next.server.once('error',no);next.server.listen(3443,'127.0.0.1',()=>{next.server.removeListener('error',no);ok();});});graph=next;}
  catch(error){next.server.close();throw error;}
 }
 async function stop():Promise<void>{const old=graph;graph=undefined;if(old)await new Promise<void>((ok,no)=>{old.server.close(error=>error?no(error):ok());old.server.closeAllConnections();});}
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
 return Object.freeze({start,stop,restart:async()=>{fault=undefined;await stop();await start();},readbackReceipt,
  injectCommitFault(kind:'before'|'after',skip=0){if(disposed||fault||!['before','after'].includes(kind)||!Number.isInteger(skip)||skip<0||skip>3)throw new Error('Fixture unavailable');fault={kind,skip};},
  dispose:async()=>{if(disposed)return;fault=undefined;await stop();disposed=true;await Promise.all([actor.end(),owner.end()]);}});
}
