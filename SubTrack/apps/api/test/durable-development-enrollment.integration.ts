// ST-236 qualified PG16 entry. The owned foundation harness bundles this file
// into its read-only Node22 sidecar after SQL001–010; it is never a mock test.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { createDevelopmentBootstrapTransaction } from '../src/auth/browser-nonce/development-bootstrap-transaction';
import { createDevelopmentBootstrapPostgresPort } from '../src/auth/browser-nonce/development-bootstrap-postgres-port';
import { DevelopmentEnrollmentPersonVerifier } from '../src/auth/identity-provider/development-enrollment-person-verifier';
import { DurableDevelopmentEnrollment } from '../src/auth/enrollment-v2/durable-development-enrollment';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { DurableCurrentWebAuthority } from '../src/auth/sessions-v2/durable-current-web-authority';
import { hashBrowserBindingCookie } from '../src/auth/sessions-v2/v2-web-session-binding';

const origin = 'https://st233a.invalid';
const epoch = 'fixture';
const manifestHash = 'a'.repeat(64);
const fixture = JSON.parse(readFileSync('/fixture.json', 'utf8')) as Record<string, unknown>;
if (Object.keys(fixture).sort().join(',') !== 'database,ownerPassword,password' ||
    fixture.database !== 'st233a_development_auth_foundation_proof' ||
    ![fixture.password, fixture.ownerPassword].every(v => typeof v === 'string' && /^[a-f0-9]{48}$/.test(v))) throw Error('fixture-config');
const connection = { host: '127.0.0.1', port: 5432, database: String(fixture.database),
  connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 4000,
  application_name: 'st236-durable-enrollment' };
const actor = new Pool({ ...connection, user: 'subtrack_dev_auth_login', password: String(fixture.password), max: 4 });
const owner = new Pool({ ...connection, user: 'st233a_fixture_owner', password: String(fixture.ownerPassword), max: 2 });
const keyNames = ['binding', 'idempotency', 'authority', 'request', 'nonce', 'otp', 'proof', 'person', 'session'] as const;
const keys = Object.fromEntries(keyNames.map((name, index) => [name, new Uint8Array(32).fill(index + 17)])) as
  Record<(typeof keyNames)[number], Uint8Array>;
const verifier = (seed = 9) => new DevelopmentEnrollmentPersonVerifier({ environment: 'development', enabled: true,
  simulatorHmacKey: new Uint8Array(32).fill(seed) });
const create = (pool: Pick<Pool, 'connect'> = actor, seed = 9, clock: () => number = Date.now) => new DurableDevelopmentEnrollment({ environment: 'development', enabled: true,
  origin, epoch, manifestHash, pool, clock, verifier: verifier(seed), keys,
  developmentOtpCode: () => '123456' });
const service = create();
const query = (sql: string, values: readonly unknown[] = []) => owner.query(sql, [...values]);
const deny = async (label: string, action: () => Promise<unknown>, expected = 'AUTH_RESTART_REQUIRED') => {
  try { await action(); } catch (error) {
    if (String(error).includes('123456') || String(error).includes(String(fixture.password))) throw Error(`${label}:secret-disclosed`);
    if (expected && !String(error).includes(expected)) throw Error(`${label}:unexpected-denial`);
    return;
  }
  throw Error(`${label}:accepted`);
};
function bootstrap() {
  const port = createDevelopmentBootstrapPostgresPort({ enabled: true, origin, epoch, manifestHash,
    database: fixture.database, password: fixture.password });
  return createDevelopmentBootstrapTransaction({ enabled: true, origin, epoch, manifestHash, retentionMs: 60_000,
    idempotencyKey: new Uint8Array(32).fill(1), originKey: new Uint8Array(32).fill(2) }, port);
}
async function initialWeb() {
  const minted = await bootstrap().issue(`st236-bootstrap-${randomUUID()}`, 'enroll_identifier');
  return { origin, bindingCookie: minted.cookieSecret, nonce: minted.nonce, chainId: '', epoch };
}
async function stage(label: string, enrol = service, contact?: string) {
  const startWeb = await initialWeb();
  const identifier = contact ?? `${label}-${randomUUID()}@example.invalid`;
  const started = await enrol.startOtp(startWeb, { identifier, channel: 'email', purpose: 'enroll_identifier' }, `st236-start-${randomUUID()}`);
  const verifyWeb = { ...startWeb, nonce: started.nextBrowserNonce };
  const verifiedOtp = await enrol.verifyOtp(verifyWeb, { challengeId: started.challengeId, code: '123456' }, `st236-otp-${randomUUID()}`);
  const admitWeb = { ...startWeb, nonce: verifiedOtp.nextBrowserNonce };
  const admitted = await enrol.admit(admitWeb, { proof: verifiedOtp.proof }, `st236-admit-${randomUUID()}`);
  const personWeb = { ...startWeb, nonce: admitted.nextBrowserNonce };
  const person = await enrol.verifyPerson(personWeb, { pending: admitted.pending }, `st236-person-${randomUUID()}`);
  const terminalWeb = { ...startWeb, nonce: person.nextBrowserNonce };
  return { startWeb, started, verifyWeb, verifiedOtp, admitWeb, admitted, personWeb, person, terminalWeb, identifier };
}
function unknownAfterCommit(): Pick<Pool, 'connect'> {
  let armed = false;
  return { connect: async () => {
    const client = await actor.connect();
    const intercepted: PoolClient['query'] = (async (sql: string, values?: unknown[]) => {
      if (sql.startsWith('INSERT INTO public.identity_profile')) armed = true;
      if (sql === 'COMMIT' && armed) {
        armed = false;
        await client.query(sql);
        throw Error('injected-lost-commit-reply');
      }
      return client.query(sql, values);
    }) as PoolClient['query'];
    return { query: intercepted, release: (error?: Error) => client.release(error) } as PoolClient;
  } };
}
async function cleanPool() {
  const clients = await Promise.all(Array.from({ length: 4 }, () => actor.connect()));
  try {
    for (const client of clients) {
      const r = await client.query(`SELECT current_user='subtrack_dev_auth_login' AND session_user='subtrack_dev_auth_login' AS role_ok,
        coalesce(current_setting('app.user_id',true),'')='' AS user_ok,
        coalesce(current_setting('app.current_user_id',true),'')='' AS current_ok`);
      if (Object.values(r.rows[0] as Record<string, unknown>).some(value => value !== true)) throw Error('pooled-role-or-guc');
    }
  } finally { clients.forEach(client => client.release()); }
}
function failAtProfileInsert(): Pick<Pool, 'connect'> {
  let injected = false;
  return { connect: async () => {
    const client = await actor.connect();
    const query: PoolClient['query'] = ((sql: string, values?: unknown[]) => {
      if (!injected && sql.startsWith('INSERT INTO public.identity_profile')) { injected = true; throw Error('injected-profile-write'); }
      return client.query(sql, values);
    }) as PoolClient['query'];
    return { query, release: (error?: Error) => client.release(error) } as PoolClient;
  } };
}
function substituteOldIdentityAtBind(oldId: string, onAttempt: () => void): Pick<Pool, 'connect'> {
  return { connect: async () => {
    const client = await actor.connect();
    const intercepted: PoolClient['query'] = (async (sql: string, values?: unknown[]) => {
      if (sql.includes('subtrack_auth.bind_enrollment_identity(')) {
        onAttempt();
        await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)", [oldId]);
        return client.query(sql, [...(values ?? []).slice(0, -1), oldId]);
      }
      return client.query(sql, values);
    }) as PoolClient['query'];
    return { query: intercepted, release: (error?: Error) => client.release(error) } as PoolClient;
  } };
}
async function noBirthResidue(label: string) {
  const result = await query(`SELECT
    (SELECT count(*)::int FROM subtrack_auth.enrollment_intent) AS intents,
    (SELECT count(*)::int FROM subtrack_auth.identity_birth) AS births`);
  if (result.rows[0]?.intents !== 0 || result.rows[0]?.births !== 0) throw Error(`${label}:birth-residue`);
}
async function catalog() {
  // This disposable database admits only the harness and this private sidecar.
  // A legacy route, deletion worker or refresh writer would invalidate the
  // fixture qualification before any race result could be used as evidence.
  const writers = await query(`SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()
      AND (usename NOT IN ('st233a_fixture_owner','subtrack_dev_auth_login')
        OR application_name NOT IN ('st236-durable-enrollment','psql',''))`);
  if (writers.rows[0]?.n !== 0) throw Error('competing-writer-present');
  const privateTables = ['otp','restricted_proof','pending_enrollment','verified_enrollment',
    'enrollment_intent','identity_birth','family','session','credential','csrf'];
  for (const role of ['subtrack_dev_auth_login','subtrack_auth_producer','subtrack_runtime','subtrack_identity_provisioner']) {
    for (const table of privateTables) {
      const result = await query('SELECT NOT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER\') AS denied',
        [role, `subtrack_auth.${table}`]);
      if (result.rows[0]?.denied !== true) throw Error(`private-table-acl:${role}:${table}`);
    }
  }
  const acl = await query(`SELECT has_schema_privilege('subtrack_auth_executor','public','USAGE') AS schema_ok,
    has_column_privilege('subtrack_auth_executor','public.identity','id','SELECT') AS id_ok,
    has_column_privilege('subtrack_auth_executor','public.identity','external_id','SELECT') AS subject_ok,
    has_column_privilege('subtrack_auth_executor','public.identity','deleted_at','SELECT') AS deleted_ok,
    NOT has_table_privilege('subtrack_auth_executor','public.identity','INSERT,UPDATE,DELETE') AS writes_denied,
    NOT pg_has_role('subtrack_dev_auth_login','subtrack_auth_executor','SET') AS set_denied`);
  if (Object.values(acl.rows[0] as Record<string, unknown>).some(value => value !== true)) throw Error('executor-acl');
  const policy = await query(`SELECT count(*)=1 AND bool_and(polcmd='r' AND polroles=ARRAY['subtrack_auth_executor'::regrole::oid]
    AND pg_get_expr(polqual,polrelid) LIKE '%app.user_id%' AND pg_get_expr(polqual,polrelid) LIKE '%app.current_user_id%') AS correct
    FROM pg_policy WHERE polrelid='public.identity'::regclass AND polname='identity_enrollment_executor_select'`);
  if (policy.rows[0]?.correct !== true) throw Error('executor-policy');
  const sidecars = await query(`SELECT count(*)=2 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS forced
    FROM pg_class c WHERE c.oid IN ('subtrack_auth.enrollment_intent'::regclass,
      'subtrack_auth.identity_birth'::regclass)`);
  if (sidecars.rows[0]?.forced !== true) throw Error('birth-force-rls');
  const sidecarAcl = await query(`SELECT
    bool_and(has_table_privilege('subtrack_auth_executor',c.oid,'SELECT,INSERT,DELETE')
      AND NOT has_table_privilege('subtrack_auth_executor',c.oid,'UPDATE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_table_privilege('subtrack_dev_auth_login',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('subtrack_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('subtrack_identity_provisioner',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE a.grantee=0)) AS exact
    FROM pg_class c WHERE c.oid IN ('subtrack_auth.enrollment_intent'::regclass,
      'subtrack_auth.identity_birth'::regclass)`);
  if (sidecarAcl.rows[0]?.exact !== true) throw Error('birth-acl');
  const sidecarShape = await query(`SELECT
    (SELECT array_agg(attname ORDER BY attnum)::text[] FROM pg_attribute
      WHERE attrelid='subtrack_auth.enrollment_intent'::regclass AND attnum>0 AND NOT attisdropped)
      =ARRAY['xid','verified_h','expires_ms']::text[] AS intent_ok,
    (SELECT array_agg(attname ORDER BY attnum)::text[] FROM pg_attribute
      WHERE attrelid='subtrack_auth.identity_birth'::regclass AND attnum>0 AND NOT attisdropped)
      =ARRAY['identity_id','xid','expires_ms']::text[] AS birth_ok`);
  if (sidecarShape.rows[0]?.intent_ok !== true || sidecarShape.rows[0]?.birth_ok !== true) throw Error('birth-shape');
  const trigger = await query(`SELECT count(*)=1 AND bool_and(NOT t.tgisinternal AND t.tgenabled='O'
    AND p.proname='attest_enrollment_birth' AND p.prosecdef AND p.proowner='subtrack_auth_executor'::regrole::oid)
    AS qualified FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='public.identity'::regclass AND t.tgname='identity_enrollment_birth'`);
  if (trigger.rows[0]?.qualified !== true) throw Error('birth-trigger');
  const fixedIssuers = await query(`SELECT count(*)::int AS n,
    bool_and(p.prosecdef AND p.provolatile='v' AND p.proparallel='u'
      AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) AS fixed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='subtrack_auth' AND p.proname=ANY($1::text[])`, [[
      'enrollment_checked_ms','reserve_enrollment','issue_enrollment_otp','verify_enrollment_otp',
      'admit_enrollment','pending_enrollment','verify_enrollment_person','terminal_enrollment',
      'bind_enrollment_identity','issue_enrollment_session','consume_enrollment',
      'fail_enrollment_burn','prune_enrollment','attest_enrollment_birth']]);
  if (fixedIssuers.rows[0]?.n !== 14 || fixedIssuers.rows[0]?.fixed !== true) throw Error('generic-issuer-acl');
  for (const role of ['subtrack_dev_auth_login','subtrack_auth_producer','subtrack_identity_provisioner','subtrack_auth_executor']) {
    const denied = await query('SELECT NOT has_table_privilege($1,\'public.identity_profile\',\'SELECT,INSERT,UPDATE,DELETE\') AS denied', [role]);
    if (denied.rows[0]?.denied !== true) throw Error(`profile-acl:${role}`);
  }
  const c = await actor.connect();
  try {
    for (const sql of ['SET ROLE subtrack_auth_executor','SELECT * FROM subtrack_auth.otp',
      'SELECT * FROM public.identity_profile', 'INSERT INTO public.identity(id) VALUES (gen_random_uuid())'])
      await deny(`login-direct:${sql.slice(0,20)}`, () => c.query(sql), '');
  } finally { c.release(true); }
  const scoped = await actor.connect();
  try {
    await scoped.query('BEGIN');
    await scoped.query('SET LOCAL ROLE subtrack_runtime');
    await scoped.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$2,true)",
      [randomUUID(), randomUUID()]);
    await scoped.query('ROLLBACK');
  } finally { scoped.release(); }
  await cleanPool();
  const unqualifiedId = randomUUID();
  const unqualified = await actor.connect();
  try {
    await unqualified.query('BEGIN');
    await unqualified.query('SET LOCAL ROLE subtrack_identity_provisioner');
    await unqualified.query("INSERT INTO public.identity(id,external_id,auth_method) VALUES($1::uuid,$2::text,'BANKID')",
      [unqualifiedId, 'unqualified-' + randomUUID()]);
    await unqualified.query('COMMIT');
  } catch (error) { await unqualified.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { unqualified.release(); }
  const noUnqualifiedBirth = await query('SELECT count(*)::int AS n FROM subtrack_auth.identity_birth WHERE identity_id=$1',
    [unqualifiedId]);
  if (noUnqualifiedBirth.rows[0]?.n !== 0) throw Error('unqualified-birth');
  await query('DELETE FROM public.identity WHERE id=$1', [unqualifiedId]);
  await noBirthResidue('catalog');
  const staleXid = '900000000000' + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  await query(`INSERT INTO subtrack_auth.enrollment_intent(xid,verified_h,expires_ms)
    VALUES($1::xid8,repeat('f',64),(extract(epoch FROM clock_timestamp())*1000)::bigint-1)`, [staleXid]);
  await query(`INSERT INTO subtrack_auth.identity_birth(identity_id,xid,expires_ms)
    VALUES($1::uuid,$2::xid8,(extract(epoch FROM clock_timestamp())*1000)::bigint-1)`, [randomUUID(), staleXid]);
  const pruner = await actor.connect();
  try {
    await pruner.query('BEGIN');
    await pruner.query('SET LOCAL ROLE subtrack_runtime');
    const pruned = await pruner.query('SELECT subtrack_auth.prune_enrollment($1::text,$2::subtrack_auth.h,$3::subtrack_auth.ms) AS ok',
      [epoch, manifestHash, Date.now()]);
    if (pruned.rows[0]?.ok !== true) throw Error('birth-prune-denied');
    await pruner.query('COMMIT');
  } catch (error) { await pruner.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { pruner.release(); }
  await noBirthResidue('prune');
}
async function graph(identityId: string, contact: string) {
  const result = await query(`SELECT i.id,i.external_id,i.email,i.verified_at,i.given_name,i.surname,
    p.identity_id,p.display_name,p.avatar_color,p.avatar_emoji,p.language,p.theme,p.default_currency,p.profile_complete,
    (SELECT count(*) FROM subtrack_auth.family f WHERE f.identity_id=i.id) AS families,
    (SELECT count(*) FROM subtrack_auth.session s WHERE s.identity_id=i.id) AS sessions,
    (SELECT count(*) FROM subtrack_auth.credential c WHERE c.identity_id=i.id AND c.state='current') AS credentials,
    (SELECT count(*) FROM subtrack_auth.csrf x WHERE x.identity_id=i.id) AS csrf
    FROM public.identity i JOIN public.identity_profile p ON p.identity_id=i.id WHERE i.id=$1`, [identityId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (result.rowCount !== 1 || !row || row.email !== contact || row.given_name !== 'Alice' || row.surname !== 'Andersson' ||
      row.verified_at === null || row.display_name !== null || row.avatar_color !== null || row.avatar_emoji !== null ||
      row.language !== 'en' || row.theme !== 'system' || row.default_currency?.toString().trim() !== 'SEK' ||
      row.profile_complete !== false || row.families !== '1' || row.sessions !== '1' ||
      row.credentials !== '1' || row.csrf !== '1') throw Error('graph');
}
async function currentWeb(identityId: string, sessionId: string, refreshToken: string, csrfToken: string, bindingCookie: string) {
  const session = await query('SELECT chain FROM subtrack_auth.session WHERE session_id=$1 AND identity_id=$2',
    [sessionId, identityId]);
  if (session.rowCount !== 1 || typeof session.rows[0]?.chain !== 'string') throw Error('current-session-chain');
  const bound = await query('SELECT binding_h FROM subtrack_auth.session WHERE session_id=$1', [sessionId]);
  if (bound.rows[0]?.binding_h !== hashBrowserBindingCookie(bindingCookie)) throw Error('session-binding-digest');
  const refreshH = createHash('sha256').update('subtrack:auth-refresh:v2:').update(refreshToken).digest('hex');
  const refresh = await query(`SELECT count(*)::int AS n FROM subtrack_auth.credential
    WHERE session_id=$1 AND identity_id=$2 AND refresh_h=$3 AND state='current'`,
    [sessionId, identityId, refreshH]);
  if (refresh.rows[0]?.n !== 1) throw Error('current-refresh-digest');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const tokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey, publicKey, clock: Date.now });
  const authority = new DurableCurrentWebAuthority({ pool: actor, accessTokens: tokens, origin, epoch,
    manifestHash, businessStatements: { ownIdentity: 'SELECT id FROM public.identity WHERE id=$1' } });
  const request = { accessToken: tokens.issue(identityId, sessionId), exactOrigin: origin,
    bindingCookie, browserChainId: session.rows[0].chain as string, csrfToken };
  await authority.withCurrentWebAuthority(request, async tx => {
    const own = await tx.execute('ownIdentity', [identityId]);
    if (own.rowCount !== 1 || own.rows[0]?.id !== identityId) throw Error('current-web-owner');
  });
}
async function restartChild(data: { web: Awaited<ReturnType<typeof stage>>['terminalWeb']; verified: string; key: string; retry?: boolean }) {
  const fresh = create();
  if (data.retry) {
    await deny('fresh-process-same-key', () => fresh.complete(data.web, { verified: data.verified }, data.key));
    await cleanPool();
    await actor.end(); await owner.end();
    process.stdout.write('ST-236 retry: PASS\n');
    return;
  }
  const completed = await fresh.complete(data.web, { verified: data.verified }, data.key);
  if (!completed.identityId || !completed.sessionId || !completed.refreshToken || !completed.csrfToken) throw Error('restart-result');
  await currentWeb(completed.identityId, completed.sessionId, completed.refreshToken,
    completed.csrfToken, data.web.bindingCookie);
  await cleanPool();
  await actor.end(); await owner.end();
  process.stdout.write('ST-236 restart: PASS\n');
}
async function restartInFreshProcess(data: Parameters<typeof restartChild>[0]) {
  const child = spawn(process.execPath, ['/fixture.cjs'],
    { env: { NODE_ENV: 'development' }, stdio: ['pipe','pipe','pipe'] });
  let output = '';
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (part: string) => { output += part; if (output.length > 128) child.kill(); });
  child.stderr.resume();
  const completed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('restart-timeout')); }, 20_000);
    child.once('error', () => { clearTimeout(timer); reject(Error('restart-spawn')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && output === (data.retry ? 'ST-236 retry: PASS\n' : 'ST-236 restart: PASS\n')) resolve();
      else reject(Error('restart-proof'));
    });
  });
  child.stdin.end(JSON.stringify(data));
  await completed;
}
async function main() {
  if (process.argv.length !== 2) throw Error('argv');
  let input = '';
  for await (const part of process.stdin) { input += String(part); if (input.length > 16_384) throw Error('restart-input'); }
  if (input) { await restartChild(JSON.parse(input) as Parameters<typeof restartChild>[0]); return; }
  await catalog();
  const wrongWeb = await initialWeb();
  const candidate = { identifier: `bound-${randomUUID()}@example.invalid`, channel: 'email' as const,
    purpose: 'enroll_identifier' as const };
  await deny('wrong-origin', () => service.startOtp({ ...wrongWeb, origin: 'https://foreign.invalid' }, candidate, `st236-origin-${randomUUID()}`));
  await deny('wrong-binding', () => service.startOtp({ ...wrongWeb, bindingCookie: wrongWeb.nonce }, candidate, `st236-binding-${randomUUID()}`));
  await deny('wrong-chain', () => service.startOtp({ ...wrongWeb, chainId: wrongWeb.nonce }, candidate, `st236-chain-${randomUUID()}`));
  await deny('wrong-epoch', () => service.startOtp({ ...wrongWeb, epoch: 'foreign' }, candidate, `st236-epoch-${randomUUID()}`));
  await deny('wrong-nonce', () => service.startOtp({ ...wrongWeb, nonce: wrongWeb.bindingCookie }, candidate, `st236-nonce-${randomUUID()}`));
  await deny('wrong-purpose', () => service.startOtp(wrongWeb,
    { ...candidate, purpose: 'otp_step_up' as 'enroll_identifier' }, `st236-purpose-${randomUUID()}`));
  const duplicateWeb = await initialWeb();
  const duplicateKey = `st236-global-concurrent-${randomUUID()}`;
  const duplicateInput = { identifier: `duplicate-${randomUUID()}@example.invalid`,
    channel: 'email' as const, purpose: 'enroll_identifier' as const };
  const duplicate = await Promise.allSettled([service.startOtp(duplicateWeb, duplicateInput, duplicateKey),
    create().startOtp(duplicateWeb, duplicateInput, duplicateKey)]);
  if (duplicate.filter(r => r.status === 'fulfilled').length !== 1 ||
      duplicate.filter(r => r.status === 'rejected').length !== 1) throw Error('global-concurrent-key');
  const duplicateStarted = duplicate.find((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof service.startOtp>>> =>
    r.status === 'fulfilled')?.value;
  if (!duplicateStarted) throw Error('global-concurrent-missing');
  await deny('global-key-across-operations', () => service.verifyOtp(
    { ...duplicateWeb, nonce: duplicateStarted.nextBrowserNonce },
    { challengeId: duplicateStarted.challengeId, code: '123456' }, duplicateKey));
  await deny('clock-future', () => create(actor, 9, () => Date.now() + 900_000).startOtp(wrongWeb,
    candidate, `st236-clock-${randomUUID()}`));
  const retiredWeb = await initialWeb();
  await query("UPDATE subtrack_auth.epoch SET state='retired' WHERE id=$1", [epoch]);
  try {
    await deny('retired-epoch', () => service.startOtp(retiredWeb,
      { identifier: `retired-${randomUUID()}@example.invalid`, channel: 'email', purpose: 'enroll_identifier' },
      `st236-retired-${randomUUID()}`));
  } finally { await query("UPDATE subtrack_auth.epoch SET state='active' WHERE id=$1", [epoch]); }
  const expiredWeb = await initialWeb();
  const expiredContact = `expired-${randomUUID()}@example.invalid`;
  const expiredStarted = await service.startOtp(expiredWeb,
    { identifier: expiredContact, channel: 'email', purpose: 'enroll_identifier' },
    `st236-expired-${randomUUID()}`);
  await query(`UPDATE subtrack_auth.otp SET issued_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-300000,
    expires_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1 WHERE contact=$1`,
    [expiredContact]);
  await deny('expired-source', () => service.verifyOtp(
    { ...expiredWeb, nonce: expiredStarted.nextBrowserNonce },
    { challengeId: expiredStarted.challengeId, code: '123456' }, `st236-expired-verify-${randomUUID()}`));
  const capacityWeb = await initialWeb();
  await query(`INSERT INTO subtrack_auth.otp(challenge_h,code_h,identifier_h,channel,contact,origin,chain,binding_h,session_binding_h,epoch,issued_ms,expires_ms)
    SELECT lpad(to_hex(g),64,'0'),repeat('b',64),repeat('c',64),'email','capacity@example.invalid',$1,'capacity-chain',
      repeat('d',64),repeat('e',64),$2,t.ms,t.ms+300000 FROM generate_series(100000,109999) g
      CROSS JOIN (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint ms) t`, [origin, epoch]);
  await deny('otp-capacity', () => service.startOtp(capacityWeb,
    { identifier: `capacity-${randomUUID()}@example.invalid`, channel: 'email', purpose: 'enroll_identifier' },
    `st236-capacity-${randomUUID()}`));
  await query("DELETE FROM subtrack_auth.otp WHERE chain='capacity-chain'");
  const attemptWeb = await initialWeb();
  const wrongIdentifier = `attempt-${randomUUID()}@example.invalid`;
  const challenge = await service.startOtp(attemptWeb,
    { identifier: wrongIdentifier, channel: 'email', purpose: 'enroll_identifier' }, `st236-attempt-start-${randomUUID()}`);
  const challengeWeb = { ...attemptWeb, nonce: challenge.nextBrowserNonce };
  let firstWrongKey = '';
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wrongKey = `st236-wrong-code-${randomUUID()}`;
    if (attempt === 1) firstWrongKey = wrongKey;
    await deny(`wrong-code-${attempt}`, () => service.verifyOtp(challengeWeb,
      { challengeId: challenge.challengeId, code: '000000' }, wrongKey));
    const row = await query('SELECT attempts FROM subtrack_auth.otp WHERE contact=$1', [wrongIdentifier]);
    if (row.rowCount !== 1 || row.rows[0].attempts !== attempt) throw Error(`wrong-code-not-durable:${attempt}`);
  }
  await deny('wrong-code-duplicate-burn', () => service.verifyOtp(challengeWeb,
    { challengeId: challenge.challengeId, code: '123456' }, firstWrongKey));
  await deny('wrong-code-terminal', () => service.verifyOtp(challengeWeb,
    { challengeId: challenge.challengeId, code: '123456' }, `st236-post-exhaustion-${randomUUID()}`));
  const noProof = await query(`SELECT count(*)::int AS n FROM subtrack_auth.restricted_proof p
    JOIN subtrack_auth.otp o ON o.challenge_h=p.challenge_h WHERE o.contact=$1`, [wrongIdentifier]);
  if (noProof.rows[0]?.n !== 0) throw Error('wrong-code-proof');
  const first = await stage('first');
  await deny('terminal-wrong-verified', () => service.complete(first.terminalWeb,
    { verified: first.startWeb.nonce }, `st236-wrong-verified-${randomUUID()}`));
  await deny('terminal-wrong-binding', () => service.complete({ ...first.terminalWeb, bindingCookie: first.terminalWeb.nonce },
    { verified: first.person.verified }, `st236-wrong-terminal-binding-${randomUUID()}`));
  await deny('injected-write-rollback', () => create(failAtProfileInsert()).complete(first.terminalWeb,
    { verified: first.person.verified }, `st236-rollback-${randomUUID()}`));
  const afterRollback = await query('SELECT count(*)::int AS n FROM public.identity WHERE email=$1', [first.identifier]);
  if (afterRollback.rows[0]?.n !== 0) throw Error('partial-account-graph');
  await noBirthResidue('rollback');
  const key = `st236-complete-${randomUUID()}`;
  await restartInFreshProcess({ web: first.terminalWeb, verified: first.person.verified, key });
  await restartInFreshProcess({ web: first.terminalWeb, verified: first.person.verified, key, retry: true });
  const committed = await query('SELECT id FROM public.identity WHERE email=$1', [first.identifier]);
  if (committed.rowCount !== 1) throw Error('restart-identity');
  await graph(String(committed.rows[0].id), first.identifier);
  await noBirthResidue('committed');
  const oldIdStage = await stage('old-id-rebind', create(actor, 14));
  let oldBindAttempted = false;
  await deny('old-identity-cannot-bind', () => create(substituteOldIdentityAtBind(String(committed.rows[0].id),
    () => { oldBindAttempted = true; }), 14)
    .complete(oldIdStage.terminalWeb, { verified: oldIdStage.person.verified }, `st236-old-id-${randomUUID()}`));
  if (!oldBindAttempted) throw Error('old-identity-bind-not-reached');
  await noBirthResidue('old-id-rollback');
  await deny('duplicate-global-key', () => service.complete(first.terminalWeb, { verified: first.person.verified }, key));
  await deny('spent-verified', () => service.complete(first.terminalWeb, { verified: first.person.verified }, `st236-repeat-${randomUUID()}`));
  const second = await stage('active-subject');
  await deny('active-subject', () => service.complete(second.terminalWeb, { verified: second.person.verified }, `st236-active-${randomUUID()}`),
    'ENROLLMENT_LOGIN_REQUIRED');
  const sharedContact = `contact-race-${randomUUID()}@example.invalid`;
  const races = await Promise.all([stage('contact-a', create(actor, 10), sharedContact),
    stage('contact-b', create(actor, 11), sharedContact)]);
  const raced = await Promise.allSettled(races.map((s, i) => create(actor, 10 + i).complete(
    s.terminalWeb, { verified: s.person.verified }, `st236-contact-race-${randomUUID()}`)));
  if (raced.filter(r => r.status === 'fulfilled').length !== 1 ||
      raced.filter(r => r.status === 'rejected').length !== 1) throw Error('contact-race-result');
  const contactRows = await query('SELECT count(*)::int AS n FROM public.identity WHERE email=$1', [sharedContact]);
  if (contactRows.rows[0]?.n !== 1) throw Error('contact-race-duplicate');
  const subjectStages = await Promise.all([stage('subject-a', create(actor, 13)),
    stage('subject-b', create(actor, 13))]);
  const subjectRaced = await Promise.allSettled(subjectStages.map(s => create(actor, 13).complete(
    s.terminalWeb, { verified: s.person.verified }, `st236-subject-race-${randomUUID()}`)));
  if (subjectRaced.filter(r => r.status === 'fulfilled').length !== 1 ||
      subjectRaced.filter(r => r.status === 'rejected').length !== 1) throw Error('subject-race-result');
  const subjectContacts = await query('SELECT count(*)::int AS n FROM public.identity WHERE email=ANY($1::text[])',
    [subjectStages.map(s => s.identifier)]);
  if (subjectContacts.rows[0]?.n !== 1) throw Error('subject-race-duplicate');
  const uncertain = await stage('unknown-commit', create(actor, 12));
  const uncertainKey = `st236-uncertain-${randomUUID()}`;
  await deny('unknown-commit-no-disclosure', () => create(unknownAfterCommit(), 12).complete(
    uncertain.terminalWeb, { verified: uncertain.person.verified }, uncertainKey));
  const committedUnknown = await query('SELECT count(*)::int AS n FROM public.identity WHERE email=$1', [uncertain.identifier]);
  if (committedUnknown.rows[0]?.n !== 1) throw Error('unknown-commit-not-committed');
  await noBirthResidue('unknown-commit');
  await deny('unknown-commit-no-retry', () => create(actor, 12).complete(
    uncertain.terminalWeb, { verified: uncertain.person.verified }, uncertainKey));
  await query('UPDATE public.identity SET deleted_at=clock_timestamp() WHERE id=$1', [committed.rows[0].id]);
  const deleted = await stage('detectable-deleted');
  await deny('detectable-deleted', () => service.complete(deleted.terminalWeb,
    { verified: deleted.person.verified }, `st236-deleted-${randomUUID()}`));
  for (const table of ['csrf','credential','session','family'])
    await query(`DELETE FROM subtrack_auth.${table} WHERE identity_id=$1`, [committed.rows[0].id]);
  await query('DELETE FROM public.identity_profile WHERE identity_id=$1', [committed.rows[0].id]);
  await query('DELETE FROM public.identity WHERE id=$1', [committed.rows[0].id]);
  const absent = await query(`SELECT NOT EXISTS(SELECT 1 FROM public.identity WHERE id=$1)
    AND NOT EXISTS(SELECT 1 FROM public.identity_profile WHERE identity_id=$1)
    AND NOT EXISTS(SELECT 1 FROM subtrack_auth.family WHERE identity_id=$1)
    AND NOT EXISTS(SELECT 1 FROM subtrack_auth.session WHERE identity_id=$1)
    AND NOT EXISTS(SELECT 1 FROM subtrack_auth.credential WHERE identity_id=$1)
    AND NOT EXISTS(SELECT 1 FROM subtrack_auth.csrf WHERE identity_id=$1) AS erased`, [committed.rows[0].id]);
  if (absent.rows[0]?.erased !== true) throw Error('old-owner-retained');
  const erased = await stage('fully-erased');
  const afterErasure = await service.complete(erased.terminalWeb,
    { verified: erased.person.verified }, `st236-erased-${randomUUID()}`);
  if (afterErasure.identityId === committed.rows[0].id) throw Error('erased-uuid-restored');
  await graph(afterErasure.identityId, erased.identifier);
  await cleanPool();
  await actor.end(); await owner.end();
  process.stdout.write('ST-236 durable enrollment: PASS\n');
}
main().catch(() => { process.exitCode = 1; void actor.end(); void owner.end(); });
