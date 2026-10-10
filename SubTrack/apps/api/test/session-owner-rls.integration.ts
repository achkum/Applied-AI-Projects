import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { withRequestTransaction } from '../src/database/request-transaction';
import { JwtService } from '../src/auth/sessions/jwt.service';
import { PrincipalResolver } from '../src/auth/sessions/principal-resolver';
import { PrismaSessionOwnerReader } from '../src/auth/sessions/prisma-session-owner-reader';

// Explicit dedicated-workflow entrypoint, excluded from the normal *.spec.ts suite.
test('disposable actual Prisma session owner and nonowner RLS proof', async () => {
  let phase = 'disposable endpoint verification';
  function endpoint(key: string, role: string): string {
    const value = process.env[key];
    assert(value);
    const url = new URL(value);
    assert.equal(process.env['SEC_FU1D_DISPOSABLE'], 'new-container');
    assert.equal(url.protocol, 'postgresql:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.username, role);
    assert.equal(url.pathname, '/session_owner_proof');
    assert.equal(url.searchParams.get('connection_limit'), '1');
    assert.equal(url.port, process.env['SEC_FU1D_PORT']);
    return value;
  }
  let owner: PrismaClient | undefined;
  let app: PrismaClient | undefined;
  let failure: Error | undefined;
  const oldPem = process.env['JWT_PRIVATE_KEY_PEM'];
  try {
    owner = new PrismaClient({
      datasources: {
        db: { url: endpoint('SEC_FU1D_OWNER_URL', 'fixture_owner') },
      },
      log: [],
    });
    app = new PrismaClient({
      datasources: {
        db: { url: endpoint('SEC_FU1D_READER_URL', 'proof_reader') },
      },
      log: [],
    });
    const db = app;
    phase = 'authenticated role and RLS preconditions';
    const roles = await db.$queryRaw<
      {
        name: string;
        authenticated: string;
        superuser: boolean;
        bypass: boolean;
        memberships: bigint;
      }[]
    >`
      SELECT current_user AS name, session_user AS authenticated,
             r.rolsuper AS superuser, r.rolbypassrls AS bypass,
             (SELECT count(*) FROM pg_auth_members WHERE member = r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname = current_user`;
    assert.equal(roles.length, 1);
    assert.deepEqual(roles[0], {
      name: 'proof_reader',
      authenticated: 'proof_reader',
      superuser: false,
      bypass: false,
      memberships: 0n,
    });
    const tables = await db.$queryRaw<
      {
        name: string;
        owner: string;
        rls: boolean;
        write: boolean;
        select: boolean;
      }[]
    >`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        (has_table_privilege(current_user,c.oid,'INSERT') OR has_table_privilege(current_user,c.oid,'UPDATE')
          OR has_table_privilege(current_user,c.oid,'DELETE')) AS write,
        has_table_privilege(current_user,c.oid,'SELECT') AS select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('identity','session') ORDER BY c.relname`;
    assert.deepEqual(
      tables,
      ['identity', 'session'].map((name) => ({
        name,
        owner: 'fixture_owner',
        rls: true,
        write: false,
        select: true,
      })),
    );
    phase = 'synthetic fixture provisioning';
    const first = randomUUID(),
      second = randomUUID(),
      firstSid = randomUUID(),
      secondSid = randomUUID();
    await owner.$executeRaw`INSERT INTO identity (id,auth_method) VALUES (${first}::uuid,'MOCK'),(${second}::uuid,'MOCK')`;
    await owner.$executeRaw`INSERT INTO session (id,identity_id,device_name,refresh_token_hash,family_id)
      VALUES (${firstSid}::uuid,${first}::uuid,'synthetic',${randomUUID()},${randomUUID()}::uuid),
             (${secondSid}::uuid,${second}::uuid,'synthetic',${randomUUID()},${randomUUID()}::uuid)`;
    delete process.env['JWT_PRIVATE_KEY_PEM'];
    const jwt = new JwtService();
    const reader = new PrismaSessionOwnerReader(db);
    let storageCalls = 0;
    const resolver = new PrincipalResolver(jwt, {
      readCurrentSessionOwner: async (...args) => {
        storageCalls++;
        return reader.readCurrentSessionOwner(...args);
      },
    });
    async function unauthorized(token: string) {
      try {
        await resolver.resolve(token);
        assert.fail();
      } catch (error) {
        assert(error instanceof UnauthorizedException);
        assert.equal(error.message, 'Unauthorized');
        assert.equal(error.getStatus(), 401);
        assert.equal(error.cause, undefined);
      }
    }
    phase = 'actual JWT active owner and scoped lookup';
    const token = jwt.issue(first, firstSid);
    assert.deepEqual(await resolver.resolve(token), {
      identityId: first,
      sessionId: firstSid,
    });
    assert.equal(
      await reader.readCurrentSessionOwner(randomUUID(), { userId: first }),
      null,
    );
    assert.equal(
      await reader.readCurrentSessionOwner(secondSid, { userId: first }),
      null,
    );
    await unauthorized(jwt.issue(first, secondSid));
    await unauthorized(jwt.issue(second, firstSid));
    phase = 'independent direct cross-owner RLS and both local GUCs';
    type Settings = {
      pid: number;
      canonical: string | null;
      historical: string | null;
    };
    async function settings(client: Pick<PrismaClient, '$queryRaw'>) {
      const result = await client.$queryRaw<
        Settings[]
      >`SELECT pg_backend_pid() AS pid,
        current_setting('app.user_id',true) AS canonical, current_setting('app.current_user_id',true) AS historical`;
      assert.equal(result.length, 1);
      return result[0]!;
    }
    const baseline = await settings(db);
    function cleared(value: Settings) {
      assert.equal(value.pid, baseline.pid);
      assert(!value.canonical && !value.historical);
    }
    cleared(baseline);
    for (const [identityId, sessionId, hiddenIdentity, hiddenSession] of [
      [first, firstSid, second, secondSid],
      [second, secondSid, first, firstSid],
    ] as const) {
      await withRequestTransaction(db, { userId: identityId }, async (tx) => {
        assert.deepEqual(await settings(tx), {
          pid: baseline.pid,
          canonical: identityId,
          historical: identityId,
        });
        const identities = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id::text FROM identity`;
        const sessions = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id::text FROM session`;
        assert.deepEqual(identities, [{ id: identityId }]);
        assert.deepEqual(sessions, [{ id: sessionId }]);
        assert.deepEqual(
          await tx.$queryRaw`SELECT id FROM identity WHERE id=${hiddenIdentity}::uuid`,
          [],
        );
        assert.deepEqual(
          await tx.$queryRaw`SELECT id FROM session WHERE id=${hiddenSession}::uuid`,
          [],
        );
      });
      cleared(await settings(db));
    }
    phase = 'same pooled backend rollback and SQL error cleanup';
    for (const sqlError of [false, true]) {
      let rejected = false;
      let reachedFailure = false;
      const rollback = new Error('synthetic rollback');
      try {
        await withRequestTransaction(db, { userId: first }, async (tx) => {
          assert.deepEqual(await settings(tx), {
            pid: baseline.pid,
            canonical: first,
            historical: first,
          });
          reachedFailure = true;
          if (sqlError) await tx.$queryRaw`SELECT 1/0`;
          throw rollback;
        });
      } catch (error) {
        assert(reachedFailure);
        if (sqlError) {
          assert(error instanceof Prisma.PrismaClientKnownRequestError);
          assert.equal(error.code, 'P2010');
          assert.equal(error.meta?.['code'], '22012');
        } else {
          assert.equal(error, rollback);
        }
        rejected = true;
      }
      assert(rejected);
      cleared(await settings(db));
      assert.deepEqual(await resolver.resolve(jwt.issue(second, secondSid)), {
        identityId: second,
        sessionId: secondSid,
      });
      cleared(await settings(db));
    }
    phase = 'invalid JWT zero storage and generic malformed opaque identifiers';
    const before = storageCalls;
    await unauthorized('invalid');
    await unauthorized(new JwtService().issue(first, firstSid));
    assert.equal(storageCalls, before);
    await unauthorized(jwt.issue('opaque-not-uuid', firstSid));
    cleared(await settings(db));
    await unauthorized(jwt.issue(first, 'opaque-not-uuid'));
    cleared(await settings(db));
    phase = 'current committed revocation';
    await owner.$executeRaw`UPDATE session SET revoked_at=NOW() WHERE id=${firstSid}::uuid`;
    await unauthorized(token);
    phase = 'current committed deletion';
    await owner.$executeRaw`UPDATE session SET revoked_at=NULL WHERE id=${firstSid}::uuid`;
    assert.deepEqual(await resolver.resolve(token), {
      identityId: first,
      sessionId: firstSid,
    });
    await owner.$executeRaw`UPDATE identity SET deleted_at=NOW() WHERE id=${first}::uuid`;
    await unauthorized(token);
    cleared(await settings(db));
  } catch {
    // Assertion diffs and driver exceptions can contain fixture identifiers/SQL/URLs.
    failure = new Error(`Disposable session owner proof failed: ${phase}`);
  } finally {
    if (oldPem === undefined) delete process.env['JWT_PRIVATE_KEY_PEM'];
    else process.env['JWT_PRIVATE_KEY_PEM'] = oldPem;
  }
  const disconnected = await Promise.allSettled([
    Promise.resolve().then(() => owner?.$disconnect()),
    Promise.resolve().then(() => app?.$disconnect()),
  ]);
  if (failure) throw failure;
  if (disconnected.some((result) => result.status === 'rejected')) {
    throw new Error('Disposable session owner proof failed: client cleanup');
  }
}, 60_000);
