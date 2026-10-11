import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { test } from 'vitest';
import { AUTHORITY_CASES, COMPETITOR_FIXTURES, type AuthorityCase, createWriterRollbackDelegate, inspectOwnedFixture, privateFile, ROLLBACK_BASELINE, ROLLBACK_FIXTURE } from '../src/subscriptions/browser-subscription-lifecycle.local';
import { SubscriptionLifecycleRepository } from '../src/subscriptions/subscription-lifecycle.repository';

type Credential = { handle: 'owner' | 'peer' | AuthorityCase; access: string; binding: string; csrf: string };
const root = resolve(__dirname, '../../..');
const origin = 'https://127.0.0.1:35426';
interface BrowserRequest { allHeaders(): Promise<Record<string, string>>; method(): string; url(): string }
interface BrowserPage {
  goto(url: string): Promise<unknown>;
  route(url: string, handler: (route: { request(): BrowserRequest; fulfill(options: object): Promise<void> }) => Promise<void>): Promise<void>;
  evaluate<T, R>(fn: (input: T) => Promise<R>, input: T): Promise<R>;
  on(event: 'request', handler: (request: BrowserRequest) => void): void;
  off(event: 'request', handler: (request: BrowserRequest) => void): void;
}
interface BrowserContext {
  addCookies(cookies: object[]): Promise<void>; newPage(): Promise<BrowserPage>; close(): Promise<void>;
  cookies(): Promise<{ name: string; httpOnly: boolean; secure: boolean; sameSite: string; path: string; domain: string }[]>;
}
interface Browser { newContext(options: object): Promise<BrowserContext>; close(): Promise<void> }
const requireUi = createRequire(resolve(root, 'packages/ui/package.json'));
const { chromium } = requireUi('playwright') as { chromium: { launch(): Promise<Browser> } };
const statuses = ['DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED'] as const;
const targets = ['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'] as const;
const allowed = new Set(['ACTIVE:PAUSED', 'ACTIVE:CANCELLED', 'ACTIVE:ARCHIVED',
  'PAUSED:ACTIVE', 'PAUSED:CANCELLED', 'PAUSED:ARCHIVED', 'CANCELLED:ARCHIVED']);
const phases = ['fixture', 'compiled_child', 'child_spawn', 'child_bootstrap', 'child_startup_exit',
  'child_startup_timeout', 'child_pool', 'smoke', 'denials', 'browser', 'writer_rollback', 'writer_negative', 'fixture_reset', 'matrix', 'visibility', 'authority', 'competing', 'abort', 'reconciliation', 'malformed', 'sigterm_cleanup', 'sigint_cleanup', 'parent_cleanup'] as const;
type Phase = typeof phases[number];
type Cleanup = 'none' | 'child_exit' | 'child_timeout' | 'owner_disconnect';
const failureReceipt = (phase: unknown, cleanup: unknown) =>
  `ST-227a browser proof failed: ${phases.includes(phase as Phase) ? phase : 'unavailable'}; cleanup: ${
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

test('natural Chromium lifecycle matrix, authority and owned launcher cleanup', async () => {
  if (process.platform !== 'linux' || process.env['CI'] !== 'true') throw new Error('ST-227a requires Linux CI');
  let phase: Phase = 'fixture';
  let failure: Phase | undefined;
  let cleanup: Cleanup = 'none';
  let ownerDb: PrismaClient | undefined;
  let child: ChildProcess | undefined;
  let credentials: Credential[] = [];
  let browser: Browser | undefined;
  const contexts: BrowserContext[] = [];
  const pending = new Set<Promise<unknown>>();
  const settled = async <T>(operation: Promise<T>, ms = 5_000): Promise<T> => {
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    let timer: NodeJS.Timeout | undefined;
    try { return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('deadline')), ms);
    })]); } finally { clearTimeout(timer); }
  };
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
    await settled(ownerDb.$executeRaw`SET statement_timeout = 5000`);
    const fixtures = statuses.flatMap(current => targets.map(target => ({ id: randomUUID(), current, target })));
    const shared = randomUUID(), openBook = randomUUID(), household = randomUUID();
    for (const identity of [owner, peer])
      await ownerDb.$executeRaw`INSERT INTO identity (id,auth_method,updated_at) VALUES (${identity}::uuid,'MOCK',NOW())`;
    const merchant = randomUUID();
    await ownerDb.$executeRaw`INSERT INTO merchant
      (id,canonical_name,slug,category_code,aliases,country,created_at,updated_at)
      VALUES (${merchant}::uuid,'Synthetic Merchant','st227a-synthetic','VIDEO_STREAMING','[]'::jsonb,'SE',NOW(),NOW())`;
    for (const [id, identity] of [[smoke, owner], [unrelated, peer]] as const)
      await ownerDb.$executeRaw`INSERT INTO subscription
        (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${id}::uuid,${identity}::uuid,${merchant}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',9007199254740993,'SEK',
          'ACTIVE'::subscription_status,'DETECTED',true,NOW())`;
    for (const fixture of fixtures)
      await settled(ownerDb.$executeRaw`INSERT INTO subscription
        (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${fixture.id}::uuid,${owner}::uuid,${merchant}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',1,'SEK',
          ${fixture.current}::subscription_status,'DETECTED',true,NOW())`);
    await settled(ownerDb.$executeRaw`INSERT INTO subscription
      (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
      VALUES (${ROLLBACK_FIXTURE}::uuid,${owner}::uuid,${merchant}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',1,'SEK',
        'ACTIVE'::subscription_status,'DETECTED',true,${new Date(ROLLBACK_BASELINE)})`);
    for (const id of Object.values(COMPETITOR_FIXTURES)) await settled(ownerDb.$executeRaw`INSERT INTO subscription
      (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
      VALUES (${id}::uuid,${owner}::uuid,${merchant}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',1,'SEK',
        'ACTIVE'::subscription_status,'DETECTED',true,NOW())`);
    await settled(ownerDb.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO household (id,name,updated_at) VALUES (${household}::uuid,'synthetic',NOW())`;
      await tx.$executeRaw`INSERT INTO household_member (household_id,identity_id,role)
        VALUES (${household}::uuid,${owner}::uuid,'ADMIN'),(${household}::uuid,${peer}::uuid,'MEMBER')`;
    }));
    await settled(ownerDb.$executeRaw`INSERT INTO consent (identity_id,scope_id,scope_type,open_book,updated_at)
      VALUES (${owner}::uuid,${household}::uuid,'HOUSEHOLD',true,NOW())`);
    for (const [id, privateRow] of [[shared, true], [openBook, false]] as const)
      await settled(ownerDb.$executeRaw`INSERT INTO subscription
        (id,identity_id,merchant_id,custom_name,category_code,cadence,expected_amount_minor,currency,status,source,always_private,updated_at)
        VALUES (${id}::uuid,${owner}::uuid,${merchant}::uuid,'synthetic','VIDEO_STREAMING','MONTHLY',1,'SEK',
          'ACTIVE'::subscription_status,'DETECTED',${privateRow},NOW())`);
    await settled(ownerDb.$executeRaw`INSERT INTO subscription_share (id,subscription_id,household_id,shared_by)
      VALUES (${randomUUID()}::uuid,${shared}::uuid,${household}::uuid,${owner}::uuid)`);
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
      sessions: await ownerDb!.$queryRaw`SELECT * FROM session ORDER BY id`,
    });
    await settled(snapshot());
    phase = 'writer_negative';
    // Actual accepted UPDATE to another owned row must abort on the armed wrong-id result.
    custody();
    const negativeDb = new PrismaClient({ datasources: { db: { url: runtimeUrl! } }, log: [] });
    let negativeProof: Awaited<ReturnType<typeof createWriterRollbackDelegate>> | undefined;
    try {
      const before = await settled(snapshot()); let stopped = false;
      negativeProof = await settled(createWriterRollbackDelegate(negativeDb, owner, () => { stopped = true; }));
      assert(negativeProof.arm());
      await assert.rejects(settled(new SubscriptionLifecycleRepository(negativeProof.prisma).apply({ userId: owner }, smoke, 'pause')),
        { message: 'SUBSCRIPTION_STORAGE_ERROR' });
      assert(stopped); assert.equal(negativeProof.verified, false); assert.equal(negativeProof.failed, true);
      assert.deepEqual(await settled(snapshot()), before);
    } finally {
      if (negativeProof) await settled(negativeProof.settle(), 10_000);
      assert.equal(pending.size, 0); await settled(negativeDb.$disconnect(), 10_000);
    }
    await waitForConnections(baseline);
    phase = 'compiled_child';
    const startChild = async (competing = false) => {
      custody();
      phase = 'child_spawn';
      child = spawn(process.execPath, [resolve(root, 'apps/api/dist/subscriptions/browser-subscription-lifecycle.local.js')], {
        cwd: resolve(root, 'apps/api'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'development', ST226_ENABLED: '1', ST226_HOST: '127.0.0.1',
          ST226_PORT: '35426', ST226_OWNER_ID: owner, ST226_PEER_ID: peer, ST226_RUNTIME_URL: runtimeUrl,
          ST226_OWNER_URL: '', ST226_OWNER_PROVENANCE_FILE: '', ST227B_ENABLED: '1', ST227C1_ENABLED: '1', ST227C2_ENABLED: competing ? '1' : '' },
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
          if (!Array.isArray(result) || result.length !== 10 ||
              result.map(item => item.handle).join(',') !== ['owner', 'peer', ...AUTHORITY_CASES].join(',') ||
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
      await waitForConnections(baseline + (competing ? 2 : 1));
    };
    let nextId = 1;
    let startupPid: number | undefined;
    const observe = (handle: 'owner' | 'peer') => new Promise<void>((done, reject) => {
      const id = nextId++;
      const current = child!;
      const finish = (error?: Error) => { clearTimeout(timer); current.off('message', listener); if (error) reject(error); else done(); };
      const timer = setTimeout(() => finish(new Error('observe timeout')), 5_000);
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
    const rollbackControl = (action: string, verified: boolean) =>
      new Promise<void>((done, reject) => {
        const current = child!, id = nextId++;
        const finish = (error?: Error) => { clearTimeout(timer); current.off('message', listener); if (error) reject(error); else done(); };
        const timer = setTimeout(() => finish(new Error('control deadline')), 5_000);
        const listener = (raw: unknown) => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
          const ack = raw as { kind: string; id: number; action: string; verified: boolean };
          if (ack.kind !== 'controlled' || ack.id !== id) return;
          if (Object.keys(raw).sort().join(',') !== 'action,id,kind,verified' || ack.action !== action || ack.verified !== verified)
            return finish(new Error('writer evidence'));
          finish();
        };
        current.on('message', listener);
        try { current.send({ kind: 'control', id, action }, error => { if (error) finish(new Error('control send')); }); }
        catch { finish(new Error('control send')); }
      });
    await startChild(true);
    phase = 'browser';
    browser = await settled(chromium.launch(), 10_000);
    const pageFor = async (credential: Credential, options: { access?: string | null; binding?: string | null; refresh?: boolean } = {}) => {
      custody();
      const context = await settled(browser!.newContext({ ignoreHTTPSErrors: true })); contexts.push(context);
      const cookies = [
        { name: 'st_v2_access', value: options.access === undefined ? credential.access : options.access },
        { name: 'st_v2_binding', value: options.binding === undefined ? credential.binding : options.binding },
        ...(options.refresh ? [{ name: 'st_v2_refresh', value: 'synthetic' }] : []),
      ].filter(cookie => cookie.value !== null);
      await settled(context.addCookies(cookies.map(cookie => ({ ...cookie, domain: '127.0.0.1', path: '/v2',
        secure: true, httpOnly: true, sameSite: 'Lax' }))));
      const properties = await settled(context.cookies());
      assert.equal(properties.length, cookies.length);
      assert(properties.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax' && cookie.path === '/v2' && cookie.domain === '127.0.0.1'));
      const page = await settled(context.newPage());
      await settled(page.route(`${origin}/v2/proof`, route => {
        assert.equal(route.request().method(), 'GET'); assert.equal(route.request().url(), `${origin}/v2/proof`);
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic proof</title>' });
      }));
      await settled(page.goto(`${origin}/v2/proof`));
      assert.equal(await settled(page.evaluate(async () => (globalThis as unknown as { document: { cookie: string } }).document.cookie, {})), '');
      return { page, cookieNames: cookies.map(cookie => cookie.name).sort() };
    };
    type Client = Awaited<ReturnType<typeof pageFor>>;
    const fetchCase = async (client: Client, credential: Credential, id: string, options: {
      read?: boolean; body?: string; query?: string; csrf?: string | null; headers?: Record<string, string>;
      controlledAbort?: boolean; deferObservation?: boolean; reconcile?: boolean
    } = {}) => {
      const method = options.read ? 'POST' : 'PATCH';
      const url = `${origin}/v2/subscriptions/${id}${options.read ? '/read' : ''}${options.query ?? ''}`;
      let listener!: (request: BrowserRequest) => void;
      let cancelObservation!: () => void;
      let timer: NodeJS.Timeout | undefined;
      const emitted = new Promise<BrowserRequest>((done, reject) => {
        cancelObservation = () => reject(new Error('observation cancelled'));
        timer = setTimeout(() => reject(new Error('observation')), 5_000);
        listener = request => { if (request.method() === method && request.url() === url) { clearTimeout(timer); done(request); } };
        client.page.on('request', listener);
      });
      // Attach rejection handling before the fetch; neither header values nor errors escape memory.
      const headersEvidence = emitted.then(async request => {
        const headers = await settled(request.allHeaders());
        assert.equal(headers.origin, origin);
        assert.deepEqual((headers.cookie ?? '').split(';').filter(Boolean).map(part => part.trim().split('=')[0]!).sort(), client.cookieNames);
      });
      pending.add(headersEvidence);
      void headersEvidence.then(() => pending.delete(headersEvidence), () => pending.delete(headersEvidence));
      try {
        const result = await settled(client.page.evaluate(async input => {
          const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), 5_000);
          const memory = globalThis as unknown as { proofAbort?: AbortController;
            proofView?: { view: unknown; actions: boolean } };
          if (input.controlledAbort) memory.proofAbort = controller;
          if (input.reconcile && !memory.proofView) memory.proofView = { view: 'PAUSED', actions: true };
          try {
            const response = await fetch(input.url, { method: input.method, credentials: 'include', signal: controller.signal,
              body: input.body, headers: input.headers });
            const body = await response.json() as Record<string, unknown>;
            if (input.reconcile) memory.proofView = response.status === 200
              ? { view: body.status, actions: true } : { view: null, actions: false };
            return { status: response.status, body, view: memory.proofView?.view ?? null, actions: memory.proofView?.actions ?? false,
              cache: response.headers.get('cache-control'), contentType: response.headers.get('content-type') };
          } catch (error) {
            if (!input.controlledAbort || !controller.signal.aborted || !(error instanceof Error) || error.name !== 'AbortError') throw error;
            return { status: 0, body: {} as Record<string, unknown>, cache: 'no-store', contentType: null, view: null, actions: false };
          } finally { clearTimeout(deadline); delete memory.proofAbort; }
        }, { url, method, controlledAbort: options.controlledAbort, reconcile: options.reconcile, body: options.body ?? (options.read ? '{}' : '{"status":"PAUSED"}'),
          headers: { 'Content-Type': 'application/json', ...(options.csrf === null ? {} : { 'X-Session-CSRF': options.csrf ?? credential.csrf }), ...options.headers } }), 7_000);
        await settled(headersEvidence); assert.equal(result.cache, 'no-store');
        if (!options.deferObservation) await settled(observe(credential.handle === 'peer' ? 'peer' : 'owner')); return result;
      } finally { clearTimeout(timer); client.page.off('request', listener); cancelObservation(); }
    };
    const ownerClient = await pageFor(credentials[0]!), peerClient = await pageFor(credentials[1]!);
    // Literal expectations follow the accepted browser READ/PATCH contract, independently of adapter constants.
    const expectedProblems = {
      400: { type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' },
      401: { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTHENTICATION_REQUIRED' },
      403: { type: 'about:blank', title: 'Forbidden', status: 403, code: 'AUTH_CSRF_UNAVAILABLE' },
      404: { type: 'about:blank', title: 'Not Found', status: 404, code: 'SUBSCRIPTION_NOT_FOUND' },
      409: { type: 'about:blank', title: 'Conflict', status: 409, code: 'LIFECYCLE_CONFLICT' },
    };
    const problem = (result: Awaited<ReturnType<typeof fetchCase>>, status: keyof typeof expectedProblems, read = false) => {
      assert.equal(result.status, status); assert.equal(result.body.status, status);
      assert.deepEqual(Object.keys(result.body).sort(), ['code', 'status', 'title', 'type']);
      assert.equal(result.body.type, 'about:blank'); assert.equal(typeof result.body.title, 'string');
      assert.equal(typeof result.body.code, 'string'); assert.match(result.contentType ?? '', /^application\/problem\+json/);
      assert.deepEqual(result.body, status === 400 && read
        ? { type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_SUBSCRIPTION_QUERY' }
        : expectedProblems[status]);
    };
    await settled(observe('owner'));
    for (const handle of ['race', 'abort'] as const) {
      phase = handle === 'race' ? 'competing' : 'abort';
      const prior = await settled(snapshot()), id = COMPETITOR_FIXTURES[handle];
      const locked = new Promise<number>((done, reject) => {
        const current = child!, timer = setTimeout(() => finish(new Error('lock deadline')), 5_000);
        const finish = (error?: Error, pid?: number) => {
          clearTimeout(timer); current.off('message', listener); if (error) reject(error); else done(pid!);
        };
        const listener = (raw: unknown) => {
          if (!raw || typeof raw !== 'object' || (raw as { kind?: string }).kind !== 'competitor-locked') return;
          const ack = raw as { handle: string; pid: number };
          if (Object.keys(raw).sort().join(',') !== 'handle,kind,pid' || ack.handle !== handle ||
              !Number.isSafeInteger(ack.pid) || ack.pid < 1 || ack.pid > 2147483647 || ack.pid === startupPid)
            return finish(new Error('lock evidence'));
          finish(undefined, ack.pid);
        };
        current.on('message', listener);
      });
      void locked.catch(() => undefined);
      await settled(rollbackControl(`arm-${handle}`, true));
      const competitorPid = await settled(locked);
      const patch = fetchCase(ownerClient, credentials[0]!, id, { controlledAbort: handle === 'abort', deferObservation: true });
      pending.add(patch); void patch.then(() => pending.delete(patch), () => pending.delete(patch));
      const deadline = Date.now() + 5_000;
      let waiter = false;
      while (Date.now() < deadline) {
        const rows = await settled(ownerDb.$queryRaw<{ blocked: boolean }[]>`SELECT
          (${competitorPid}::integer = ANY(pg_blocking_pids(${startupPid!}::integer))) AND
          EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=${startupPid!}::integer AND wait_event_type='Lock') AS blocked`);
        if (rows.length === 1 && rows[0]?.blocked === true) { waiter = true; break; }
        await new Promise(done => setTimeout(done, 20));
      }
      assert(waiter);
      if (handle === 'abort') {
        assert.equal(await settled(ownerClient.page.evaluate(async () => {
          const controller = (globalThis as unknown as { proofAbort?: AbortController }).proofAbort;
          if (!controller || controller.signal.aborted) return false;
          controller.abort(); return true;
        }, {})), true);
        assert.equal((await settled(patch)).status, 0); // In-page AbortError is observed while the row lock is held.
      }
      await settled(rollbackControl('competitor-release', true));
      await settled(rollbackControl('writer-settled', true));
      if (handle === 'race') problem(await settled(patch), 409);
      await settled(observe('owner'));
      const committed = await settled(snapshot()), expected = handle === 'race' ? 'CANCELLED' : 'PAUSED';
      assert.equal(committed.subscriptions.find(row => row.id === id)?.status, expected);
      assert.deepEqual({ ...committed, subscriptions: committed.subscriptions.map(row => row.id === id
        ? prior.subscriptions.find(original => original.id === id)! : row) }, prior);
      const read = await fetchCase(ownerClient, credentials[0]!, id, { read: true });
      assert.equal(read.status, 200); assert.equal(read.body.status, expected);
    }
    phase = 'reconciliation';
    const missingAccess = await pageFor(credentials[0]!, { access: null });
    const deniedRead = await fetchCase(missingAccess, credentials[0]!, COMPETITOR_FIXTURES.abort, { read: true, reconcile: true });
    problem(deniedRead, 401, true);
    assert.equal(deniedRead.view, null); assert.equal(deniedRead.actions, false);
    const restored = await fetchCase(ownerClient, credentials[0]!, COMPETITOR_FIXTURES.abort, { read: true, reconcile: true });
    assert.equal(restored.status, 200); assert.equal(restored.body.status, 'PAUSED');
    assert.equal(restored.view, 'PAUSED'); assert.equal(restored.actions, true);
    await settled(rollbackControl('competitor-close', true)); await waitForConnections(baseline + 1);
    phase = 'writer_rollback';
    const beforeRollback = await settled(snapshot());
    await settled(rollbackControl('arm-writer-rollback', false));
    const rollbackResponse = await fetchCase(ownerClient, credentials[0]!, ROLLBACK_FIXTURE);
    assert.equal(rollbackResponse.status, 500);
    assert.deepEqual(rollbackResponse.body, { type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' });
    assert.match(rollbackResponse.contentType ?? '', /^application\/problem\+json/);
    await settled(rollbackControl('writer-rollback-observe', true));
    assert.deepEqual(await settled(snapshot()), beforeRollback);
    const rolledBackRead = await fetchCase(ownerClient, credentials[0]!, ROLLBACK_FIXTURE, { read: true });
    assert.equal(rolledBackRead.status, 200); assert.equal(rolledBackRead.body.status, 'ACTIVE');
    const afterRollback = await fetchCase(ownerClient, credentials[0]!, ROLLBACK_FIXTURE);
    assert.equal(afterRollback.status, 200); assert.deepEqual(afterRollback.body, { id: ROLLBACK_FIXTURE, status: 'PAUSED' });
    const committedRollback = await settled(snapshot());
    const changed = committedRollback.subscriptions.find(row => row.id === ROLLBACK_FIXTURE)!;
    assert.equal(changed.status, 'PAUSED'); assert.notDeepEqual(changed.updated_at,
      beforeRollback.subscriptions.find(row => row.id === ROLLBACK_FIXTURE)!.updated_at);
    assert.deepEqual({ ...committedRollback, subscriptions: committedRollback.subscriptions.map(row => row.id === ROLLBACK_FIXTURE
      ? beforeRollback.subscriptions.find(original => original.id === ROLLBACK_FIXTURE)! : row) }, beforeRollback);
    problem(await fetchCase(peerClient, credentials[1]!, ROLLBACK_FIXTURE), 404);
    assert.deepEqual(await settled(snapshot()), committedRollback);
    phase = 'matrix';
    let successes = 0, denials = 0;
    for (const fixture of fixtures) {
      const prior = await settled(snapshot());
      const result = await fetchCase(ownerClient, credentials[0]!, fixture.id, { body: JSON.stringify({ status: fixture.target }) });
      if (allowed.has(`${fixture.current}:${fixture.target}`)) {
        successes++; assert.equal(result.status, 200); assert.deepEqual(result.body, { id: fixture.id, status: fixture.target });
        const read = await fetchCase(ownerClient, credentials[0]!, fixture.id, { read: true });
        assert.equal(read.status, 200); assert.equal(read.body.id, fixture.id); assert.equal(read.body.status, fixture.target);
        const committed = await settled(snapshot()); assert.equal(committed.subscriptions.find(row => row.id === fixture.id)?.status, fixture.target);
        const normalized = committed.subscriptions.map(row => row.id === fixture.id
          ? prior.subscriptions.find(original => original.id === fixture.id)! : row);
        assert.deepEqual({ ...committed, subscriptions: normalized }, prior);
      } else {
        denials++; problem(result, 409); assert.equal(result.body.code, 'LIFECYCLE_CONFLICT');
        assert.deepEqual(await settled(snapshot()), prior);
      }
    }
    assert.equal(successes, 7); assert.equal(denials, 21);
    phase = 'visibility';
    const unchanged = await settled(snapshot());
    for (const id of [shared, openBook]) {
      const read = await fetchCase(peerClient, credentials[1]!, id, { read: true });
      assert.equal(read.status, 200); assert.equal(read.body.visibility, 'household');
    }
    let absentBody: Record<string, unknown> | undefined;
    for (const id of [shared, openBook, smoke, unrelated, missing]) {
      // unrelated is owned by peer; use owner for that identifier, otherwise peer.
      const credential = id === unrelated ? credentials[0]! : credentials[1]!;
      const result = await fetchCase(id === unrelated ? ownerClient : peerClient, credential, id);
      problem(result, 404); if (absentBody) assert.deepEqual(result.body, absentBody); else absentBody = result.body;
      assert.deepEqual(await settled(snapshot()), unchanged);
    }
    phase = 'authority';
    for (const options of [{ access: null }, { access: 'invalid' }, { binding: null }, { binding: 'invalid' },
      { binding: 'A'.repeat(43) }, { binding: credentials[1]!.binding }]) {
      const client = await pageFor(credentials[0]!, options);
      for (const read of [false, true])
        problem(await fetchCase(client, credentials[0]!, smoke, { read }), read && options.binding === 'invalid' ? 400 : 401, read);
      assert.deepEqual(await settled(snapshot()), unchanged);
    }
    for (const csrf of [null, 'A'.repeat(43), credentials[1]!.csrf])
      for (const read of [false, true]) {
        problem(await fetchCase(ownerClient, credentials[0]!, smoke, { read, csrf }), 403);
        assert.deepEqual(await settled(snapshot()), unchanged);
      }
    phase = 'malformed';
    const malformed = [
      { id: 'not-a-uuid' }, { body: '{' }, { body: '{"status":"PAUSED","extra":true}' },
      { body: '{"status":"PAUSED","status":"PAUSED"}' }, { body: '{"status":"TRIAL"}' },
      { query: `?identityId=${peer}` }, { headers: { Authorization: 'Bearer synthetic' } },
      { headers: { 'Idempotency-Key': 'synthetic' } },
      ...['X-Identity-Id', 'X-Owner-Id', 'X-User-Id', 'X-Household-Id', 'X-Session-Id', 'X-Scope', 'X-Transport']
        .map(name => ({ headers: { [name]: peer } })),
      { body: '{"status":"PAUSED"}'.padEnd(257, ' ') },
    ];
    for (const options of malformed) {
      problem(await fetchCase(ownerClient, credentials[0]!, 'id' in options ? options.id : smoke, options), 400);
      assert.deepEqual(await settled(snapshot()), unchanged);
    }
    for (const body of ['{}'.padEnd(65, ' '), '{"extra":true}']) {
      problem(await fetchCase(ownerClient, credentials[0]!, smoke, { read: true, body }), 400, true);
      assert.deepEqual(await settled(snapshot()), unchanged);
    }
    // Exact byte boundaries admit a legal PATCH and a READ, rather than merely rejecting malformed oversized bodies.
    const boundary = await fetchCase(ownerClient, credentials[0]!, smoke, { body: '{"status":"PAUSED"}'.padEnd(256, ' ') });
    assert.equal(boundary.status, 200); assert.deepEqual(boundary.body, { id: smoke, status: 'PAUSED' });
    const boundaryRead = await fetchCase(ownerClient, credentials[0]!, smoke, { read: true, body: '{}'.padEnd(64, ' ') });
    assert.equal(boundaryRead.status, 200); assert.equal(boundaryRead.body.status, 'PAUSED');
    const finalState = await settled(snapshot());
    assert.deepEqual({ ...finalState, subscriptions: finalState.subscriptions.map(row => row.id === smoke
      ? unchanged.subscriptions.find(original => original.id === smoke)! : row) }, unchanged);
    const refreshClient = await pageFor(credentials[0]!, { refresh: true });
    for (const read of [false, true]) problem(await fetchCase(refreshClient, credentials[0]!, smoke, { read }), 400, read);
    assert.deepEqual(await settled(snapshot()), finalState);
    phase = 'authority';
    let authorityDenials = 0;
    for (const handle of AUTHORITY_CASES) {
      const credential = credentials.find(item => item.handle === handle)!;
      const client = await pageFor(credential), before = await settled(snapshot());
      await settled(observe('owner'));
      await settled(rollbackControl(`arm-${handle}`, true));
      const current = child!;
      let listener!: (raw: unknown) => void, arrivalTimer: NodeJS.Timeout | undefined;
      const arrival = new Promise<void>((done, reject) => {
        arrivalTimer = setTimeout(() => reject(new Error('arrival deadline')), 5_000);
        listener = raw => {
          if (!raw || typeof raw !== 'object' || (raw as { kind?: string }).kind !== 'arrived') return;
          if (Object.keys(raw).sort().join(',') !== 'handle,kind' || (raw as { handle?: string }).handle !== handle)
            return reject(new Error('arrival evidence'));
          clearTimeout(arrivalTimer); done();
        }; current.on('message', listener);
      });
      // Start the natural request before awaiting arrival; release uses a separate IPC command.
      const response = fetchCase(client, credential, smoke, { read: handle.startsWith('read-') });
      const trackedResponse = settled(response, 7_000); void trackedResponse.catch(() => undefined);
      try {
        await settled(arrival);
        await settled(rollbackControl(`release-${handle}`, true));
        problem(await trackedResponse, 401, handle.startsWith('read-'));
        await settled(rollbackControl(`observe-${handle}`, true));
        assert.deepEqual(await settled(snapshot()), before); authorityDenials++;
      } finally { clearTimeout(arrivalTimer); current.off('message', listener); }
    }
    assert.equal(authorityDenials, 8);
    for (const context of contexts) await settled(context.close(), 10_000);
    contexts.length = 0; await settled(browser.close(), 10_000); browser = undefined;
    assert.equal(pending.size, 0);
    phase = 'sigterm_cleanup'; await stopChild('SIGTERM');
    phase = 'fixture_reset';
    assert.equal(pending.size, 0); const beforeReset = await settled(snapshot());
    assert.equal(beforeReset.subscriptions.find(row => row.id === ROLLBACK_FIXTURE)?.status, 'PAUSED');
    assert.equal(await settled(ownerDb.$executeRaw`UPDATE subscription SET status='ACTIVE'::subscription_status,
      updated_at=${new Date(ROLLBACK_BASELINE)} WHERE id=${ROLLBACK_FIXTURE}::uuid AND identity_id=${owner}::uuid
      AND status='PAUSED'::subscription_status AND always_private=true`), 1);
    const reset = await settled(snapshot()), resetRow = reset.subscriptions.find(row => row.id === ROLLBACK_FIXTURE)!;
    assert.equal(resetRow.status, 'ACTIVE'); assert.deepEqual(resetRow.updated_at, new Date(ROLLBACK_BASELINE));
    assert.deepEqual({ ...reset, subscriptions: reset.subscriptions.map(row => row.id === ROLLBACK_FIXTURE
      ? beforeReset.subscriptions.find(original => original.id === ROLLBACK_FIXTURE)! : row) }, beforeReset);
    assert.equal(pending.size, 0);
    phase = 'sigint_cleanup'; nextId = 1; startupPid = undefined;
    await startChild(); phase = 'sigint_cleanup'; await observe('peer'); await stopChild('SIGINT');
  } catch { failure = phase; }
  finally {
    credentials.length = 0;
    for (const context of contexts) { try { await settled(context.close(), 10_000); } catch { cleanup = 'owner_disconnect'; } }
    try { if (browser) await settled(browser.close(), 10_000); } catch { cleanup = 'owner_disconnect'; }
    if (child) {
      child.kill('SIGTERM');
      try { if (await childExit(child, 15_000) !== 0) cleanup = 'child_exit'; }
      catch { child.kill('SIGKILL'); try { await childExit(child, 5_000); } catch { /* retain failure */ } cleanup = 'child_timeout'; }
    }
    const childStopped = !child || child.exitCode !== null || child.signalCode !== null;
    if (pending.size !== 0 || !childStopped) cleanup = 'owner_disconnect';
    try { if (pending.size === 0 && childStopped) await settled(ownerDb?.$disconnect() ?? Promise.resolve(), 10_000); } catch { cleanup = 'owner_disconnect'; }
  }
  if (failure || cleanup !== 'none') throw new Error(failureReceipt(failure ?? 'parent_cleanup', cleanup));
  process.stdout.write('ST227C1 authority proof: PASS cases=8 dispatch=zero current-owner=post-await\n');
  process.stdout.write('ST227C2 race proof: PASS waiter=actual cancel=CANCELLED pause=409 abort=before-release writer=settled eventual=PAUSED reconciliation=cleared-restored\n');
}, 180_000);
