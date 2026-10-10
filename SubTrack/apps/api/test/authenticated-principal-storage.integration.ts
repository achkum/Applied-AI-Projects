import 'reflect-metadata';
import {
  Controller,
  Post,
  Req,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { test, vi } from 'vitest';
import {
  AuthenticatedPrincipalGuard,
  getVerifiedPrincipal,
  getVerifiedRequestContext,
} from '../src/auth/sessions/authenticated-principal.guard';
import { JwtService } from '../src/auth/sessions/jwt.service';
import { PrincipalResolver } from '../src/auth/sessions/principal-resolver';
import { PrismaSessionOwnerReader } from '../src/auth/sessions/prisma-session-owner-reader';

test('test-only HTTP guard composed with real disposable nonowner storage', async () => {
  let phase = 'independent disposable endpoint verification';
  let failure: Error | undefined;
  let owner: PrismaClient | undefined;
  let db: PrismaClient | undefined;
  let app: INestApplication | undefined;
  const oldPem = process.env['JWT_PRIVATE_KEY_PEM'];
  const logSpies = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
    vi.spyOn(console, method as 'log').mockImplementation(() => undefined),
  );
  try {
    function endpoint(key: string, username: string) {
      const value = process.env[key];
      assert(value);
      const url = new URL(value);
      assert.equal(process.env['SEC_FU1D_DISPOSABLE'], 'new-container');
      assert.equal(url.protocol, 'postgresql:');
      assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.username, username);
      assert.equal(url.pathname, '/session_owner_proof');
      assert.equal(url.searchParams.get('connection_limit'), '1');
      assert.equal(url.port, process.env['SEC_FU1D_PORT']);
      return value;
    }
    owner = new PrismaClient({
      datasources: {
        db: { url: endpoint('SEC_FU1D_OWNER_URL', 'fixture_owner') },
      },
      log: [],
    });
    db = new PrismaClient({
      datasources: {
        db: { url: endpoint('SEC_FU1D_READER_URL', 'proof_reader') },
      },
      log: [],
    });
    const storage = db;
    phase = 'independent authenticated role and table RLS preconditions';
    const roles = await storage.$queryRaw<
      {
        name: string;
        authenticated: string;
        superuser: boolean;
        bypass: boolean;
        memberships: bigint;
      }[]
    >`
      SELECT current_user AS name, session_user AS authenticated, r.rolsuper AS superuser,
        r.rolbypassrls AS bypass, (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname=current_user`;
    assert.deepEqual(roles, [
      {
        name: 'proof_reader',
        authenticated: 'proof_reader',
        superuser: false,
        bypass: false,
        memberships: 0n,
      },
    ]);
    const tables = await storage.$queryRaw<
      {
        name: string;
        owner: string;
        rls: boolean;
        select: boolean;
        write: boolean;
      }[]
    >`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS select,
        (has_table_privilege(current_user,c.oid,'INSERT') OR has_table_privilege(current_user,c.oid,'UPDATE')
          OR has_table_privilege(current_user,c.oid,'DELETE')) AS write
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('identity','session') ORDER BY c.relname`;
    assert.deepEqual(
      tables,
      ['identity', 'session'].map((name) => ({
        name,
        owner: 'fixture_owner',
        rls: true,
        select: true,
        write: false,
      })),
    );
    phase = 'independent synthetic fixture provisioning';
    const first = randomUUID(),
      second = randomUUID(),
      firstSid = randomUUID(),
      secondSid = randomUUID();
    await owner.$executeRaw`INSERT INTO identity (id,auth_method) VALUES (${first}::uuid,'MOCK'),(${second}::uuid,'MOCK')`;
    await owner.$executeRaw`INSERT INTO session (id,identity_id,device_name,refresh_token_hash,family_id)
      VALUES (${firstSid}::uuid,${first}::uuid,'synthetic',${randomUUID()},${randomUUID()}::uuid),
             (${secondSid}::uuid,${second}::uuid,'synthetic',${randomUUID()},${randomUUID()}::uuid)`;
    const key = generateKeyPairSync('ed25519').privateKey;
    process.env['JWT_PRIVATE_KEY_PEM'] = key
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    let jwt: JwtService;
    try {
      jwt = new JwtService();
    } finally {
      if (oldPem === undefined) delete process.env['JWT_PRIVATE_KEY_PEM'];
      else process.env['JWT_PRIVATE_KEY_PEM'] = oldPem;
    }
    const actualReader = new PrismaSessionOwnerReader(storage);
    const reads: { sid: string; sub: string; frozen: boolean }[] = [];
    let readFailures = 0;
    const resolver = new PrincipalResolver(jwt, {
      readCurrentSessionOwner: async (sid, context) => {
        reads.push({
          sid,
          sub: context.userId,
          frozen: Object.isFrozen(context),
        });
        try {
          return await actualReader.readCurrentSessionOwner(sid, context);
        } catch (error) {
          readFailures++;
          throw error;
        }
      },
    });
    let handlerCalls = 0;
    let expected: { identityId: string; sessionId: string } = {
      identityId: first,
      sessionId: firstSid,
    };
    @Controller('storage-probe')
    class Probe {
      @Post()
      @UseGuards(AuthenticatedPrincipalGuard)
      probe(@Req() request: Request) {
        handlerCalls++;
        const principal = getVerifiedPrincipal(request);
        const context = getVerifiedRequestContext(request);
        return {
          principalMatches:
            principal.identityId === expected.identityId &&
            principal.sessionId === expected.sessionId,
          contextMatches: context.userId === expected.identityId,
          principalShape: Object.keys(principal).sort().join(','),
          contextShape: Object.keys(context).join(','),
          frozen: Object.isFrozen(principal) && Object.isFrozen(context),
        };
      }
    }
    phase = 'test-only loopback Nest setup';
    const guard = new AuthenticatedPrincipalGuard(resolver);
    const module = await Test.createTestingModule({
      controllers: [Probe],
      providers: [{ provide: AuthenticatedPrincipalGuard, useValue: guard }],
    })
      .overrideGuard(AuthenticatedPrincipalGuard)
      .useValue(guard)
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const address: unknown = app.getHttpServer().address();
    assert(
      address &&
        typeof address === 'object' &&
        'port' in address &&
        'address' in address,
    );
    assert.equal(address.address, '127.0.0.1');
    assert(typeof address.port === 'number' && address.port > 0);
    const port = address.port;
    function send(headers: string[]) {
      return new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          const request = httpRequest(
            {
              hostname: '127.0.0.1',
              port,
              path: '/storage-probe?identityId=spoof&userId=spoof',
              method: 'POST',
              headers: [
                'Host',
                '127.0.0.1',
                'Content-Type',
                'application/json',
                ...headers,
              ],
            },
            (response) => {
              let body = '';
              response.setEncoding('utf8');
              response.on('data', (chunk: string) => {
                body += chunk;
              });
              response.on('error', reject);
              response.on('end', () =>
                resolve({ status: response.statusCode ?? 0, body }),
              );
            },
          );
          request.on('error', reject);
          request.setTimeout(5_000, () =>
            request.destroy(new Error('Synthetic HTTP timeout')),
          );
          request.end(
            JSON.stringify({
              identityId: 'spoof',
              userId: 'spoof',
              sessionId: 'spoof',
            }),
          );
        },
      );
    }
    type Settings = {
      pid: number;
      canonical: string | null;
      historical: string | null;
    };
    async function settings() {
      const rows = await storage.$queryRaw<
        Settings[]
      >`SELECT pg_backend_pid() AS pid,
        current_setting('app.user_id',true) AS canonical, current_setting('app.current_user_id',true) AS historical`;
      assert.equal(rows.length, 1);
      return rows[0]!;
    }
    const baseline = await settings();
    async function cleared() {
      const value = await settings();
      assert.equal(value.pid, baseline.pid);
      assert(!value.canonical && !value.historical);
    }
    await cleared();
    const bearer = (token: string) => ['Authorization', `Bearer ${token}`];
    async function success(identityId: string, sessionId: string) {
      expected = { identityId, sessionId };
      const before = reads.length,
        handlers = handlerCalls;
      const response = await send([
        ...bearer(jwt.issue(identityId, sessionId)),
        'X-Caller-Id',
        'spoof',
        'Cookie',
        'unrelated=ok',
      ]);
      assert.equal(response.status, 201);
      assert.deepEqual(JSON.parse(response.body), {
        principalMatches: true,
        contextMatches: true,
        principalShape: 'identityId,sessionId',
        contextShape: 'userId',
        frozen: true,
      });
      assert.equal(handlerCalls, handlers + 1);
      assert.equal(reads.length, before + 1);
      assert.deepEqual(reads.at(-1), {
        sid: sessionId,
        sub: identityId,
        frozen: true,
      });
      await cleared();
    }
    const genericBody = JSON.stringify({
      message: 'Unauthorized',
      error: 'Unauthorized',
      statusCode: 401,
    });
    async function rejected(headers: string[], expectedReads: number) {
      const before = reads.length,
        handlers = handlerCalls;
      const response = await send(headers);
      assert.equal(response.status, 401);
      assert.equal(response.body, genericBody);
      assert.equal(handlerCalls, handlers);
      assert.equal(reads.length, before + expectedReads);
      await cleared();
    }
    phase = 'sequential verified HTTP owners and spoof resistance';
    await success(first, firstSid);
    await success(second, secondSid);
    await success(first, firstSid);
    phase = 'raw transport rejection with zero storage and no handler';
    const token = jwt.issue(first, firstSid);
    for (const headers of [
      ['X-Caller-Id', 'spoof'],
      [...bearer(token), ...bearer(token)],
      [
        ...bearer(token),
        'authorization',
        `Bearer ${jwt.issue(second, secondSid)}`,
      ],
      ['Authorization', `Basic ${token}`],
      ['Authorization', `Bearer ${token},extra`],
      [...bearer(token), 'Cookie', 'st_v2_access='],
      [...bearer(token), 'Cookie', 'st_v2_refresh='],
      bearer('invalid'),
    ])
      await rejected(headers, 0);
    phase = 'signed malformed claims and invalid signature with zero storage';
    const header = Buffer.from(
      JSON.stringify({ alg: 'EdDSA', crv: 'Ed25519', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: first, sid: firstSid, iat: 1, exp: 'invalid' }),
    ).toString('base64url');
    const message = `${header}.${payload}`;
    await rejected(
      bearer(
        `${message}.${sign(null, Buffer.from(message), key).toString('base64url')}`,
      ),
      0,
    );
    const parts = token.split('.');
    const original = `${parts[0]}.${parts[1]}`;
    const other = generateKeyPairSync('ed25519').privateKey;
    await rejected(
      bearer(
        `${original}.${sign(null, Buffer.from(original), other).toString('base64url')}`,
      ),
      0,
    );
    phase = 'actual scoped cross-owner and absent current rows';
    await rejected(bearer(jwt.issue(first, secondSid)), 1);
    await rejected(bearer(jwt.issue(second, firstSid)), 1);
    await rejected(bearer(jwt.issue(first, randomUUID())), 1);
    await rejected(bearer(jwt.issue(randomUUID(), randomUUID())), 1);
    phase = 'signed opaque identifiers cause delegated real storage errors';
    for (const [sub, sid] of [
      ['opaque-not-uuid', firstSid],
      [first, 'opaque-not-uuid'],
    ] as const) {
      const before = readFailures;
      await rejected(bearer(jwt.issue(sub, sid)), 1);
      assert.equal(readFailures, before + 1);
      assert.deepEqual(reads.at(-1), { sid, sub, frozen: true });
      await success(second, secondSid);
    }
    phase = 'committed revocation observed on repeated HTTP request';
    await owner.$executeRaw`UPDATE session SET revoked_at=NOW() WHERE id=${firstSid}::uuid`;
    await rejected(bearer(token), 1);
    await success(second, secondSid);
    phase = 'committed deletion observed on repeated HTTP request';
    await owner.$executeRaw`UPDATE session SET revoked_at=NULL WHERE id=${firstSid}::uuid`;
    await success(first, firstSid);
    await owner.$executeRaw`UPDATE identity SET deleted_at=NOW() WHERE id=${first}::uuid`;
    await rejected(bearer(token), 1);
    await success(second, secondSid);
    phase = 'credential-bearing log absence';
    for (const spy of logSpies) assert.equal(spy.mock.calls.length, 0);
  } catch {
    failure = new Error(`Disposable HTTP storage proof failed: ${phase}`);
  } finally {
    if (oldPem === undefined) delete process.env['JWT_PRIVATE_KEY_PEM'];
    else process.env['JWT_PRIVATE_KEY_PEM'] = oldPem;
  }
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(() => app?.close()),
    Promise.resolve().then(() => owner?.$disconnect()),
    Promise.resolve().then(() => db?.$disconnect()),
  ]);
  const logged = logSpies.some((spy) => spy.mock.calls.length > 0);
  for (const spy of logSpies) spy.mockRestore();
  if (failure) throw failure;
  if (cleanup.some((result) => result.status === 'rejected') || logged)
    throw new Error('Disposable HTTP storage proof failed: cleanup or logging');
}, 60_000);
