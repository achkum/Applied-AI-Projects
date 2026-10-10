import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { test } from 'vitest';
import { inspectOwnedFixture, privateFile } from '../src/subscriptions/browser-subscription-lifecycle.local';

type Credential = { handle: 'owner' | 'peer'; access: string; binding: string; csrf: string };
const root = resolve(__dirname, '../../..');
const origin = 'https://127.0.0.1:35426';
const phases = ['fixture', 'compiled_child', 'child_spawn', 'child_bootstrap', 'child_startup_exit',
  'child_startup_timeout', 'child_pool', 'smoke', 'denials', 'sigterm_cleanup', 'sigint_cleanup', 'parent_cleanup'] as const;
type Phase = typeof phases[number];
type Cleanup = 'none' | 'child_exit' | 'child_timeout' | 'owner_disconnect';
const failureReceipt = (phase: unknown, cleanup: unknown) =>
  `ST-226 launcher proof failed: ${phases.includes(phase as Phase) ? phase : 'unavailable'}; cleanup: ${
    ['none', 'child_exit', 'child_timeout', 'owner_disconnect'].includes(cleanup as string) ? cleanup : 'unavailable'}`;
const childExit = (child: ChildProcess, ms: number): Promise<number | null> => new Promise((done, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) return done(child.exitCode);
  const timer = setTimeout(() => { clear(); reject(new Error('timeout')); }, ms);
  const onExit = (code: number | null) => { clear(); done(code); };
  const onError = () => { clear(); reject(new Error('child')); };
  function clear() { clearTimeout(timer); child.off('exit', onExit); child.off('error', onError); }
  child.once('exit', onExit); child.once('error', onError);
});
const request = (id: string, method: 'POST' | 'PATCH', credential?: Credential, status = 'PAUSED') =>
  new Promise<{ status: number; body: Record<string, unknown>; cache: string | undefined }>((done, reject) => {
    const body = method === 'POST' ? '{}' : JSON.stringify({ status });
    const req = httpsRequest(`${origin}/v2/subscriptions/${id}${method === 'POST' ? '/read' : ''}`, {
      method, rejectUnauthorized: false, headers: { Origin: origin, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body), ...(credential ? { 'X-Session-CSRF': credential.csrf,
          Cookie: `st_v2_access=${credential.access}; st_v2_binding=${credential.binding}` } : {}) },
    }, result => {
      let text = '';
      result.setEncoding('utf8');
      result.on('data', (chunk: string) => { text += chunk; if (text.length > 16_384) req.destroy(new Error('bound')); });
      result.once('end', () => { try { done({ status: result.statusCode ?? 0,
        body: JSON.parse(text) as Record<string, unknown>, cache: result.headers['cache-control'] }); } catch { reject(new Error('response')); } });
      result.once('error', reject);
    });
    req.once('error', reject); req.setTimeout(5_000, () => req.destroy(new Error('timeout'))); req.end(body);
  });
const listenerClosed = async (id: string) => {
  try { await request(id, 'POST'); }
  catch (error) { assert.equal((error as NodeJS.ErrnoException).code, 'ECONNREFUSED'); return; }
  assert.fail('listener survived');
};

test('owned PG16 compiled HTTPS READ PATCH persistence and launcher cleanup', async () => {
  if (process.platform !== 'linux' || process.env['CI'] !== 'true') throw new Error('ST-226 requires Linux CI');
  let phase: Phase = 'fixture';
  let failure: Phase | undefined;
  let cleanup: Cleanup = 'none';
  let ownerDb: PrismaClient | undefined;
  let child: ChildProcess | undefined;
  let credentials: Credential[] = [];
  try {
    assert(!process.env['DATABASE_URL']);
    const ownerUrl = process.env['ST226_OWNER_URL'], runtimeUrl = process.env['ST226_RUNTIME_URL'];
    const custody = () => {
      inspectOwnedFixture(process.env['ST226_PROVENANCE_FILE'], runtimeUrl);
      privateFile(process.env['ST226_TLS_KEY_FILE'], 0o600).fill(0);
      privateFile(process.env['ST226_TLS_CERT_FILE'], 0o600).fill(0);
      const parent: unknown = JSON.parse(privateFile(process.env['ST226_OWNER_PROVENANCE_FILE'], 0o600).toString());
      assert(parent && typeof parent === 'object' && Object.keys(parent).join(',') === 'ownerUrl');
      assert.equal((parent as { ownerUrl: string }).ownerUrl, ownerUrl);
      assert(ownerUrl && runtimeUrl);
      const owner = new URL(ownerUrl), runtime = new URL(runtimeUrl);
      assert.equal(ownerUrl, `postgresql://fixture_owner:${owner.password}@127.0.0.1:${runtime.port}/browser_subscription_lifecycle_proof?connection_limit=1`);
      assert.match(owner.password, /^[a-f0-9]{48}$/);
    };
    custody();
    ownerDb = new PrismaClient({ datasources: { db: { url: ownerUrl! } }, log: [] });
    const owner = randomUUID(), peer = randomUUID(), smoke = randomUUID(), unrelated = randomUUID(), missing = randomUUID();
    for (const identity of [owner, peer])
      await ownerDb.$executeRaw`INSERT INTO identity (id,auth_method,updated_at) VALUES (${identity}::uuid,'MOCK',NOW())`;
    const merchant = randomUUID();
    await ownerDb.$executeRaw`INSERT INTO merchant
      (id,canonical_name,slug,category_code,aliases,country,created_at,updated_at)
      VALUES (${merchant}::uuid,'Synthetic Merchant','st226-synthetic','VIDEO_STREAMING','[]'::jsonb,'SE',NOW(),NOW())`;
    for (const [id, identity] of [[smoke, owner], [unrelated, peer]] as const)
      await ownerDb.$executeRaw`INSERT INTO subscription
        (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${id}::uuid,${identity}::uuid,${merchant}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',9007199254740993,'SEK',
          'ACTIVE'::subscription_status,'DETECTED',true,NOW())`;
    const connections = async () => (await ownerDb!.$queryRaw<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM pg_stat_activity
      WHERE datname=current_database() AND usename='st_browser_lifecycle_runtime'`)[0]!.count;
    const baseline = await connections(); assert.equal(baseline, 0);
    const waitForConnections = async (expected: number) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (await connections() === expected) return;
        await new Promise(done => setTimeout(done, 50));
      }
      assert.equal(await connections(), expected);
    };
    const snapshot = async () => ({
      subscriptions: await ownerDb!.$queryRaw<Record<string, unknown>[]>`SELECT * FROM subscription ORDER BY id`,
      shares: await ownerDb!.$queryRaw`SELECT * FROM subscription_share ORDER BY id`,
      identities: await ownerDb!.$queryRaw`SELECT * FROM identity ORDER BY id`,
      households: await ownerDb!.$queryRaw`SELECT * FROM household ORDER BY id`,
      members: await ownerDb!.$queryRaw`SELECT * FROM household_member ORDER BY identity_id`,
      consents: await ownerDb!.$queryRaw`SELECT * FROM consent ORDER BY identity_id`,
      merchants: await ownerDb!.$queryRaw`SELECT * FROM merchant ORDER BY id`,
      audit: await ownerDb!.$queryRaw`SELECT * FROM audit_log ORDER BY id`,
    });
    const before = await snapshot();
    phase = 'compiled_child';
    const startChild = async () => {
      custody();
      phase = 'child_spawn';
      child = spawn(process.execPath, [resolve(root, 'apps/api/dist/subscriptions/browser-subscription-lifecycle.local.js')], {
        cwd: resolve(root, 'apps/api'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'development', ST226_ENABLED: '1', ST226_HOST: '127.0.0.1',
          ST226_PORT: '35426', ST226_OWNER_ID: owner, ST226_PEER_ID: peer, ST226_RUNTIME_URL: runtimeUrl,
          ST226_OWNER_URL: '', ST226_OWNER_PROVENANCE_FILE: '' },
      });
      phase = 'child_bootstrap';
      const current = child;
      credentials = await new Promise<Credential[]>((done, reject) => {
        const finish = (error?: Error, result?: Credential[]) => {
          clearTimeout(timer); current.off('message', ready); current.off('error', failed); current.off('exit', exited);
          if (error) reject(error); else done(result!);
        };
        const failed = () => { phase = 'child_spawn'; finish(new Error('startup')); };
        const exited = () => { phase = 'child_startup_exit'; finish(new Error('startup')); };
        const timer = setTimeout(() => { phase = 'child_startup_timeout'; finish(new Error('timeout')); }, 20_000);
        const ready = (raw: unknown) => {
          clearTimeout(timer);
          if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
              Object.keys(raw).sort().join(',') !== 'credentials,id,kind' ||
              (raw as { kind?: string }).kind !== 'ready' || (raw as { id?: number }).id !== 0)
            return finish(new Error('bootstrap'));
          const result = (raw as { credentials?: Credential[] }).credentials;
          if (!Array.isArray(result) || result.length !== 2 || result[0]?.handle !== 'owner' || result[1]?.handle !== 'peer' ||
              !result.every(item => item && Object.keys(item).sort().join(',') === 'access,binding,csrf,handle' &&
                typeof item.access === 'string' && item.access.length > 16 && item.access.length < 8192 &&
                typeof item.binding === 'string' && /^[A-Za-z0-9_-]{43}$/.test(item.binding) &&
                typeof item.csrf === 'string' && item.csrf.length > 16 && item.csrf.length < 512))
            return finish(new Error('bootstrap'));
          finish(undefined, result);
        };
        current.once('message', ready); current.once('error', failed); current.once('exit', exited);
      });
      phase = 'child_pool';
      await waitForConnections(baseline + 1);
    };
    let nextId = 1;
    let startupPid: number | undefined;
    const observe = (handle: 'owner' | 'peer') => new Promise<void>((done, reject) => {
      const id = nextId++;
      const current = child!;
      const finish = (error?: Error) => { clearTimeout(timer); current.off('message', listener); if (error) reject(error); else done(); };
      const timer = setTimeout(() => finish(new Error('observe timeout')), 10_000);
      const listener = (raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const ack = raw as { kind: string; id: number; action: string; handle: string; pid: number; canonicalClean: boolean; historicalClean: boolean };
        if (ack.kind !== 'controlled' || ack.id !== id) return;
        if (Object.keys(raw).sort().join(',') !== 'action,canonicalClean,handle,historicalClean,id,kind,pid' ||
            ack.action !== 'pool-observe' || ack.handle !== handle || !Number.isSafeInteger(ack.pid) || ack.pid < 1 ||
            ack.pid > 2147483647 || ack.canonicalClean !== true || ack.historicalClean !== true ||
            (startupPid !== undefined && startupPid !== ack.pid)) return finish(new Error('pool evidence'));
        startupPid = ack.pid; finish();
      };
      current.on('message', listener);
      try { current.send({ kind: 'control', id, action: 'pool-observe', handle }, error => { if (error) finish(new Error('send')); }); }
      catch { finish(new Error('send')); }
    });
    const stopChild = async (signal: 'SIGTERM' | 'SIGINT') => {
      assert(child); child.kill(signal);
      assert.equal(await childExit(child, 15_000), 0); child = undefined; credentials.length = 0;
      await listenerClosed(smoke); await waitForConnections(baseline);
    };
    await startChild();
    phase = 'smoke';
    await observe('owner');
    const read = await request(smoke, 'POST', credentials[0]);
    assert.equal(read.status, 200); assert.equal(read.cache, 'no-store'); assert.equal(read.body.status, 'ACTIVE');
    assert.equal(read.body.expectedAmountMinor, '9007199254740993'); await observe('owner');
    const patch = await request(smoke, 'PATCH', credentials[0]);
    assert.equal(patch.status, 200); assert.equal(patch.cache, 'no-store');
    assert.deepEqual(patch.body, { id: smoke, status: 'PAUSED' }); await observe('owner');
    const reread = await request(smoke, 'POST', credentials[0]);
    assert.equal(reread.status, 200); assert.equal(reread.cache, 'no-store'); assert.equal(reread.body.status, 'PAUSED');
    await observe('owner');
    const persisted = await snapshot();
    assert.equal(persisted.subscriptions.find(row => row.id === smoke)?.status, 'PAUSED');
    const normalize = (rows: Record<string, unknown>[]) => rows.map(row => row.id === smoke
      ? { ...row, status: 'ACTIVE', updated_at: before.subscriptions.find(original => original.id === smoke)?.updated_at } : row);
    assert.deepEqual({ ...persisted, subscriptions: normalize(persisted.subscriptions) }, before);
    phase = 'denials';
    const invisible = await request(smoke, 'PATCH', credentials[1]);
    const absent = await request(missing, 'PATCH', credentials[1]);
    assert.equal(invisible.status, 404); assert.equal(absent.status, 404); assert.deepEqual(invisible.body, absent.body);
    assert.equal(invisible.cache, 'no-store'); await observe('peer');
    const conflict = await request(smoke, 'PATCH', credentials[0]);
    assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'LIFECYCLE_CONFLICT');
    assert.equal(conflict.cache, 'no-store'); await observe('owner');
    assert.deepEqual(await snapshot(), persisted);
    phase = 'sigterm_cleanup'; await stopChild('SIGTERM');
    phase = 'sigint_cleanup'; nextId = 1; startupPid = undefined;
    await startChild(); phase = 'sigint_cleanup'; await observe('peer'); await stopChild('SIGINT');
  } catch { failure = phase; }
  finally {
    credentials.length = 0;
    if (child) {
      child.kill('SIGTERM');
      try { if (await childExit(child, 15_000) !== 0) cleanup = 'child_exit'; }
      catch { child.kill('SIGKILL'); try { await childExit(child, 5_000); } catch { /* retain failure */ } cleanup = 'child_timeout'; }
    }
    try { await ownerDb?.$disconnect(); } catch { cleanup = 'owner_disconnect'; }
  }
  if (failure || cleanup !== 'none') throw new Error(failureReceipt(failure ?? 'parent_cleanup', cleanup));
}, 180_000);

test('parent diagnostic preserves primary failure and redacts unknown values', () => {
  assert.equal(failureReceipt('child_startup_exit', 'child_exit'),
    'ST-226 launcher proof failed: child_startup_exit; cleanup: child_exit');
  assert.equal(failureReceipt('credentialURL header body', 'secret'),
    'ST-226 launcher proof failed: unavailable; cleanup: unavailable');
});
test('parent detects a child already exited unsuccessfully without waiting', async () => {
  assert.equal(await childExit({ exitCode: 1, signalCode: null } as ChildProcess, 10), 1);
});
