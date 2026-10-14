import {privateBankFailureCategory,privateBankFailureLabel,type PrivateBankProofPhase,type PrivateBankTwoOwnerStep} from './private-mobile-bank-diagnostics.js';
import assert from 'node:assert/strict';
import {request} from 'node:https';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createOwnedPrivateMobileHarness,type OwnedPrivateMobileConfig} from './private-mobile-owned-fixture.js';
import {PRIVATE_MOBILE_PATHS as paths,parsePrivateMobileSessionResponse} from '@subtrack/contracts/private-mobile';
import {PRIVATE_MOBILE_BANK_PATHS as bank,parsePrivateMobileBankMutationResult,parsePrivateMobileBankReadResult} from '@subtrack/contracts/private-mobile-bank';
/** Actual owned PG16 bank extension; parent manual flow first establishes the verified profile. */
export async function runPrivateMobileBankProof(config:OwnedPrivateMobileConfig){
 const harness=createOwnedPrivateMobileHarness(config),ca=await readFile(config.caPath);let phase:PrivateBankProofPhase='START';let twoOwnerStep:PrivateBankTwoOwnerStep|null=null;
 const step=(value:PrivateBankTwoOwnerStep)=>{twoOwnerStep=value;harness.beginBankDiagnostic(value);};
 async function post(path:string,body:object,status:number,headers:Record<string,string>={}){
  const raw=JSON.stringify(body);
  const result=await new Promise<{status:number;body:string}>((ok,no)=>{
   const req=request({hostname:'127.0.0.1',port:3443,servername:'localhost',path,method:'POST',ca,headers:{Host:'localhost:3443','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(raw)),...headers}},res=>{
    const chunks:Buffer[]=[];let length=0;res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>131072){res.destroy();no(new Error('Bound exceeded'));}else chunks.push(chunk);});res.on('error',no);res.on('end',()=>ok({status:res.statusCode!,body:Buffer.concat(chunks).toString('utf8')}));
   });req.setTimeout(15000,()=>req.destroy(new Error('Request deadline')));req.on('error',no);req.end(raw);
  });assert.equal(result.status,status);return result.body?JSON.parse(result.body) as Record<string,unknown>:{};
 }
 const key=()=>({'Idempotency-Key':randomUUID()});
 async function login(){const proof=await post(paths.verifyLogin,{transport:'mobile'},200,key());const credentials=parsePrivateMobileSessionResponse(await post(paths.session,{transport:'mobile',loginProof:proof.loginProof},201,key()));return {Authorization:`Bearer ${credentials.accessToken}`};}
 const ownerClaim=(authorization:string)=>{
  const value=JSON.parse(Buffer.from(authorization.slice(7).split('.')[1]!,'base64url').toString('utf8')) as {sub:unknown};
  assert.equal(typeof value.sub,'string');assert.match(value.sub as string,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);return value.sub as string;
 };
 try{
  await harness.start();let auth=await login();const manual=await harness.readbackTrackingReceipt();
  phase='CONNECT';const intent=key();const connected=await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...intent});
  const id=parsePrivateMobileBankMutationResult(connected).connection.connectionId;
  assert.deepEqual(await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...intent}),connected);
  const concurrent=await Promise.all([post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...key()}),post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...key()})]);
  assert.ok(concurrent.every(result=>parsePrivateMobileBankMutationResult(result).connection.connectionId===id));
  await post(bank.connect,{institutionId:'synthetic-demo-v1',identityId:randomUUID()},400,{...auth,...key()});
  await post(bank.sync,{connectionId:randomUUID()},409,{...auth,...key()});
  phase='SYNC';const syncKey=key();const synced=parsePrivateMobileBankMutationResult(await post(bank.sync,{connectionId:id},200,{...auth,...syncKey}));
  assert.equal(synced.connection.accountCount,1);assert.ok(synced.connection.transactionCount>0);
  assert.deepEqual(parsePrivateMobileBankMutationResult(await post(bank.sync,{connectionId:id},200,{...auth,...syncKey})),synced);
  const before=await harness.readbackBankReceipt();await post(bank.sync,{connectionId:id},200,{...auth,...key()});
  const after=await harness.readbackBankReceipt();assert.equal(after.transactions,before.transactions);assert.equal(after.transactionDigest,before.transactionDigest);
  phase='RESTART';await harness.restart();auth=await login();const read=parsePrivateMobileBankReadResult(await post(bank.read,{},200,auth));
  assert.ok(JSON.stringify(read).includes(id));assert.equal((await harness.readbackBankReceipt()).transactionDigest,before.transactionDigest);
  phase='TWO_OWNER';
  step('A_SNAPSHOT');const aliceOwner=ownerClaim(auth.Authorization),aliceBank=await harness.readbackBankOwnerReceipt(aliceOwner);
  step('B_SESSION');const bobCredentials=parsePrivateMobileSessionResponse(await harness.secondOwnerSession());
  step('B_DISTINCT');const bobAuth={Authorization:`Bearer ${bobCredentials.accessToken}`};const bobOwner=ownerClaim(bobAuth.Authorization);assert.notEqual(bobOwner,aliceOwner);
  step('B_PROFILE_GATE');assert.equal((await post(bank.read,{},409,bobAuth)).code,'MODE_CONFLICT');
  step('B_PROFILE_PATCH');await post(paths.profile,{displayName:'Owned second fixture',avatarColourToken:'member.accent.02',avatarEmoji:'\u{1f642}',language:'en',theme:'system'},200,bobAuth);
  step('B_MODE');await post(paths.mode,{mode:'just-me'},200,bobAuth);
  step('B_EMPTY_READ');assert.deepEqual(parsePrivateMobileBankReadResult(await post(bank.read,{},200,bobAuth)).connections,[]);
  step('PUBLIC_SELECTOR');await post(paths.verifyLogin,{transport:'mobile',demoIdentity:'bob'},400,key());
  step('B_EMPTY_SNAPSHOT');const bobEmpty=await harness.readbackBankOwnerReceipt(bobOwner);
  for(const [path,body,label,snapshot]of [[bank.sync,{connectionId:id},'B_TO_A_SYNC','B_TO_A_SYNC_SNAPSHOT'],[bank.disconnect,{connectionId:id,purge:false},'B_TO_A_RETAIN','B_TO_A_RETAIN_SNAPSHOT'],[bank.disconnect,{connectionId:id,purge:true},'B_TO_A_PURGE','B_TO_A_PURGE_SNAPSHOT']] as const){
   step(label);
   assert.equal((await post(path,body,409,{...bobAuth,...key()})).code,'BANK_STATE_CONFLICT');
   step(snapshot);assert.deepEqual(await harness.readbackBankOwnerReceipt(aliceOwner),aliceBank);assert.deepEqual(await harness.readbackBankOwnerReceipt(bobOwner),bobEmpty);assert.deepEqual(await harness.readbackTrackingReceipt(),manual);
  }
  step('B_CONNECT');const bobId=parsePrivateMobileBankMutationResult(await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...bobAuth,...key()})).connection.connectionId;
  assert.notEqual(bobId,id);
  step('B_SYNC');const bobSynced=parsePrivateMobileBankMutationResult(await post(bank.sync,{connectionId:bobId},200,{...bobAuth,...key()}));
  assert.equal(bobSynced.connection.accountCount,1);assert.ok(bobSynced.connection.transactionCount>0);
  step('B_POSITIVE_READ');assert.deepEqual(parsePrivateMobileBankReadResult(await post(bank.read,{},200,bobAuth)).connections,[bobSynced.connection]);
  step('A_POSITIVE_READ');const aliceReadDuringBob=parsePrivateMobileBankReadResult(await post(bank.read,{},200,auth));assert.deepEqual(aliceReadDuringBob,read);assert.ok(aliceReadDuringBob.connections.every(connection=>connection.connectionId!==bobId));
  step('B_POSITIVE_SNAPSHOT');const bobBeforeForeign=await harness.readbackBankOwnerReceipt(bobOwner);
  for(const [path,body,label,snapshot]of [[bank.sync,{connectionId:bobId},'A_TO_B_SYNC','A_TO_B_SYNC_SNAPSHOT'],[bank.disconnect,{connectionId:bobId,purge:false},'A_TO_B_RETAIN','A_TO_B_RETAIN_SNAPSHOT'],[bank.disconnect,{connectionId:bobId,purge:true},'A_TO_B_PURGE','A_TO_B_PURGE_SNAPSHOT']] as const){
   step(label);
   assert.equal((await post(path,body,409,{...auth,...key()})).code,'BANK_STATE_CONFLICT');
   step(snapshot);assert.deepEqual(await harness.readbackBankOwnerReceipt(bobOwner),bobBeforeForeign);assert.deepEqual(await harness.readbackBankOwnerReceipt(aliceOwner),aliceBank);assert.deepEqual(await harness.readbackTrackingReceipt(),manual);
  }
  assert.deepEqual(await harness.readbackBankOwnerReceipt(aliceOwner),aliceBank);
  step('B_PURGE');const bobPurged=parsePrivateMobileBankMutationResult(await post(bank.disconnect,{connectionId:bobId,purge:true},200,{...bobAuth,...key()}));
  assert.equal(bobPurged.connection.disposition,'purged');assert.equal(bobPurged.connection.transactionCount,0);
  step('B_EMPTY_AFTER_PURGE');assert.deepEqual(parsePrivateMobileBankReadResult(await post(bank.read,{},200,bobAuth)).connections,[]);
  step('B_LOGOUT');await post(paths.logout,{},204,bobAuth);step('B_LOGOUT_DENIED');await post(bank.read,{},401,bobAuth);
  step('A_FINAL_SNAPSHOT');assert.deepEqual(await harness.readbackBankOwnerReceipt(aliceOwner),aliceBank);assert.deepEqual(await harness.readbackTrackingReceipt(),manual);
  step('TWO_OWNER_COUNTS');const twoOwners=await harness.readbackReceipt();assert.equal(twoOwners.identityCount,2);assert.equal(twoOwners.profileCompleteCount,2);assert.equal(twoOwners.justMeCount,2);assert.equal(twoOwners.subscriptionCount,1);
  harness.clearBankDiagnostic();twoOwnerStep=null;phase='EXPIRED_SESSION';
  const expiryObserver=new Pool({host:config.host,port:config.port,database:config.database,user:'st233a_fixture_owner',password:config.ownerPassword,max:1});
  const claims=JSON.parse(Buffer.from(auth.Authorization.slice(7).split('.')[1]!,'base64url').toString('utf8')) as {sub:string;sid:string};
  const beforeExpiry=await harness.readbackBankReceipt();
  const priorSession=await expiryObserver.query('SELECT created_ms::text,expires_ms::text FROM st244_mobile.session WHERE id=$1::uuid AND identity_id=$2::uuid',[claims.sid,claims.sub]);
  assert.equal(priorSession.rowCount,1);
  try{
   const expired=Date.now()-1;
   await expiryObserver.query('UPDATE st244_mobile.session SET created_ms=$3::bigint,expires_ms=$4::bigint WHERE id=$1::uuid AND identity_id=$2::uuid',[claims.sid,claims.sub,expired-86400000,expired]);
   await post(bank.read,{},401,auth);assert.deepEqual(await harness.readbackBankReceipt(),beforeExpiry);
  }finally{
   await expiryObserver.query('UPDATE st244_mobile.session SET created_ms=$3::bigint,expires_ms=$4::bigint WHERE id=$1::uuid AND identity_id=$2::uuid',[claims.sid,claims.sub,priorSession.rows[0].created_ms,priorSession.rows[0].expires_ms]);await expiryObserver.end();
  }
  phase='RETAIN';const retained=await post(bank.disconnect,{connectionId:id,purge:false},200,{...auth,...key()});assert.equal(parsePrivateMobileBankMutationResult(retained).connection.disposition,'retained');
  await post(bank.sync,{connectionId:id},409,{...auth,...key()});assert.equal((await harness.readbackBankReceipt()).transactionDigest,before.transactionDigest);
  phase='RECONNECT';const newId=parsePrivateMobileBankMutationResult(await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...key()})).connection.connectionId;
  assert.notEqual(newId,id);assert.ok(JSON.stringify(await post(bank.read,{},200,auth)).includes(id));
  phase='DEPENDENCY';
  const observer=new Pool({host:config.host,port:config.port,database:config.database,user:'st233a_fixture_owner',password:config.ownerPassword,max:1});
  const dependency=randomUUID();
  try{
   const added=await observer.query(`INSERT INTO public.subscription_charge(id,identity_id,subscription_id,raw_transaction_id,amount_minor,currency,charged_at,matched_by,updated_at)
    SELECT $1::uuid,rt.identity_id,s.id,rt.id,rt.amount_minor,rt.currency,rt.transaction_date,$3::public.charge_matched_by,pg_catalog.clock_timestamp()
    FROM public.raw_transaction rt JOIN public.subscription s ON s.identity_id=rt.identity_id
    JOIN public.bank_account ba ON ba.id=rt.account_id WHERE ba.connection_id=$2::uuid ORDER BY rt.id LIMIT 1 RETURNING id`,[dependency,id,'USER']);
   assert.equal(added.rowCount,1);const beforeDependency=await harness.readbackBankReceipt();
   await post(bank.disconnect,{connectionId:id,purge:true},500,{...auth,...key()});assert.deepEqual(await harness.readbackBankReceipt(),beforeDependency);
   assert.equal((await observer.query('SELECT id FROM public.subscription_charge WHERE id=$1::uuid',[dependency])).rowCount,1);
  }finally{await observer.query('DELETE FROM public.subscription_charge WHERE id=$1::uuid',[dependency]);await observer.end();}
  phase='PURGE';const purgeKey=key();const purged=await post(bank.disconnect,{connectionId:id,purge:true},200,{...auth,...purgeKey});
  assert.equal(parsePrivateMobileBankMutationResult(purged).connection.disposition,'purged');
  assert.deepEqual(await post(bank.disconnect,{connectionId:id,purge:true},200,{...auth,...purgeKey}),purged);
  await post(bank.disconnect,{connectionId:id,purge:false},409,{...auth,...purgeKey});assert.deepEqual(await post(bank.disconnect,{connectionId:id,purge:true},200,{...auth,...key()}),purged);
  assert.deepEqual(await harness.readbackTrackingReceipt(),manual);
  phase='RLS_NEGATIVE';const pool=new Pool({host:config.host,port:config.port,database:config.database,user:'subtrack_dev_auth_login',password:config.actorPassword,max:1});const client=await pool.connect();
  try{
   await client.query('BEGIN');await client.query('SET LOCAL ROLE subtrack_runtime');
   await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[randomUUID()]);
   for(const table of ['public.bank_connection','public.bank_account','public.raw_transaction','st248_bank.generation','st248_bank.receipt'])assert.equal((await client.query(`SELECT * FROM ${table}`)).rowCount,0);
   await client.query('ROLLBACK');
  }finally{client.release();await pool.end();}
  phase='UNCERTAINTY';await post(bank.sync,{connectionId:newId},200,{...auth,...key()});
  for(const kind of ['before','after'] as const){
   const mutation=key();harness.injectCommitFault(kind);await post(bank.disconnect,{connectionId:newId,purge:true},500,{...auth,...mutation});
   await harness.restart();auth=await login();
   const receipt=await harness.readbackBankReceipt();if(kind==='before')assert.ok(receipt.transactions>0);else assert.equal(receipt.transactions,0);
   if(kind==='before')continue;
   assert.equal(parsePrivateMobileBankMutationResult(await post(bank.disconnect,{connectionId:newId,purge:true},200,{...auth,...mutation})).connection.disposition,'purged');
  }
  assert.deepEqual(await harness.readbackTrackingReceipt(),manual);
  phase='LOGOUT';await post(paths.logout,{},204,auth);await post(bank.read,{},401,auth);
  const final=await harness.readbackReceipt();assert.equal(final.identityCount,2);assert.equal(final.profileCompleteCount,2);assert.equal(final.justMeCount,2);assert.equal(final.subscriptionCount,1);
  return Object.freeze({...final,version:1,dedup:true,restart:true,retainedReachable:true,purged:true,replay:true,ownerIsolation:true,twoVerifiedOwners:true,rlsNegative:true,manualPreserved:true,uncertaintyRollback:true,dependencyRollback:true,parallelConnect:true,expiredSessionDenied:true,logoutDenied:true});
 }catch(error){const category=twoOwnerStep===null?privateBankFailureCategory(error):harness.bankFailureCategory(twoOwnerStep)??privateBankFailureCategory(error);throw new Error(privateBankFailureLabel(phase,twoOwnerStep,category));}finally{await harness.dispose();}
}
