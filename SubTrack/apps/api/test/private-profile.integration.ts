// Actual owned PG16 proof, bundled by private-profile-proof.sh; never a unit fixture or default startup.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { readProfileBusinessCatalog } from './profile-business-catalog';
import { PRIVATE_PROFILE_STATEMENTS } from '../src/profile/private-profile-statements';
import { loadPrivateAuthEpoch } from '../src/auth/private-auth-epoch';

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
    await owner.$executeRaw`DELETE FROM identity_profile WHERE identity_id IN (${a}::uuid,${b}::uuid)`;
    await owner.$executeRaw`DELETE FROM identity WHERE id IN (${a}::uuid,${b}::uuid)`;
    process.stdout.write('PASS ST237_PRIVATE_PROFILE_SECOND_OWNER_DUAL_GUC_ROLLBACK_POOL_RESET\n');
  } finally { await actor.end(); await owner.$disconnect(); }
}
prove().catch(() => { process.stderr.write(`FAIL ST237_PRIVATE_PG phase=${phase}\n`); process.exitCode = 1; });
