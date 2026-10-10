import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { test, vi } from 'vitest';
import { AuthenticatedPrincipalGuard } from '../src/auth/sessions/authenticated-principal.guard';
import { JwtService } from '../src/auth/sessions/jwt.service';
import { PrincipalResolver } from '../src/auth/sessions/principal-resolver';
import { PrismaSessionOwnerReader } from '../src/auth/sessions/prisma-session-owner-reader';
import { withRequestTransaction } from '../src/database/request-transaction';
import { SubscriptionReadController } from '../src/subscriptions/subscription-read.controller';
import { SubscriptionReadRepository } from '../src/subscriptions/subscription-read.repository';
import { SubscriptionReadService } from '../src/subscriptions/subscription-read.service';

// The dedicated runner creates the database and applies every canonical migration.
test('disposable PG16 authenticated subscription HTTP and RLS proof', async () => {
  let phase = 'isolated endpoint verification';
  let failure: Error | undefined;
  let owner: PrismaClient | undefined;
  let reader: PrismaClient | undefined;
  let app: INestApplication | undefined;
  const originalPem = process.env['JWT_PRIVATE_KEY_PEM'];
  const logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map(method =>
    vi.spyOn(console, method).mockImplementation(() => undefined));
  function endpoint(key: string, username: string): string {
    const value = process.env[key];
    assert(value);
    const url = new URL(value);
    assert.equal(process.env['ST212_DISPOSABLE'], 'new-container');
    assert.equal(url.protocol, 'postgresql:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.username, username);
    assert.equal(url.pathname, '/subscription_read_proof');
    assert.equal(url.searchParams.get('connection_limit'), '1');
    assert.equal(url.port, process.env['ST212_PORT']);
    return value;
  }
  try {
    owner = new PrismaClient({ datasources: { db: { url: endpoint('ST212_OWNER_URL', 'fixture_owner') } }, log: [] });
    reader = new PrismaClient({ datasources: { db: { url: endpoint('ST212_READER_URL', 'st212_runtime') } }, log: [] });
    const storage = reader;
    phase = 'independent runtime role and RLS preconditions';
    const role = await storage.$queryRaw<{ name: string; login: boolean; superuser: boolean; bypass: boolean; runtime: boolean }[]>`
      SELECT current_user AS name, r.rolcanlogin AS login, r.rolsuper AS superuser,
        r.rolbypassrls AS bypass, pg_has_role(current_user, 'subtrack_runtime', 'member') AS runtime
      FROM pg_roles r WHERE r.rolname=current_user`;
    assert.deepEqual(role, [{ name: 'st212_runtime', login: true, superuser: false, bypass: false, runtime: true }]);
    const tables = await storage.$queryRaw<{ name: string; owner: string; rls: boolean; select: boolean }[]>`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('identity','session','household','household_member','consent','subscription','subscription_share')
      ORDER BY c.relname`;
    assert.equal(tables.length, 7);
    for (const table of tables) {
      assert.equal(table.owner, 'fixture_owner');
      assert.equal(table.rls, true);
      assert.equal(table.select, true);
    }
    type Settings = { pid: number; canonical: string | null; historical: string | null };
    async function settings() {
      const rows = await storage.$queryRaw<Settings[]>`SELECT pg_backend_pid() AS pid,
        current_setting('app.user_id',true) AS canonical,
        current_setting('app.current_user_id',true) AS historical`;
      assert.equal(rows.length, 1);
      return rows[0]!;
    }
    const baseline = await settings();
    async function cleared() {
      const row = await settings();
      assert.equal(row.pid, baseline.pid);
      assert(!row.canonical && !row.historical);
    }
    await cleared();
    phase = 'canonical synthetic identity, session and household fixture';
    const alice = randomUUID(), bob = randomUUID(), outsider = randomUUID();
    const aliceSession = randomUUID(), bobSession = randomUUID(), outsiderSession = randomUUID();
    const household = randomUUID();
    for (const identity of [alice, bob, outsider])
      await owner.$executeRaw`INSERT INTO identity (id,auth_method,updated_at)
        VALUES (${identity}::uuid,'MOCK',NOW())`;
    for (const [identity, session] of [[alice, aliceSession], [bob, bobSession], [outsider, outsiderSession]])
      await owner.$executeRaw`INSERT INTO session (id,identity_id,device_name,refresh_token_hash,family_id)
        VALUES (${session}::uuid,${identity}::uuid,'synthetic',${randomUUID()},${randomUUID()}::uuid)`;
    await owner.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO household (id,name,updated_at)
        VALUES (${household}::uuid,'synthetic',NOW())`;
      await tx.$executeRaw`INSERT INTO household_member (household_id,identity_id,role)
        VALUES (${household}::uuid,${alice}::uuid,'ADMIN'),(${household}::uuid,${bob}::uuid,'MEMBER')`;
    });
    await owner.$executeRaw`INSERT INTO consent (identity_id,scope_id,scope_type,open_book,updated_at)
      VALUES (${alice}::uuid,${household}::uuid,'HOUSEHOLD',true,NOW())`;
    const detected = randomUUID(), sharedPrivate = randomUUID(), open = randomUUID();
    const hiddenPrivate = randomUUID(), secondOpen = randomUUID(), outsiderRow = randomUUID();
    type Fixture = { id: string; identity: string; status: string; private: boolean; amount: bigint; minute: number };
    const fixtures: Fixture[] = [
      { id: detected, identity: alice, status: 'DETECTED', private: false, amount: 101n, minute: 6 },
      { id: sharedPrivate, identity: alice, status: 'ACTIVE', private: true, amount: 9007199254740993n, minute: 5 },
      { id: hiddenPrivate, identity: alice, status: 'ACTIVE', private: true, amount: 103n, minute: 4 },
      { id: open, identity: alice, status: 'PAUSED', private: false, amount: -9007199254740993n, minute: 3 },
      { id: secondOpen, identity: alice, status: 'TRIAL', private: false, amount: 105n, minute: 2 },
      { id: outsiderRow, identity: outsider, status: 'ACTIVE', private: false, amount: 106n, minute: 1 },
    ];
    for (const row of fixtures) {
      const created = new Date(`2026-01-01T00:0${row.minute}:00.000Z`);
      await owner.$executeRaw`INSERT INTO subscription
        (id,identity_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,
         confidence,detection_reasons,always_private,created_at,updated_at)
        VALUES (${row.id}::uuid,${row.identity}::uuid,'synthetic owner only','VIDEO_STREAMING','MONTHLY',
          ${row.amount},'SEK',${row.status}::subscription_status,'DETECTED',0.9,
          '[{"code":"CADENCE_MATCHED"}]'::jsonb,${row.private},${created},NOW())`;
    }
    await owner.$executeRaw`INSERT INTO subscription_share (subscription_id,household_id,shared_by)
      VALUES (${detected}::uuid,${household}::uuid,${alice}::uuid),
             (${sharedPrivate}::uuid,${household}::uuid,${alice}::uuid)`;
    assert.deepEqual(await storage.$queryRaw`SELECT id FROM subscription`, []);
    phase = 'test-only HTTP composition of actual guard, resolver and storage';
    delete process.env['JWT_PRIVATE_KEY_PEM'];
    const jwt = new JwtService();
    const resolver = new PrincipalResolver(jwt, new PrismaSessionOwnerReader(storage));
    const guard = new AuthenticatedPrincipalGuard(resolver);
    const service = new SubscriptionReadService(new SubscriptionReadRepository(storage));
    const module = await Test.createTestingModule({
      controllers: [SubscriptionReadController],
      providers: [{ provide: SubscriptionReadService, useValue: service }],
    }).overrideGuard(AuthenticatedPrincipalGuard).useValue(guard).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const aliceToken = jwt.issue(alice, aliceSession), bobToken = jwt.issue(bob, bobSession);
    const outsiderToken = jwt.issue(outsider, outsiderSession);
    const get = (path: string, token: string) => request(server).get(path).set('Authorization', `Bearer ${token}`);
    const ids = (body: { items: { id: string }[] }) => body.items.map(item => item.id);
    phase = 'owner, peer, explicit share and open-book HTTP projection';
    const mine = await get('/v1/subscriptions', aliceToken).expect(200);
    assert.deepEqual(ids(mine.body), [detected, sharedPrivate, hiddenPrivate, open, secondOpen]);
    assert.equal(mine.body.nextCursor, null);
    assert.equal(mine.body.items[1].expectedAmountMinor, '9007199254740993');
    assert.equal(mine.body.items[3].expectedAmountMinor, '-9007199254740993');
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household', aliceToken).expect(200)).body),
      [detected, sharedPrivate, hiddenPrivate, open, secondOpen]);
    const peer = await get('/v1/subscriptions?scope=household', bobToken).expect(200);
    assert.deepEqual(ids(peer.body), [sharedPrivate, open, secondOpen]);
    assert.deepEqual(Object.keys(peer.body).sort(), ['items', 'nextCursor']);
    assert.deepEqual(Object.keys(peer.body.items[0]).sort(),
      ['visibility','id','categoryCode','cadence','status','expectedAmountMinor','currency'].sort());
    assert.equal(peer.body.items[0].expectedAmountMinor, '9007199254740993');
    assert.equal(peer.body.items[1].expectedAmountMinor, '-9007199254740993');
    assert.deepEqual(ids((await get('/v1/subscriptions', bobToken).expect(200)).body), []);
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household&status=PAUSED', bobToken).expect(200)).body), [open]);
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household&category=GAMING', bobToken).expect(200)).body), []);
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household', outsiderToken).expect(200)).body), []);
    assert.deepEqual(ids((await get('/v1/subscriptions', outsiderToken).expect(200)).body), [outsiderRow]);
    phase = 'detected is owner-only before keyset and detail projection';
    const inbox = await get('/v1/review-inbox', aliceToken).expect(200);
    assert.deepEqual(ids(inbox.body), [detected]);
    assert.deepEqual(inbox.body.items[0].reasonCodes, ['CADENCE_MATCHED']);
    assert.deepEqual(ids((await get('/v1/review-inbox', bobToken).expect(200)).body), []);
    const ownerDetail = await get(`/v1/subscriptions/${detected}`, aliceToken).expect(200);
    assert.equal(ownerDetail.body.visibility, 'owner');
    const peerDetail = await get(`/v1/subscriptions/${sharedPrivate}`, bobToken).expect(200);
    assert.equal(peerDetail.body.visibility, 'household');
    assert.equal(peerDetail.body.customName, undefined);
    const invisible = await get(`/v1/subscriptions/${hiddenPrivate}`, bobToken).expect(404);
    const missing = await get(`/v1/subscriptions/${randomUUID()}`, bobToken).expect(404);
    assert.deepEqual(invisible.body, missing.body);
    assert.deepEqual((await get(`/v1/subscriptions/${detected}`, bobToken).expect(404)).body, missing.body);
    phase = 'bounded endpoint-bound keyset, hidden rows and revocation';
    const first = await get('/v1/subscriptions?scope=household&limit=1', bobToken).expect(200);
    assert.deepEqual(ids(first.body), [sharedPrivate]);
    assert.equal(typeof first.body.nextCursor, 'string');
    const cursor = encodeURIComponent(first.body.nextCursor as string);
    const second = await get(`/v1/subscriptions?scope=household&limit=1&cursor=${cursor}`, bobToken).expect(200);
    assert.deepEqual(ids(second.body), [open]);
    assert.equal(typeof second.body.nextCursor, 'string');
    await get(`/v1/review-inbox?cursor=${cursor}`, bobToken).expect(400);
    await get(`/v1/subscriptions?scope=me&cursor=${cursor}`, bobToken).expect(400);
    for (const limit of ['0', '51', '-1', '1.5'])
      await get(`/v1/subscriptions?limit=${limit}`, bobToken).expect(400);
    await get(`/v1/subscriptions?cursor=${'x'.repeat(513)}`, bobToken).expect(400);
    await owner.$executeRaw`UPDATE subscription_share SET revoked_at=NOW()
      WHERE subscription_id=${sharedPrivate}::uuid`;
    const afterRevoke = await get(`/v1/subscriptions?scope=household&limit=1&cursor=${cursor}`, bobToken).expect(200);
    assert.deepEqual(ids(afterRevoke.body), [open]);
    assert.deepEqual((await get(`/v1/subscriptions/${sharedPrivate}`, bobToken).expect(404)).body, missing.body);
    await owner.$executeRaw`UPDATE consent SET open_book=false WHERE identity_id=${alice}::uuid`;
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household', bobToken).expect(200)).body), []);
    await owner.$executeRaw`UPDATE consent SET open_book=true WHERE identity_id=${alice}::uuid`;
    await withRequestTransaction(owner, { userId: bob }, async tx => {
      await tx.$executeRaw`UPDATE household_member SET left_at=NOW() WHERE identity_id=${bob}::uuid`;
    });
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household', bobToken).expect(200)).body), []);
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household', aliceToken).expect(200)).body),
      [detected, sharedPrivate, hiddenPrivate, open, secondOpen]);
    phase = 'spoofed authority, current revocation and pooled GUC cleanup';
    await get('/v1/subscriptions?scope=household&identityId=' + alice, bobToken).expect(400);
    assert.deepEqual(ids((await get('/v1/subscriptions?scope=household', bobToken)
      .set('X-Caller-Id', alice).expect(200)).body), []);
    await request(server).get('/v1/subscriptions').set('X-Caller-Id', alice).expect(401);
    await request(server).get('/v1/subscriptions').set('Authorization', 'Bearer invalid').expect(401);
    await owner.$executeRaw`UPDATE session SET revoked_at=NOW() WHERE id=${bobSession}::uuid`;
    await get('/v1/subscriptions', bobToken).expect(401);
    assert.deepEqual(ids((await get('/v1/subscriptions', aliceToken).expect(200)).body),
      [detected, sharedPrivate, hiddenPrivate, open, secondOpen]);
    await cleared();
    for (const spy of logs) assert.equal(spy.mock.calls.length, 0);
  } catch {
    // Driver errors and assertion diffs can contain fixture identifiers or URLs.
    failure = new Error(`Disposable subscription read proof failed: ${phase}`);
  } finally {
    if (originalPem === undefined) delete process.env['JWT_PRIVATE_KEY_PEM'];
    else process.env['JWT_PRIVATE_KEY_PEM'] = originalPem;
  }
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(() => app?.close()),
    Promise.resolve().then(() => reader?.$disconnect()),
    Promise.resolve().then(() => owner?.$disconnect()),
  ]);
  const logged = logs.some(spy => spy.mock.calls.length > 0);
  for (const spy of logs) spy.mockRestore();
  if (logged || cleanup.some(result => result.status === 'rejected'))
    throw new Error(`Disposable subscription read proof failed: ${failure ? 'assertion and ' : ''}cleanup or logging`);
  if (failure) throw failure;
}, 90_000);
