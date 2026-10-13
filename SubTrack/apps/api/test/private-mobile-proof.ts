import assert from 'node:assert/strict';
import {request} from 'node:https';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Pool} from 'pg';
import {createOwnedPrivateMobileHarness,type OwnedPrivateMobileConfig,type PrivateMobileReceipt} from './private-mobile-owned-fixture.js';
import type {PrivateMobileCredentials} from '../src/auth/mobile-private/durable-mobile-sessions.js';
import {PRIVATE_MOBILE_PATHS as paths,parsePrivateMobileSessionResponse} from '@subtrack/contracts/private-mobile';

/** Actual direct-TLS PG proof. Values/assertion diffs stay private; callers publish only the fixed receipt. */
export async function runPrivateMobileProof(config:OwnedPrivateMobileConfig):Promise<PrivateMobileReceipt>{
 let otp:string|undefined;const harness=createOwnedPrivateMobileHarness(config,{onOtpIssued:event=>{otp=event.code;}});
 let phase='START';
 const ca=await readFile(config.caPath);
 async function post(path:string,body:object|undefined,status:number,headers:Record<string,string>={}):Promise<Record<string,unknown>>{
  const raw=body===undefined?undefined:JSON.stringify(body);
  const result=await new Promise<{status:number;body:string;cache:string|undefined}>((ok,no)=>{
   const req=request({hostname:'127.0.0.1',port:3443,servername:'localhost',path,method:'POST',ca,headers:{Host:'localhost:3443',...(raw===undefined?{}:{'Content-Type':'application/json','Content-Length':String(Buffer.byteLength(raw))}),...headers}},res=>{
    const chunks:Buffer[]=[];let length=0;res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>131072){res.destroy();no(new Error('Bound exceeded'));}else chunks.push(chunk);});res.on('error',no);res.on('end',()=>ok({status:res.statusCode!,body:Buffer.concat(chunks).toString('utf8'),cache:res.headers['cache-control']}));
   });req.setTimeout(15000,()=>req.destroy(new Error('Request deadline')));req.on('error',no);req.end(raw);
  });assert.equal(result.status,status);assert.equal(result.cache,'no-store');return result.body?JSON.parse(result.body) as Record<string,unknown>:{};
 }
 const key=()=>({'Idempotency-Key':randomUUID()});const bearer=(session:PrivateMobileCredentials)=>({Authorization:`Bearer ${session.accessToken}`});
 async function enroll():Promise<PrivateMobileCredentials>{
  otp=undefined;const start=await post('/v2/auth/otp/start',{channel:'email',identifier:'owned@example.invalid',purpose:'enroll_identifier',transport:'mobile'},202,key());
  assert.equal(typeof otp,'string');const verified=await post('/v2/auth/otp/verify',{challengeId:start.challengeId,code:otp,transport:'mobile'},200,key());otp=undefined;
  return parsePrivateMobileSessionResponse(await post(paths.complete,{transport:'mobile',enrollmentProof:verified.proof,locale:'en'},201,key()));
 }
 async function login():Promise<PrivateMobileCredentials>{
  const verified=await post(paths.verifyLogin,{transport:'mobile'},200,key());return parsePrivateMobileSessionResponse(await post(paths.session,{transport:'mobile',loginProof:verified.loginProof},201,key()));
 }
 try{
  await harness.start();assert.equal((await harness.readbackReceipt()).identityCount,0);
  phase='ENROLL';const session=await enroll();const auth=bearer(session);
  phase='PROFILE_MODE';
  await post(paths.profileRead,{},200,auth);
  await post(paths.profile,{displayName:'Owned native fixture',avatarColourToken:'member.accent.01',avatarEmoji:'🙂',language:'en',theme:'system'},200,auth);
  await post(paths.mode,{mode:'just-me'},200,auth);
  const before=await post(paths.ownerRead,{},200,auth);assert.deepEqual(before.items,[]);
  phase='ADD';const manual={customName:'Owned subscription',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'12990',nextChargeDate:'2026-11-13'};
  const addKey=key();const added=await post(paths.manual,manual,201,{...auth,...addKey});assert.deepEqual(await post(paths.manual,manual,201,{...auth,...addKey}),added);
  await post(paths.manual,{...manual,expectedAmountMinor:'13000'},409,{...auth,...addKey});
  const list=await post(paths.ownerRead,{},200,auth);assert.equal((list.items as {id:string}[])[0]?.id,added.id);
  phase='ISOLATION';
  // Real least-privilege role and forced RLS: a foreign scoped principal cannot see the saved row.
  const pool=new Pool({host:config.host,port:config.port,database:config.database,user:'subtrack_dev_auth_login',password:config.actorPassword,max:1});
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query('SET LOCAL ROLE subtrack_runtime');await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[randomUUID()]);
   assert.equal((await client.query('SELECT id FROM public.subscription WHERE id=$1::uuid',[added.id])).rowCount,0);
   await client.query("SELECT set_config('app.user_id','',true),set_config('app.current_user_id','',true)");assert.equal((await client.query('SELECT id FROM public.subscription')).rowCount,0);
   await client.query('ROLLBACK');
  }finally{client.release();await pool.end();}
  await post(paths.ownerRead,{identityId:randomUUID()},400,auth);
  await post(paths.profileRead,{},400,{...auth,Cookie:'unrelated=fixture'});
  await post(paths.profileRead,{},400,{...auth,...key()});
  await post(paths.refresh,{},400,{Authorization:`Refresh ${session.refreshToken}`,...key()});
  phase='ROTATION_REUSE';const rotated=parsePrivateMobileSessionResponse(await post(paths.refresh,undefined,200,{Authorization:`Refresh ${session.refreshToken}`,...key()}));
  assert.notEqual(rotated.refreshToken,session.refreshToken);
  await post(paths.refresh,undefined,409,{Authorization:`Refresh ${session.refreshToken}`,...key()});
  await post(paths.profileRead,{},401,bearer(rotated));
  phase='LOGIN';const newSession=await login();const receipt=await harness.readbackReceipt();assert.equal(receipt.identityCount,1);assert.equal(receipt.profileCompleteCount,1);assert.equal(receipt.justMeCount,1);assert.equal(receipt.subscriptionCount,1);
  phase='RESTART';
  await harness.restart();const restarted=await login();assert.deepEqual(await harness.readbackReceipt(),receipt);
  const persisted=await post(paths.ownerRead,{},200,bearer(restarted));assert.equal((persisted.items as {id:string}[])[0]?.id,added.id);
  phase='LOGOUT';await post(paths.logout,{},204,bearer(restarted));await post(paths.profileRead,{},401,bearer(restarted));
  await post(paths.profileRead,{},200,bearer(newSession));
  phase='UNCERTAINTY';
  const observer=new Pool({host:config.host,port:config.port,database:config.database,user:'st233a_fixture_owner',password:config.ownerPassword,max:1});
  try{
  const grants=(await observer.query("SELECT has_table_privilege('subtrack_runtime','st244_mobile.verified_contact','INSERT') AS runtime_insert,has_table_privilege('subtrack_runtime','st244_mobile.verified_contact','SELECT') AS runtime_select,has_table_privilege('subtrack_auth_producer','st244_mobile.verified_contact','INSERT') AS producer_insert,has_table_privilege('subtrack_auth_producer','st244_mobile.verified_contact','SELECT') AS producer_select")).rows[0];
  assert.deepEqual(grants,{runtime_insert:true,runtime_select:false,producer_insert:false,producer_select:false});
  const policy=(await observer.query("SELECT cmd,roles::text[] AS roles,qual,with_check FROM pg_catalog.pg_policies WHERE schemaname='st244_mobile' AND tablename='verified_contact' AND policyname='contact_owner'")).rows;
  assert.equal(policy.length,1);assert.equal(policy[0].cmd,'INSERT');assert.deepEqual(policy[0].roles,['subtrack_runtime']);assert.equal(policy[0].qual,null);assert.match(policy[0].with_check,/subtrack_principal_matches\(identity_id\)/);
  for(const kind of ['before','after'] as const){
   const verified=await post(paths.verifyLogin,{transport:'mobile'},200,key());
   const countBefore=(await observer.query('SELECT count(*)::int4 AS n FROM st244_mobile.session')).rows[0].n as number;
   // Read, reservation, independently committed one-use admission, then session mutation.
   harness.injectCommitFault(kind,3);
   const denied=await post(paths.session,{transport:'mobile',loginProof:verified.loginProof},500,key());
   assert.equal(Object.hasOwn(denied,'accessToken'),false);assert.equal(Object.hasOwn(denied,'refreshToken'),false);
   const committedCount=countBefore+(kind==='after'?1:0);
   assert.equal((await observer.query('SELECT count(*)::int4 AS n FROM st244_mobile.session')).rows[0].n,committedCount);
   for(const restart of [false,true]){
    if(restart)await harness.restart();
    const replay=await post(paths.session,{transport:'mobile',loginProof:verified.loginProof},409,key());
    assert.equal(replay.code,'AUTH_RESTART_REQUIRED');assert.equal(Object.hasOwn(replay,'accessToken'),false);assert.equal(Object.hasOwn(replay,'refreshToken'),false);
    assert.equal((await observer.query('SELECT count(*)::int4 AS n FROM st244_mobile.session')).rows[0].n,committedCount);
   }
   const recovered=await login();await post(paths.ownerRead,{},200,bearer(recovered));assert.deepEqual(await harness.readbackReceipt(),receipt);
  }
  }finally{await observer.end();}
  phase='KEY_TAMPER';
  const original=await readFile(config.keyBundlePath);const bundle=JSON.parse(original.toString('utf8')) as Record<string,string>;
  for(const name of ['person','simulator','otp','privateKey']){
   await harness.stop();const changed={...bundle};changed[name]=name==='privateKey'?generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString(): 'ff'.repeat(32);
   try{await writeFile(config.keyBundlePath,JSON.stringify(changed),{mode:0o600});await assert.rejects(harness.start(),/Fixture key manifest rejected/);}
   finally{await writeFile(config.keyBundlePath,original,{mode:0o600});}
   await harness.start();assert.deepEqual(await harness.readbackReceipt(),receipt);
  }
  // Restart must read and verify the file again, never reuse cached key objects.
  try{await writeFile(config.keyBundlePath,JSON.stringify({...bundle,person:'fe'.repeat(32)}),{mode:0o600});await assert.rejects(harness.restart(),/Fixture key manifest rejected/);}
  finally{await writeFile(config.keyBundlePath,original,{mode:0o600});}
  await harness.start();await post(paths.ownerRead,{},200,bearer(await login()));assert.deepEqual(await harness.readbackReceipt(),receipt);
  return await harness.readbackReceipt();
 }catch{throw new Error(`ST244_PROOF_FAILURE phase=${phase}`);}finally{otp=undefined;await harness.dispose();}
}
