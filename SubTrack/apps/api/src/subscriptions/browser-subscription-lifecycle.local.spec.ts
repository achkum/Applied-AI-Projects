import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOwnedFixture, main, type Provenance } from './browser-subscription-lifecycle.local';

const runtime = vi.hoisted(() => ({
  record: '', inspected: '', url: '', appFailure: false, ready: false,
  disconnects: 0, closes: 0, listens: 0, transactions: 0, order: [] as string[], queryFailure: false, listenFailure: false, fileMode: 0o600,
  queryGate: undefined as Promise<void> | undefined, badFile: '', symlink: '',
}));
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>(),
  lstatSync: (path: string) => ({ isFile: () => !path.endsWith('private'), isDirectory: () => path.endsWith('private'),
    isSymbolicLink: () => path === runtime.symlink, mode: path.endsWith('private') ? 0o700 : path === runtime.badFile ? 0o644 : runtime.fileMode, uid: process.getuid?.() }),
  readFileSync: (path: string) => Buffer.from(path.endsWith('provenance') ? runtime.record : 'synthetic TLS'),
}));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: () => runtime.inspected,
}));
vi.mock('@prisma/client', () => ({ PrismaClient: class {
  $queryRaw = async () => [{ pid: 7, canonical: null, historical: null }];
  $transaction = async (callback: (tx: { $queryRaw: () => Promise<unknown[]> }) => Promise<unknown>) => {
    runtime.transactions++;
    return callback({ $queryRaw: async () => { await runtime.queryGate; if (runtime.queryFailure) throw new Error('private query error'); return [{ pid: 7, canonical: null, historical: null }]; } });
  };
  $disconnect = async () => { runtime.disconnects++; runtime.order.push('disconnect'); };
} }));
vi.mock('./browser-subscription-lifecycle.composition.js', () => ({ createBrowserSubscriptionLifecycleApp: async () => {
  if (runtime.appFailure) throw new Error('synthetic startup failure');
  return { listen: async () => { runtime.listens++; if (runtime.listenFailure) throw new Error('listen failed'); }, close: async () => { runtime.closes++; runtime.order.push('close'); } };
} }));

const cid = 'a'.repeat(64);
const label = `ST-226:${'b'.repeat(32)}`;
const created = new Date().toISOString();
const runtimeUrl = 'postgresql://st_browser_lifecycle_runtime:' + 'c'.repeat(48) +
  '@127.0.0.1:35001/browser_subscription_lifecycle_proof?connection_limit=1';
const name = `st226-0-1-${'b'.repeat(32)}`;
const record: Provenance = { cid, label, name, created, runtimeUrl };
const fixture = () => ({
  Id: cid, Name: `/${name}`, Created: created,
  Config: { Image: 'mirror.gcr.io/library/postgres:16-alpine', Labels: { 'subtrack.task': label } },
  State: { Running: true },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
  HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] } },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '35001' }] } },
});

describe('ST-226 owned fixture provenance before Prisma', () => {
  it('accepts only an exact fresh task-owned temporary PG16 resource and full URL', () => {
    expect(() => assertOwnedFixture(record, fixture(), runtimeUrl)).not.toThrow();
    const changedUrl = runtimeUrl.replace('c'.repeat(48), 'd'.repeat(48));
    expect(() => assertOwnedFixture(record, fixture(), changedUrl)).toThrow('ST-226 local proof denied');
    expect(() => assertOwnedFixture(record, fixture(), undefined)).toThrow('ST-226 local proof denied');
  });
  it.each([
    ['foreign CID', (v: ReturnType<typeof fixture>) => { v.Id = 'd'.repeat(64); }],
    ['foreign label', (v: ReturnType<typeof fixture>) => { v.Config.Labels['subtrack.task'] = 'ST-221:' + 'b'.repeat(32); }],
    ['different image', (v: ReturnType<typeof fixture>) => { v.Config.Image = 'postgres:latest'; }],
    ['stopped', (v: ReturnType<typeof fixture>) => { v.State.Running = false; }],
    ['persistent mount', (v: ReturnType<typeof fixture>) => { v.Mounts[0]!.Type = 'volume'; }],
    ['public binding', (v: ReturnType<typeof fixture>) => { v.HostConfig.PortBindings['5432/tcp'][0]!.HostIp = '0.0.0.0'; }],
    ['other port', (v: ReturnType<typeof fixture>) => { v.NetworkSettings.Ports['5432/tcp'][0]!.HostPort = '35002'; }],
  ])('rejects %s', (_name, mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => assertOwnedFixture(record, value, runtimeUrl)).toThrow('ST-226 local proof denied');
  });
  it('rejects stale, wrong role/database, query and credential-bearing URL variants', () => {
    expect(() => assertOwnedFixture({ ...record, created: new Date(Date.now() - 31 * 60_000).toISOString() },
      fixture(), runtimeUrl)).toThrow();
    for (const url of [
      runtimeUrl.replace('st_browser_lifecycle_runtime', 'fixture_owner'),
      runtimeUrl.replace('browser_subscription_lifecycle_proof', 'other'),
      runtimeUrl.replace('connection_limit=1', 'connection_limit=2'),
      runtimeUrl.replace('127.0.0.1', 'localhost'),
      runtimeUrl.replace('c'.repeat(48), ''),
    ]) expect(() => assertOwnedFixture({ ...record, runtimeUrl: url }, fixture(), url)).toThrow();
  });
});

const ownedRecordPath = '/synthetic/private/provenance';
const tlsPath = '/synthetic/private/tls';
const originalEnv = { ...process.env };
const originalSend = process.send;
const originalConnected = process.connected;
const originalDisconnect = process.disconnect;
afterEach(() => {
  process.env = { ...originalEnv };
  Object.defineProperty(process, 'send', { configurable: true, value: originalSend });
  Object.defineProperty(process, 'connected', { configurable: true, value: originalConnected });
  Object.defineProperty(process, 'disconnect', { configurable: true, value: originalDisconnect });
});

function prepareMain(onSend: (message: Record<string, unknown>) => void): void {
  Object.assign(runtime, { record: JSON.stringify(record), inspected: JSON.stringify(fixture()), url: runtimeUrl,
    appFailure: false, ready: false, disconnects: 0, closes: 0, listens: 0, transactions: 0, order: [], queryFailure: false, listenFailure: false, fileMode: 0o600, queryGate: undefined, badFile: '', symlink: '' });
  delete process.env['DATABASE_URL'];
  Object.assign(process.env, { NODE_ENV: 'development', ST226_ENABLED: '1', ST226_HOST: '127.0.0.1',
    ST226_PORT: '35426', ST226_OWNER_ID: '11111111-1111-4111-8111-111111111111',
    ST226_PEER_ID: '22222222-2222-4222-8222-222222222222',
    ST226_PROVENANCE_FILE: ownedRecordPath, ST226_RUNTIME_URL: runtimeUrl,
    ST226_TLS_KEY_FILE: tlsPath, ST226_TLS_CERT_FILE: tlsPath });
  Object.defineProperty(process, 'connected', { configurable: true, value: true });
  Object.defineProperty(process, 'disconnect', { configurable: true, value: () => undefined });
  Object.defineProperty(process, 'send', { configurable: true,
    value: (message: Record<string, unknown>, callback: (error?: Error) => void) => {
      callback(); queueMicrotask(() => onSend(message)); return true;
    } });
}

describe('ST-226 compiled launcher lifecycle', () => {
  it('starts the accepted graph, observes both clean GUCs on the writer pool, and closes on SIGTERM', async () => {
    const sent: Record<string, unknown>[] = [];
    prepareMain(message => {
      sent.push(message);
      if (message.kind === 'ready') {
        process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'peer' });
      }
      if (message.kind === 'controlled') process.emit('SIGTERM');
    });
    await main();
    expect(sent.map(message => message.kind)).toEqual(['ready', 'controlled']);
    expect(sent[1]).toMatchObject({ id: 1, action: 'pool-observe', handle: 'peer', pid: 7, canonicalClean: true, historicalClean: true });
    expect(runtime).toMatchObject({ listens: 1, closes: 1, disconnects: 1, transactions: 1 });
  });
  it('disconnects the owned pool when graph creation fails before listening', async () => {
    prepareMain(() => undefined);
    runtime.appFailure = true;
    await expect(main()).rejects.toThrow('synthetic startup failure');
    expect(runtime).toMatchObject({ listens: 0, closes: 0, disconnects: 1 });
  });
  it('rejects a substituted runtime URL before opening a listener', async () => {
    prepareMain(() => undefined);
    process.env['ST226_RUNTIME_URL'] = runtimeUrl.replace('c'.repeat(48), 'd'.repeat(48));
    await expect(main()).rejects.toThrow('ST-226 local proof denied');
    expect(runtime).toMatchObject({ listens: 0, closes: 0, disconnects: 0 });
  });
  it('observes the peer handle and closes on SIGINT', async () => {
    const sent: Record<string, unknown>[] = [];
    prepareMain(message => {
      sent.push(message);
      if (message.kind === 'ready') process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner' });
      if (message.kind === 'controlled') process.emit('SIGINT');
    });
    await main();
    expect(sent[1]).toMatchObject({ id: 1, action: 'pool-observe', handle: 'owner', pid: 7, canonicalClean: true, historicalClean: true });
    expect(runtime).toMatchObject({ listens: 1, closes: 1, disconnects: 1, transactions: 1 });
  });
  it('rejects ambient URL, production, missing IPC, invalid identity and private file modes before Prisma', async () => {
    for (const mutate of [
      () => { process.env['DATABASE_URL'] = runtimeUrl; },
      () => { process.env['NODE_ENV'] = 'production'; },
      () => { process.env['ST226_OWNER_ID'] = 'invalid'; },
      () => { runtime.fileMode = 0o644; },
      () => { process.env['ST226_PORT'] = '35001'; },
      () => { Object.defineProperty(process, 'send', { configurable: true, value: undefined }); },
    ]) {
      prepareMain(() => undefined); mutate();
      await expect(main()).rejects.toThrow('ST-226 local proof denied');
      expect(runtime.disconnects).toBe(0);
    }
  });
  it('ignores malformed, extra-key, replay and arbitrary control inputs', async () => {
    prepareMain(message => {
      if (message.kind === 'ready') {
        for (const command of [null, [], {}, { kind: 'control', id: 1, action: 'sql', handle: 'owner' },
          { kind: 'control', id: 2, action: 'pool-observe', handle: 'owner' },
          { kind: 'control', id: 1, action: 'pool-observe', handle: 'outside' },
          { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner', sql: 'SELECT 1' }])
          process.listeners('message').find(listener => listener.name === 'control')?.(command, undefined);
        process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner' });
      } else {
        process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner' });
        process.emit('disconnect');
      }
    });
    await main(); expect(runtime.transactions).toBe(1);
    expect(runtime.order).toEqual(['close', 'disconnect']);
  });
  it('settles a failed pool observation before ordered shutdown', async () => {
    prepareMain(message => { if (message.kind === 'ready')
      process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner' }); });
    runtime.queryFailure = true;
    await expect(main()).rejects.toThrow('ST-226 local proof denied');
    expect(runtime.order).toEqual(['close', 'disconnect']);
  });
  it('closes before disconnect after listener failure', async () => {
    prepareMain(() => undefined); runtime.listenFailure = true;
    await expect(main()).rejects.toThrow('listen failed');
    expect(runtime.order).toEqual(['close', 'disconnect']);
  });
  it.each(['SIGTERM', 'SIGINT', 'disconnect'] as const)('settles an in-flight observation before %s teardown', async signal => {
    let release!: () => void;
    const sent: string[] = [];
    prepareMain(message => {
      sent.push(String(message.kind));
      if (message.kind === 'ready') {
        process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner' });
        process.emit(signal);
        queueMicrotask(() => { expect(runtime.order).toEqual([]); release(); });
      }
    });
    runtime.queryGate = new Promise<void>(resolve => { release = resolve; });
    await main();
    expect(runtime.transactions).toBe(1); expect(sent).toEqual(['ready']);
    expect(runtime.order).toEqual(['close', 'disconnect']);
  });
  it.each(['ready', 'controlled'])('tears down after %s IPC delivery failure', async failedKind => {
    prepareMain(() => undefined);
    Object.defineProperty(process, 'send', { configurable: true,
      value: (message: Record<string, unknown>, callback: (error?: Error) => void) => {
        callback(message.kind === failedKind ? new Error('private delivery failure') : undefined);
        if (message.kind === 'ready' && failedKind !== 'ready') queueMicrotask(() =>
          process.emit('message', { kind: 'control', id: 1, action: 'pool-observe', handle: 'owner' }));
        return true;
      } });
    await expect(main()).rejects.toThrow('ST-226 local proof denied');
    expect(runtime.order).toEqual(['close', 'disconnect']);
  });
  it.each(['key', 'cert', 'directory'])('rejects substituted private TLS %s before Prisma', async target => {
    prepareMain(() => undefined);
    process.env['ST226_TLS_KEY_FILE'] = `${tlsPath}.key`; process.env['ST226_TLS_CERT_FILE'] = `${tlsPath}.cert`;
    if (target === 'directory') runtime.symlink = '/synthetic/private';
    else runtime.badFile = `${tlsPath}.${target}`;
    await expect(main()).rejects.toThrow('ST-226 local proof denied');
    expect(runtime).toMatchObject({ listens: 0, disconnects: 0 });
  });
  it('closes the listener and pool after synchronous IPC failure', async () => {
    prepareMain(() => undefined);
    Object.defineProperty(process, 'send', { configurable: true, value: () => { throw new Error('private send error'); } });
    await expect(main()).rejects.toThrow('ST-226 local proof denied');
    expect(runtime.order).toEqual(['close', 'disconnect']);
  });
});
