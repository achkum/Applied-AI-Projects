// ST-240 actual owned PG16 proof; shell bundles this from the exact reviewed source.
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
import { PRIVATE_MANUAL_CREATE_STATEMENTS } from '../src/subscriptions/private-manual-create-statements';
import { PRIVATE_ONBOARDING_STATEMENTS } from '../src/profile/private-onboarding-statements';
import { createPrivateManualCreateHttp } from '../src/subscriptions/private-manual-create-http';

let phase = 'CONFIG';
const pass = (label: string): void => { process.stdout.write(`PASS ST240_ACTUAL_PG_${label}\n`); };
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
    businessStatements:{...PRIVATE_ONBOARDING_STATEMENTS,...PRIVATE_MANUAL_CREATE_STATEMENTS}});
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
  async function call(current: Session, key: string, payload: object = body, pool: Pick<Pool,'connect'> = actor,
    override: {origin?:string;csrf?:string;binding?:string;chain?:string;rawBody?:string} = {}) {
    const text = override.rawBody ?? JSON.stringify(payload);
    const socket = Object.create(TLSSocket.prototype) as TLSSocket;
    Object.defineProperties(socket,{remoteAddress:{value:'127.0.0.1'},encrypted:{value:true}});
    const req = Object.assign(Readable.from([Buffer.from(text)]),{socket,method:'POST',url:'/v2/subscriptions/owner/manual',rawHeaders:[
      'Host','localhost:3443','Content-Type','application/json','Content-Length',String(Buffer.byteLength(text)),
      'Origin',override.origin ?? epoch.origin,'Idempotency-Key',key,'X-Session-CSRF',override.csrf ?? current.csrf,
      'Cookie',`st_v2_access=${current.access}; st_v2_binding=${override.binding ?? current.binding}; st_v2_chain=${override.chain ?? current.chain}`,
    ]}) as unknown as IncomingMessage;
    const headers: Record<string,unknown> = {}; let textResponse = '';
    const res = {statusCode:0,setHeader:(name:string,value:unknown)=>{headers[name]=value;},end:(value:string)=>{textResponse=value;}};
    await createPrivateManualCreateHttp(authority(pool)).handle(req,res as unknown as ServerResponse);
    assert.equal(headers['Cache-Control'],'no-store');
    assert.equal(headers['Content-Type'],res.statusCode===201?'application/json':'application/problem+json');
    return {status:res.statusCode,body:JSON.parse(textResponse) as {id?:string;code?:string}};
  }
  async function counts(identityId:string) {
    const result = await owner.query(`SELECT
      (SELECT count(*)::int FROM public.subscription WHERE identity_id=$1) AS subscriptions,
      (SELECT count(*)::int FROM public.manual_subscription_create_receipt WHERE identity_id=$1) AS receipts`,[identityId]);
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
  try {
    if (process.argv[2] === '--manual-replay') {
      const chunks: Buffer[] = []; let size=0;
      for await (const chunk of process.stdin) {
        const bytes=Buffer.from(chunk as Uint8Array); size+=bytes.length; assert(size<=8192); chunks.push(bytes);
      }
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {current:Session;key:string;id:string};
      assert.deepEqual(await call(input.current,input.key),{status:201,body:{id:input.id}});
      process.stdout.write('PASS ST240_RESTART_EXACT_REPLAY\n');
      return;
    }
    phase='CREATE';
    const a = await session(), b = await session(), key = randomUUID();
    const created = await call(a,key,{...body,customName:'  Manual Proof  '});
    assert.equal(created.status,201); assert.match(created.body.id ?? '',/^[0-9a-f-]{36}$/);
    const id = created.body.id!;
    assert.deepEqual(await call(a,key),created);
    const omittedDate = { customName:body.customName,categoryCode:body.categoryCode,cadence:body.cadence,expectedAmountMinor:body.expectedAmountMinor };
    assert.deepEqual(await call(a,key,omittedDate),created);
    assert.deepEqual(await counts(a.identityId),{subscriptions:1,receipts:1});
    const row = await owner.query(`SELECT identity_id::text,custom_name,source::text,status::text,currency,
      expected_amount_minor::text,next_charge_date,always_private,merchant_id,catalog_plan_id,paying_account_id,confidence,detection_reasons
      FROM public.subscription WHERE id=$1`,[id]);
    assert.deepEqual(row.rows,[{identity_id:a.identityId,custom_name:'Manual Proof',source:'MANUAL',status:'ACTIVE',currency:'SEK',
      expected_amount_minor:'9223372036854775807',next_charge_date:null,always_private:true,merchant_id:null,catalog_plan_id:null,paying_account_id:null,confidence:null,detection_reasons:null}]);
    const receipt = await owner.query('SELECT key_hash,request_hash,subscription_id::text,created_at FROM public.manual_subscription_create_receipt WHERE identity_id=$1',[a.identityId]);
    assert.deepEqual(receipt.rows[0]?.key_hash,hash(key));
    assert.deepEqual(receipt.rows[0]?.request_hash,hash(JSON.stringify({v:'manual-create-v1',...body})));
    assert.equal(receipt.rows[0]?.subscription_id,id);
    assert.equal((await call(a,key,{...body,customName:'Changed'})).body.code,'MANUAL_IDEMPOTENCY_CONFLICT');
    pass('CREATE_CANONICAL_REPLAY_CONFLICT_FIXED_FIELDS');
    phase='MODE';
    for (const settings of [[false,'just-me'],[true,null]] as const) {
      await owner.query('UPDATE public.identity_profile SET profile_complete=$2,onboarding_mode=$3 WHERE identity_id=$1',[a.identityId,...settings]);
      for (const candidate of [key,randomUUID()]) {
        const denied = await call(a,candidate); assert.equal(denied.status,409); assert.equal(denied.body.code,'MODE_CONFLICT');
      }
    }
    await owner.query('UPDATE public.identity_profile SET profile_complete=true,onboarding_mode=\'just-me\' WHERE identity_id=$1',[a.identityId]);
    pass('MODE_CURRENT_ON_CREATE_AND_REPLAY');
    phase='AUTHORITY';
    for (const override of [{origin:'https://foreign.invalid'},{csrf:randomBytes(32).toString('base64url')},
      {binding:b.binding},{chain:b.chain}]) {
      const denied = await call(a,randomUUID(),body,actor,override); assert([401,403].includes(denied.status));
    }
    await owner.query('UPDATE public.identity SET deleted_at=now() WHERE id=$1',[a.identityId]);
    assert.equal((await call(a,key)).status,401);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.manual_subscription_create_receipt WHERE identity_id=$1',[a.identityId])).rows[0]?.n,1);
    await owner.query('UPDATE public.identity SET deleted_at=NULL WHERE id=$1',[a.identityId]);
    await owner.query('UPDATE subtrack_auth.session SET revoked_ms=issued_ms+1 WHERE session_id=$1',[a.sid]);
    assert.equal((await call(a,key)).status,401);
    await owner.query('UPDATE subtrack_auth.session SET revoked_ms=NULL WHERE session_id=$1',[a.sid]);
    await owner.query('UPDATE subtrack_auth.csrf SET expires_ms=issued_ms+1 WHERE session_id=$1',[a.sid]);
    assert.equal((await call(a,key)).status,401);
    const fresh = await session(a.identityId);
    assert.deepEqual(await call(fresh,key),created);
    assert.equal((await call(b,key)).status,201);
    for (const [first,second] of [[b.identityId,b.identityId],[a.identityId,''],[a.identityId,b.identityId],['bad','bad']]) {
      assert.equal((await runtime(first!,second!,PRIVATE_MANUAL_CREATE_STATEMENTS.manualReceiptRead,[a.identityId,hash(key)])).rowCount,0);
    }
    pass('CURRENT_SESSION_ORIGIN_CSRF_BINDING_CHAIN_FOREIGN_ISOLATION');
    phase='CONCURRENCY';
    const parallelKey = randomUUID();
    const parallel = await Promise.all([call(fresh,parallelKey),call(fresh,parallelKey)]);
    assert.equal(parallel[0]?.status,201); assert.deepEqual(parallel[0],parallel[1]);
    assert.deepEqual(await counts(a.identityId),{subscriptions:2,receipts:2});
    pass('CONCURRENT_EXACT_DUPLICATE_SINGLE_ROW');
    phase='ROLLBACK';
    let attempts=0,discards=0;
    const rollbackPool = {connect:async()=>{
      const real=await actor.connect();
      return {query:async(sql:string,values?:unknown[])=>{
        if (sql===PRIVATE_MANUAL_CREATE_STATEMENTS.manualReceiptInsert) {attempts++; throw new Error('receipt fault');}
        return real.query(sql,values);
      },release:(error?:Error)=>{if(error)discards++;real.release(error);}};
    }} as unknown as Pick<Pool,'connect'>;
    assert.equal((await call(fresh,randomUUID(),body,rollbackPool)).status,500);
    assert.equal(attempts,1); assert.equal(discards,1);
    assert.deepEqual(await counts(a.identityId),{subscriptions:2,receipts:2});
    pass('KNOWN_ROLLBACK_NO_SUBSCRIPTION_OR_RECEIPT_RESIDUE');
    phase='UNKNOWN_COMMIT';
    let commits=0,connects=0;discards=0;
    const uncertainPool = {connect:async()=>{
      connects++;const real=await actor.connect();
      return {query:async(sql:string,values?:unknown[])=>{
        if(sql==='COMMIT'){commits++;await real.query(sql,values);throw new Error('commit acknowledgement unavailable');}
        return real.query(sql,values);
      },release:(error?:Error)=>{if(error)discards++;real.release(error);}};
    }} as unknown as Pick<Pool,'connect'>;
    const uncertainKey=randomUUID();
    const uncertain=await call(fresh,uncertainKey,body,uncertainPool);
    assert.equal(uncertain.status,500);assert.deepEqual(uncertain.body,{type:'about:blank',title:'Internal Server Error',status:500,code:'INTERNAL_ERROR'});
    assert.equal(connects,1);assert.equal(commits,1);assert.equal(discards,1);
    const recovered=await call(fresh,uncertainKey);assert.equal(recovered.status,201);
    assert.deepEqual(await counts(a.identityId),{subscriptions:3,receipts:3});
    pass('UNKNOWN_COMMIT_MASKED_DISCARD_EXPLICIT_REPLAY_RECOVERY');
    phase='RESTART';
    const child = spawn(process.execPath,[process.argv[1]!,'--manual-replay'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let output=''; child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString('utf8');});
    // Parent-to-child stdin retains private fixture authority in process memory only.
    child.stderr.resume();
    const childResult=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    child.stdin.end(JSON.stringify({current:fresh,key:uncertainKey,id:recovered.body.id}));
    assert.equal(await childResult,0); assert.equal(output,'PASS ST240_RESTART_EXACT_REPLAY\n');
    assert.deepEqual(await counts(a.identityId),{subscriptions:3,receipts:3});
    pass('FRESH_PROCESS_EXACT_DURABLE_RECEIPT_REPLAY');
    phase='RETENTION';
    await owner.query('UPDATE public.subscription SET status=\'PAUSED\' WHERE id=$1',[id]);
    assert.deepEqual(await call(fresh,key),created);
    assert.equal((await owner.query('SELECT status::text FROM public.subscription WHERE id=$1',[id])).rows[0]?.status,'PAUSED');
    await owner.query('DELETE FROM public.subscription WHERE id=$1',[id]);
    assert.deepEqual(await call(fresh,key),created);
    const immutable = await owner.query('SELECT key_hash,request_hash,subscription_id::text,created_at FROM public.manual_subscription_create_receipt WHERE identity_id=$1 AND key_hash=$2',[a.identityId,hash(key)]);
    assert.deepEqual(immutable.rows,receipt.rows);
    pass('IMMUTABLE_RECEIPT_STATUS_DELETE_FRESH_AUTHORITY_RETENTION');
    phase='ACL';
    for (const sql of ['UPDATE public.manual_subscription_create_receipt SET subscription_id=subscription_id',
      'DELETE FROM public.manual_subscription_create_receipt','TRUNCATE public.manual_subscription_create_receipt']) {
      await assert.rejects(runtime(a.identityId,a.identityId,sql),{code:'42501'});
    }
    for (const length of [0,31,33]) {
      await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_CREATE_STATEMENTS.manualReceiptInsert,
        [a.identityId,Buffer.alloc(length),Buffer.alloc(32),randomUUID()]),{code:'23514'});
      await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_CREATE_STATEMENTS.manualReceiptInsert,
        [a.identityId,randomBytes(32),Buffer.alloc(length),randomUUID()]),{code:'23514'});
    }
    await assert.rejects(runtime(b.identityId,b.identityId,PRIVATE_MANUAL_CREATE_STATEMENTS.manualReceiptInsert,
      [a.identityId,randomBytes(32),randomBytes(32),randomUUID()]),{code:'42501'});
    await assert.rejects(runtime(a.identityId,a.identityId,PRIVATE_MANUAL_CREATE_STATEMENTS.manualReceiptInsert,
      [a.identityId,hash(key),randomBytes(32),randomUUID()]),{code:'23505'});
    const c=await actor.connect();
    try { const reset=await c.query(`SELECT current_user::text,session_user::text,
      current_setting('app.user_id',true) AS owner,current_setting('app.current_user_id',true) AS current_owner`);
      assert.equal(reset.rows[0]?.current_user,epoch.login);assert.equal(reset.rows[0]?.session_user,epoch.login);
      assert([null,''].includes(reset.rows[0]?.owner));assert([null,''].includes(reset.rows[0]?.current_owner));
    } finally {c.release();}
    pass('APPEND_ONLY_ACL_DUAL_GUC_HASH_CONSTRAINT_UNIQUE_POOL_RESET');
    phase='ERASURE';
    for(const identityId of owned) {
      await owner.query('DELETE FROM subtrack_auth.csrf WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM subtrack_auth.credential WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM subtrack_auth.session WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM subtrack_auth.family WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM public.subscription WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM public.identity_profile WHERE identity_id=$1',[identityId]);
      await owner.query('DELETE FROM public.identity WHERE id=$1',[identityId]);
      assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.manual_subscription_create_receipt WHERE identity_id=$1',[identityId])).rows[0]?.n,0);
    }
    pass('PRIVILEGED_OWNER_ERASURE_CASCADE');
  } finally {await actor.end();await owner.end();}
}
prove().catch(()=>{process.stderr.write(`FAIL ST240_ACTUAL_PG_MANUAL phase=${phase}\n`);process.exitCode=1;});
