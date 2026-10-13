// ST-241 actual owned PG16 proof; shell bundles this from the exact reviewed source.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { TLSSocket } from 'node:tls';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { loadPrivateAuthEpoch } from '../src/auth/private-auth-epoch';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { DurableCurrentWebAuthority } from '../src/auth/sessions-v2/durable-current-web-authority';
import { hashBrowserBindingCookie } from '../src/auth/sessions-v2/v2-web-session-binding';
import { mintDurableSessionCsrf } from '../src/auth/session-csrf/durable-session-csrf';
import { PRIVATE_MANUAL_EDIT_STATEMENTS } from '../src/subscriptions/private-manual-edit-statements';
import { PRIVATE_MANUAL_CREATE_STATEMENTS } from '../src/subscriptions/private-manual-create-statements';
import { PrismaClient, type Prisma } from '@prisma/client';
import { SubscriptionLifecycleRepository } from '../src/subscriptions/subscription-lifecycle.repository';
import { PRIVATE_ONBOARDING_STATEMENTS } from '../src/profile/private-onboarding-statements';
import { createPrivateManualEditHttp } from '../src/subscriptions/private-manual-edit-http';

let phase = 'CONFIG';
const pass = (label: string): void => { process.stdout.write(`PASS ST241_ACTUAL_PG_${label}\n`); };
const hash = (value: string): Buffer => createHash('sha256').update(value).digest();
const body = { customName:'Manual Proof',categoryCode:'OTHER_SUBSCRIPTION',cadence:'MONTHLY',expectedAmountMinor:'9223372036854775807',nextChargeDate:null };
async function prove(): Promise<void> {
  const configPath = process.env['ST237_PRIVATE_CONFIG'];
  const ownerPassword = process.env['ST237_OWNER_PASSWORD'];
  const password = process.env['ST237_PG_PASSWORD'];
  const port = Number(process.env['ST237_PG_PORT']);
  assert(configPath && ownerPassword && password && /^[a-f0-9]{48}$/.test(ownerPassword) && /^[a-f0-9]{48}$/.test(password));
  assert(Number.isSafeInteger(port) && port>0 && port<65536);
  const epoch = loadPrivateAuthEpoch(configPath);
  const common = {host:'127.0.0.1',port,database:epoch.database,connectionTimeoutMillis:3000,
    query_timeout:4000,statement_timeout:3000,lock_timeout:2000,idle_in_transaction_session_timeout:4000};
  const owner = new Pool({...common,user:'st233a_fixture_owner',password:ownerPassword,max:2});
  const actor = new Pool({...common,user:epoch.login,password,max:4});
  owner.on('error',()=>{}); actor.on('error',()=>{});
  const tokens = new V2AccessToken({environment:'development',enabled:true,...epoch.accessKeyPair,clock:Date.now});
  const authority = (pool: Pick<Pool,'connect'> = actor) => new DurableCurrentWebAuthority({pool,accessTokens:tokens,
    origin:epoch.origin,database:epoch.database,epoch:epoch.epoch,manifestHash:epoch.manifestHash,
    businessStatements:{...PRIVATE_ONBOARDING_STATEMENTS,...PRIVATE_MANUAL_CREATE_STATEMENTS,...PRIVATE_MANUAL_EDIT_STATEMENTS}});
  const ordinaryPrisma = new PrismaClient({datasources:{db:{url:`postgresql://${epoch.login}:${password}@127.0.0.1:${port}/${epoch.database}`}},log:[]});
  // The production repository uses only the interactive transaction overload.
  // This fixture adapter adds the existing runtime role without changing its SQL.
  const lifecycle = new SubscriptionLifecycleRepository({$transaction: <T>(operation:(tx:Prisma.TransactionClient)=>Promise<T>) => ordinaryPrisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE subtrack_runtime'); return operation(tx);
  })} as unknown as Pick<PrismaClient,'$transaction'>);
  const owned: string[] = [];
  async function session(identityId = randomUUID()) {
    if (!owned.includes(identityId)) {
      owned.push(identityId);
      await owner.query('INSERT INTO public.identity(id,auth_method,updated_at) VALUES ($1,\'MOCK\',now())',[identityId]);
      await owner.query('INSERT INTO public.identity_profile(identity_id,profile_complete,onboarding_mode) VALUES ($1,true,\'just-me\')',[identityId]);
    }
    const fid = randomUUID(), sid = randomUUID(), binding = randomBytes(32).toString('base64url'), chain = randomBytes(32).toString('base64url');
    const csrf = mintDurableSessionCsrf(), now = Date.now();
    await owner.query('INSERT INTO subtrack_auth.family(family_id,identity_id,epoch,issued_ms,expires_ms) VALUES ($1,$2,$3,$4,$5)',[fid,identityId,epoch.epoch,now,now+86400000]);
    await owner.query(`INSERT INTO subtrack_auth.session(session_id,family_id,identity_id,transport,origin,chain,binding_h,epoch,issued_ms,expires_ms)
      VALUES ($1,$2,$3,'web',$4,$5,$6,$7,$8,$9)`,[sid,fid,identityId,epoch.origin,chain,hashBrowserBindingCookie(binding),epoch.epoch,now,now+86400000]);
    await owner.query(`INSERT INTO subtrack_auth.credential(refresh_h,session_id,family_id,identity_id,epoch,state,issued_ms,expires_ms)
      VALUES ($1,$2,$3,$4,$5,'current',$6,$7)`,[randomBytes(32).toString('hex'),sid,fid,identityId,epoch.epoch,now,now+86400000]);
    await owner.query('INSERT INTO subtrack_auth.csrf(session_id,family_id,identity_id,epoch,token_h,issued_ms,expires_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)',[sid,fid,identityId,epoch.epoch,csrf.digest,now,now+86400000]);
    return {identityId,sid,fid,binding,chain,csrf:csrf.token,access:tokens.issue(identityId,sid)};
  }
  type Session = Awaited<ReturnType<typeof session>>;
  async function call(current: Session, id: string, key: string, payload: object = body, pool: Pick<Pool,'connect'> = actor,
    override: {origin?:string;csrf?:string;binding?:string;chain?:string;rawBody?:string} = {}) {
    const text = override.rawBody ?? JSON.stringify(payload);
    const socket = Object.create(TLSSocket.prototype) as TLSSocket;
    Object.defineProperties(socket,{remoteAddress:{value:'127.0.0.1'},encrypted:{value:true}});
    const req = Object.assign(Readable.from([Buffer.from(text)]),{socket,method:'POST',url:`/v2/subscriptions/owner/manual/${id}/edit`,rawHeaders:[
      'Host','localhost:3443','Content-Type','application/json','Content-Length',String(Buffer.byteLength(text)),
      'Origin',override.origin ?? epoch.origin,'Idempotency-Key',key,'X-Session-CSRF',override.csrf ?? current.csrf,
      'Cookie',`st_v2_access=${current.access}; st_v2_binding=${override.binding ?? current.binding}; st_v2_chain=${override.chain ?? current.chain}`,
    ]}) as unknown as IncomingMessage;
    const headers: Record<string,unknown> = {}; let textResponse = '';
    const res = {statusCode:0,setHeader:(name:string,value:unknown)=>{headers[name]=value;},end:(value:string)=>{textResponse=value;}};
    await createPrivateManualEditHttp(authority(pool)).handle(req,res as unknown as ServerResponse);
    assert.equal(headers['Cache-Control'],'no-store');
    assert.equal(headers['Content-Type'],res.statusCode===200?'application/json':'application/problem+json');
    return {status:res.statusCode,body:JSON.parse(textResponse) as {id?:string;revision?:string;code?:string}};
  }
  async function counts(identityId:string) {
    const result = await owner.query(`SELECT
      (SELECT count(*)::int FROM public.subscription WHERE identity_id=$1) AS subscriptions,
      (SELECT count(*)::int FROM public.manual_subscription_edit_receipt WHERE identity_id=$1) AS receipts`,[identityId]);
    return result.rows[0] as {subscriptions:number;receipts:number};
  }
  async function runtime(first:string,second:string,sql:string,args:unknown[]=[]) {
    const c = await actor.connect();
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL ROLE subtrack_runtime');
      await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$2,true)",[first,second]);
      return await c.query(sql,args);
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  async function seed(identityId:string, source='MANUAL', currency='SEK', cadence='MONTHLY') {
    const id=randomUUID();
    await owner.query(`INSERT INTO public.subscription(id,identity_id,custom_name,category_code,cadence,
      expected_amount_minor,currency,status,source,always_private,updated_at,revision)
      VALUES($1,$2,'Original','OTHER_SUBSCRIPTION',$3,1234,$4,'ACTIVE',$5,true,now(),999)`,
      [id,identityId,cadence,currency,source]);
    return id;
  }
  async function snapshot(id:string) {
    return (await owner.query(`SELECT id::text,identity_id::text,merchant_id::text,catalog_plan_id::text,
      paying_account_id::text,custom_name,category_code,cadence::text,expected_amount_minor::text,currency,
      status::text,source::text,confidence::text,detection_reasons,next_charge_date::text,always_private,
      created_at::text,revision::text FROM public.subscription WHERE id=$1`,[id])).rows[0] as Record<string,unknown>;
  }
  const intent=(revision:string, changes:object={})=>({...body,expectedRevision:revision,...changes});
  const fixedError=(code:string,status:number)=>({status,body:{type:'about:blank',
    title:status===404?'Not Found':status===409?'Conflict':'Internal Server Error',status,code}});
  try {
    if (process.argv[2]==='--edit-replay') {
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of process.stdin){const bytes=Buffer.from(chunk as Uint8Array);size+=bytes.length;assert(size<=8192);chunks.push(bytes);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {current:Session;key:string;id:string;payload:object;result:object};
      assert.deepEqual(await call(input.current,input.id,input.key,input.payload),input.result);
      process.stdout.write('PASS ST241_RESTART_EXACT_REPLAY\n');return;
    }
    phase='REVISION';
    const a=await session(), b=await session();
    const id=await seed(a.identityId), second=await seed(a.identityId), foreign=await seed(b.identityId);
    assert.equal((await snapshot(id))['revision'],'1');
    await owner.query('UPDATE public.subscription SET revision=1,custom_name=custom_name WHERE id=$1',[id]);
    assert.equal((await snapshot(id))['revision'],'2');
    await owner.query('UPDATE public.subscription SET revision=999 WHERE id=$1',[id]);
    assert.equal((await snapshot(id))['revision'],'3');
    pass('FORCED_INSERT_ONE_CALLER_INDEPENDENT_EVERY_UPDATE');
    phase='EDIT';
    const prior=await snapshot(id), key=randomUUID(), payload=intent('3');
    const saved=await call(a,id,key,{...payload,customName:'  Manual Proof  '});
    assert.deepEqual(saved,{status:200,body:{id,revision:'4'}});
    assert.deepEqual(await call(a,id,key,payload),saved);
    const after=await snapshot(id);
    assert.deepEqual(after,{...prior,custom_name:body.customName,category_code:body.categoryCode,
      cadence:body.cadence,expected_amount_minor:body.expectedAmountMinor,next_charge_date:null,revision:'4'});
    const readback=await runtime(a.identityId,a.identityId,PRIVATE_ONBOARDING_STATEMENTS.ownerDetail,[a.identityId,id,'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"']);
    assert.equal(readback.rows[0]?.revision,'4');assert.equal(readback.rows[0]?.custom_name,body.customName);
    const receipt=await owner.query(`SELECT key_hash,request_hash,subscription_id::text,result_revision::text,created_at
      FROM public.manual_subscription_edit_receipt WHERE identity_id=$1 AND key_hash=$2`,[a.identityId,hash(key)]);
    assert.deepEqual(receipt.rows[0]?.request_hash,hash(JSON.stringify({v:'manual-edit-v1',id,expectedRevision:'3',...body})));
    assert.equal(receipt.rows[0]?.result_revision,'4');
    assert.equal((await call(a,id,key,intent('4'))).body.code,'MANUAL_EDIT_IDEMPOTENCY_CONFLICT');
    assert.equal((await call(a,second,key,intent('1'))).body.code,'MANUAL_EDIT_IDEMPOTENCY_CONFLICT');
    assert.equal((await snapshot(second))['revision'],'1');
    pass('CANONICAL_EXACT_REPLAY_CROSS_TARGET_KEY_CONFLICT_PROTECTED_FIELDS');
    phase='ELIGIBILITY';
    const ineligible=[foreign,randomUUID(),await seed(a.identityId,'DETECTED'),await seed(a.identityId,'MANUAL','EUR'),await seed(a.identityId,'MANUAL','SEK','CUSTOM')];
    for(const target of ineligible) assert.deepEqual(await call(a,target,randomUUID(),intent('1')),fixedError('SUBSCRIPTION_NOT_FOUND',404));
    for(const [first,secondOwner] of [[b.identityId,b.identityId],[a.identityId,''],[a.identityId,b.identityId],['bad','bad']]) {
      assert.equal((await runtime(first!,secondOwner!,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptRead,[a.identityId,hash(key)])).rowCount,0);
    }
    pass('MISSING_FOREIGN_DETECTED_NON_SEK_CUSTOM_DUAL_GUC_ISOLATION');
    phase='MODE';
    for(const settings of [[false,'just-me'],[true,null]] as const) {
      await owner.query('UPDATE public.identity_profile SET profile_complete=$2,onboarding_mode=$3 WHERE identity_id=$1',[a.identityId,...settings]);
      assert.equal((await call(a,id,key,payload)).body.code,'MODE_CONFLICT');
      assert.equal((await call(a,id,randomUUID(),intent('4'))).body.code,'MODE_CONFLICT');
    }
    await owner.query('UPDATE public.identity_profile SET profile_complete=true,onboarding_mode=\'just-me\' WHERE identity_id=$1',[a.identityId]);
    assert.deepEqual(await call(a,id,key,payload),saved);
    pass('CURRENT_PROFILE_MODE_BEFORE_RECEIPT_REPLAY');
    phase='AUTHORITY';
    for(const override of [{origin:'https://foreign.invalid'},{csrf:randomBytes(32).toString('base64url')},
      {binding:b.binding},{chain:b.chain}]) {
      const denied=await call(a,id,key,payload,actor,override);assert([401,403].includes(denied.status));
    }
    await owner.query('UPDATE public.identity SET deleted_at=now() WHERE id=$1',[a.identityId]);
    assert.equal((await call(a,id,key,payload)).status,401);
    await owner.query('UPDATE public.identity SET deleted_at=NULL WHERE id=$1',[a.identityId]);
    await owner.query('UPDATE subtrack_auth.session SET revoked_ms=issued_ms+1 WHERE session_id=$1',[a.sid]);
    assert.equal((await call(a,id,key,payload)).status,401);
    await owner.query('UPDATE subtrack_auth.session SET revoked_ms=NULL WHERE session_id=$1',[a.sid]);
    assert.deepEqual(await call(a,id,key,payload),saved);
    pass('CURRENT_AUTHORITY_ORIGIN_CSRF_BINDING_CHAIN_REVOCATION');
    phase='STATUS';
    assert.deepEqual(await lifecycle.apply({userId:a.identityId},id,'pause'),{id,status:'PAUSED'});
    assert.equal((await snapshot(id))['revision'],'5');
    assert.equal((await call(a,id,randomUUID(),intent('4'))).body.code,'MANUAL_EDIT_CONFLICT');
    const c=await actor.connect();
    try {
      await c.query('BEGIN');await c.query('SET LOCAL ROLE subtrack_runtime');
      await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[a.identityId]);
      await c.query(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusLock,[a.identityId,id]);
      assert.equal((await c.query(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusCompareUpdate,[a.identityId,id,'PAUSED','ACTIVE'])).rowCount,1);
      await c.query('COMMIT');
    } finally {c.release();}
    assert.equal((await snapshot(id))['revision'],'6');
    assert.equal((await call(a,id,randomUUID(),intent('5'))).body.code,'MANUAL_EDIT_CONFLICT');
    assert.deepEqual(await call(a,id,key,payload),saved);
    pass('BOTH_UNCHANGED_STATUS_WRITERS_INVALIDATE_STALE_EDIT');
    phase='CONCURRENCY';
    const duplicateKey=randomUUID(), duplicatePayload=intent('6');
    const duplicate=await Promise.all([call(a,id,duplicateKey,duplicatePayload),call(a,id,duplicateKey,duplicatePayload)]);
    assert.deepEqual(duplicate[0],{status:200,body:{id,revision:'7'}});assert.deepEqual(duplicate[0],duplicate[1]);
    const competing=await Promise.all([call(a,id,randomUUID(),intent('7',{customName:'First'})),call(a,id,randomUUID(),intent('7',{customName:'Second'}))]);
    assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
    assert.equal(competing.find(r=>r.status===409)?.body.code,'MANUAL_EDIT_CONFLICT');
    assert.equal((await snapshot(id))['revision'],'8');
    // Hold a real ordinary lifecycle transaction immediately after its UPDATE;
    // Edit must block on the row lock then compare the newly committed revision.
    let wrote!:()=>void,releaseWriter!:()=>void;
    const writerReady=new Promise<void>(resolve=>{wrote=resolve;});
    const writerRelease=new Promise<void>(resolve=>{releaseWriter=resolve;});
    const heldLifecycle=new SubscriptionLifecycleRepository({$transaction:<T>(operation:(tx:Prisma.TransactionClient)=>Promise<T>)=>ordinaryPrisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET LOCAL ROLE subtrack_runtime');
      const result=await operation(tx);wrote();await writerRelease;return result;
    })} as unknown as Pick<PrismaClient,'$transaction'>);
    const writer=heldLifecycle.apply({userId:a.identityId},id,'pause');await writerReady;
    let targetAttempt!:()=>void;
    const targetReady=new Promise<void>(resolve=>{targetAttempt=resolve;});
    const observedPool={connect:async()=>{const real=await actor.connect();return {
      query:(sql:string,values?:unknown[])=>{if(sql===PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditTargetLock)targetAttempt();return real.query(sql,values);},
      release:(error?:Error)=>real.release(error)};}} as unknown as Pick<Pool,'connect'>;
    const blockedEdit=call(a,id,randomUUID(),intent('8'),observedPool);await targetReady;releaseWriter();
    assert.deepEqual(await writer,{id,status:'PAUSED'});
    assert.equal((await blockedEdit).body.code,'MANUAL_EDIT_CONFLICT');
    assert.equal((await snapshot(id))['revision'],'9');
    pass('SAME_KEY_ONCE_DIFFERENT_INTENT_STALE_CONCURRENT_ORDINARY_WRITER');
    phase='ROLLBACK';
    const stable=await snapshot(id), stableCounts=await counts(a.identityId);
    for(const fault of [PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditCompareUpdate,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptInsert]) {
      let discards=0;const operations:string[]=[];
      const faultPool={connect:async()=>{const real=await actor.connect();return {
        query:async(sql:string,values?:unknown[])=>{operations.push(sql);if(sql===fault)throw new Error('controlled write fault');return real.query(sql,values);},
        release:(error?:Error)=>{if(error)discards++;real.release(error);}};}} as unknown as Pick<Pool,'connect'>;
      assert.deepEqual(await call(a,id,randomUUID(),intent('9'),faultPool),fixedError('INTERNAL_ERROR',500));
      assert.equal(operations.includes('COMMIT'),false);assert.equal(operations.filter(sql=>sql==='ROLLBACK').length,1);assert.equal(discards,1);
      assert.deepEqual(await snapshot(id),stable);assert.deepEqual(await counts(a.identityId),stableCounts);
    }
    pass('KNOWN_ROLLBACK_NO_REVISION_OR_RECEIPT_RESIDUE');
    phase='OVERFLOW';
    const overflow=await seed(a.identityId);const privileged=await owner.connect();
    try {
      await privileged.query('BEGIN');
      await privileged.query('ALTER TABLE public.subscription DISABLE TRIGGER subscription_revision_before_write');
      await privileged.query('UPDATE public.subscription SET revision=9223372036854775807 WHERE id=$1',[overflow]);
      await privileged.query('ALTER TABLE public.subscription ENABLE TRIGGER subscription_revision_before_write');
      await privileged.query('COMMIT');
    } finally {privileged.release();}
    await assert.rejects(runtime(a.identityId,a.identityId,'UPDATE public.subscription SET revision=1 WHERE identity_id=$1 AND id=$2',[a.identityId,overflow]),{code:'22003'});
    assert.equal((await snapshot(overflow))['revision'],'9223372036854775807');
    const overflowCounts=await counts(a.identityId);
    assert.deepEqual(await call(a,overflow,randomUUID(),intent('9223372036854775807')),fixedError('INTERNAL_ERROR',500));
    assert.deepEqual(await counts(a.identityId),overflowCounts);
    pass('BIGINT_OVERFLOW_FAILS_CLOSED_ATOMIC_ROLLBACK');
    phase='UNKNOWN_COMMIT';
    let commits=0,connects=0,discards=0;const operations:string[]=[];
    const uncertainPool={connect:async()=>{connects++;const real=await actor.connect();return {
      query:async(sql:string,values?:unknown[])=>{operations.push(sql);if(sql==='COMMIT'){commits++;await real.query(sql,values);throw new Error('commit acknowledgement unavailable');}return real.query(sql,values);},
      release:(error?:Error)=>{if(error)discards++;real.release(error);}};}} as unknown as Pick<Pool,'connect'>;
    const unknownKey=randomUUID(), unknownPayload=intent('9');
    assert.deepEqual(await call(a,id,unknownKey,unknownPayload,uncertainPool),fixedError('INTERNAL_ERROR',500));
    assert.equal(connects,1);assert.equal(commits,1);assert.equal(discards,1);assert.equal(operations.includes('ROLLBACK'),false);
    const recovered=await call(a,id,unknownKey,unknownPayload);assert.deepEqual(recovered,{status:200,body:{id,revision:'10'}});
    assert.equal((await snapshot(id))['revision'],'10');
    pass('UNKNOWN_COMMIT_MASKED_DISCARD_EXPLICIT_EXACT_RECOVERY');
    phase='RESTART';
    const fresh=await session(a.identityId);
    const child=spawn(process.execPath,[process.argv[1]!,'--edit-replay'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let output='';child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString('utf8');});child.stderr.resume();
    const childResult=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    child.stdin.end(JSON.stringify({current:fresh,id,key:unknownKey,payload:unknownPayload,result:recovered}));
    assert.equal(await childResult,0);assert.equal(output,'PASS ST241_RESTART_EXACT_REPLAY\n');
    pass('FRESH_PROCESS_FRESH_SESSION_DURABLE_EDIT_REPLAY');
    phase='RETENTION';
    await owner.query('DELETE FROM public.subscription WHERE id=$1',[id]);
    assert.deepEqual(await call(fresh,id,key,payload),saved);
    assert.deepEqual(await call(fresh,id,unknownKey,unknownPayload),recovered);
    assert.equal((await runtime(a.identityId,a.identityId,PRIVATE_ONBOARDING_STATEMENTS.ownerDetail,[a.identityId,id,'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'])).rowCount,0);
    const immutable=await owner.query(`SELECT key_hash,request_hash,subscription_id::text,result_revision::text,created_at
      FROM public.manual_subscription_edit_receipt WHERE identity_id=$1 AND key_hash=$2`,[a.identityId,hash(key)]);
    assert.deepEqual(immutable.rows,receipt.rows);
    pass('RECEIPT_BEFORE_DELETED_TARGET_IMMUTABLE_RECONCILIATION');
    phase='ACL';
    for(const sql of ['UPDATE public.manual_subscription_edit_receipt SET result_revision=result_revision',
      'DELETE FROM public.manual_subscription_edit_receipt','TRUNCATE public.manual_subscription_edit_receipt'])
      await assert.rejects(runtime(a.identityId,a.identityId,sql),{code:'42501'});
    for(const length of [0,31,33]) {
      await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptInsert,
        [a.identityId,Buffer.alloc(length),Buffer.alloc(32),randomUUID(),'1']),{code:'23514'});
      await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptInsert,
        [a.identityId,randomBytes(32),Buffer.alloc(length),randomUUID(),'1']),{code:'23514'});
    }
    await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptInsert,
      [a.identityId,randomBytes(32),randomBytes(32),randomUUID(),'0']),{code:'23514'});
    await assert.rejects(runtime(b.identityId,b.identityId,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptInsert,
      [a.identityId,randomBytes(32),randomBytes(32),randomUUID(),'1']),{code:'42501'});
    await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_EDIT_STATEMENTS.manualEditReceiptInsert,
      [a.identityId,hash(key),randomBytes(32),randomUUID(),'1']),{code:'23505'});
    const resetLoans=await Promise.all(Array.from({length:4},()=>actor.connect()));
    try {
      for(const reset of resetLoans) {
        const row=(await reset.query(`SELECT current_user::text,session_user::text,
          current_setting('app.user_id',true) AS owner,current_setting('app.current_user_id',true) AS current_owner`)).rows[0];
        assert.equal(row?.current_user,epoch.login);assert.equal(row?.session_user,epoch.login);
        assert([null,''].includes(row?.owner));assert([null,''].includes(row?.current_owner));
      }
    } finally {for(const reset of resetLoans)reset.release();}
    pass('APPEND_ONLY_HASH_REVISION_UNIQUE_OWNER_ACL_POOL_RESET');
    phase='ERASURE';
    for(const identityId of owned) {
      for(const table of ['csrf','credential','session','family'])await owner.query(`DELETE FROM subtrack_auth.${table} WHERE identity_id=$1`,[identityId]);
      await owner.query('DELETE FROM public.subscription WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM public.identity_profile WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM public.identity WHERE id=$1',[identityId]);
      assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.manual_subscription_edit_receipt WHERE identity_id=$1',[identityId])).rows[0]?.n,0);
    }
    pass('PRIVILEGED_OWNER_ERASURE_CASCADE');
  } finally {await ordinaryPrisma.$disconnect();await actor.end();await owner.end();}
}
prove().catch(()=>{process.stderr.write(`FAIL ST241_ACTUAL_PG_EDIT phase=${phase}\n`);process.exitCode=1;});
