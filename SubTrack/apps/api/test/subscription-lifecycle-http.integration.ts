import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { test, vi } from 'vitest';
import { JwtService } from '../src/auth/sessions/jwt.service';
import { withRequestTransaction } from '../src/database/request-transaction';
import { createSubscriptionLifecycleApp } from '../src/subscriptions/subscription-lifecycle.http-composition';
import { inspectOwnedFixture } from '../src/subscriptions/subscription-lifecycle.local';

test('ST-216 actual HTTP, ordinary-role PostgreSQL, and direct Node proof', async () => {
  let phase = 'fixture preflight';
  let failure: Error | undefined;
  let fixture: PrismaClient | undefined;
  let runtime: PrismaClient | undefined;
  let app: Awaited<ReturnType<typeof createSubscriptionLifecycleApp>> | undefined;
  let child: ChildProcess | undefined;
  const logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map(name =>
    vi.spyOn(console, name).mockImplementation(() => undefined));
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  function endpoint(key: string, role: string): string {
    assert.equal(process.env['ST216_DISPOSABLE'], 'new-container');
    const value = process.env[key];
    assert(value);
    const url = new URL(value);
    assert.equal(url.protocol, 'postgresql:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, process.env['ST216_PORT']);
    assert.equal(url.pathname, '/subscription_lifecycle_proof');
    assert.equal(url.username, role);
    assert.equal(url.searchParams.get('connection_limit'), '1');
    return value;
  }
  const problem = (status: number, code: string) => ({ type: 'about:blank',
    title: status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' :
      status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : 'Internal Server Error', status, code });
  const exit = (processChild: ChildProcess, ms: number): Promise<number | null> => new Promise((resolve, reject) => {
    if (processChild.exitCode !== null || processChild.signalCode !== null) return resolve(processChild.exitCode);
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, ms);
    const done = () => { clearTimeout(timer); processChild.off('exit', onExit); processChild.off('error', onError); };
    const onExit = (code: number | null) => { done(); resolve(code); };
    const onError = () => { done(); reject(new Error('child')); };
    processChild.once('exit', onExit);
    processChild.once('error', onError);
  });
  const terminate = async (processChild: ChildProcess, signal: 'SIGTERM' | 'SIGINT' = 'SIGTERM') => {
    if (processChild.exitCode !== null || processChild.signalCode !== null) return;
    processChild.kill(signal);
    try { await exit(processChild, 10_000); return; } catch { /* bounded escalation */ }
    processChild.kill('SIGKILL');
    await exit(processChild, 3_000);
  };
  try {
    const runtimeUrl = endpoint('ST216_RUNTIME_URL', 'st216_runtime');
    inspectOwnedFixture(process.env['ST216_PROVENANCE_FILE'], runtimeUrl);
    const ownerUrl = endpoint('ST216_OWNER_URL', 'fixture_owner');
    const verifiedRuntime = new URL(runtimeUrl);
    const verifiedOwner = new URL(ownerUrl);
    assert.equal(verifiedOwner.host, verifiedRuntime.host);
    assert.equal(verifiedOwner.pathname, verifiedRuntime.pathname);
    fixture = new PrismaClient({ datasources: { db: { url: ownerUrl } }, log: [] });
    runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } }, log: [] });
    const storage = runtime;
    const roles = await storage.$queryRaw<{ role: string; superuser: boolean; bypass: boolean; login: boolean; members: bigint }[]>`
      SELECT current_user AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass,
        r.rolcanlogin AS login, (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS members
      FROM pg_roles r WHERE r.rolname=current_user`;
    assert.deepEqual(roles, [{ role: 'st216_runtime', superuser: false, bypass: false, login: true, members: 1n }]);
    const policy = await storage.$queryRaw<{ rls: boolean; update: boolean }[]>`
      SELECT c.relrowsecurity AS rls, has_table_privilege(current_user,c.oid,'UPDATE') AS update
      FROM pg_class c WHERE c.oid='public.subscription'::regclass`;
    assert.deepEqual(policy, [{ rls: true, update: true }]);
    type Settings = { pid: number; canonical: string | null; historical: string | null };
    const settings = async () => (await storage.$queryRaw<Settings[]>`SELECT pg_backend_pid() AS pid,
      current_setting('app.user_id',true) AS canonical,
      current_setting('app.current_user_id',true) AS historical`)[0]!;
    const baseline = await settings();
    const cleared = async () => { const row = await settings(); assert.equal(row.pid, baseline.pid);
      assert(!row.canonical && !row.historical); };
    await cleared();
    phase = 'synthetic identities and current sessions';
    const owner = randomUUID(), peer = randomUUID(), outsider = randomUUID(), household = randomUUID();
    const ownerSession = randomUUID(), peerSession = randomUUID(), outsiderSession = randomUUID();
    const revokedSession = randomUUID();
    for (const identity of [owner, peer, outsider])
      await fixture.$executeRaw`INSERT INTO identity (id,auth_method,updated_at) VALUES (${identity}::uuid,'MOCK',NOW())`;
    for (const [identity, session] of [[owner, ownerSession], [peer, peerSession], [outsider, outsiderSession], [peer, revokedSession]])
      await fixture.$executeRaw`INSERT INTO session (id,identity_id,device_name,refresh_token_hash,family_id)
        VALUES (${session}::uuid,${identity}::uuid,'synthetic',${randomUUID()},${randomUUID()}::uuid)`;
    await fixture.$executeRaw`UPDATE session SET revoked_at=NOW() WHERE id=${revokedSession}::uuid`;
    await fixture.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO household (id,name,updated_at) VALUES (${household}::uuid,'synthetic',NOW())`;
      await tx.$executeRaw`INSERT INTO household_member (household_id,identity_id,role)
        VALUES (${household}::uuid,${owner}::uuid,'ADMIN'),(${household}::uuid,${peer}::uuid,'MEMBER')`;
    });
    await fixture.$executeRaw`INSERT INTO consent (identity_id,scope_id,scope_type,open_book,updated_at)
      VALUES (${owner}::uuid,${household}::uuid,'HOUSEHOLD',true,NOW())`;
    const insert = async (id: string, identity: string, status: string, privateRow = false) =>
      fixture!.$executeRaw`INSERT INTO subscription
        (id,identity_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${id}::uuid,${identity}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',101,'SEK',
          ${status}::subscription_status,'DETECTED',${privateRow},NOW())`;
    const shared = randomUUID(), open = randomUUID(), hidden = randomUUID(), unrelated = randomUUID();
    for (const [id, identity, privateRow] of [[shared, owner, true], [open, owner, false],
      [hidden, owner, true], [unrelated, outsider, false]] as const) await insert(id, identity, 'ACTIVE', privateRow);
    await fixture.$executeRaw`INSERT INTO subscription_share (subscription_id,household_id,shared_by)
      VALUES (${shared}::uuid,${household}::uuid,${owner}::uuid)`;
    delete process.env['JWT_PRIVATE_KEY_PEM'];
    const jwt = new JwtService();
    const ownerToken = jwt.issue(owner, ownerSession), peerToken = jwt.issue(peer, peerSession);
    const outsiderToken = jwt.issue(outsider, outsiderSession);
    const revokedToken = jwt.issue(peer, revokedSession), wrongSubject = jwt.issue(owner, peerSession);
    app = await createSubscriptionLifecycleApp({ prisma: storage, verifier: jwt, developmentEnabled: true,
      host: '127.0.0.1', expectedDatabase: 'subscription_lifecycle_proof', expectedRole: 'st216_runtime' });
    const server = app.app.getHttpServer() as Parameters<typeof request>[0];
    const patch = (id: string, token: string, body: Record<string, string>) => request(server).patch(`/v1/subscriptions/${id}`)
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json').send(body);
    const status = async (id: string) => (await fixture!.$queryRaw<{ status: string }[]>`
      SELECT status::text FROM subscription WHERE id=${id}::uuid`)[0]!.status;
    phase = 'all seven owner status transitions';
    for (const [initial, target] of [['ACTIVE','PAUSED'], ['ACTIVE','CANCELLED'], ['ACTIVE','ARCHIVED'],
      ['PAUSED','ACTIVE'], ['PAUSED','CANCELLED'], ['PAUSED','ARCHIVED'], ['CANCELLED','ARCHIVED']] as const) {
      const id = randomUUID(); await insert(id, owner, initial);
      const response = await patch(id, ownerToken, { status: target }).expect(200);
      assert.deepEqual(response.body, { id, status: target });
      assert.equal(await status(id), target);
    }
    phase = 'visible peer, invisible peer, outsider and missing are uniformly denied';
    const visible = await request(server).get(`/v1/subscriptions/${shared}`)
      .set('Authorization', `Bearer ${peerToken}`).expect(200);
    assert.equal(visible.body.id, shared);
    const openVisible = await request(server).get(`/v1/subscriptions/${open}`)
      .set('Authorization', `Bearer ${peerToken}`).expect(200);
    assert.equal(openVisible.body.id, open);
    const missing = await patch(randomUUID(), peerToken, { status: 'PAUSED' }).expect(404);
    assert.deepEqual(missing.body, problem(404, 'SUBSCRIPTION_NOT_FOUND'));
    for (const [id, token] of [[shared,peerToken], [open,peerToken], [hidden,peerToken],
      [unrelated,ownerToken], [shared,outsiderToken]] as const) {
      const response = await patch(id, token, { status: 'PAUSED' }).expect(404);
      assert.equal(response.text, missing.text);
      assert.equal(await status(id), 'ACTIVE');
    }
    phase = 'guard and strict request validation';
    for (const token of [undefined, 'invalid', revokedToken, wrongSubject]) {
      const req = request(server).patch(`/v1/subscriptions/${shared}`).set('Content-Type','application/json');
      if (token) req.set('Authorization', `Bearer ${token}`);
      const response = await req.send({ status: 'PAUSED' }).expect(401);
      assert.deepEqual(response.body, problem(401, 'AUTHENTICATION_REQUIRED'));
    }
    for (const path of [`/v1/subscriptions/${shared}?owner=${owner}`, `/v1/subscriptions/${shared}?__proto__[x]=1`])
      assert.deepEqual((await request(server).patch(path).set('Authorization',`Bearer ${ownerToken}`)
        .set('Content-Type','application/json').send({ status:'PAUSED' }).expect(400)).body,
      problem(400,'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'));
    for (const body of [{ status:'PAUSED', ownerId:owner }, { status:'PAUSED', action:'pause' },
      { status:'DETECTED' }, { status:'PAUSED', constructor:'x' },
      { ownerId:owner }, {}])
      await patch(shared, ownerToken, body).expect(400);
    await patch('invalid', ownerToken, { status:'PAUSED' }).expect(400);
    await request(server).patch(`/v1/subscriptions/${shared}`).set('Authorization',`Bearer ${ownerToken}`)
      .set('Content-Type','text/plain').send('status=PAUSED').expect(400);
    await request(server).patch(`/v1/subscriptions/${shared}`).set('Authorization',`Bearer ${ownerToken}`)
      .set('Content-Type','application/json').send('{').expect(400);
    for (const raw of ['{"status":"PAUSED","status":"PAUSED"}',
      '{"status":"PAUSED","\\u0073tatus":"PAUSED"}',
      '{"status":"PAUSED","__proto__":{"x":1}}'])
      assert.deepEqual((await request(server).patch(`/v1/subscriptions/${shared}`)
        .set('Authorization',`Bearer ${ownerToken}`).set('Content-Type','application/json')
        .send(raw).expect(400)).body,problem(400,'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'));
    phase = 'conflict, race, rollback and pooled context';
    const raceId = randomUUID(); await insert(raceId, owner, 'ACTIVE');
    const race = await Promise.all([patch(raceId, ownerToken, {status:'PAUSED'}),
      patch(raceId, ownerToken, {status:'PAUSED'})]);
    assert.deepEqual(race.map(value => value.status).sort(), [200,409]);
    assert.equal(await status(raceId), 'PAUSED');
    assert.deepEqual((await patch(raceId, ownerToken, {status:'PAUSED'}).expect(409)).body,
      problem(409,'LIFECYCLE_CONFLICT'));
    assert.deepEqual((await patch(raceId, ownerToken, {status:'ARCHIVED'}).expect(200)).body,
      { id: raceId, status:'ARCHIVED' });
    assert.deepEqual((await patch(raceId, ownerToken, {status:'ACTIVE'}).expect(409)).body,
      problem(409,'LIFECYCLE_CONFLICT'));
    const rollbackId = randomUUID(); await insert(rollbackId, owner, 'ACTIVE');
    await assert.rejects(withRequestTransaction(storage, {userId:owner}, async tx => {
      await tx.$executeRaw`UPDATE subscription SET status='PAUSED'::subscription_status WHERE id=${rollbackId}::uuid`;
      throw new Error('rollback');
    }));
    assert.equal(await status(rollbackId), 'ACTIVE');
    await cleared();
    phase = 'masked database error';
    await fixture.$executeRawUnsafe('REVOKE UPDATE ON subscription FROM subtrack_runtime');
    try {
      const masked = await patch(rollbackId, ownerToken, {status:'PAUSED'}).expect(500);
      assert.deepEqual(masked.body, problem(500,'INTERNAL_ERROR'));
      assert(!/postgres|prisma|sql|password|127\.0\.0\.1/i.test(masked.text));
    } finally { await fixture.$executeRawUnsafe('GRANT UPDATE ON subscription TO subtrack_runtime'); }
    assert.equal(await status(rollbackId), 'ACTIVE');
    await cleared();
    phase = 'direct Node positive and provenance rejection';
    const runtimeConnections = async () => (await fixture!.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM pg_stat_activity
      WHERE usename='st216_runtime' AND datname=current_database()`)[0]!.count;
    const baselineConnections = await runtimeConnections();
    const assertPoolClosed = async () => {
      for (let attempt=0; attempt<30; attempt++) {
        if (await runtimeConnections() === baselineConnections) return;
        await delay(100);
      }
      assert.equal(await runtimeConnections(), baselineConnections);
    };
    const privateDir = process.env['ST216_PRIVATE_DIR']!;
    const keyFile = join(privateDir,'trusted-public.pem');
    writeFileSync(keyFile, jwt.publicKey.export({type:'spki',format:'pem'}), {mode:0o600});
    chmodSync(keyFile,0o600);
    const entry = join(__dirname,'../dist/subscriptions/subscription-lifecycle.local.js');
    const baseEnv = {...process.env, ST216_DEVELOPMENT_ENABLED:'1', ST216_BIND_HOST:'127.0.0.1',
      ST216_TRUSTED_PUBLIC_KEY_FILE:keyFile, NODE_ENV:'development', DATABASE_URL:'ignored'};
    const port = 20000 + Math.floor(Math.random() * 30000);
    const directId = randomUUID(); await insert(directId,owner,'ACTIVE');
    const spawnEntry = (env: Record<string,string|undefined>, bindPort: number) => spawn(process.execPath,[entry],{
      cwd:join(__dirname,'..'), stdio:'ignore', env:{...baseEnv,...env,ST216_BIND_PORT:String(bindPort)},
    });
    child = spawnEntry({},port);
    const url = `http://127.0.0.1:${port}/v1/subscriptions/${directId}`;
    let ready = false;
    for (let attempt=0; attempt<100; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try { if ((await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({status:'PAUSED'}),signal:AbortSignal.timeout(800)})).status===401) {ready=true;break;} }
      catch { /* waiting for bind */ }
      await delay(100);
    }
    assert(ready);
    const directResponse = await fetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${ownerToken}`,
      'Content-Type':'application/json'},body:JSON.stringify({status:'PAUSED'}),signal:AbortSignal.timeout(3_000)});
    assert.equal(directResponse.status,200);
    assert.deepEqual(await directResponse.json(),{id:directId,status:'PAUSED'});
    const crossPoolId=randomUUID(); await insert(crossPoolId,owner,'ACTIVE');
    const crossPoolUrl=`http://127.0.0.1:${port}/v1/subscriptions/${crossPoolId}`;
    const crossPool=await Promise.all([
      patch(crossPoolId,ownerToken,{status:'PAUSED'}),
      fetch(crossPoolUrl,{method:'PATCH',headers:{Authorization:`Bearer ${ownerToken}`,
        'Content-Type':'application/json'},body:'{"status":"PAUSED"}',signal:AbortSignal.timeout(5_000)}),
    ]);
    assert.deepEqual(crossPool.map(result=>result.status).sort(),[200,409]);
    assert.equal(await status(crossPoolId),'PAUSED');
    await terminate(child);
    assert.equal(child.exitCode,0);
    await assert.rejects(fetch(url,{signal:AbortSignal.timeout(800)}));
    await assertPoolClosed();
    child=undefined;
    const interruptPort=20000+Math.floor(Math.random()*30000);
    const interruptId=randomUUID(); await insert(interruptId,owner,'ACTIVE');
    const interruptUrl=`http://127.0.0.1:${interruptPort}/v1/subscriptions/${interruptId}`;
    child=spawnEntry({},interruptPort);
    let interruptReady=false;
    for(let attempt=0;attempt<100;attempt++) {
      if(child.exitCode!==null||child.signalCode!==null) break;
      try { if((await fetch(interruptUrl,{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:'{"status":"PAUSED"}',signal:AbortSignal.timeout(800)})).status===401) {interruptReady=true;break;} }
      catch { /* waiting for bind */ }
      await delay(100);
    }
    assert(interruptReady);
    const interruptResponse=await fetch(interruptUrl,{method:'PATCH',headers:{Authorization:`Bearer ${ownerToken}`,
      'Content-Type':'application/json'},body:'{"status":"PAUSED"}',signal:AbortSignal.timeout(3_000)});
    assert.equal(interruptResponse.status,200);
    assert.deepEqual(await interruptResponse.json(),{id:interruptId,status:'PAUSED'});
    await terminate(child,'SIGINT');
    assert.equal(child.exitCode,0);
    await assert.rejects(fetch(interruptUrl,{signal:AbortSignal.timeout(800)}));
    await assertPoolClosed();
    child=undefined;
    const record = JSON.parse(readFileSync(process.env['ST216_PROVENANCE_FILE']!,'utf8')) as Record<string,string>;
    const recordedRuntimeUrl = record.runtimeUrl;
    assert(recordedRuntimeUrl);
    const forged = join(privateDir,'forged.json'), stale = join(privateDir,'stale.json');
    writeFileSync(forged,JSON.stringify({...record,cid:'f'.repeat(64)}),{mode:0o600});
    writeFileSync(stale,JSON.stringify({...record,created:new Date(Date.now()-31*60_000).toISOString()}),{mode:0o600});
    const credentialMismatch=recordedRuntimeUrl.replace(/(st216_runtime:)[^@]+@/,'$1wrong@');
    for (const changes of [{ST216_PROVENANCE_FILE:''},{ST216_PROVENANCE_FILE:forged},
      {ST216_PROVENANCE_FILE:stale},{ST216_RUNTIME_URL:credentialMismatch},
      {ST216_RUNTIME_URL:recordedRuntimeUrl.replace('/subscription_lifecycle_proof','/wrong')}]) {
      const negativePort=20000+Math.floor(Math.random()*30000);
      const negative=spawnEntry(changes,negativePort);
      try {
        assert.equal(await exit(negative,8_000),1);
        await assert.rejects(fetch(`http://127.0.0.1:${negativePort}/`,{signal:AbortSignal.timeout(800)}));
      } finally { await terminate(negative); }
    }
    await cleared();
    assert(logs.every(spy=>spy.mock.calls.length===0));
  } catch {
    failure = new Error(`Disposable subscription lifecycle HTTP proof failed: ${phase}`);
  }
  const cleanup = await Promise.allSettled([child ? terminate(child) : Promise.resolve(),
    app?.close(),runtime?.$disconnect(),fixture?.$disconnect()]);
  const logged=logs.some(spy=>spy.mock.calls.length>0);
  for(const spy of logs) spy.mockRestore();
  if(logged||cleanup.some(item=>item.status==='rejected')) throw new Error('Disposable subscription lifecycle HTTP proof failed: cleanup or logging');
  if(failure) throw failure;
},180_000);
