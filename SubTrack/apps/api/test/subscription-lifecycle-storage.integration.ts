import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, vi } from 'vitest';
import { withRequestTransaction } from '../src/database/request-transaction';
import { SubscriptionLifecycleRepository } from '../src/subscriptions/subscription-lifecycle.repository';

test('disposable PG16 ordinary lifecycle owner and isolation proof', async () => {
  let phase = 'preflight';
  let failure: Error | undefined;
  let fixture: PrismaClient | undefined;
  let first: PrismaClient | undefined;
  let second: PrismaClient | undefined;
  const logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map(method =>
    vi.spyOn(console, method).mockImplementation(() => undefined));
  function endpoint(key: string, username: string) {
    const value = process.env[key];
    assert(value);
    const url = new URL(value);
    assert.equal(process.env['ST081C_DISPOSABLE'], 'new-container');
    assert.equal(url.protocol, 'postgresql:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, process.env['ST081C_PORT']);
    assert.equal(url.username, username);
    assert.equal(url.pathname, '/subscription_lifecycle_proof');
    assert.equal(url.searchParams.get('connection_limit'), '1');
    return value;
  }
  try {
    fixture = new PrismaClient({ datasources: { db: { url: endpoint('ST081C_OWNER_URL', 'fixture_owner') } }, log: [] });
    first = new PrismaClient({ datasources: { db: { url: endpoint('ST081C_READER_URL', 'st081c_runtime') } }, log: [] });
    second = new PrismaClient({ datasources: { db: { url: endpoint('ST081C_READER_URL', 'st081c_runtime') } }, log: [] });
    const writer = new SubscriptionLifecycleRepository(first);
    const competitor = new SubscriptionLifecycleRepository(second);
    phase = 'ordinary role and RLS';
    const role = await first.$queryRaw<{ name: string; login: boolean; superuser: boolean; bypass: boolean; runtime: boolean }[]>`
      SELECT current_user AS name, r.rolcanlogin AS login, r.rolsuper AS superuser,
        r.rolbypassrls AS bypass, pg_has_role(current_user,'subtrack_runtime','member') AS runtime
      FROM pg_roles r WHERE r.rolname=current_user`;
    assert.deepEqual(role, [{ name: 'st081c_runtime', login: true, superuser: false, bypass: false, runtime: true }]);
    const table = await first.$queryRaw<{ owner: string; rls: boolean; update: boolean }[]>`
      SELECT pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'UPDATE') AS update
      FROM pg_class c WHERE c.oid='public.subscription'::regclass`;
    assert.deepEqual(table, [{ owner: 'fixture_owner', rls: true, update: true }]);
    type Settings = { pid: number; canonical: string | null; historical: string | null };
    async function settings(client: PrismaClient) {
      const rows = await client.$queryRaw<Settings[]>`SELECT pg_backend_pid() AS pid,
        current_setting('app.user_id',true) AS canonical,
        current_setting('app.current_user_id',true) AS historical`;
      return rows[0]!;
    }
    const firstPid = (await settings(first)).pid;
    const secondPid = (await settings(second)).pid;
    async function cleared() {
      for (const [client, pid] of [[first!, firstPid], [second!, secondPid]] as const) {
        const value = await settings(client);
        assert.equal(value.pid, pid);
        assert(!value.canonical && !value.historical);
      }
    }
    await cleared();
    phase = 'synthetic ownership, peer, share and open-book';
    const alice = randomUUID(), bob = randomUUID(), outsider = randomUUID(), household = randomUUID();
    for (const identity of [alice, bob, outsider])
      await fixture.$executeRaw`INSERT INTO identity (id,auth_method,updated_at) VALUES (${identity}::uuid,'MOCK',NOW())`;
    await fixture.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO household (id,name,updated_at) VALUES (${household}::uuid,'synthetic',NOW())`;
      await tx.$executeRaw`INSERT INTO household_member (household_id,identity_id,role)
        VALUES (${household}::uuid,${alice}::uuid,'ADMIN'),(${household}::uuid,${bob}::uuid,'MEMBER')`;
    });
    await fixture.$executeRaw`INSERT INTO consent (identity_id,scope_id,scope_type,open_book,updated_at)
      VALUES (${alice}::uuid,${household}::uuid,'HOUSEHOLD',true,NOW())`;
    const active = randomUUID(), paused = randomUUID(), cancelled = randomUUID();
    const shared = randomUUID(), open = randomUUID(), privateRow = randomUUID(), outside = randomUUID();
    const rows = [
      [active, alice, 'ACTIVE', false], [paused, alice, 'PAUSED', false], [cancelled, alice, 'CANCELLED', false],
      [shared, alice, 'ACTIVE', false], [open, alice, 'ACTIVE', false],
      [privateRow, alice, 'ACTIVE', true], [outside, outsider, 'ACTIVE', false],
    ] as const;
    for (const [id, identity, status, alwaysPrivate] of rows)
      await fixture.$executeRaw`INSERT INTO subscription
        (id,identity_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${id}::uuid,${identity}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',101,'SEK',
          ${status}::subscription_status,'DETECTED',${alwaysPrivate},NOW())`;
    await fixture.$executeRaw`INSERT INTO subscription_share (subscription_id,household_id,shared_by)
      VALUES (${shared}::uuid,${household}::uuid,${alice}::uuid)`;
    assert.deepEqual(await first.$queryRaw`SELECT id FROM subscription`, []);
    const owner = { userId: alice }, peer = { userId: bob }, other = { userId: outsider };
    const status = async (id: string) => (await fixture!.$queryRaw<{ status: string }[]>`
      SELECT status::text FROM subscription WHERE id=${id}::uuid`)[0]!.status;
    const peerVisible = () => withRequestTransaction(first!, peer, async tx =>
      (await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM subscription WHERE identity_id=${alice}::uuid`)
        .map(row => row.id));
    assert((await peerVisible()).includes(shared));
    assert((await peerVisible()).includes(open));
    assert(!(await peerVisible()).includes(privateRow));
    await fixture.$executeRaw`UPDATE consent SET open_book=false
      WHERE identity_id=${alice}::uuid AND scope_id=${household}::uuid`;
    assert((await peerVisible()).includes(shared));
    assert(!(await peerVisible()).includes(open));
    assert(!(await peerVisible()).includes(privateRow));
    await assert.rejects(writer.apply(peer, shared, 'pause'), { message: 'SUBSCRIPTION_NOT_FOUND' });
    await fixture.$executeRaw`UPDATE consent SET open_book=true
      WHERE identity_id=${alice}::uuid AND scope_id=${household}::uuid`;
    assert((await peerVisible()).includes(open));
    await assert.rejects(writer.apply(peer, open, 'pause'), { message: 'SUBSCRIPTION_NOT_FOUND' });
    phase = 'all seven owner status transitions';
    for (const [initial, action, expected] of [
      ['ACTIVE', 'pause', 'PAUSED'], ['ACTIVE', 'cancel', 'CANCELLED'], ['ACTIVE', 'archive', 'ARCHIVED'],
      ['PAUSED', 'resume', 'ACTIVE'], ['PAUSED', 'cancel', 'CANCELLED'], ['PAUSED', 'archive', 'ARCHIVED'],
      ['CANCELLED', 'archive', 'ARCHIVED'],
    ] as const) {
      const transitionId = randomUUID();
      await fixture.$executeRaw`INSERT INTO subscription
        (id,identity_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${transitionId}::uuid,${alice}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',101,'SEK',
          ${initial}::subscription_status,'DETECTED',false,NOW())`;
      assert.deepEqual(await writer.apply(owner, transitionId, action), { id: transitionId, status: expected });
      assert.equal(await status(transitionId), expected);
    }
    for (const [id, action, expected] of [
      [active, 'pause', 'PAUSED'], [paused, 'resume', 'ACTIVE'], [cancelled, 'archive', 'ARCHIVED'],
    ] as const) {
      assert.deepEqual(await writer.apply(owner, id, action), { id, status: expected });
      assert.equal(await status(id), expected);
    }
    phase = 'peer, share, open-book and unrelated denial';
    for (const id of [active, shared, open, privateRow, outside]) {
      const caller = id === outside ? owner : peer;
      await assert.rejects(writer.apply(caller, id, 'pause'), { message: 'SUBSCRIPTION_NOT_FOUND' });
      assert.equal(await status(id), id === active ? 'PAUSED' : 'ACTIVE');
    }
    await assert.rejects(writer.apply(other, active, 'pause'), { message: 'SUBSCRIPTION_NOT_FOUND' });
    await assert.rejects(writer.apply(peer, randomUUID(), 'pause'), { message: 'SUBSCRIPTION_NOT_FOUND' });
    phase = 'serialized competing actions and stale conflict';
    const race = await Promise.allSettled([
      writer.apply(owner, open, 'pause'), competitor.apply(owner, open, 'cancel'),
    ]);
    // Both actions are legal sequentially; lock serialization must yield PAUSED then CANCELLED,
    // or CANCELLED then a conflict. There must be no lost or partial update.
    assert(race.some(result => result.status === 'fulfilled'));
    if (race.every(result => result.status === 'fulfilled')) assert.equal(await status(open), 'CANCELLED');
    else {
      assert.equal(await status(open), 'CANCELLED');
      assert.equal((race.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.message, 'LIFECYCLE_CONFLICT');
    }
    await assert.rejects(writer.apply(owner, cancelled, 'pause'), { message: 'LIFECYCLE_CONFLICT' });
    phase = 'transaction rollback and pooled context cleanup';
    await assert.rejects(withRequestTransaction(first, owner, async tx => {
      await tx.$executeRaw`UPDATE subscription SET status='CANCELLED'::subscription_status WHERE id=${active}::uuid`;
      throw new Error('rollback');
    }), { message: 'rollback' });
    assert.equal(await status(active), 'PAUSED');
    await cleared();
    for (const spy of logs) assert.equal(spy.mock.calls.length, 0);
  } catch {
    failure = new Error(`Disposable subscription lifecycle proof failed: ${phase}`);
  }
  const cleanup = await Promise.allSettled([first?.$disconnect(), second?.$disconnect(), fixture?.$disconnect()]);
  const logged = logs.some(spy => spy.mock.calls.length > 0);
  for (const spy of logs) spy.mockRestore();
  if (logged || cleanup.some(result => result.status === 'rejected'))
    throw new Error('Disposable subscription lifecycle proof failed: cleanup or logging');
  if (failure) throw failure;
}, 90_000);
