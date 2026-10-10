import { afterEach, describe, expect, it, vi } from 'vitest';
import { channel } from 'node:diagnostics_channel';
import { assertOwnedFixture, main, type Provenance } from './browser-subscription-read.local';

const runtime = vi.hoisted(() => ({
  record: '', inspected: '', url: '', appFailure: false, ready: false,
  disconnects: 0, closes: 0, listens: 0, transactions: 0,
}));
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>(),
  lstatSync: (path: string) => ({ isFile: () => !path.endsWith('private'), isDirectory: () => path.endsWith('private'),
    isSymbolicLink: () => false, mode: path.endsWith('private') ? 0o700 : 0o600, uid: process.getuid?.() }),
  readFileSync: (path: string) => Buffer.from(path.endsWith('provenance') ? runtime.record : 'synthetic TLS'),
}));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: () => runtime.inspected,
}));
vi.mock('@prisma/client', () => ({ PrismaClient: class {
  $queryRaw = async () => [{ pid: 7, canonical: null, historical: null }];
  $transaction = async (callback: (tx: { $queryRaw: () => Promise<unknown[]> }) => Promise<unknown>) => {
    runtime.transactions++;
    return callback({ $queryRaw: async () => [] });
  };
  $disconnect = async () => { runtime.disconnects++; };
} }));
vi.mock('./browser-subscription-read.composition.js', () => ({ createBrowserSubscriptionReadApp: async () => {
  if (runtime.appFailure) throw new Error('synthetic startup failure');
  return { listen: async () => { runtime.listens++; }, close: async () => { runtime.closes++; } };
} }));

const cid = 'a'.repeat(64);
const label = `ST-222:${'b'.repeat(32)}`;
const created = new Date().toISOString();
const runtimeUrl = 'postgresql://st221_runtime:' + 'c'.repeat(48) +
  '@127.0.0.1:35001/browser_subscription_read_proof?connection_limit=1';
const record: Provenance = { cid, label, created, runtimeUrl };
const fixture = () => ({
  Id: cid, Created: created,
  Config: { Image: 'mirror.gcr.io/library/postgres:16-alpine', Labels: { 'subtrack.task': label } },
  State: { Running: true },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
  HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] } },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '35001' }] } },
});

describe('ST-222 owned fixture provenance before Prisma', () => {
  it('accepts only an exact fresh task-owned temporary PG16 resource and full URL', () => {
    expect(() => assertOwnedFixture(record, fixture(), runtimeUrl)).not.toThrow();
    const changedUrl = runtimeUrl.replace('c'.repeat(48), 'd'.repeat(48));
    expect(() => assertOwnedFixture(record, fixture(), changedUrl)).toThrow('ST-222 local proof denied');
    expect(() => assertOwnedFixture(record, fixture(), undefined)).toThrow('ST-222 local proof denied');
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
    expect(() => assertOwnedFixture(record, value, runtimeUrl)).toThrow('ST-222 local proof denied');
  });
  it('rejects stale, wrong role/database, query and credential-bearing URL variants', () => {
    expect(() => assertOwnedFixture({ ...record, created: new Date(Date.now() - 31 * 60_000).toISOString() },
      fixture(), runtimeUrl)).toThrow();
    for (const url of [
      runtimeUrl.replace('st221_runtime', 'fixture_owner'),
      runtimeUrl.replace('browser_subscription_read_proof', 'other'),
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
    appFailure: false, ready: false, disconnects: 0, closes: 0, listens: 0, transactions: 0 });
  Object.assign(process.env, { NODE_ENV: 'development', ST222_ENABLED: '1', ST222_HOST: '127.0.0.1',
    ST222_PORT: '35001', ST222_OWNER_ID: '11111111-1111-4111-8111-111111111111',
    ST222_PEER_ID: '22222222-2222-4222-8222-222222222222',
    ST222_PROVENANCE_FILE: ownedRecordPath, ST222_RUNTIME_URL: runtimeUrl,
    ST222_TLS_KEY_FILE: tlsPath, ST222_TLS_CERT_FILE: tlsPath });
  Object.defineProperty(process, 'connected', { configurable: true, value: true });
  Object.defineProperty(process, 'disconnect', { configurable: true, value: () => undefined });
  Object.defineProperty(process, 'send', { configurable: true,
    value: (message: Record<string, unknown>, callback: (error?: Error) => void) => {
      callback(); queueMicrotask(() => onSend(message)); return true;
    } });
}

describe('ST-222 compiled launcher lifecycle', () => {
  it('starts the accepted graph, acknowledges rollback on the same clean pool, and closes on SIGTERM', async () => {
    const sent: Record<string, unknown>[] = [];
    prepareMain(message => {
      sent.push(message);
      if (message.kind === 'ready') {
        channel('http.server.request.start').publish({ request: {
          socket: { localPort: 35001, localAddress: '127.0.0.1' }, method: 'POST',
          url: '/v2/subscriptions/11111111-1111-4111-8111-111111111111/read',
          rawHeaders: ['Origin', 'https://127.0.0.1:35001', 'Cookie', 'st_v2_access=a; st_v2_binding=b'],
        } });
        process.emit('message', { kind: 'control', id: 1, action: 'revoke', handle: 'peer' });
      }
      if (message.kind === 'controlled') process.emit('SIGTERM');
    });
    await main();
    expect(sent.map(message => message.kind)).toEqual(['ready', 'controlled']);
    expect(sent[1]).toMatchObject({ id: 1, action: 'revoke', handle: 'peer', poolClean: true });
    expect(sent[1]?.observations).toEqual([{ exactOrigin: true, originCount: 1,
      accessCount: 1, bindingCount: 1, otherCount: 0 }]);
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
    process.env['ST222_RUNTIME_URL'] = runtimeUrl.replace('c'.repeat(48), 'd'.repeat(48));
    await expect(main()).rejects.toThrow('ST-222 local proof denied');
    expect(runtime).toMatchObject({ listens: 0, closes: 0, disconnects: 0 });
  });
  it('expires the current authority and closes on SIGINT', async () => {
    const sent: Record<string, unknown>[] = [];
    prepareMain(message => {
      sent.push(message);
      if (message.kind === 'ready') process.emit('message', { kind: 'control', id: 1, action: 'expire', handle: 'owner' });
      if (message.kind === 'controlled') process.emit('SIGINT');
    });
    await main();
    expect(sent[1]).toMatchObject({ id: 1, action: 'expire', handle: 'owner', poolClean: true });
    expect(runtime).toMatchObject({ listens: 1, closes: 1, disconnects: 1, transactions: 1 });
  });
});
