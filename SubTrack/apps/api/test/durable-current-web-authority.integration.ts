// ST-235 qualified PG16 entry. Bundled by the owned foundation proof into its
// read-only, two-mount Node sidecar; this file is not a mock-only Vitest test.
import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool, type PoolClient } from 'pg';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { hashBrowserBindingCookie } from '../src/auth/sessions-v2/v2-web-session-binding';
import { DurableCurrentWebAuthority, type CurrentWebRequest } from '../src/auth/sessions-v2/durable-current-web-authority';
import { createDurableCurrentWebFixture, hashDurableFixtureNonce } from '../src/auth/sessions-v2/durable-current-web-fixture';

const origin = 'https://st233a.invalid';
const epoch = 'fixture';
const manifestHash = 'a'.repeat(64);
const db = JSON.parse(readFileSync('/fixture.json', 'utf8')) as Record<string, unknown>;
if (Object.keys(db).sort().join(',') !== 'database,ownerPassword,password' ||
    !/^st233a_[a-z_]+$/.test(String(db.database)) ||
    ![db.password, db.ownerPassword].every(v => typeof v === 'string' && /^[a-f0-9]{48}$/.test(v))) throw Error('fixture-config');
const common = { host: '127.0.0.1', port: 5432, database: String(db.database),
  connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 4000,
  application_name: 'st235-durable-current' };
const actor = new Pool({ ...common, user: 'subtrack_dev_auth_login', password: String(db.password), max: 4 });
const owner = new Pool({ ...common, user: 'st233a_fixture_owner', password: String(db.ownerPassword), max: 2 });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey, publicKey, clock: Date.now });
const authority = (options: { epoch?: string; manifestHash?: string; observedMs?: () => number } = {}) =>
  new DurableCurrentWebAuthority({ pool: actor, accessTokens: tokens, origin,
    epoch: options.epoch ?? epoch, manifestHash: options.manifestHash ?? manifestHash, observedMs: options.observedMs });
const fail = async (operation: () => Promise<unknown>, label: string) => {
  try { await operation(); } catch (error) {
    if (String(error).includes('refreshToken') || String(error).includes('csrfToken')) throw Error(`${label}: secret in failure`);
    return;
  }
  throw Error(`${label}: accepted`);
};
const query = (sql: string, args: readonly unknown[] = []) => owner.query(sql, [...args]);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function seed(label: string) {
  const identityId = randomUUID();
  const nonce = randomBytes(32).toString('base64url');
  const bindingCookie = randomBytes(32).toString('base64url');
  const chain = `st235-${label}-${randomUUID()}`;
  const ms = Date.now();
  await query('INSERT INTO public.identity(id,external_id,auth_method,updated_at) VALUES ($1,$2,\'MOCK\',CURRENT_TIMESTAMP)',
    [identityId, `st235-${label}`]);
  await query(`INSERT INTO subtrack_auth.nonce(nonce_h,transport,origin,chain,binding_h,epoch,issued_ms,expires_ms,purpose,authority_h)
    VALUES ($1,'web',$2,$3,$4,$5,$6,$7,'session',NULL)`,
    [hashDurableFixtureNonce(nonce), origin, chain, hashBrowserBindingCookie(bindingCookie), epoch, ms - 1000, ms + 299000]);
  const fixture = createDurableCurrentWebFixture({ pool: owner, accessTokens: tokens, origin, epoch, manifestHash,
    ownerId: identityId, nonce, chain, bindingCookie });
  const issued = await fixture.issueFixture();
  return { identityId, nonce, chain, ...issued,
    request: { accessToken: issued.accessToken, exactOrigin: origin, bindingCookie, browserChainId: chain, csrfToken: issued.csrfToken } };
}

async function ordinaryReset() {
  const clients = await Promise.all(Array.from({ length: 4 }, () => actor.connect()));
  try {
    for (const client of clients) {
      const result = await client.query(`SELECT current_user='subtrack_dev_auth_login' AND
        session_user='subtrack_dev_auth_login' AS role_ok,
        coalesce(current_setting('app.user_id',true),'')='' AS user_ok,
        coalesce(current_setting('app.current_user_id',true),'')='' AS current_ok`);
      if (!Object.values(result.rows[0] as Record<string, unknown>).every(v => v === true)) throw Error('role-or-GUC-leak');
    }
  } finally { for (const client of clients) client.release(); }
}

// Pause after a private mutation has returned, before its adapter COMMIT. This
// holds the real PG row locks while a second adapter request attempts to enter.
async function holdMutation(
  request: CurrentWebRequest,
  operation: 'revoke' | 'csrf',
) {
  let entered = () => {};
  let release = () => {};
  const enteredGate = new Promise<void>(resolve => { entered = resolve; });
  const releaseGate = new Promise<void>(resolve => { release = resolve; });
  const gatedPool = { connect: async () => {
    const client = await actor.connect();
    const query: PoolClient['query'] = ((sql: string, values?: unknown[]) => {
      if (sql === 'COMMIT') { entered(); return releaseGate.then(() => client.query(sql, values)); }
      return client.query(sql, values);
    }) as PoolClient['query'];
    return { query, release: (error?: Error) => client.release(error) } as PoolClient;
  } };
  const gated = new DurableCurrentWebAuthority({ pool: gatedPool, accessTokens: tokens, origin, epoch, manifestHash });
  const operationResult = (operation === 'revoke' ? gated.revokeCurrent(request) : gated.replaceCurrentCsrf(request));
  return { enteredGate, release, operationResult };
}

async function restartInChild(current: CurrentWebRequest, revoked: CurrentWebRequest, oldCsrf: CurrentWebRequest) {
  const child = spawn(process.execPath, ['/fixture.cjs', '--st235-restart'], {
    env: { NODE_ENV: 'development' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdin.on('error', () => { /* child failure is reported by close */ });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (part: string) => { output += part; if (output.length > 128) child.kill(); });
  child.stderr.resume();
  const exit = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('restart-timeout')); }, 20_000);
    child.once('error', () => { clearTimeout(timer); reject(Error('restart-spawn')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && output === 'ST-235 restart: PASS\n') resolve();
      else reject(Error('restart-proof'));
    });
  });
  child.stdin.end(JSON.stringify({ key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    current, revoked, oldCsrf }));
  await exit;
}

async function restartChild() {
  let input = '';
  for await (const part of process.stdin) {
    input += String(part);
    if (input.length > 32_768) throw Error('restart-input');
  }
  const data = JSON.parse(input) as { key: string; current: CurrentWebRequest; revoked: CurrentWebRequest; oldCsrf: CurrentWebRequest };
  const signingKey = createPrivateKey(data.key);
  const sameKeyTokens = new V2AccessToken({ environment: 'development', enabled: true,
    privateKey: signingKey, publicKey: createPublicKey(signingKey), clock: Date.now });
  const fresh = new DurableCurrentWebAuthority({ pool: actor, accessTokens: sameKeyTokens, origin, epoch, manifestHash });
  await fresh.withCurrentWebAuthority(data.current, async () => true);
  await fail(() => fresh.withCurrentWebAuthority(data.revoked, async () => true), 'restart-revoked');
  await fail(() => fresh.withCurrentWebAuthority(data.oldCsrf, async () => true), 'restart-old-csrf');
  await ordinaryReset();
  await actor.end(); await owner.end();
  process.stdout.write('ST-235 restart: PASS\n');
}

async function denialCatalog() {
  const privateTables = ['family','session','credential','csrf'];
  const roles = ['subtrack_dev_auth_login','subtrack_runtime','subtrack_auth_producer','subtrack_identity_provisioner'];
  for (const role of roles) for (const table of privateTables) {
    const r = await query(`SELECT NOT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS denied`,
      [role, `subtrack_auth.${table}`]);
    if (r.rows[0]?.denied !== true) throw Error(`private-table-grant:${role}:${table}`);
  }
  for (const functionName of ['check_current_web','replace_current_csrf','revoke_current']) {
    const signature = functionName === 'replace_current_csrf' ?
      '(uuid,uuid,text,text,subtrack_auth.h,subtrack_auth.h,text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h)' :
      '(uuid,uuid,text,text,subtrack_auth.h,subtrack_auth.h,text,subtrack_auth.h,subtrack_auth.ms)';
    const r = await query(`SELECT NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) acl
      WHERE p.oid=$1::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE') AS denied`,
      [`subtrack_auth.${functionName}${signature}`]);
    if (r.rows[0]?.denied !== true) throw Error(`public-function-grant:${functionName}`);
  }
  for (const role of ['subtrack_auth_executor','subtrack_auth_owner']) {
    const r = await query(`SELECT NOT pg_has_role('subtrack_dev_auth_login',$1,'SET') AS denied`, [role]);
    if (r.rows[0]?.denied !== true) throw Error(`login-set:${role}`);
  }
  const c = await actor.connect();
  try {
    for (const sql of ['SET ROLE subtrack_auth_executor','SELECT * FROM subtrack_auth.session',
      `SELECT subtrack_auth.issue_fixture(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`]) {
      await fail(async () => { await c.query(sql); }, `actor-denial:${sql.slice(0,18)}`);
    }
  } finally { c.release(true); }
}

async function main() {
  if (process.env.NODE_ENV !== 'development') throw Error('proof-mode');
  const denyConstructors = () => {
    try {
      authority();
      throw Error('default-authority-exposed');
    } catch (error) { if (String(error).includes('default-authority-exposed')) throw error; }
    try {
      createDurableCurrentWebFixture({ pool: owner, accessTokens: tokens, origin, epoch, manifestHash,
        ownerId: randomUUID(), nonce: randomBytes(32).toString('base64url'), chain: 'guard',
        bindingCookie: randomBytes(32).toString('base64url') });
      throw Error('fixture-exposed');
    } catch (error) { if (String(error).includes('fixture-exposed')) throw error; }
  };
  try {
    delete process.env.NODE_ENV;
    denyConstructors();
    process.env.NODE_ENV = 'production';
    denyConstructors();
  } finally { process.env.NODE_ENV = 'development'; }
  await denialCatalog();
  const a = await seed('a');
  const b = await seed('b');
  const web = authority();
  const write = (value: string) => web.withCurrentWebAuthority(a.request, async (tx, principal) => {
    if (principal.identityId !== a.identityId) throw Error('wrong-principal');
    await tx.query('UPDATE public.identity SET external_id=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2', [value, a.identityId]);
    return value;
  });
  if (await write('st235-committed') !== 'st235-committed') throw Error('commit-result');
  const persisted = await query('SELECT external_id FROM public.identity WHERE id=$1', [a.identityId]);
  if (persisted.rows[0]?.external_id !== 'st235-committed') throw Error('commit-missing');
  await fail(() => web.withCurrentWebAuthority(a.request, async (tx) => {
    await tx.query('UPDATE public.identity SET external_id=$1 WHERE id=$2', ['st235-rolled-back', a.identityId]);
    throw Error('known-rollback');
  }), 'callback-rollback');
  if ((await query('SELECT external_id FROM public.identity WHERE id=$1',[a.identityId])).rows[0]?.external_id !== 'st235-committed') throw Error('rollback-write');
  await web.withCurrentWebAuthority(b.request, async tx => {
    const rows = await tx.query('SELECT id FROM public.identity ORDER BY id');
    if (rows.rows.length !== 1 || rows.rows[0]?.id !== b.identityId) throw Error('A-B-RLS');
    const cross = await tx.query('UPDATE public.identity SET external_id=$1 WHERE id=$2 RETURNING id', ['cross',a.identityId]);
    if (cross.rowCount !== 0) throw Error('A-B-update');
  });
  const bad = [
    { ...a.request, accessToken: b.accessToken },
    { ...a.request, accessToken: '' },
    { ...a.request, exactOrigin: 'https://evil.invalid' },
    { ...a.request, bindingCookie: b.bindingCookie },
    { ...a.request, browserChainId: b.chain },
    { ...a.request, csrfToken: b.csrfToken },
  ];
  for (const [index, request] of bad.entries()) {
    let callbackRan = false;
    await fail(() => web.withCurrentWebAuthority(request, async () => {
      callbackRan = true;
      throw Error('unauthorized-callback-ran');
    }), `authority-${index}`);
    if (callbackRan) throw Error(`authority-${index}: callback-ran`);
  }
  await fail(() => authority({ epoch: 'retired' }).withCurrentWebAuthority(a.request, async () => true), 'wrong-epoch');
  await fail(() => authority({ manifestHash: 'b'.repeat(64) }).withCurrentWebAuthority(a.request, async () => true), 'wrong-manifest');
  await fail(() => authority({ observedMs: () => Date.now() + 86_400_000 }).withCurrentWebAuthority(a.request, async () => true), 'future-clock');
  await ordinaryReset();
  // A max-one pool makes backend reuse observable across success and denial.
  const reusePool = new Pool({ ...common, user: 'subtrack_dev_auth_login', password: String(db.password), max: 1 });
  try {
    const first = await reusePool.connect();
    const backend = (await first.query('SELECT pg_catalog.pg_backend_pid() AS pid')).rows[0]?.pid;
    first.release();
    const reused = new DurableCurrentWebAuthority({ pool: reusePool, accessTokens: tokens, origin, epoch, manifestHash });
    await reused.withCurrentWebAuthority(a.request, async () => true);
    const afterSuccess = await reusePool.connect();
    try {
      const state = (await afterSuccess.query(`SELECT pg_catalog.pg_backend_pid() AS pid,
        current_user='subtrack_dev_auth_login' AND session_user='subtrack_dev_auth_login' AS role_ok,
        coalesce(current_setting('app.user_id',true),'')='' AS user_ok,
        coalesce(current_setting('app.current_user_id',true),'')='' AS current_ok`)).rows[0];
      if (state?.pid !== backend || state.role_ok !== true || state.user_ok !== true || state.current_ok !== true) throw Error('pool-success-reset');
    } finally { afterSuccess.release(); }
    await fail(() => reused.withCurrentWebAuthority({ ...a.request, csrfToken: b.csrfToken }, async () => true), 'reuse-denial');
    const last = await reusePool.connect();
    try {
      const state = (await last.query(`SELECT pg_catalog.pg_backend_pid() AS pid,
        current_user='subtrack_dev_auth_login' AND session_user='subtrack_dev_auth_login' AS role_ok,
        coalesce(current_setting('app.user_id',true),'')='' AS user_ok,
        coalesce(current_setting('app.current_user_id',true),'')='' AS current_ok`)).rows[0];
      if (state?.pid === backend || state.role_ok !== true || state.user_ok !== true || state.current_ok !== true) throw Error('pool-denial-cleanup');
    } finally { last.release(); }
  } finally { await reusePool.end(); }

  // A held owner write wins; revoke and CSRF replacement must wait for the same locks.
  let entered = () => {};
  let release = () => {};
  const enteredGate = new Promise<void>(resolve => { entered = resolve; });
  const holdGate = new Promise<void>(resolve => { release = resolve; });
  const held = web.withCurrentWebAuthority(a.request, async tx => {
    await tx.query('UPDATE public.identity SET external_id=$1 WHERE id=$2', ['st235-held',a.identityId]);
    entered(); await holdGate;
  });
  await enteredGate;
  let finished = false;
  const revoke = web.revokeCurrent(a.request).then(() => { finished = true; });
  await delay(100);
  if (finished) throw Error('revoke-passed-held-write');
  release(); await held; await revoke;
  if ((await query('SELECT external_id FROM public.identity WHERE id=$1',[a.identityId])).rows[0]?.external_id !== 'st235-held') throw Error('held-write-absent');
  await fail(() => write('st235-after-revoke'), 'revoked');
  const c = await seed('c');
  let csrfEntered = () => {};
  let csrfRelease = () => {};
  const csrfEnteredGate = new Promise<void>(resolve => { csrfEntered = resolve; });
  const csrfHoldGate = new Promise<void>(resolve => { csrfRelease = resolve; });
  const csrfHeld = web.withCurrentWebAuthority(c.request, async () => { csrfEntered(); await csrfHoldGate; });
  await csrfEnteredGate;
  let replaced = false;
  const replacing = web.replaceCurrentCsrf(c.request).then(token => { replaced = true; return token; });
  await delay(100);
  if (replaced) throw Error('csrf-replace-passed-held-write');
  csrfRelease(); await csrfHeld;
  const nextCsrf = await replacing;
  await fail(() => web.withCurrentWebAuthority(c.request, async () => true), 'old-csrf');
  await web.withCurrentWebAuthority({ ...c.request, csrfToken: nextCsrf }, async () => true);
  await ordinaryReset();

  // Reverse order: a committed revoke invalidates a writer that waited behind it.
  const reverseRevoke = await seed('reverse-revoke');
  const revokeFirst = await holdMutation(reverseRevoke.request, 'revoke');
  await Promise.race([revokeFirst.enteredGate, revokeFirst.operationResult.then(
    () => { throw Error('revoke-before-commit'); }, () => { throw Error('revoke-before-commit'); },
  )]);
  let revokeWriterDone = false;
  const revokeWriter = web.withCurrentWebAuthority(reverseRevoke.request, async tx => {
    await tx.query('UPDATE public.identity SET external_id=$1 WHERE id=$2', ['st235-reverse-leak', reverseRevoke.identityId]);
  }).then(() => { revokeWriterDone = true; throw Error('post-revoke-write'); }, () => { revokeWriterDone = true; });
  await delay(100);
  if (revokeWriterDone) throw Error('writer-passed-held-revoke');
  revokeFirst.release(); await revokeFirst.operationResult; await revokeWriter;
  if ((await query('SELECT external_id FROM public.identity WHERE id=$1', [reverseRevoke.identityId])).rows[0]?.external_id === 'st235-reverse-leak') throw Error('reverse-revoke-write');

  // Reverse order: an old-CSRF writer must fail after replacement commits.
  const reverseCsrf = await seed('reverse-csrf');
  const csrfFirst = await holdMutation(reverseCsrf.request, 'csrf');
  await Promise.race([csrfFirst.enteredGate, csrfFirst.operationResult.then(
    () => { throw Error('csrf-before-commit'); }, () => { throw Error('csrf-before-commit'); },
  )]);
  let csrfWriterDone = false;
  const csrfWriter = web.withCurrentWebAuthority(reverseCsrf.request, async tx => {
    await tx.query('UPDATE public.identity SET external_id=$1 WHERE id=$2', ['st235-old-csrf-leak', reverseCsrf.identityId]);
  }).then(() => { csrfWriterDone = true; throw Error('old-csrf-write'); }, () => { csrfWriterDone = true; });
  await delay(100);
  if (csrfWriterDone) throw Error('writer-passed-held-csrf');
  csrfFirst.release();
  const replacement = await csrfFirst.operationResult;
  if (typeof replacement !== 'string') throw Error('replacement-missing');
  await csrfWriter;
  if ((await query('SELECT external_id FROM public.identity WHERE id=$1', [reverseCsrf.identityId])).rows[0]?.external_id === 'st235-old-csrf-leak') throw Error('reverse-csrf-write');
  await web.withCurrentWebAuthority({ ...reverseCsrf.request, csrfToken: replacement }, async () => true);
  await ordinaryReset();

  // Fresh process, same signing key and stored state; no new session is issued.
  const restarted = authority();
  await restartInChild({ ...c.request, csrfToken: nextCsrf }, a.request, c.request);
  // The pool query facade withholds a successful COMMIT acknowledgement. The
  // database may contain the write, but the adapter must disclose no result.
  const uncertain = await seed('uncertain');
  let commits = 0;
  const lostAckPool = { connect: async () => {
    const client = await actor.connect();
    const originalQuery = client.query.bind(client);
    client.query = ((sql: string, values?: unknown[]) => {
      if (sql === 'COMMIT') {
        commits++;
        return originalQuery(sql, values).then(() => { throw Error('withheld-commit-ack'); });
      }
      return originalQuery(sql, values);
    }) as PoolClient['query'];
    return client;
  } };
  const uncertainAuthority = new DurableCurrentWebAuthority({ pool: lostAckPool, accessTokens: tokens, origin, epoch, manifestHash });
  await fail(() => uncertainAuthority.withCurrentWebAuthority(uncertain.request, async tx => {
    await tx.query('UPDATE public.identity SET external_id=$1 WHERE id=$2', ['st235-uncertain-write', uncertain.identityId]);
    return { privateResult: 'must-not-disclose' };
  }), 'unknown-commit');
  if (commits !== 1) throw Error('unknown-commit-retry');
  const uncertainRow = await query('SELECT external_id FROM public.identity WHERE id=$1', [uncertain.identityId]);
  if (uncertainRow.rows[0]?.external_id !== 'st235-uncertain-write') throw Error('unknown-commit-probe');
  await query('UPDATE public.identity SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [b.identityId]);
  await fail(() => restarted.withCurrentWebAuthority(b.request, async () => true), 'deleted-owner');
  const expired = await seed('expired');
  await query('UPDATE subtrack_auth.csrf SET expires_ms=issued_ms+1 WHERE session_id=(SELECT session_id FROM subtrack_auth.session WHERE identity_id=$1)', [expired.identityId]);
  await fail(() => restarted.withCurrentWebAuthority(expired.request, async () => true), 'expired-csrf');
  const expiredSignedToken = new V2AccessToken({ environment: 'development', enabled: true, privateKey, publicKey,
    clock: () => Date.now() + 901_000 });
  const expiredAuthority = new DurableCurrentWebAuthority({ pool: actor, accessTokens: expiredSignedToken, origin, epoch, manifestHash });
  await fail(() => expiredAuthority.withCurrentWebAuthority({ ...reverseCsrf.request, csrfToken: replacement }, async () => true), 'expired-signed-token');
  await ordinaryReset();
  await actor.end(); await owner.end();
  process.stdout.write('ST-235 durable current web: PASS\n');
}
(process.argv[2] === '--st235-restart' ? restartChild() : main()).catch(async () => {
  await Promise.allSettled([actor.end(), owner.end()]);
  process.stderr.write('ST-235 durable current web: FAIL\n');
  process.exitCode = 1;
});
