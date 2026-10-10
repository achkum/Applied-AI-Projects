import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { test } from 'vitest';

interface BrowserRequest { allHeaders(): Promise<Record<string, string>>; method(): string; url(): string }
interface BrowserPage {
  goto(url: string): Promise<unknown>;
  route(url: string, handler: (route: { request(): BrowserRequest; fulfill(options: object): Promise<void> }) => Promise<void>): Promise<void>;
  evaluate<T, R>(fn: (input: T) => Promise<R>, input: T): Promise<R>;
  on(event: 'request', handler: (request: BrowserRequest) => void): void;
}
interface BrowserContext {
  addCookies(cookies: object[]): Promise<void>;
  newPage(): Promise<BrowserPage>;
  cookies(): Promise<{ name: string; httpOnly: boolean; secure: boolean; sameSite: string; path: string; domain: string }[]>;
  close(): Promise<void>;
}
interface Browser { newContext(options: object): Promise<BrowserContext>; close(): Promise<void> }
type Credential = { handle: 'owner' | 'peer'; access: string; binding: string; csrf: string };
const root = resolve(__dirname, '../../..');
const requireUi = createRequire(resolve(root, 'packages/ui/package.json'));
const { chromium } = requireUi('playwright') as { chromium: { launch(): Promise<Browser> } };
const freePort = (): Promise<number> => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(error => error ? reject(error) : resolvePort(typeof address === 'object' && address ? address.port : 0));
  });
});
const childExit = (child: ChildProcess, ms: number): Promise<number | null> => new Promise((done, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) return done(child.exitCode);
  const timer = setTimeout(() => { clear(); reject(new Error('timeout')); }, ms);
  const onExit = (code: number | null) => { clear(); done(code); };
  const onError = () => { clear(); reject(new Error('child')); };
  function clear() { clearTimeout(timer); child.off('exit', onExit); child.off('error', onError); }
  child.once('exit', onExit); child.once('error', onError);
});
const response = async (page: BrowserPage, input: { origin: string; id: string; csrf: string; body?: string; headers?: Record<string, string> }) =>
  page.evaluate(async value => {
    const request = await fetch(`${value.origin}/v2/subscriptions/${value.id}/read`, {
      method: 'POST', credentials: 'include', body: value.body ?? '{}',
      headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': value.csrf, ...value.headers },
    });
    return { status: request.status, body: await request.json() as Record<string, unknown> };
  }, input);
const directProbe = (url: string, headers: Record<string, string> = {}): Promise<number> =>
  new Promise((done, reject) => {
    const request = httpsRequest(url, { method: 'POST', rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': '2', ...headers } }, result => {
      result.resume(); result.once('end', () => done(result.statusCode ?? 0));
    });
    request.once('error', reject); request.setTimeout(5_000, () => request.destroy(new Error('probe timeout')));
    request.end('{}');
  });
const listenerClosed = async (url: string): Promise<void> => {
  try { await directProbe(url); }
  catch (error) {
    assert.equal((error as NodeJS.ErrnoException).code, 'ECONNREFUSED');
    return;
  }
  assert.fail('ST-222 listener survived child stop');
};

test('owned PG16, compiled Node HTTPS and natural Chromium browser subscription read', async () => {
  if (process.platform !== 'linux' || process.env['CI'] !== 'true') throw new Error('ST-222 requires Linux CI');
  let phase = 'fixture';
  let ownerDb: PrismaClient | undefined;
  let readerDb: PrismaClient | undefined;
  let child: ChildProcess | undefined;
  let browser: Browser | undefined;
  const contexts: BrowserContext[] = [];
  try {
    const ownerUrl = process.env['ST222_OWNER_URL'], runtimeUrl = process.env['ST222_RUNTIME_URL'];
    assert(ownerUrl && runtimeUrl && process.env['ST222_PROVENANCE_FILE'] && process.env['ST222_TLS_KEY_FILE'] && process.env['ST222_TLS_CERT_FILE']);
    const ownerEndpoint = new URL(ownerUrl), runtimeEndpoint = new URL(runtimeUrl);
    assert.equal(ownerEndpoint.username, 'fixture_owner');
    assert.equal(runtimeEndpoint.username, 'st221_runtime');
    assert.equal(ownerEndpoint.hostname, '127.0.0.1');
    assert.equal(runtimeEndpoint.hostname, '127.0.0.1');
    assert.equal(ownerEndpoint.pathname, '/browser_subscription_read_proof');
    assert.equal(runtimeEndpoint.pathname, ownerEndpoint.pathname);
    assert.equal(runtimeEndpoint.port, ownerEndpoint.port);
    ownerDb = new PrismaClient({ datasources: { db: { url: ownerUrl } }, log: [] });
    readerDb = new PrismaClient({ datasources: { db: { url: runtimeUrl } }, log: [] });
    const owner = randomUUID(), peer = randomUUID(), outsider = randomUUID(), household = randomUUID();
    const visible = randomUUID(), hidden = randomUUID(), missing = randomUUID();
    for (const identity of [owner, peer, outsider])
      await ownerDb.$executeRaw`INSERT INTO identity (id,auth_method,updated_at) VALUES (${identity}::uuid,'MOCK',NOW())`;
    await ownerDb.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO household (id,name,updated_at) VALUES (${household}::uuid,'synthetic',NOW())`;
      await tx.$executeRaw`INSERT INTO household_member (household_id,identity_id,role)
        VALUES (${household}::uuid,${owner}::uuid,'ADMIN'),(${household}::uuid,${peer}::uuid,'MEMBER')`;
    });
    await ownerDb.$executeRaw`INSERT INTO consent (identity_id,scope_id,scope_type,open_book,updated_at)
      VALUES (${owner}::uuid,${household}::uuid,'HOUSEHOLD',true,NOW())`;
    const merchant = randomUUID();
    await ownerDb.$executeRaw`INSERT INTO merchant
      (id,canonical_name,slug,category_code,aliases,country,created_at,updated_at)
      VALUES (${merchant}::uuid,'Synthetic Merchant','st222-synthetic','VIDEO_STREAMING','[]'::jsonb,'SE',NOW(),NOW())`;
    for (const [id, privateRow, amount] of [[visible, false, 9007199254740993n], [hidden, true, -9007199254740993n]] as const)
      await ownerDb.$executeRaw`INSERT INTO subscription
        (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${id}::uuid,${owner}::uuid,${merchant}::uuid,'synthetic owner only','VIDEO_STREAMING','MONTHLY',${amount},'SEK',
          'ACTIVE'::subscription_status,'DETECTED',${privateRow},NOW())`;
    await ownerDb.$executeRaw`INSERT INTO subscription_share (id,subscription_id,household_id,shared_by)
      VALUES (${randomUUID()}::uuid,${visible}::uuid,${household}::uuid,${owner}::uuid)`;
    assert.deepEqual(await readerDb.$queryRaw`SELECT id FROM subscription`, []);
    const baseline = await readerDb.$queryRaw<{ pid: number; canonical: string | null; historical: string | null }[]>`
      SELECT pg_backend_pid() AS pid, current_setting('app.user_id',true) AS canonical,
        current_setting('app.current_user_id',true) AS historical`;
    assert.equal(baseline.length, 1);
    assert(!baseline[0]!.canonical && !baseline[0]!.historical);
    const runtimeConnections = async () => {
      const rows = await ownerDb!.$queryRaw<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM pg_stat_activity
        WHERE datname = current_database() AND usename = 'st221_runtime'`;
      return rows[0]!.count;
    };
    const parentConnections = await runtimeConnections();
    assert.equal(parentConnections, 1);
    const waitForConnections = async (expected: number) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (await runtimeConnections() === expected) return;
        await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
      }
      assert.equal(await runtimeConnections(), expected, 'ST-222 owned runtime pool count');
    };
    const snapshot = async () => ({
      subscriptions: await ownerDb!.$queryRaw`SELECT id,identity_id,merchant_id,custom_name,category_code,cadence,
        expected_amount_minor,currency,status,source,always_private,updated_at FROM subscription ORDER BY id`,
      shares: await ownerDb!.$queryRaw`SELECT id,subscription_id,household_id,shared_by FROM subscription_share ORDER BY id`,
      identities: await ownerDb!.$queryRaw`SELECT * FROM identity ORDER BY id`,
      households: await ownerDb!.$queryRaw`SELECT * FROM household ORDER BY id`,
      members: await ownerDb!.$queryRaw`SELECT * FROM household_member ORDER BY identity_id`,
      consents: await ownerDb!.$queryRaw`SELECT * FROM consent ORDER BY identity_id`,
      merchants: await ownerDb!.$queryRaw`SELECT * FROM merchant ORDER BY id`,
      audit: await ownerDb!.$queryRaw`SELECT * FROM audit_log ORDER BY id`,
    });
    const before = await snapshot();
    phase = 'compiled child';
    const port = await freePort();
    const origin = `https://127.0.0.1:${port}`;
    const startChild = async (): Promise<Credential[]> => {
      child = spawn(process.execPath, [resolve(root, 'apps/api/dist/subscriptions/browser-subscription-read.local.js')], {
        cwd: resolve(root, 'apps/api'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'development', ST222_ENABLED: '1', ST222_HOST: '127.0.0.1',
          ST222_PORT: String(port), ST222_OWNER_ID: owner, ST222_PEER_ID: peer, ST222_RUNTIME_URL: runtimeUrl,
          ST222_OWNER_URL: '' },
      });
      const ready = await new Promise<Credential[]>((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 20_000);
      child!.once('message', (raw: unknown) => {
        clearTimeout(timeout);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
            Object.keys(raw).sort().join(',') !== 'credentials,id,kind' ||
            (raw as { kind?: string }).kind !== 'ready' || (raw as { id?: number }).id !== 0)
          return reject(new Error('bootstrap'));
        const result = (raw as { credentials?: Credential[] }).credentials;
        if (!Array.isArray(result) || result.length !== 2 || result[0]?.handle !== 'owner' || result[1]?.handle !== 'peer' ||
            !result.every(item => item && Object.keys(item).sort().join(',') === 'access,binding,csrf,handle' &&
              typeof item.access === 'string' && item.access.length > 16 && item.access.length < 8192 &&
              typeof item.binding === 'string' && /^[A-Za-z0-9_-]{43}$/.test(item.binding) &&
              typeof item.csrf === 'string' && item.csrf.length > 16 && item.csrf.length < 512))
          return reject(new Error('bootstrap'));
        done(result);
      });
      child!.once('exit', () => { clearTimeout(timeout); reject(new Error('startup')); });
      });
      await waitForConnections(parentConnections + 1);
      return ready;
    };
    const stopChild = async (signal: 'SIGTERM' | 'SIGINT') => {
      assert(child);
      child.kill(signal);
      assert.equal(await childExit(child, 10_000), 0, `ST-222 ${signal} child exit`);
      child = undefined;
      await listenerClosed(`${origin}/v2/subscriptions/${visible}/read`);
      await waitForConnections(parentConnections);
    };
    const credentials = await startChild();
    phase = 'browser';
    browser = await chromium.launch();
    const pageFor = async (credential: Credential, binding = credential.binding) => {
      const context = await browser!.newContext({ ignoreHTTPSErrors: true });
      contexts.push(context);
      await context.addCookies(['st_v2_access', 'st_v2_binding'].map((name, index) => ({
        name, value: index === 0 ? credential.access : binding, domain: '127.0.0.1', path: '/v2',
        secure: true, httpOnly: true, sameSite: 'Lax',
      })));
      const cookies = await context.cookies();
      assert.equal(cookies.length, 2);
      assert(cookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax' && cookie.path === '/v2' && cookie.domain === '127.0.0.1'));
      const page = await context.newPage();
      await page.route(`${origin}/`, route => {
        assert.equal(route.request().method(), 'GET');
        assert.equal(route.request().url(), `${origin}/`);
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>ST-222 synthetic fixture</title>' });
      });
      await page.goto(`${origin}/`);
      const jsCookies = await page.evaluate(async () => ({ cookie: (globalThis as unknown as { document: { cookie: string } }).document.cookie }), {});
      assert.equal(jsCookies.cookie, '');
      return page;
    };
    const ownerPage = await pageFor(credentials[0]!);
    const peerPage = await pageFor(credentials[1]!);
    assert.equal(await directProbe(`${origin}/v2/subscriptions/${visible}/read`,
      { Origin: origin, 'X-Session-CSRF': credentials[0]!.csrf }), 401);
    let observeOwner!: (request: BrowserRequest) => void;
    const ownerRequest = new Promise<BrowserRequest>((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => rejectRequest(new Error('owner POST observation timeout')), 5_000);
      observeOwner = request => {
        if (request.method() !== 'POST' || request.url() !== `${origin}/v2/subscriptions/${hidden}/read`) return;
        clearTimeout(timeout); resolveRequest(request);
      };
    });
    ownerPage.on('request', observeOwner);
    const ownerRead = await response(ownerPage, { origin, id: hidden, csrf: credentials[0]!.csrf });
    const ownerHeaders = await (await ownerRequest).allHeaders();
    assert.equal(ownerHeaders.origin, origin);
    assert.deepEqual((ownerHeaders.cookie ?? '').split(';').map(part => part.trim().split('=')[0]!).sort(),
      ['st_v2_access', 'st_v2_binding']);
    assert.equal(ownerRead.status, 200);
    assert.equal(ownerRead.body.visibility, 'owner');
    assert.equal(ownerRead.body.expectedAmountMinor, '-9007199254740993');
    assert.equal(ownerRead.body.customName, 'synthetic owner only');
    const peerRead = await response(peerPage, { origin, id: visible, csrf: credentials[1]!.csrf });
    assert.equal(peerRead.status, 200);
    assert.equal(peerRead.body.visibility, 'household');
    assert.equal(peerRead.body.expectedAmountMinor, '9007199254740993');
    assert.equal(peerRead.body.customName, undefined);
    assert.deepEqual(Object.keys(peerRead.body).sort(),
      ['cadence', 'categoryCode', 'currency', 'expectedAmountMinor', 'id', 'status', 'visibility']);
    const invisible = await response(peerPage, { origin, id: hidden, csrf: credentials[1]!.csrf });
    const absent = await response(peerPage, { origin, id: missing, csrf: credentials[1]!.csrf });
    assert.equal(invisible.status, 404);
    assert.deepEqual(invisible.body, absent.body);
    assert.equal((await response(ownerPage, { origin, id: visible, csrf: credentials[0]!.csrf, body: '{' })).status, 400);
    assert.equal((await response(ownerPage, { origin, id: `${visible}?identityId=${peer}`, csrf: credentials[0]!.csrf })).status, 400);
    assert.equal((await response(ownerPage, { origin, id: visible, csrf: 'A'.repeat(43) })).status, 403);
    assert.equal((await response(ownerPage, { origin, id: visible, csrf: credentials[0]!.csrf,
      headers: { 'X-Identity-Id': peer } })).status, 400);
    assert.equal((await response(peerPage, { origin, id: visible, csrf: credentials[0]!.csrf })).status, 403);
    const wrongBinding = await pageFor(credentials[0]!, 'A'.repeat(43));
    assert.equal((await response(wrongBinding, { origin, id: visible, csrf: credentials[0]!.csrf })).status, 401);
    const mixedCredentials = await pageFor(credentials[0]!, credentials[1]!.binding);
    assert.equal((await response(mixedCredentials, { origin, id: visible, csrf: credentials[0]!.csrf })).status, 401);
    // Node sends a forged Origin to the real HTTPS listener; browser assertions above use its ambient Origin.
    assert.equal(await directProbe(`${origin}/v2/subscriptions/${visible}/read`, {
      Origin: 'https://127.0.0.1:1', Cookie: `st_v2_access=${credentials[0]!.access}; st_v2_binding=${credentials[0]!.binding}`,
      'X-Session-CSRF': credentials[0]!.csrf,
    }), 400);
    phase = 'current authority';
    const control = (action: 'revoke' | 'expire', handle: 'owner' | 'peer', id: number) => new Promise<void>((done, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); child!.off('message', listener);
        if (error) reject(error); else done();
      };
      const timeout = setTimeout(() => finish(new Error('control timeout')), 5_000);
      const listener = (raw: unknown) => {
        if (!raw || typeof raw !== 'object' || (raw as { kind?: string }).kind !== 'controlled' || (raw as { id?: number }).id !== id) return;
        const ack = raw as { action?: string; handle?: string; poolClean?: boolean; observations?: { exactOrigin: boolean; originCount: number;
          accessCount: number; bindingCount: number; otherCount: number }[] };
        if (Object.keys(raw).sort().join(',') !== 'action,handle,id,kind,observations,poolClean' ||
            ack.action !== action || ack.handle !== handle || ack.poolClean !== true || !Array.isArray(ack.observations) ||
            ack.observations.length > 32 || !ack.observations.every(item =>
              item && Object.keys(item).sort().join(',') === 'accessCount,bindingCount,exactOrigin,originCount,otherCount' &&
              typeof item.exactOrigin === 'boolean' &&
              [item.originCount, item.accessCount, item.bindingCount, item.otherCount].every(count =>
                Number.isSafeInteger(count) && count >= 0 && count <= 32)) ||
            !ack.observations.some(item => item.exactOrigin && item.originCount === 1 &&
              item.accessCount === 1 && item.bindingCount === 1 && item.otherCount === 0))
          finish(new Error('child request or pool evidence missing'));
        else finish();
      };
      child!.on('message', listener);
      try { child!.send({ kind: 'control', id, action, handle }, error => { if (error) finish(new Error('control send failed')); }); }
      catch { finish(new Error('control send failed')); }
    });
    await control('revoke', 'peer', 1);
    assert.equal((await response(peerPage, { origin, id: visible, csrf: credentials[1]!.csrf })).status, 401);
    await control('expire', 'owner', 2);
    assert.equal((await response(ownerPage, { origin, id: visible, csrf: credentials[0]!.csrf })).status, 401);
    const after = await snapshot();
    assert.deepEqual(after, before);
    const pooled = await readerDb.$queryRaw<{ pid: number; canonical: string | null; historical: string | null }[]>`
      SELECT pg_backend_pid() AS pid, current_setting('app.user_id',true) AS canonical,
        current_setting('app.current_user_id',true) AS historical`;
    assert.equal(pooled[0]!.pid, baseline[0]!.pid);
    assert(!pooled[0]!.canonical && !pooled[0]!.historical);
    phase = 'SIGTERM listener and pool cleanup';
    await stopChild('SIGTERM');
    phase = 'SIGINT listener and pool cleanup';
    await startChild();
    await stopChild('SIGINT');
  } catch {
    throw new Error(`ST-222 browser proof failed: ${phase}`);
  } finally {
    let cleanupFailed = false;
    for (const context of contexts) {
      try { await context.close(); } catch { cleanupFailed = true; }
    }
    try { await browser?.close(); } catch { cleanupFailed = true; }
    if (child) {
      child.kill('SIGTERM');
      try { assert.equal(await childExit(child, 10_000), 0); }
      catch {
        child.kill('SIGKILL');
        try { await childExit(child, 5_000); } catch { /* cleanup failure is reported below */ }
        cleanupFailed = true;
      }
    }
    try { await readerDb?.$disconnect(); } catch { cleanupFailed = true; }
    try { await ownerDb?.$disconnect(); } catch { cleanupFailed = true; }
    assert.equal(cleanupFailed, false, 'ST-222 parent or child cleanup failed');
  }
}, 180_000);
