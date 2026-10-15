import {OwnedPrivateBankDiagnostics,type PrivateBankTwoOwnerStep} from './private-mobile-bank-diagnostics.js';
import {PrivateMobileSubjectVerifier} from '../src/auth/mobile-private/verified-subject-binding.js';
import {DevelopmentEnrollmentPersonVerifier} from '../src/auth/identity-provider/development-enrollment-person-verifier.js';
import {createOwnedOtpStartObserver,OwnedDetectionController,OwnedInitialDetectionScanObserver,type OwnedDetectionScenario} from './private-mobile-owned-fixture-observer.js';
import {privateMobileRenewalsReceipt,type PrivateMobileRenewalsReceipt} from './private-mobile-renewals-receipt.js';
import {privateMobileTrackingReceipt,type PrivateMobileTrackingReceipt} from './private-mobile-tracking-receipt.js';
import {createHash,createPrivateKey,createPublicKey,randomUUID} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import type {BigintTransactionSeries} from '@subtrack/domain/detection';
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
const OVERFLOW_MIN='-9223372036854775808',OVERFLOW_MAX=9223372036854775807n;
const OVERFLOW_ALIASES=Object.freeze(['NETFLIX','Netflix','NETFLIX*','NETFLIX.COM']);
const OVERFLOW_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type OverflowCohort=Readonly<{owner:string;account:string;connection:string;currency:string;originals:readonly Readonly<{id:string;amount:string}>[]}>;
const overflowCustody=new WeakSet<OverflowCohort>();
const OVERFLOW_READ=`SELECT rt.id::text AS id,rt.identity_id::text AS identity_id,ba.id::text AS account_id,bc.id::text AS connection_id,
rt.amount_minor::text AS amount,rt.transaction_date::text AS date,rt.currency,rt.raw_description AS description,
bg.fixture_version,bc.status::text AS connection_status,bc.revoked_at,bg.purged_at,bc.last_synced_at
FROM public.raw_transaction rt JOIN public.bank_account ba ON ba.id=rt.account_id AND ba.identity_id=rt.identity_id
JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id
JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
WHERE rt.identity_id=$1::uuid AND bc.provider='SYNTHETIC' AND bc.institution_id='synthetic-demo-v1'
AND bc.status='ACTIVE' AND bc.revoked_at IS NULL AND bg.fixture_version='solberg-v1' AND bg.purged_at IS NULL
AND bc.last_synced_at IS NOT NULL AND rt.status='BOOKED' AND rt.amount_minor<0 AND rt.is_refund=false
AND rt.currency=ba.currency AND rt.raw_description=ANY($2::text[])
ORDER BY ba.id,rt.transaction_date,rt.id LIMIT 10001 FOR UPDATE OF rt,ba,bc,bg`;
const OVERFLOW_WRITE=`UPDATE public.raw_transaction rt SET amount_minor=$7::bigint
WHERE rt.identity_id=$1::uuid AND rt.account_id=$2::uuid AND rt.id=$5::uuid AND rt.currency=$4::char(3)
AND rt.amount_minor=$6::bigint AND rt.status='BOOKED' AND rt.is_refund=false AND rt.raw_description=ANY($8::text[])
AND EXISTS(SELECT 1 FROM public.bank_account ba JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id
JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
WHERE ba.id=rt.account_id AND ba.identity_id=rt.identity_id AND ba.currency=rt.currency AND bc.id=$3::uuid
AND bc.provider='SYNTHETIC' AND bc.institution_id='synthetic-demo-v1' AND bc.status='ACTIVE' AND bc.revoked_at IS NULL
AND bg.fixture_version='solberg-v1' AND bg.purged_at IS NULL AND bc.last_synced_at IS NOT NULL)
RETURNING rt.id::text AS id`;
const overflowUnavailable=():never=>{throw new Error('Fixture unavailable');};
/** Actual compiled detector validates the negative control before any bank evidence is changed. */
export async function prepareOwnedDetectionOverflow(client:Pick<PoolClient,'query'>,owner:string):Promise<OverflowCohort>{
 if(!OVERFLOW_UUID.test(owner))return overflowUnavailable();
 await client.query('BEGIN');
 try{
  const found=await client.query(OVERFLOW_READ,[owner,OVERFLOW_ALIASES]);
  if(found.command!=='SELECT'||found.rowCount!==found.rows.length||found.rows.length<3||found.rows.length>10000)return overflowUnavailable();
  const first=found.rows[0],ids=new Set<string>();
  if(!OVERFLOW_UUID.test(first.account_id)||!OVERFLOW_UUID.test(first.connection_id)||first.currency!=='SEK')return overflowUnavailable();
  const transactions=found.rows.map(row=>{
   if(row.identity_id!==owner||row.account_id!==first.account_id||row.connection_id!==first.connection_id||row.currency!==first.currency||!OVERFLOW_UUID.test(row.id)||ids.has(row.id)||!OVERFLOW_ALIASES.includes(row.description)||row.fixture_version!=='solberg-v1'||row.connection_status!=='ACTIVE'||row.revoked_at!==null||row.purged_at!==null||!(row.last_synced_at instanceof Date)||!Number.isFinite(row.last_synced_at.getTime())||typeof row.amount!=='string'||!/^-[1-9][0-9]{0,18}$/.test(row.amount)||BigInt(row.amount)<BigInt(OVERFLOW_MIN)||typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))return overflowUnavailable();
   const date=new Date(`${row.date}T00:00:00.000Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.date)return overflowUnavailable();ids.add(row.id);
   return {id:row.id as string,accountId:first.account_id as string,date,amountMinor:BigInt(row.amount),currency:first.currency as string,direction:'DEBIT' as const,pending:false};
  });
  const runtime=createRequire(__filename),core=await import(pathToFileURL(runtime.resolve('@subtrack/domain/detection-runtime')).href) as typeof import('@subtrack/domain/detection-runtime');
  const series:BigintTransactionSeries={ownerId:owner,accountId:first.account_id,merchantKey:'netflix',currency:first.currency,categoryCode:'VIDEO_STREAMING',transactions};
  const original=core.detectRecurringBigint(series).filter(candidate=>candidate.cadence==='MONTHLY'),overflow=core.detectRecurringBigint({...series,transactions:transactions.map(row=>({...row,amountMinor:BigInt(OVERFLOW_MIN)}))}).filter(candidate=>candidate.cadence==='MONTHLY');
  if(original.length!==1||original[0]!.amountBand.representative.minorUnits<=0n||original[0]!.amountBand.representative.minorUnits>OVERFLOW_MAX||overflow.length!==1||overflow[0]!.amountBand.representative.minorUnits<=OVERFLOW_MAX)return overflowUnavailable();
  const cohort:OverflowCohort=Object.freeze({owner,account:first.account_id,connection:first.connection_id,currency:first.currency,originals:Object.freeze(found.rows.map(row=>Object.freeze({id:row.id as string,amount:row.amount as string})))});
  for(const row of cohort.originals){const saved=await client.query(OVERFLOW_WRITE,[owner,cohort.account,cohort.connection,cohort.currency,row.id,row.amount,OVERFLOW_MIN,OVERFLOW_ALIASES]);if(saved.command!=='UPDATE'||saved.rowCount!==1||saved.rows.length!==1||saved.rows[0].id!==row.id)return overflowUnavailable();}
  await client.query('COMMIT');overflowCustody.add(cohort);return cohort;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function restoreOwnedDetectionOverflow(client:Pick<PoolClient,'query'>,cohort:OverflowCohort):Promise<void>{
 if(!overflowCustody.has(cohort))return overflowUnavailable();
 await client.query('BEGIN');
 try{
  const found=await client.query(OVERFLOW_READ,[cohort.owner,OVERFLOW_ALIASES]),expected=new Set(cohort.originals.map(row=>row.id));
  if(found.command!=='SELECT'||found.rowCount!==cohort.originals.length||found.rows.length!==cohort.originals.length)return overflowUnavailable();
  for(const row of found.rows){if(!expected.delete(row.id)||row.identity_id!==cohort.owner||row.account_id!==cohort.account||row.connection_id!==cohort.connection||row.currency!==cohort.currency||row.amount!==OVERFLOW_MIN||row.fixture_version!=='solberg-v1'||row.connection_status!=='ACTIVE'||row.revoked_at!==null||row.purged_at!==null||!OVERFLOW_ALIASES.includes(row.description))return overflowUnavailable();}
  if(expected.size!==0)return overflowUnavailable();
  for(const row of cohort.originals){const restored=await client.query(OVERFLOW_WRITE,[cohort.owner,cohort.account,cohort.connection,cohort.currency,row.id,OVERFLOW_MIN,row.amount,OVERFLOW_ALIASES]);if(restored.command!=='UPDATE'||restored.rowCount!==1||restored.rows.length!==1||restored.rows[0].id!==row.id)return overflowUnavailable();}
  await client.query('COMMIT');overflowCustody.delete(cohort);
 }catch(error){await client.query('ROLLBACK');throw error;}
}
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
 let fault:Readonly<{kind:'before'|'after';skip:number}>|undefined;const bankDiagnostics=new OwnedPrivateBankDiagnostics();
 const initialScan=new OwnedInitialDetectionScanObserver();const detection=new OwnedDetectionController();const clock=()=>detection.now();
 let detectionOwner:string|undefined;let adversary:Readonly<{kind:'collision'|'unmatched';id:string;prior:string}|{kind:'overflow';cohort:OverflowCohort}>|undefined;
 // Test-only transport faults around real PostgreSQL COMMIT, never inside the production factory.
 const actorPool:Pick<Pool,'connect'>={connect:async()=>{
  const client=await actor.connect();
  return new Proxy(client,{get(target,property){
   if(property==='query')return async(...args:unknown[])=>{
    if(args[0]==='COMMIT'&&fault){
     if(fault.skip>0)fault={...fault,skip:fault.skip-1};
     else{const kind=fault.kind;fault=undefined;await target.query(kind==='before'?'ROLLBACK':'COMMIT');throw new Error('Owned commit transport uncertainty');}
    }
    return initialScan.query(args[0],()=>bankDiagnostics.observedQuery(()=>detection.query(args[0] as string,args[1] as readonly unknown[]|undefined,sql=>Reflect.apply(target.query,target,[sql,...args.slice(1)]))));
   };
   if(property==='release')return (error?:Error)=>{detection.released(error!==undefined);target.release(error);};
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
  class OwnedDetectionToken extends V2AccessToken{override verify(token:string){const claims=super.verify(token);if(detection.enabled()&&detectionOwner===undefined)detectionOwner=claims.sub;detection.verified(claims.sub,claims.sid);return claims;}}
  const serverConfig:PrivateMobileServerConfig={environment:'development',enabled:true,pool:actorPool,clock,manifestHash:config.manifestHash,keys,
   tls:{key:await privateFile(config.leafKeyPath,config),cert:await privateFile(config.leafChainPath,config)},
   accessTokens:new OwnedDetectionToken({environment:'development',enabled:true,privateKey,publicKey:createPublicKey(privateKey),clock}),
   ...(options.onOtpIssued?{onSyntheticOtpIssued:options.onOtpIssued}:{})};
  const next=createPrivateMobileServer(serverConfig);
  const fixtureSubjects=new PrivateMobileSubjectVerifier(new DevelopmentEnrollmentPersonVerifier({environment:'development',enabled:true,simulatorHmacKey:keys.simulator,clock}),clock,config.manifestHash,keys.subject,
   [keys.otp,keys.rate,keys.idempotency,keys.anonymous,keys.person,keys.simulator,...keys.credentialKeys],keys.person);
  otpObserver.attach(next.server);
  try{await new Promise<void>((ok,no)=>{next.server.once('error',no);next.server.listen(3443,'127.0.0.1',()=>{next.server.removeListener('error',no);ok();});});graph=next;secondOwnerSubjects=fixtureSubjects;bankDiagnostics.startGraph();}
  catch(error){otpObserver.stop();next.server.close();throw error;}
 }
 async function stop():Promise<void>{initialScan.clear();detection.clear();otpObserver.stop();const old=graph;bankDiagnostics.stopGraph();graph=undefined;secondOwnerSubjects=undefined;if(old)await new Promise<void>((ok,no)=>{old.server.close(error=>error?no(error):ok());old.server.closeAllConnections();});}
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
 async function readbackManualTrackingReceipt():Promise<PrivateMobileTrackingReceipt>{
  if(disposed)throw new Error('Fixture unavailable');await fence();const client=await owner.connect();
  try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const rows=await client.query("SELECT id::text,custom_name,category_code,cadence::text,expected_amount_minor::text,currency,status::text,source::text,next_charge_date::text,always_private,revision::text FROM public.subscription WHERE source='MANUAL' ORDER BY id");
   const result=privateMobileTrackingReceipt(config.marker,rows.rows);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function readbackDetectionReceipt(){
  if(disposed)throw new Error('Fixture unavailable');await fence();const client=await owner.connect();
  try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state=[];
   for(const table of ['st081_detection.candidate','st081_detection.source_link','st081_detection.feedback','st081_detection.review_receipt','st081_detection.scan_receipt']){
    const rows=await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`);state.push(rows.rows);
   }
   const subscriptions=await client.query("SELECT to_jsonb(s) AS row FROM public.subscription s WHERE source='DETECTED' ORDER BY id");state.push(subscriptions.rows);
   await client.query('COMMIT');return Object.freeze({candidateCount:state[0]!.length,sourceLinkCount:state[1]!.length,feedbackCount:state[2]!.length,reviewCount:state[3]!.length,scanCount:state[4]!.length,detectedCount:state[5]!.length,digest:createHash('sha256').update(JSON.stringify(state)).digest('hex')});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function enableDetectionQualification(){if(arguments.length!==0||disposed||graph||fault||process.env.NODE_ENV!=='development')throw new Error('Fixture unavailable');await fence();const time=await owner.query('SELECT floor(EXTRACT(EPOCH FROM clock_timestamp())*1000)::text AS now');detection.enable(Number(time.rows[0].now));}
 async function armDetectionScenario(scenario:OwnedDetectionScenario){
  if(arguments.length!==1||disposed||!graph||fault||process.env.NODE_ENV!=='development')throw new Error('Fixture unavailable');await fence();const binding=detection.binding();if(!binding)throw new Error('Fixture unavailable');
  const observed=await owner.query('SELECT identity_id::text,subscription_id::text,undo_until,consumed_at FROM st081_detection.review_receipt WHERE identity_id=$1::uuid AND id=$2::uuid',[binding.owner,binding.receipt]);
  const row=observed.rows[0];if(observed.rowCount!==1||row.identity_id!==binding.owner||row.subscription_id!==binding.candidate||row.consumed_at!==null||!(row.undo_until instanceof Date)||row.undo_until.getTime()!==binding.deadline)throw new Error('Fixture unavailable');
  const time=await owner.query('SELECT floor(EXTRACT(EPOCH FROM clock_timestamp())*1000)::text AS now');detection.arm(scenario,Number(time.rows[0].now));
 }
 async function prepareDetectionAdversary(kind:'overflow'|'collision'|'unmatched'){
  if(disposed||!graph||!detection.enabled()||!detectionOwner||adversary||process.env.NODE_ENV!=='development')throw new Error('Fixture unavailable');await fence();
  if(kind==='overflow'){const client=await owner.connect();try{adversary={kind,cohort:await prepareOwnedDetectionOverflow(client,detectionOwner)};}finally{client.release();}return;}
  if(kind==='collision'){
   const found=await owner.query('SELECT subscription_id::text AS id,merchant_key AS prior FROM st081_detection.candidate WHERE identity_id=$1::uuid ORDER BY subscription_id LIMIT 1',[detectionOwner]);if(found.rowCount!==1)throw new Error('Fixture unavailable');
   const saved=await owner.query("UPDATE st081_detection.candidate SET merchant_key='fixture-"+"collision-v1' WHERE identity_id=$1::uuid AND subscription_id=$2::uuid AND merchant_key=$3::text RETURNING subscription_id",[detectionOwner,found.rows[0].id,found.rows[0].prior]);if(saved.rowCount!==1)throw new Error('Fixture unavailable');adversary={kind,id:found.rows[0].id,prior:found.rows[0].prior};
  }else{
   const found=await owner.query(`SELECT rt.id::text AS id,rt.amount_minor::text AS amount,rt.raw_description AS description FROM public.raw_transaction rt
    JOIN public.bank_account ba ON ba.id=rt.account_id AND ba.identity_id=rt.identity_id JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id
    JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
    WHERE rt.identity_id=$1::uuid AND bc.provider='SYNTHETIC' AND bc.institution_id='synthetic-demo-v1' AND bc.status='ACTIVE' AND bc.revoked_at IS NULL
    AND bg.fixture_version='solberg-v1' AND bg.purged_at IS NULL AND bc.last_synced_at IS NOT NULL AND rt.status='BOOKED' AND rt.amount_minor<0 AND rt.is_refund=false AND rt.currency=ba.currency ORDER BY ba.id,rt.transaction_date,rt.id LIMIT 1`,[detectionOwner]);if(found.rowCount!==1)throw new Error('Fixture unavailable');
   const row=found.rows[0],sql="UPDATE public.raw_transaction SET raw_description='OWNED_UNMATCHED_PRIVATE_DESCRIPTOR' WHERE identity_id=$1::uuid AND id=$2::uuid AND raw_description=$3::text RETURNING id";
   const prior=row.description;if(typeof prior!=='string')throw new Error('Fixture unavailable');if((await owner.query(sql,[detectionOwner,row.id,prior])).rowCount!==1)throw new Error('Fixture unavailable');adversary={kind,id:row.id,prior};
  }
 }
 async function restoreDetectionAdversary(){
  if(arguments.length!==0||disposed||!adversary||!detectionOwner)throw new Error('Fixture unavailable');await fence();if(adversary.kind==='overflow'){const client=await owner.connect();try{await restoreOwnedDetectionOverflow(client,adversary.cohort);adversary=undefined;}finally{client.release();}return;}const {kind,id,prior}=adversary;
  const sql=kind==='collision'?"UPDATE st081_detection.candidate SET merchant_key=$3::text WHERE identity_id=$1::uuid AND subscription_id=$2::uuid AND merchant_key='fixture-"+"collision-v1' RETURNING subscription_id":"UPDATE public.raw_transaction SET raw_description=$3::text WHERE identity_id=$1::uuid AND id=$2::uuid AND raw_description='OWNED_UNMATCHED_PRIVATE_DESCRIPTOR' RETURNING id";
  if((await owner.query(sql,[detectionOwner,id,prior])).rowCount!==1)throw new Error('Fixture unavailable');adversary=undefined;
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
 return Object.freeze({start,stop,otpStartObservation:()=>otpObserver.observation(),restart:async()=>{fault=undefined;await stop();await start();},readbackReceipt,readbackTrackingReceipt,readbackManualTrackingReceipt,readbackRenewalsReceipt,readbackBankReceipt,secondOwnerSession,readbackBankOwnerReceipt,readbackDetectionReceipt,enableDetectionQualification,armDetectionScenario,
  beginInitialScanDiagnostic(){if(arguments.length!==0||disposed||!graph||!detection.enabled()||process.env.NODE_ENV!=='development')throw new Error('Fixture unavailable');initialScan.begin();},initialScanDiagnostic:()=>initialScan.observation(),clearInitialScanDiagnostic:()=>initialScan.clear(),
  detectionScenarioObservation:()=>detection.observation(),clearDetectionScenario:()=>detection.clear(),detectionNow:()=>detection.now(),
  prepareDetectionOverflow(){if(arguments.length!==0)throw new Error('Fixture unavailable');return prepareDetectionAdversary('overflow');},prepareDetectionCollision(){if(arguments.length!==0)throw new Error('Fixture unavailable');return prepareDetectionAdversary('collision');},prepareUnmatchedDetectionDescriptor(){if(arguments.length!==0)throw new Error('Fixture unavailable');return prepareDetectionAdversary('unmatched');},restoreDetectionAdversary,
  beginBankDiagnostic(step:PrivateBankTwoOwnerStep){if(disposed||!graph||process.env.NODE_ENV!=='development')throw new Error('Fixture unavailable');bankDiagnostics.beginStep(step);},
  bankFailureCategory:(step:PrivateBankTwoOwnerStep)=>bankDiagnostics.failureCategory(step),clearBankDiagnostic:()=>bankDiagnostics.clearStep(),
  injectCommitFault(kind:'before'|'after',skip=0){if(disposed||fault||!['before','after'].includes(kind)||!Number.isInteger(skip)||skip<0||skip>3)throw new Error('Fixture unavailable');fault={kind,skip};},
  dispose:async()=>{if(disposed)return;fault=undefined;await stop();disposed=true;await Promise.all([actor.end(),owner.end()]);}});
}
