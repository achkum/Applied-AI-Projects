import { HttpException, type INestApplication, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { BrowserSubscriptionLifecycleHttpController, BrowserSubscriptionLifecycleHttpService } from './browser-subscription-lifecycle.http';
import { hashBrowserBindingCookie } from '../auth/sessions-v2/v2-web-session-binding';
import { BrowserSubscriptionReadHttpController, BrowserSubscriptionReadHttpService } from './browser-subscription-read.http';
import { assertBrowserSubscriptionLifecycleStorage, createBrowserSubscriptionLifecycleApp,
  type BrowserSubscriptionLifecycleCompositionOptions } from './browser-subscription-lifecycle.composition';

const role = { database: 'browser_subscription_lifecycle_proof', role: 'st_browser_lifecycle_runtime', login: true,
  superuser: false, bypass: false, member: true, memberships: 1n };
const names = ['consent', 'household', 'household_member', 'identity', 'session', 'subscription', 'subscription_share'];
const tables = names.map(name => ({ name, owner: 'fixture_owner', rls: true, select: true, update: true }));
const merchant = [{ name: 'merchant', owner: 'fixture_owner', select: true }];
const bad = 'Browser subscription lifecycle startup denied';
const badStorage = 'Browser subscription lifecycle storage preflight denied';
const port = 34567;

function fixture(roles: unknown = [role], relations: unknown = tables, catalogue: unknown = merchant) {
  const query = vi.fn().mockResolvedValueOnce(roles).mockResolvedValueOnce(relations).mockResolvedValueOnce(catalogue);
  const transaction = vi.fn();
  const options: BrowserSubscriptionLifecycleCompositionOptions = {
    prisma: { $queryRaw: query, $transaction: transaction } as unknown as PrismaClient,
    accessTokens: { verify: vi.fn() }, principal: { resolve: vi.fn() },
    repository: { readSession: vi.fn(), webContextForCurrentSession: vi.fn() },
    csrf: { verify: vi.fn() }, clock: () => 1_000,
    bindingCookieName: 'st_v2_binding', developmentEnabled: true, host: '127.0.0.1', port,
    exactOrigin: `https://127.0.0.1:${port}`,
    tls: { key: Buffer.from('ephemeral-test-key'), cert: Buffer.from('ephemeral-test-cert') },
    expectedDatabase: 'browser_subscription_lifecycle_proof', expectedRole: 'st_browser_lifecycle_runtime',
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

async function httpsPost(portNumber: number, headers: Record<string, string>, body: string, method = 'POST', path?: string): Promise<{
  status: number | undefined; headers: Record<string, string | string[] | undefined>; body: unknown;
}> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: '127.0.0.1', port: portNumber, method,
      path: path ?? `/v2/subscriptions/33333333-3333-4333-8333-333333333333${method === 'POST' ? '/read' : ''}`,
      rejectUnauthorized: false, agent: false, headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try { resolve({ status: response.statusCode, headers: response.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }); }
        catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('HTTPS test request timed out')), 5_000);
    request.once('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end(body);
  });
}

describe('private browser subscription read composition', () => {
  it('accepts the real Prisma proxy and reaches preflight without connecting or creating Nest', async () => {
    const prisma = new PrismaClient({ datasourceUrl: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic', log: [] });
    const request = vi.spyOn(prisma as unknown as { _request: () => Promise<never> }, '_request')
      .mockRejectedValue(new Error('Synthetic query refusal'));
    const connect = vi.spyOn(prisma, '$connect');
    const disconnect = vi.spyOn(prisma, '$disconnect');
    const create = vi.spyOn(NestFactory, 'create');
    try {
      for (const method of ['$queryRaw', '$transaction'] as const) {
        expect(typeof prisma[method]).toBe('function');
        expect(typeof Object.getOwnPropertyDescriptor(prisma, method)?.value).not.toBe('function');
      }
      await expect(createBrowserSubscriptionLifecycleApp({ ...fixture().options, prisma })).rejects.toThrow(badStorage);
      expect(request).toHaveBeenCalledOnce();
      expect(connect).not.toHaveBeenCalled(); expect(disconnect).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally { request.mockRestore(); connect.mockRestore(); disconnect.mockRestore(); create.mockRestore(); }
  });

  it('rejects noncallable Prisma methods before preflight or Nest', async () => {
    const create = vi.spyOn(NestFactory, 'create');
    try {
      for (const method of ['$queryRaw', '$transaction'] as const) {
        const { options, query } = fixture();
        Object.assign(options.prisma, { [method]: undefined });
        await expect(createBrowserSubscriptionLifecycleApp(options)).rejects.toThrow(bad);
        expect(query).not.toHaveBeenCalled();
      }
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });

  it('denies subscription UPDATE before Nest and masks query faults', async () => {
    const create = vi.spyOn(NestFactory, 'create');
    try {
      const denied = tables.map(row => ({ ...row, update: row.name !== 'subscription' }));
      await expect(createBrowserSubscriptionLifecycleApp(fixture([role], denied).options)).rejects.toThrow(badStorage);
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });

  it('rejects authority accessors without invoking them before preflight', async () => {
    for (const [field, method] of [['accessTokens', 'verify'], ['principal', 'resolve'], ['repository', 'readSession'],
      ['repository', 'webContextForCurrentSession'], ['csrf', 'verify']] as const) {
      const { options, query } = fixture();
      const getter = vi.fn(() => vi.fn());
      Object.defineProperty(options[field], method, { get: getter });
      await expect(createBrowserSubscriptionLifecycleApp(options)).rejects.toThrow(bad);
      expect(getter).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
    }
  });

  it('shares bound authority before await and executes actual scoped read and locked writer over HTTPS', async () => {
    const { options, query, transaction } = fixture();
    const actualPort = await freePort();
    Object.assign(options, { port: actualPort, exactOrigin: `https://127.0.0.1:${actualPort}`, tls: syntheticTls() });
    const origin = options.exactOrigin;
    const userId = '11111111-1111-4111-8111-111111111111';
    const sessionId = '22222222-2222-4222-8222-222222222222';
    const id = '33333333-3333-4333-8333-333333333333';
    const binding = Buffer.alloc(32, 4).toString('base64url');
    const csrf = Buffer.alloc(32, 5).toString('base64url');
    const verify = vi.fn().mockReturnValue({ iss: 'urn:subtrack:auth:v2:development', aud: 'urn:subtrack:api:v2:development',
      sub: userId, sid: sessionId, iat: 1, exp: 901, ver: 2 });
    const resolve = vi.fn().mockResolvedValue({ identityId: userId, sessionId });
    const record = { identityId: userId, sessionId, familyId: id, generation: 0, refreshTokenHash: 'a'.repeat(64),
      transport: 'web', deviceName: null, createdAt: 0, expiresAt: 86_400_000, exactOrigin: origin,
      browserChainId: 'chain', browserBindingCookieHash: hashBrowserBindingCookie(binding) };
    const readSession = vi.fn().mockReturnValue(record);
    const webContext = vi.fn().mockReturnValue({ transport: 'web', exactOrigin: origin, browserChainId: 'chain' });
    const guard = vi.fn();
    Object.assign(options.accessTokens, { verify }); Object.assign(options.principal, { resolve });
    Object.assign(options.repository, { readSession, webContextForCurrentSession: webContext });
    Object.assign(options.csrf, { verify: guard });
    let resume!: (value: unknown) => void;
    query.mockReset().mockImplementationOnce(() => new Promise(done => { resume = done; }))
      .mockResolvedValueOnce(tables).mockResolvedValueOnce(merchant);
    let status = 'ACTIVE';
    const execute = vi.fn().mockResolvedValue(1);
    const scoped = vi.fn().mockImplementation(async (sql: { strings: string[]; values: unknown[] }) => {
      const statement = sql.strings.join('');
      if (statement.includes('FOR UPDATE')) return [{ id, identityId: userId, status }];
      if (statement.includes('UPDATE subscription')) { status = sql.values[0] as string; return [{ id, status }]; }
      return [{ id, identityId: userId, merchantId: null, merchantName: null, customName: null, categoryCode: 'AI_TOOLS',
        cadence: 'MONTHLY', status, expectedAmountMinor: 123n, currency: 'SEK', nextChargeDate: null, alwaysPrivate: true }];
    });
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $executeRaw: execute, $queryRaw: scoped }));
    const pending = createBrowserSubscriptionLifecycleApp(options);
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
    const poison = vi.fn(() => { throw new Error('unexpected changed authority'); });
    Object.assign(options.accessTokens, { verify: poison }); Object.assign(options.principal, { resolve: poison });
    Object.assign(options.repository, { readSession: poison, webContextForCurrentSession: poison }); Object.assign(options.csrf, { verify: poison });
    resume([role]);
    const composition = await pending;
    const headers = { 'Content-Type': 'application/json', Origin: origin,
      Cookie: `st_v2_access=e30.e30.c2ln; st_v2_binding=${binding}`, 'X-Session-CSRF': csrf };
    const call = (body: string, method = 'POST', extra: Record<string, string> = {}) => httpsPost(actualPort,
      { ...headers, 'Content-Length': String(Buffer.byteLength(body)), ...extra }, body, method);
    try {
      expect(Object.keys(composition)).toEqual(['listen', 'close']);
      await composition.listen(); await expect(composition.listen()).rejects.toThrow(bad);
      const read = await call('{}' + ' '.repeat(62));
      expect(read.status).toBe(200); expect(read.body).toMatchObject({ id, status: 'ACTIVE', expectedAmountMinor: '123' });
      const patch = await call('{"status":"PAUSED"}' + ' '.repeat(237), 'PATCH');
      expect(patch.status).toBe(200); expect(patch.body).toEqual({ id, status: 'PAUSED' });
      expect(await call('{}')).toMatchObject({ status: 200, body: { status: 'PAUSED' } });
      expect(verify).toHaveBeenCalledTimes(3); expect(resolve).toHaveBeenCalledTimes(3);
      expect(guard).toHaveBeenCalledTimes(3); expect(readSession).toHaveBeenCalledTimes(6); expect(webContext).toHaveBeenCalledTimes(6);
      expect(poison).not.toHaveBeenCalled(); expect(transaction).toHaveBeenCalledTimes(3);
      expect(scoped.mock.calls.some(([sql]) => sql.strings.join('').includes('FOR UPDATE'))).toBe(true);
      for (const [, value] of execute.mock.calls) expect(value).toBe(userId);
      const before = transaction.mock.calls.length;
      for (const method of ['POST', 'PATCH']) {
        const valid = method === 'POST' ? '{}' : '{"status":"PAUSED"}';
        const cases: [string, Record<string, string>][] = [['{', {}], [valid + ' '.repeat(257 - valid.length), {}],
          [valid, { 'Content-Type': 'text/plain' }], [valid, { 'Content-Encoding': 'gzip' }],
          [valid, { 'Content-Type': 'application/json; charset=bogus' }]];
        if (method === 'POST') for (const length of [65, 128, 256]) cases.push(['{}' + ' '.repeat(length - 2), {}]);
        for (const [body, extra] of cases) {
          const result = await call(body, method, extra);
          expect(result).toMatchObject({ status: 400, headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
            body: { type: 'about:blank', title: 'Bad Request', status: 400,
              code: method === 'POST' ? 'INVALID_SUBSCRIPTION_QUERY' : 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' } });
          expect(Object.keys(result.body as object)).toHaveLength(4);
        }
      }
      for (const path of [`/v2/subscriptions/${id}?owner=other`, '/v2/subscriptions/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']) {
        const malformed = await httpsPost(actualPort, { 'Content-Type': 'application/json', 'Content-Length': '1' }, '{', 'PATCH', path);
        expect(malformed).toMatchObject({ status: 400, body: { code: 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' } });
      }
      const absent = await httpsPost(actualPort, { 'Content-Type': 'application/json', 'Content-Length': '2' }, '{}', 'POST', '/v2/auth/session');
      expect(absent).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } });
      expect(transaction).toHaveBeenCalledTimes(before);
      const denied = await call('{"status":"ACTIVE"}', 'PATCH', { 'X-Session-CSRF': 'bad' });
      expect(denied.status).toBe(403); expect(transaction).toHaveBeenCalledTimes(before);
    } finally { await composition.close(); }
    await expect(composition.listen()).rejects.toThrow(bad);
    const probe = createServer();
    try { await new Promise<void>(done => probe.listen(actualPort, '127.0.0.1', done)); }
    finally { await new Promise<void>(done => probe.close(() => done())); }
  }, 30_000); // Bounds startup, sequential HTTPS requests and teardown under CI load.

  it('checks the same ordinary pool including merchant SELECT before Nest creation', async () => {
    const { options, query } = fixture();
    await expect(assertBrowserSubscriptionLifecycleStorage(options)).resolves.toBeUndefined();
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
      await expect(createBrowserSubscriptionLifecycleApp(fixture(roles, relations, catalogue).options))
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
      await expect(createBrowserSubscriptionLifecycleApp({ ...options, ...override } as BrowserSubscriptionLifecycleCompositionOptions))
        .rejects.toThrow(bad);
      expect(query).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });

  it('denies production and masks a storage driver error', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try { await expect(assertBrowserSubscriptionLifecycleStorage(fixture().options)).rejects.toThrow(bad); }
    finally { if (previous === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = previous; }
    const { options, query } = fixture();
    query.mockReset().mockRejectedValue(new Error('secret URL'));
    await expect(assertBrowserSubscriptionLifecycleStorage(options)).rejects.toThrow(/^Browser subscription lifecycle storage preflight denied$/);
  });

  it('masks hostile option getters before touching storage or Nest', async () => {
    const { options, query } = fixture();
    const create = vi.spyOn(NestFactory, 'create');
    try {
      Object.defineProperty(options, 'tls', { get() { throw new Error('private key leaked'); } });
      await expect(createBrowserSubscriptionLifecycleApp(options)).rejects.toThrow(/^Browser subscription lifecycle startup denied$/);
      await expect(assertBrowserSubscriptionLifecycleStorage(options)).rejects.toThrow(/^Browser subscription lifecycle startup denied$/);
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
      const pending = createBrowserSubscriptionLifecycleApp(options);
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
    const composition = await createBrowserSubscriptionLifecycleApp(options);
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
      const composition = await createBrowserSubscriptionLifecycleApp(options);
      const [module, nestOptions] = create.mock.calls[0]!;
      expect((module as DynamicModule).controllers).toEqual([BrowserSubscriptionReadHttpController, BrowserSubscriptionLifecycleHttpController]);
      const providers = (module as DynamicModule).providers!;
      expect(providers).toHaveLength(2);
      expect((providers[1] as { useValue: unknown }).useValue).toBeInstanceOf(BrowserSubscriptionLifecycleHttpService);
      const provider = providers[0] as { provide: unknown; useValue: BrowserSubscriptionReadHttpService };
      expect(provider.provide).toBe(BrowserSubscriptionReadHttpService);
      expect(provider.useValue).toBeInstanceOf(BrowserSubscriptionReadHttpService);
      expect(nestOptions).toMatchObject({ logger: false, rawBody: true, bodyParser: false,
        httpsOptions: { key: options.tls.key, cert: options.tls.cert } });
      expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: 256, inflate: false });
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
      const composition = await createBrowserSubscriptionLifecycleApp(fixture().options);
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
      filter.catch(new HttpException('private error', 400), { switchToHttp: () => ({ getResponse: () => fromFilter, getRequest: () => ({}) }) });
      expect(fromFilter.body).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400,
        code: 'INVALID_SUBSCRIPTION_QUERY' });
      const throwing = new HttpException('private error', 400);
      throwing.getStatus = () => { throw new Error('secret URL'); };
      const masked = response();
      filter.catch(throwing, { switchToHttp: () => ({ getResponse: () => masked, getRequest: () => ({}) }) });
      expect(masked.body).toEqual(res.body);
      await composition.close();
    } finally { create.mockRestore(); }
  });

  it('bounds preflight without creating Nest or disconnecting the caller pool', async () => {
    vi.useFakeTimers();
    const { options, query } = fixture();
    const disconnect = vi.fn();
    Object.assign(options.prisma, { $disconnect: disconnect });
    query.mockReset().mockReturnValue(new Promise(() => undefined));
    const create = vi.spyOn(NestFactory, 'create');
    try {
      const rejected = expect(createBrowserSubscriptionLifecycleApp(options)).rejects.toThrow(badStorage);
      await vi.advanceTimersByTimeAsync(STARTUP_DEADLINE); await rejected;
      expect(create).not.toHaveBeenCalled(); expect(disconnect).not.toHaveBeenCalled();
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('bounds close, closes connections and preserves caller pool ownership', async () => {
    vi.useFakeTimers();
    const { options } = fixture();
    const disconnect = vi.fn();
    Object.assign(options.prisma, { $disconnect: disconnect });
    const sockets = vi.fn();
    const app = Object.assign(fakeApp(), { getHttpServer: () => ({ closeAllConnections: sockets }) });
    app.close.mockReturnValue(new Promise(() => undefined));
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionLifecycleApp(options);
      const close = composition.close(); expect(composition.close()).toBe(close);
      const rejected = expect(close).rejects.toThrow(bad);
      await vi.advanceTimersByTimeAsync(10_000); await rejected;
      expect(sockets).toHaveBeenCalledOnce(); expect(app.close).toHaveBeenCalledOnce();
      expect(disconnect).not.toHaveBeenCalled(); await expect(composition.listen()).rejects.toThrow(bad);
    } finally { create.mockRestore(); vi.useRealTimers(); }
  });

  it('cleans a listen that settles after concurrent close', async () => {
    const app = fakeApp();
    let finish!: () => void;
    app.listen.mockReturnValue(new Promise<void>(done => { finish = done; }));
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionLifecycleApp(fixture().options);
      const rejected = expect(composition.listen()).rejects.toThrow(bad);
      await composition.close(); finish(); await rejected;
      expect(app.close).toHaveBeenCalledTimes(2);
    } finally { create.mockRestore(); }
  });

  it('closes late created, initialized, and listening apps after deadline', async () => {
    vi.useFakeTimers();
    let finishCreate!: (app: INestApplication) => void;
    const late = fakeApp();
    const create = vi.spyOn(NestFactory, 'create').mockReturnValue(new Promise(resolve => { finishCreate = resolve; }));
    try {
      const pending = createBrowserSubscriptionLifecycleApp(fixture().options);
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
      const pending = createBrowserSubscriptionLifecycleApp(fixture().options);
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
      const pending = createBrowserSubscriptionLifecycleApp(fixture().options);
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
    try { await expect(createBrowserSubscriptionLifecycleApp(fixture().options)).rejects.toThrow(/^Browser subscription lifecycle startup denied$/); }
    finally { create.mockRestore(); }
  });

  it('closes the app after initialization rejects or throws synchronously', async () => {
    for (const sync of [true, false]) {
      const app = fakeApp();
      if (sync) app.init.mockImplementation(() => { throw new Error('secret URL'); });
      else app.init.mockRejectedValue(new Error('secret URL'));
      const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
      try {
        await expect(createBrowserSubscriptionLifecycleApp(fixture().options)).rejects.toThrow(/^Browser subscription lifecycle startup denied$/);
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
      const composition = await createBrowserSubscriptionLifecycleApp(fixture().options);
      await expect(composition.listen()).rejects.toThrow(/^Browser subscription lifecycle startup denied$/);
      expect(app.close).toHaveBeenCalledOnce();
      await expect(composition.listen()).rejects.toThrow(bad);
    } finally { create.mockRestore(); }

    const failed = fakeApp();
    failed.close.mockRejectedValue(new Error('secret URL'));
    const again = vi.spyOn(NestFactory, 'create').mockResolvedValue(failed as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionLifecycleApp(fixture().options);
      await expect(composition.close()).rejects.toThrow(/^Browser subscription lifecycle startup denied$/);
      await expect(composition.close()).rejects.toThrow(/^Browser subscription lifecycle startup denied$/);
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
      const pending = createBrowserSubscriptionLifecycleApp(fixture().options);
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
      const composition = await createBrowserSubscriptionLifecycleApp(fixture().options);
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
    const server = createHttpsServer(syntheticTls());
    let finishListen!: (value: unknown) => void;
    const app = Object.assign(fakeApp(), { getHttpServer: () => server });
    app.listen.mockImplementation(() => new Promise(resolve => { finishListen = resolve; }));
    app.close.mockImplementation(async () => {
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    const create = vi.spyOn(NestFactory, 'create').mockResolvedValue(app as unknown as INestApplication);
    try {
      const composition = await createBrowserSubscriptionLifecycleApp(options);
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
