import { HttpException, type INestApplication, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { BrowserSubscriptionReadHttpController, BrowserSubscriptionReadHttpService } from './browser-subscription-read.http';
import { assertBrowserSubscriptionReadStorage, createBrowserSubscriptionReadApp,
  type BrowserSubscriptionReadCompositionOptions } from './browser-subscription-read.composition';

const role = { database: 'browser_subscription_read_proof', role: 'st221_runtime', login: true,
  superuser: false, bypass: false, member: true, memberships: 1n };
const names = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const tables = names.map(name => ({ name, owner: 'fixture_owner', rls: true, select: true }));
const merchant = [{ name: 'merchant', owner: 'fixture_owner', select: true }];
const bad = 'Browser subscription read startup denied';
const badStorage = 'Browser subscription read storage preflight denied';
const port = 34567;

function fixture(roles: unknown = [role], relations: unknown = tables, catalogue: unknown = merchant) {
  const query = vi.fn().mockResolvedValueOnce(roles).mockResolvedValueOnce(relations).mockResolvedValueOnce(catalogue);
  const transaction = vi.fn();
  const options: BrowserSubscriptionReadCompositionOptions = {
    prisma: { $queryRaw: query, $transaction: transaction } as unknown as PrismaClient,
    accessTokens: { verify: vi.fn() }, principal: { resolve: vi.fn() },
    repository: { readSession: vi.fn(), webContextForCurrentSession: vi.fn() },
    csrf: { verify: vi.fn() }, clock: () => 1_000,
    bindingCookieName: 'st_v2_binding', developmentEnabled: true, host: '127.0.0.1', port,
    exactOrigin: `https://127.0.0.1:${port}`,
    tls: { key: Buffer.from('ephemeral-test-key'), cert: Buffer.from('ephemeral-test-cert') },
    expectedDatabase: 'browser_subscription_read_proof', expectedRole: 'st221_runtime',
  };
  return { options, query, transaction };
}

function fakeApp() {
  const app = { useBodyParser: vi.fn(), use: vi.fn(), useGlobalFilters: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined), listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined) };
  return app;
}

function syntheticTls() {
  const executable = process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl';
  const pem = execFileSync(executable, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', '-', '-out', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const key = pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  if (!key || !cert) throw new Error('Synthetic TLS fixture unavailable');
  return { key: Buffer.from(key[0]), cert: Buffer.from(cert[0]) };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Ephemeral port unavailable');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function httpsPost(portNumber: number, headers: Record<string, string>, body: string): Promise<{
  status: number | undefined; headers: Record<string, string | string[] | undefined>; body: unknown;
}> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: '127.0.0.1', port: portNumber, method: 'POST',
      path: '/v2/subscriptions/33333333-3333-4333-8333-333333333333/read',
      rejectUnauthorized: false, agent: false, headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try { resolve({ status: response.statusCode, headers: response.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

describe('private browser subscription read composition', () => {
  it('checks the same ordinary pool including merchant SELECT before Nest creation', async () => {
    const { options, query } = fixture();
    await expect(assertBrowserSubscriptionReadStorage(options)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[2]?.[0])).toContain("c.relname='merchant'");
  });

  it.each([
    ['database', [{ ...role, database: 'persistent' }], tables, merchant],
    ['owner role', [{ ...role, role: 'fixture_owner' }], tables, merchant],
    ['nonlogin', [{ ...role, login: false }], tables, merchant],
    ['superuser', [{ ...role, superuser: true }], tables, merchant],
    ['bypass', [{ ...role, bypass: true }], tables, merchant],
    ['wrong group', [{ ...role, member: false }], tables, merchant],
    ['extra membership', [{ ...role, memberships: 2n }], tables, merchant],
    ['missing RLS table', [role], tables.slice(1), merchant],
    ['RLS disabled', [role], tables.map((t, i) => i ? t : { ...t, rls: false }), merchant],
    ['RLS owner', [role], tables.map((t, i) => i ? t : { ...t, owner: 'other' }), merchant],
    ['RLS SELECT', [role], tables.map((t, i) => i ? t : { ...t, select: false }), merchant],
    ['merchant absent', [role], tables, []],
    ['merchant owner', [role], tables, [{ ...merchant[0], owner: 'other' }]],
    ['merchant SELECT', [role], tables, [{ ...merchant[0], select: false }]],
  ])('denies %s before creating Nest', async (_case, roles, relations, catalogue) => {
    const create = vi.spyOn(NestFactory, 'create');
    try {
      await expect(createBrowserSubscriptionReadApp(fixture(roles, relations, catalogue).options))
        .rejects.toThrow(badStorage);
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });

  it.each([
    ['disabled', { developmentEnabled: false }], ['public host', { host: '0.0.0.0' }],
    ['zero port', { port: 0 }], ['floating port', { port: 2.5 }],
    ['wrong Origin', { exactOrigin: 'https://localhost:34567' }],
    ['plain Origin', { exactOrigin: 'http://127.0.0.1:34567' }],
    ['missing TLS', { tls: undefined }],
    ['wrong database expectation', { expectedDatabase: 'persistent' }],
    ['wrong role expectation', { expectedRole: 'fixture_owner' }],
  ])('denies %s before storage or Nest', async (_case, override) => {
    const { options, query } = fixture();
    const create = vi.spyOn(NestFactory, 'create');
    try {
      await expect(createBrowserSubscriptionReadApp({ ...options, ...override } as BrowserSubscriptionReadCompositionOptions))
        .rejects.toThrow(bad);
      expect(query).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });

  it('denies production and masks a storage driver error', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try { await expect(assertBrowserSubscriptionReadStorage(fixture().options)).rejects.toThrow(bad); }
    finally { if (previous === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = previous; }
    const { options, query } = fixture();
    query.mockReset().mockRejectedValue(new Error('secret URL'));
    await expect(assertBrowserSubscriptionReadStorage(options)).rejects.toThrow(/^Browser subscription read storage preflight denied$/);
  });

  it('masks hostile option getters before touching storage or Nest', async () => {
    const { options, query } = fixture();
    const create = vi.spyOn(NestFactory, 'create');
    try {
      Object.defineProperty(options, 'tls', { get() { throw new Error('private key leaked'); } });
      await expect(createBrowserSubscriptionReadApp(options)).rejects.toThrow(/^Browser subscription read startup denied$/);
      await expect(assertBrowserSubscriptionReadStorage(options)).rejects.toThrow(/^Browser subscription read startup denied$/);
      expect(query).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });

  it('uses the original pool, ports, Origin and TLS after caller options change during preflight', async () => {
    const { options, query } = fixture();
    const originalPool = options.prisma;
    const originalAccess = options.accessTokens;
    const originalKey = Buffer.from(options.tls.key);
    let resume!: (value: unknown) => void;
    query.mockReset().mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }))
      .mockResolvedValueOnce(tables).mockResolvedValueOnce(merchant);
    const app = fakeApp();
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const pending = createBrowserSubscriptionReadApp(options);
      await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
      const mutable = options as unknown as Record<string, unknown>;
      mutable['prisma'] = fixture().options.prisma;
      mutable['accessTokens'] = { verify: vi.fn() };
      mutable['port'] = 1;
      mutable['exactOrigin'] = 'https://attacker.example';
      options.tls.key.fill(0);
      resume([role]);
      const composition = await pending;
      expect(query).toHaveBeenCalledTimes(3);
      expect(mutable['prisma']).not.toBe(originalPool);
      const module = create.mock.calls[0]![0] as DynamicModule;
      const service = (module.providers![0] as { useValue: BrowserSubscriptionReadHttpService }).useValue;
      expect(service).toBeInstanceOf(BrowserSubscriptionReadHttpService);
      expect((create.mock.calls[0]![1] as unknown as { httpsOptions: { key: Buffer } }).httpsOptions.key).toEqual(originalKey);
      expect(originalAccess.verify).toBeDefined();
      await composition.listen();
      expect(app.listen).toHaveBeenCalledWith(port, '127.0.0.1');
      await composition.close();
    } finally { create.mockRestore(); }
  });

  it('maps real HTTPS parser and content-type failures to fixed no-store problems', async () => {
    const { options } = fixture();
    const actualPort = await freePort();
    const mutable = options as unknown as { port: number; exactOrigin: string; tls: { key: Buffer; cert: Buffer } };
    mutable.port = actualPort;
    mutable.exactOrigin = `https://127.0.0.1:${actualPort}`;
    mutable.tls = syntheticTls();
    const composition = await createBrowserSubscriptionReadApp(options);
    try {
      await composition.listen();
      const cases = [
        { headers: { 'Content-Type': 'application/json' }, body: '{' },
        { headers: { 'Content-Type': 'application/json' }, body: '{'.repeat(65) },
        { headers: { 'Content-Type': 'text/plain' }, body: '{}' },
        { headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}' },
      ];
      for (const testCase of cases) {
        const result = await httpsPost(actualPort, { ...testCase.headers, 'Content-Length': String(Buffer.byteLength(testCase.body)) }, testCase.body);
        expect(result.status).toBe(400);
        expect(result.headers['cache-control']).toBe('no-store');
        expect(result.headers['content-type']).toMatch(/^application\/problem\+json/);
        expect(result.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400,
          code: 'INVALID_SUBSCRIPTION_QUERY' });
      }
    } finally { await composition.close(); }
  });

  it('constructs only the v2 read graph using the preflight pool and direct HTTPS options', async () => {
    const { options, transaction } = fixture();
    const app = fakeApp();
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionReadApp(options);
      const [module, nestOptions] = create.mock.calls[0]!;
      expect((module as DynamicModule).controllers).toEqual([BrowserSubscriptionReadHttpController]);
      const providers = (module as DynamicModule).providers!;
      expect(providers).toHaveLength(1);
      const provider = providers[0] as { provide: unknown; useValue: BrowserSubscriptionReadHttpService };
      expect(provider.provide).toBe(BrowserSubscriptionReadHttpService);
      expect(provider.useValue).toBeInstanceOf(BrowserSubscriptionReadHttpService);
      expect(nestOptions).toMatchObject({ logger: false, rawBody: true, bodyParser: false,
        httpsOptions: { key: options.tls.key, cert: options.tls.cert } });
      expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: 64, inflate: false });
      expect(app.useGlobalFilters).toHaveBeenCalledOnce();
      const id = '33333333-3333-4333-8333-333333333333';
      const userId = '11111111-1111-4111-8111-111111111111';
      const detail = (provider.useValue as unknown as { detail: (context: unknown, id: string) => Promise<unknown> }).detail;
      const executeRaw = vi.fn().mockResolvedValue(1);
      const scopedQuery = vi.fn().mockResolvedValue([]);
      transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        $executeRaw: executeRaw, $queryRaw: scopedQuery,
      }));
      await expect(detail({ userId }, id)).rejects.toThrow();
      expect(transaction).toHaveBeenCalledOnce();
      expect(executeRaw.mock.calls).toHaveLength(2);
      expect(String(executeRaw.mock.calls[0]?.[0])).toContain("set_config('app.user_id'");
      expect(String(executeRaw.mock.calls[1]?.[0])).toContain("set_config('app.current_user_id'");
      expect(executeRaw.mock.calls[0]?.[1]).toBe(userId);
      expect(executeRaw.mock.calls[1]?.[1]).toBe(userId);
      expect(scopedQuery).toHaveBeenCalledOnce();
      await composition.listen();
      expect(app.listen).toHaveBeenCalledWith(port, '127.0.0.1');
      await composition.close();
      await composition.close();
      expect(app.close).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); }
  });

  it('maps parser errors before controller and masks other framework errors', async () => {
    const app = fakeApp();
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionReadApp(fixture().options);
      const boundary = app.use.mock.calls[0]![0] as (error: unknown, request: unknown, response: unknown, next: unknown) => void;
      const response = () => {
        const res = { headersSent: false, headers: {} as Record<string, string>, body: undefined as unknown,
          setHeader(key: string, value: string) { this.headers[key] = value; return this; },
          status(value: number) { this.headers.status = String(value); return this; },
          type(value: string) { this.headers.type = value; return this; },
          json(value: unknown) { this.body = value; return this; } };
        return res;
      };
      for (const [type, status] of [['entity.parse.failed', 400], ['entity.too.large', 413],
        ['charset.unsupported', 415], ['encoding.unsupported', 415]] as const) {
        const res = response();
        boundary({ type, status }, {}, res, vi.fn());
        expect(res.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400,
          code: 'INVALID_SUBSCRIPTION_QUERY' });
        expect(res.headers['Cache-Control']).toBe('no-store');
      }
      const res = response();
      boundary(new Error('secret URL'), {}, res, vi.fn());
      expect(res.body).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' });
      const hostile = response();
      const getter = { status: 400 };
      Object.defineProperty(getter, 'type', { get() { throw new Error('secret URL'); } });
      boundary(getter, {}, hostile, vi.fn());
      expect(hostile.body).toEqual(res.body);
      const filter = app.useGlobalFilters.mock.calls[0]![0] as { catch(error: unknown, host: unknown): void };
      const fromFilter = response();
      filter.catch(new HttpException('private error', 400), { switchToHttp: () => ({ getResponse: () => fromFilter }) });
      expect(fromFilter.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400,
        code: 'INVALID_SUBSCRIPTION_QUERY' });
      const throwing = new HttpException('private error', 400);
      throwing.getStatus = () => { throw new Error('secret URL'); };
      const masked = response();
      filter.catch(throwing, { switchToHttp: () => ({ getResponse: () => masked }) });
      expect(masked.body).toEqual(res.body);
      await composition.close();
    } finally { create.mockRestore(); }
  });

  it('closes late created, initialized, and listening apps after deadline', async () => {
    vi.useFakeTimers();
    let finishCreate!: (app: INestApplication) => void;
    const late = fakeApp();
    const create = vi.spyOn(NestFactory, 'create').mockReturnValue(new Promise(resolve => { finishCreate = resolve; }));
    try {
      const pending = createBrowserSubscriptionReadApp(fixture().options);
      const rejected = expect(pending).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE);
      await rejected;
      finishCreate(late as unknown as INestApplication);
      await vi.advanceTimersByTimeAsync(0);
      expect(late.close).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('settles a late Nest creation rejection after the startup deadline', async () => {
    vi.useFakeTimers();
    let failCreate!: (error: Error) => void;
    const create = vi.spyOn(NestFactory, 'create').mockReturnValue(new Promise((_, reject) => { failCreate = reject; }));
    try {
      const pending = createBrowserSubscriptionReadApp(fixture().options);
      const rejected = expect(pending).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE);
      await rejected;
      failCreate(new Error('private connection URL'));
      await vi.advanceTimersByTimeAsync(0);
      expect(create).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('masks late-created app shutdown failure after the startup deadline', async () => {
    vi.useFakeTimers();
    let finishCreate!: (app: INestApplication) => void;
    const late = fakeApp();
    late.close.mockRejectedValue(new Error('private connection URL'));
    const create = vi.spyOn(NestFactory, 'create').mockReturnValue(new Promise(resolve => { finishCreate = resolve; }));
    try {
      const pending = createBrowserSubscriptionReadApp(fixture().options);
      const rejected = expect(pending).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE);
      await rejected;
      finishCreate(late as unknown as INestApplication);
      await vi.advanceTimersByTimeAsync(0);
      expect(late.close).toHaveBeenCalledOnce();
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('masks synchronous Nest creation failures without opening a listener', async () => {
    const create = vi.spyOn(NestFactory, 'create').mockImplementation(() => { throw new Error('secret URL'); });
    try { await expect(createBrowserSubscriptionReadApp(fixture().options)).rejects.toThrow(/^Browser subscription read startup denied$/); }
    finally { create.mockRestore(); }
  });

  it('closes the app after initialization rejects or throws synchronously', async () => {
    for (const sync of [true, false]) {
      const app = fakeApp();
      if (sync) app.init.mockImplementation(() => { throw new Error('secret URL'); });
      else app.init.mockRejectedValue(new Error('secret URL'));
      const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
      try {
        await expect(createBrowserSubscriptionReadApp(fixture().options)).rejects.toThrow(/^Browser subscription read startup denied$/);
        expect(app.close).toHaveBeenCalledOnce();
        expect(app.listen).not.toHaveBeenCalled();
      } finally { create.mockRestore(); }
    }
  });

  it('closes the app after listen rejects and makes close idempotent after shutdown failure', async () => {
    const app = fakeApp();
    app.listen.mockRejectedValue(new Error('secret URL'));
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionReadApp(fixture().options);
      await expect(composition.listen()).rejects.toThrow(/^Browser subscription read startup denied$/);
      expect(app.close).toHaveBeenCalledOnce();
      await expect(composition.listen()).rejects.toThrow(bad);
    } finally { create.mockRestore(); }

    const failed = fakeApp();
    failed.close.mockRejectedValue(new Error('secret URL'));
    const again = vi.spyOn(NestFactory, 'create').mockResolvedValue(failed as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionReadApp(fixture().options);
      await expect(composition.close()).rejects.toThrow(/^Browser subscription read startup denied$/);
      await expect(composition.close()).rejects.toThrow(/^Browser subscription read startup denied$/);
      expect(failed.close).toHaveBeenCalledOnce();
    } finally { again.mockRestore(); }
  });

  it('closes again after a timed-out init completes', async () => {
    vi.useFakeTimers();
    let finish!: (app: INestApplication) => void;
    const app = fakeApp();
    app.init.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const pending = createBrowserSubscriptionReadApp(fixture().options);
      const rejected = expect(pending).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE);
      await rejected;
      expect(app.close).toHaveBeenCalledOnce();
      finish(app as unknown as INestApplication);
      await vi.advanceTimersByTimeAsync(0);
      expect(app.close).toHaveBeenCalledTimes(2);
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('closes again when a timed-out listen binds late', async () => {
    vi.useFakeTimers();
    let finish!: (app: INestApplication) => void;
    const app = fakeApp();
    app.listen.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionReadApp(fixture().options);
      const pending = composition.listen();
      const rejected = expect(pending).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE);
      await rejected;
      expect(app.close).toHaveBeenCalledOnce();
      finish(app as unknown as INestApplication);
      await vi.advanceTimersByTimeAsync(0);
      expect(app.close).toHaveBeenCalledTimes(2);
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('releases an actual loopback listener that binds after the listen deadline', async () => {
    vi.useFakeTimers();
    const boundPort = await freePort();
    const { options } = fixture();
    const mutable = options as unknown as { port: number; exactOrigin: string };
    mutable.port = boundPort;
    mutable.exactOrigin = `https://127.0.0.1:${boundPort}`;
    const server = createServer();
    let finishListen!: (value: unknown) => void;
    const app = fakeApp();
    app.listen.mockImplementation(() => new Promise(resolve => { finishListen = resolve; }));
    app.close.mockImplementation(async () => {
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionReadApp(options);
      const pending = composition.listen();
      const rejected = expect(pending).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE);
      await rejected;
      await new Promise<void>(resolve => server.listen(boundPort, '127.0.0.1', resolve));
      expect(server.listening).toBe(true);
      finishListen(app);
      await vi.advanceTimersByTimeAsync(0);
      expect(server.listening).toBe(false);
      expect(app.close).toHaveBeenCalledTimes(2);
      const probe = createServer();
      try { await new Promise<void>(resolve => probe.listen(boundPort, '127.0.0.1', resolve));
        expect(probe.listening).toBe(true); }
      finally { await new Promise<void>(resolve => probe.close(() => resolve())); }
    } finally {
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      create.mockRestore();
      vi.useRealTimers();
    }
  });
});

const STARTUP_DEADLINE = 20_000;
