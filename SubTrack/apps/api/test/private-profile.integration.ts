// Actual owned PG16 proof, bundled by private-profile-proof.sh; never a unit fixture or default startup.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { readProfileBusinessCatalog } from './profile-business-catalog';
import { PRIVATE_PROFILE_STATEMENTS } from '../src/profile/private-profile-statements';
import { PRIVATE_ONBOARDING_STATEMENTS } from '../src/profile/private-onboarding-statements';
import { loadPrivateAuthEpoch } from '../src/auth/private-auth-epoch';
import { V2AccessToken } from '../src/auth/sessions-v2/v2-access-token';
import { DurableCurrentWebAuthority } from '../src/auth/sessions-v2/durable-current-web-authority';
import { hashBrowserBindingCookie } from '../src/auth/sessions-v2/v2-web-session-binding';
import { mintDurableSessionCsrf } from '../src/auth/session-csrf/durable-session-csrf';

let phase = 'CONFIG';
async function prove(): Promise<void> {
  const port = Number(process.env['ST237_PG_PORT']);
  const ownerPassword = process.env['ST237_OWNER_PASSWORD'];
  const actorPassword = process.env['ST237_PG_PASSWORD'];
  const bundlePath = process.env['ST237_PRIVATE_CONFIG'];
  const runnerTemp = process.env['RUNNER_TEMP'];
  assert(Number.isSafeInteger(port) && port > 0 && port < 65536 && ownerPassword && actorPassword && bundlePath && runnerTemp);
  assert(/^[a-f0-9]{48}$/.test(ownerPassword) && /^[a-f0-9]{48}$/.test(actorPassword));
  const epoch = loadPrivateAuthEpoch(bundlePath);
  const catalogPath = resolve(runnerTemp, 'st237-ordinary-profile-catalog.json');
  const stat = lstatSync(catalogPath);
  assert(stat.isFile() && (stat.mode & 0o077) === 0 && stat.size > 100 && stat.size < 50000);
  const ordinary = JSON.parse(readFileSync(catalogPath, 'utf8')) as { catalog: unknown };
  assert.deepEqual(Object.keys(ordinary), ['catalog']);
  const owner = new PrismaClient({ datasources: { db: { url:
    `postgresql://st233a_fixture_owner:${ownerPassword}@127.0.0.1:${port}/${epoch.database}` } }, log: [] });
  const actor = new Pool({ host: '127.0.0.1', port, database: epoch.database, user: epoch.login,
    password: actorPassword, max: 1, connectionTimeoutMillis: 3000, query_timeout: 3000,
    statement_timeout: 2000, lock_timeout: 1000, idle_in_transaction_session_timeout: 4000 });
  actor.on('error', () => {});
  try {
    phase = 'CATALOG';
    assert.deepEqual(await readProfileBusinessCatalog(owner), ordinary.catalog);
    process.stdout.write('PASS ST237_ACTUAL_ORDINARY_QUALIFIED_CATALOG_EQUIVALENCE\n');
    const rows = await owner.$queryRaw<{ id: string; manifest_h: string; origin: string; state: string }[]>`
      SELECT id,manifest_h,origin,state FROM subtrack_auth.epoch`;
    assert.deepEqual(rows, [{ id: epoch.epoch, manifest_h: epoch.manifestHash, origin: epoch.origin, state: 'active' }]);
    phase = 'TUPLE';
    const tokens = new V2AccessToken({ environment: 'development', enabled: true,
      ...epoch.accessKeyPair, clock: Date.now });
    for (const [database, origin, candidateEpoch] of [
      [epoch.database, 'https://st233a.invalid', epoch.epoch],
      ['st233a_development_auth_foundation_proof', epoch.origin, epoch.epoch],
      [epoch.database, epoch.origin, 'fixture'],
    ] as const) {
      assert.throws(() => new DurableCurrentWebAuthority({ pool: actor, accessTokens: tokens,
        database, origin, epoch: candidateEpoch, manifestHash: epoch.manifestHash,
        businessStatements: PRIVATE_PROFILE_STATEMENTS }));
    }
    const tupleClient = await actor.connect();
    try {
      await tupleClient.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await tupleClient.query('SET LOCAL ROLE subtrack_runtime');
      for (const [candidateEpoch, candidateHash] of [
        ['fixture', epoch.manifestHash], [epoch.epoch, 'a'.repeat(64)],
      ] as const) {
        const result = await tupleClient.query<{ ok: boolean }>(
          'SELECT subtrack_auth.fence($1::text,$2::subtrack_auth.h,$3::subtrack_auth.ms) AS ok',
          [candidateEpoch, candidateHash, Date.now()]);
        assert.equal(result.rows[0]?.ok, false);
      }
      await tupleClient.query('ROLLBACK');
    } finally { tupleClient.release(); }
    process.stdout.write('PASS ST237_ACTUAL_PG_AND_CONSTRUCTOR_CROSS_PAIRED_TUPLE_REFUSAL\n');
    phase = 'OWNER_RLS';
    const a = randomUUID(), b = randomUUID();
    await owner.$executeRaw`INSERT INTO identity(id,auth_method,updated_at) VALUES (${a}::uuid,'MOCK',now()),(${b}::uuid,'MOCK',now())`;
    await owner.$executeRaw`INSERT INTO identity_profile(identity_id) VALUES (${a}::uuid),(${b}::uuid)`;
    const client = await actor.connect();
    try {
      for (const [first, second, expectOwn] of [[a, a, true], ['', '', false], [a, '', false], [a, b, false], ['bad', 'bad', false]] as const) {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        try {
          await client.query('SET LOCAL ROLE subtrack_runtime');
          await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$2,true)", [first, second]);
          const visible = await client.query(PRIVATE_PROFILE_STATEMENTS.profileRead, [a]);
          assert.equal(visible.rowCount, expectOwn ? 1 : 0);
          const foreign = await client.query(PRIVATE_PROFILE_STATEMENTS.profilePatch,
            [b, true, 'Forbidden', false, null, false, null, false, null, false, null]);
          assert.equal(foreign.rowCount, 0);
          if (expectOwn) {
            const changed = await client.query(PRIVATE_PROFILE_STATEMENTS.profilePatch,
              [a, true, 'Rollback Proof', false, null, false, null, false, null, true, 'dark']);
            assert.equal(changed.rowCount, 1);
            assert.equal(changed.rows[0]?.profile_complete, true);
          }
        } finally { await client.query('ROLLBACK'); }
        const clean = await client.query(`SELECT session_user::text AS session_user,current_user::text AS current_user,
          current_database()::text AS database_name,current_setting('app.user_id',true) AS user_id,
          current_setting('app.current_user_id',true) AS current_user_id`);
        assert.equal(clean.rows.length, 1);
        assert.equal(clean.rows[0]?.session_user, epoch.login);
        assert.equal(clean.rows[0]?.current_user, epoch.login);
        assert.equal(clean.rows[0]?.database_name, epoch.database);
        assert([null, ''].includes(clean.rows[0]?.user_id));
        assert([null, ''].includes(clean.rows[0]?.current_user_id));
      }
    } finally { client.release(); }
    const untouched = await owner.$queryRaw<{ display_name: string | null; profile_complete: boolean }[]>`
      SELECT display_name,profile_complete FROM identity_profile WHERE identity_id IN (${a}::uuid,${b}::uuid)`;
    assert.equal(untouched.length, 2);
    assert(untouched.every(row => row.display_name === null && row.profile_complete === false));
    phase = 'SUBSCRIPTION_OWNER';
    const household = randomUUID(), foreignId = randomUUID(), missingId = randomUUID();
    await owner.$executeRaw`INSERT INTO public.household(id,name,updated_at) VALUES (${household}::uuid,'Proof',now())`;
    await owner.$executeRaw`INSERT INTO public.household_member(household_id,identity_id,role)
      VALUES (${household}::uuid,${a}::uuid,'ADMIN'),(${household}::uuid,${b}::uuid,'MEMBER')`;
    await owner.$executeRaw`INSERT INTO public.subscription(id,identity_id,custom_name,category_code,cadence,
      expected_amount_minor,currency,status,source,always_private,updated_at)
      VALUES (${foreignId}::uuid,${b}::uuid,'Peer proof','OTHER_SUBSCRIPTION','MONTHLY',100,'SEK','ACTIVE','MANUAL',false,now())`;
    await owner.$executeRaw`INSERT INTO public.subscription_share(subscription_id,household_id,shared_by)
      VALUES (${foreignId}::uuid,${household}::uuid,${b}::uuid)`;
    const inspectAs = async (principal: string, sql: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> => {
      const c = await actor.connect();
      try {
        await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await c.query('SET LOCAL ROLE subtrack_runtime');
        await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)", [principal]);
        const result = await c.query(sql, values);
        await c.query('ROLLBACK');
        return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
      } finally { c.release(); }
    };
    // Compare peer visibility with the same installed policies on either side of FORCE.
    await owner.$executeRaw`ALTER TABLE public.subscription NO FORCE ROW LEVEL SECURITY`;
    try {
      const peerBefore = await inspectAs(a, 'SELECT id::text FROM public.subscription WHERE id=$1::uuid', [foreignId]);
      assert.equal(peerBefore.rowCount, 1);
      await owner.$executeRaw`ALTER TABLE public.subscription FORCE ROW LEVEL SECURITY`;
      const peerAfter = await inspectAs(a, 'SELECT id::text FROM public.subscription WHERE id=$1::uuid', [foreignId]);
      assert.deepEqual(peerAfter, peerBefore);
    } finally { await owner.$executeRaw`ALTER TABLE public.subscription FORCE ROW LEVEL SECURITY`; }
    assert.equal((await inspectAs(a, PRIVATE_ONBOARDING_STATEMENTS.ownerDetail,
      [a, foreignId, 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'])).rowCount, 0);
    assert.equal((await inspectAs(a, PRIVATE_ONBOARDING_STATEMENTS.ownerDetail,
      [a, missingId, 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'])).rowCount, 0);
    assert.equal((await inspectAs(a, PRIVATE_ONBOARDING_STATEMENTS.ownerStatusLock, [a, foreignId])).rowCount, 0);
    assert.equal((await inspectAs(a, PRIVATE_ONBOARDING_STATEMENTS.ownerStatusLock, [a, missingId])).rowCount, 0);
    process.stdout.write('PASS ST238_ACTUAL_PG_PEER_POLICY_FORCE_BEFORE_AFTER_OWNER_PREDICATE\n');
    phase = 'SUBSCRIPTION_MODE';
    assert.equal((await inspectAs(a, PRIVATE_ONBOARDING_STATEMENTS.modeChoose, [a, 'just-me'])).rowCount, 0);
    const incomplete = await owner.$queryRaw<{ onboarding_mode: string | null }[]>`
      SELECT onboarding_mode FROM public.identity_profile WHERE identity_id=${a}::uuid`;
    assert.deepEqual(incomplete, [{ onboarding_mode: null }]);
    await owner.$executeRaw`UPDATE public.identity_profile SET profile_complete=true WHERE identity_id=${a}::uuid`;
    const modeClient = await actor.connect();
    try {
      await modeClient.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await modeClient.query('SET LOCAL ROLE subtrack_runtime');
      await modeClient.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)", [a]);
      assert.equal((await modeClient.query(PRIVATE_ONBOARDING_STATEMENTS.modeChoose, [a, 'just-me'])).rowCount, 1);
      assert.equal((await modeClient.query(PRIVATE_ONBOARDING_STATEMENTS.modeChoose, [a, 'just-me'])).rowCount, 0);
      await modeClient.query('COMMIT');
    } finally { modeClient.release(); }
    const modeRows = await owner.$queryRaw<{ onboarding_mode: string | null }[]>`
      SELECT onboarding_mode FROM public.identity_profile WHERE identity_id=${a}::uuid`;
    assert.deepEqual(modeRows, [{ onboarding_mode: 'just-me' }]);
    process.stdout.write('PASS ST238_ACTUAL_PG_INCOMPLETE_MODE_AND_REPEAT_NO_UPDATE\n');
    phase = 'SUBSCRIPTION_CURSOR';
    await owner.$executeRaw`INSERT INTO public.subscription(identity_id,custom_name,category_code,cadence,
      expected_amount_minor,currency,status,source,always_private,created_at,updated_at)
      SELECT ${a}::uuid,'Page proof '||g.i,'OTHER_SUBSCRIPTION','MONTHLY',g.i,'SEK','ACTIVE','MANUAL',true,
        '2026-01-01 00:00:00.123456+00'::timestamptz,now()
      FROM pg_catalog.generate_series(1,103) AS g(i)`;
    const format = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
    const list = async (id: string, at: string | null, afterId: string | null) =>
      inspectAs(id, PRIVATE_ONBOARDING_STATEMENTS.ownerList, [id, at, afterId, 'UTC', format]);
    const firstPage = await list(a, null, null);
    assert.equal(firstPage.rowCount, 51);
    assert(firstPage.rows.every(row => row.identity_id === a && row.created_at === '2026-01-01T00:00:00.123456Z'));
    const secondPage = await list(a, firstPage.rows[49]!.created_at as string, firstPage.rows[49]!.id as string);
    assert.equal(secondPage.rowCount, 51);
    const thirdPage = await list(a, secondPage.rows[49]!.created_at as string, secondPage.rows[49]!.id as string);
    assert.equal(thirdPage.rowCount, 3);
    assert.equal(new Set([...firstPage.rows.slice(0, 50), ...secondPage.rows.slice(0, 50), ...thirdPage.rows]
      .map(row => row.id)).size, 103);
    assert.equal((await list(b, firstPage.rows[49]!.created_at as string, firstPage.rows[49]!.id as string)).rowCount, 0);
    assert.equal((await list(b, null, null)).rowCount, 1);
    for (const count of [1, 50, 51] as const) {
      const page = await list(a, '2026-01-01T00:00:00.123456Z', firstPage.rows[count - 1]!.id as string);
      assert.equal(page.rowCount, Math.min(51, 103 - count));
    }
    process.stdout.write('PASS ST238_ACTUAL_PG_OWNER_CURSOR_50_51_103_TIED_MICROSECONDS\n');
    phase = 'SUBSCRIPTION_STATUS';
    const targetId = firstPage.rows[0]!.id as string;
    const statusClient = await actor.connect();
    try {
      await statusClient.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await statusClient.query('SET LOCAL ROLE subtrack_runtime');
      await statusClient.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)", [a]);
      const locked = await statusClient.query(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusLock, [a, targetId]);
      assert.equal(locked.rows[0]?.status, 'ACTIVE');
      assert.equal((await statusClient.query(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusCompareUpdate,
        [a, targetId, 'ACTIVE', 'PAUSED'])).rowCount, 1);
      assert.equal((await statusClient.query(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusCompareUpdate,
        [a, targetId, 'ACTIVE', 'CANCELLED'])).rowCount, 0);
      assert.equal((await statusClient.query(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusCompareUpdate,
        [a, foreignId, 'ACTIVE', 'PAUSED'])).rowCount, 0);
      await statusClient.query('COMMIT');
    } finally { statusClient.release(); }
    const statusRead = await inspectAs(a, PRIVATE_ONBOARDING_STATEMENTS.ownerDetail, [a, targetId, 'UTC', format]);
    assert.equal(statusRead.rows[0]?.status, 'PAUSED');
    process.stdout.write('PASS ST238_ACTUAL_PG_LOCKED_STATUS_STALE_COMPARE_AND_READBACK\n');
    await owner.$executeRaw`DELETE FROM public.subscription_share WHERE subscription_id=${foreignId}::uuid`;
    await owner.$executeRaw`DELETE FROM public.subscription WHERE identity_id IN (${a}::uuid,${b}::uuid)`;
    await owner.$executeRaw`DELETE FROM public.household_member WHERE household_id=${household}::uuid`;
    await owner.$executeRaw`DELETE FROM public.household WHERE id=${household}::uuid`;
    await owner.$executeRaw`DELETE FROM identity_profile WHERE identity_id IN (${a}::uuid,${b}::uuid)`;
    await owner.$executeRaw`DELETE FROM identity WHERE id IN (${a}::uuid,${b}::uuid)`;
    process.stdout.write('PASS ST237_PRIVATE_PROFILE_SECOND_OWNER_DUAL_GUC_ROLLBACK_POOL_RESET\n');
    phase = 'UNKNOWN_COMMIT';
    const identityId = randomUUID(), sid = randomUUID(), fid = randomUUID();
    const binding = randomBytes(32).toString('base64url');
    const chain = randomBytes(32).toString('base64url');
    const csrf = mintDurableSessionCsrf();
    const bindingHash = hashBrowserBindingCookie(binding);
    const refreshHash = randomBytes(32).toString('hex');
    const token = tokens.issue(identityId, sid);
    await owner.$executeRaw`INSERT INTO public.identity(id,auth_method,updated_at)
      VALUES (${identityId}::uuid,'MOCK',now())`;
    await owner.$executeRaw`INSERT INTO public.identity_profile(identity_id) VALUES (${identityId}::uuid)`;
    await owner.$executeRaw`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      INSERT INTO subtrack_auth.family(family_id,identity_id,epoch,issued_ms,expires_ms)
      SELECT ${fid}::uuid,${identityId}::uuid,${epoch.epoch},t.ms,t.ms+86400000 FROM t`;
    await owner.$executeRaw`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      INSERT INTO subtrack_auth.session(session_id,family_id,identity_id,transport,origin,chain,binding_h,epoch,issued_ms,expires_ms)
      SELECT ${sid}::uuid,${fid}::uuid,${identityId}::uuid,'web',${epoch.origin},${chain},${bindingHash},${epoch.epoch},
      t.ms,t.ms+86400000 FROM t`;
    await owner.$executeRaw`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      INSERT INTO subtrack_auth.credential(refresh_h,session_id,family_id,identity_id,epoch,state,issued_ms,expires_ms)
      SELECT ${refreshHash},${sid}::uuid,${fid}::uuid,${identityId}::uuid,${epoch.epoch},'current',
      t.ms,t.ms+86400000 FROM t`;
    await owner.$executeRaw`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      INSERT INTO subtrack_auth.csrf(session_id,family_id,identity_id,epoch,token_h,issued_ms,expires_ms)
      SELECT ${sid}::uuid,${fid}::uuid,${identityId}::uuid,${epoch.epoch},${csrf.digest},
      t.ms,t.ms+86400000 FROM t`;
    const request = { accessToken: token, exactOrigin: epoch.origin,
      bindingCookie: binding, browserChainId: chain, csrfToken: csrf.token };
    const directAuthority = new DurableCurrentWebAuthority({ pool: actor, accessTokens: tokens,
      database: epoch.database, origin: epoch.origin, epoch: epoch.epoch,
      manifestHash: epoch.manifestHash, businessStatements: PRIVATE_PROFILE_STATEMENTS });
    const mustNotRun = async (): Promise<never> => { throw new Error('unexpected owner callback'); };
    phase = 'EXPIRED_OWNER';
    await owner.$executeRaw`UPDATE public.identity SET deleted_at=now() WHERE id=${identityId}::uuid`;
    await assert.rejects(directAuthority.withCurrentWebAuthority(request, mustNotRun),
      { message: 'Current web session unavailable' });
    await owner.$executeRaw`UPDATE public.identity SET deleted_at=NULL WHERE id=${identityId}::uuid`;
    await owner.$executeRaw`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      UPDATE subtrack_auth.csrf SET issued_ms=t.ms-2,expires_ms=t.ms-1 FROM t WHERE session_id=${sid}::uuid`;
    await assert.rejects(directAuthority.withCurrentWebAuthority(request, mustNotRun),
      { message: 'Current web session unavailable' });
    await owner.$executeRaw`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      UPDATE subtrack_auth.csrf SET issued_ms=t.ms,expires_ms=t.ms+86400000 FROM t WHERE session_id=${sid}::uuid`;
    process.stdout.write('PASS ST237_PRIVATE_ACTUAL_PG_DELETED_OWNER_EXPIRED_CSRF_REFUSAL\n');
    phase = 'UNKNOWN_COMMIT';
    let connects = 0, discarded = false, commitForwarded = false;
    const uncertainPool = { connect: async () => {
      connects++;
      const real = await actor.connect();
      return {
        query: async (sql: string, values?: unknown[]) => {
          if (sql === 'COMMIT') {
            await real.query('COMMIT'); commitForwarded = true;
            throw new Error('uncertain transport after commit');
          }
          return real.query(sql, values);
        },
        release: (error?: Error) => { discarded = error instanceof Error; real.release(error); },
      };
    } } as unknown as Pool;
    const authority = new DurableCurrentWebAuthority({ pool: uncertainPool, accessTokens: tokens,
      database: epoch.database, origin: epoch.origin, epoch: epoch.epoch,
      manifestHash: epoch.manifestHash, businessStatements: PRIVATE_PROFILE_STATEMENTS });
    await assert.rejects(authority.withCurrentWebAuthority(request, async (tx, current) => {
      assert.equal(current.identityId, identityId);
      const update = await tx.execute('profilePatch', [identityId, true, 'Unknown Commit Proof', false, null,
        false, null, false, null, false, null]);
      assert.equal(update.rowCount, 1);
      return update.rows[0];
    }), { message: 'Current web session unavailable' });
    assert.equal(connects, 1); assert(commitForwarded && discarded);
    const committed = await owner.$queryRaw<{ display_name: string | null }[]>`
      SELECT display_name FROM public.identity_profile WHERE identity_id=${identityId}::uuid`;
    assert.deepEqual(committed, [{ display_name: 'Unknown Commit Proof' }]);
    await owner.$executeRaw`DELETE FROM subtrack_auth.csrf WHERE session_id=${sid}::uuid`;
    await owner.$executeRaw`DELETE FROM subtrack_auth.credential WHERE session_id=${sid}::uuid`;
    await owner.$executeRaw`DELETE FROM subtrack_auth.session WHERE session_id=${sid}::uuid`;
    await owner.$executeRaw`DELETE FROM subtrack_auth.family WHERE family_id=${fid}::uuid`;
    await owner.$executeRaw`DELETE FROM public.identity_profile WHERE identity_id=${identityId}::uuid`;
    await owner.$executeRaw`DELETE FROM public.identity WHERE id=${identityId}::uuid`;
    process.stdout.write('PASS ST237_PRIVATE_ACTUAL_PG_UNKNOWN_COMMIT_DISCARD_NO_RETRY\n');
  } finally { await actor.end(); await owner.$disconnect(); }
}
prove().catch(() => { process.stderr.write(`FAIL ST237_PRIVATE_PG phase=${phase}\n`); process.exitCode = 1; });
