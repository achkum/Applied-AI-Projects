import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOwnedFixture, createWriterRollbackDelegate, main, ROLLBACK_BASELINE, ROLLBACK_FIXTURE, type Provenance } from './browser-subscription-lifecycle.local';
import type { Prisma, PrismaClient } from '@prisma/client';

const runtime = vi.hoisted(() => ({
  record: '', inspected: '', url: '', appFailure: false, ready: false,
  disconnects: 0, closes: 0, listens: 0, transactions: 0, order: [] as string[], queryFailure: false, listenFailure: false, fileMode: 0o600,
  queryGate: undefined as Promise<void> | undefined, badFile: '', symlink: '',
  writerUpdated: false, writer: undefined as (() => Promise<unknown>) | undefined,
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
    return callback({ $executeRaw: async () => 1, $queryRaw: async () => {
      await runtime.queryGate; if (runtime.queryFailure) throw new Error('private query error');
      return process.env['ST227B_ENABLED'] === '1' && runtime.transactions === 1
        ? [{ id: ROLLBACK_FIXTURE, owner: process.env['ST226_OWNER_ID'], status: 'ACTIVE', private: true,
          updated: new Date(ROLLBACK_BASELINE), pid: 7, canonical: process.env['ST226_OWNER_ID'], historical: process.env['ST226_OWNER_ID'] }]
        : [{ pid: 7, canonical: null, historical: null }];
    } } as unknown as { $queryRaw: () => Promise<unknown[]> });
  };
  $disconnect = async () => { runtime.disconnects++; runtime.order.push('disconnect'); };
} }));
vi.mock('./browser-subscription-lifecycle.composition.js', () => ({ createBrowserSubscriptionLifecycleApp: async (options: { prisma: PrismaClient }) => {
  runtime.writer = () => options.prisma.$transaction(async () => ({ id: 'wrong', status: 'PAUSED' }));
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

describe('ST-227b real-transaction delegate contract', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  function model() {
    const row = { id: ROLLBACK_FIXTURE, owner, status: 'ACTIVE', private: true,
      updated: new Date(ROLLBACK_BASELINE), pid: 7, canonical: owner, historical: owner };
    const order: string[] = [], options: unknown[] = [];
    let tx!: Prisma.TransactionClient;
    const client = {
      marker: 17,
      $queryRaw() { expect(this).toBe(client); return Promise.resolve(this.marker); },
      async $transaction(callback: (value: Prisma.TransactionClient) => Promise<unknown>, option: unknown) {
        expect(this).toBe(client); options.push(option);
        const previous = { ...row }; order.push('begin');
        tx = { $executeRaw: async () => { order.push('guc'); return 1; },
          $queryRaw: async () => { order.push('select'); return [{ ...row }]; } } as unknown as Prisma.TransactionClient;
        try { const result = await callback(tx); order.push('commit'); return result; }
        catch (error) { Object.assign(row, previous); order.push('rollback'); throw error; }
      },
    };
    return { row, order, options, client: client as unknown as PrismaClient, tx: () => tx,
      update() { order.push('update'); row.status = 'PAUSED'; row.updated = new Date('2001-01-01'); } };
  }
  it('binds callable proxy properties, preserves receiver/options/exact tx and nonarmed values/errors', async () => {
    const m = model(), stop = vi.fn();
    const original = new Proxy(m.client, { get: (target, key) => {
      const value: unknown = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const proof = await createWriterRollbackDelegate(original, owner, stop);
    // Original methods see their original proxy receiver, including property access.
    const option = { timeout: 5_000 };
    await expect(proof.prisma.$queryRaw`SELECT 1`).resolves.toBe(17);
    await expect(proof.prisma.$transaction(async tx => { expect(tx).toBe(m.tx()); return 23; }, option)).resolves.toBe(23);
    expect(m.options.at(-1)).toBe(option);
    const error = new Error('accepted callback error');
    await expect(proof.prisma.$transaction(async () => { throw error; })).rejects.toBe(error);
    expect(proof.verified).toBe(false); expect(stop).not.toHaveBeenCalled(); await proof.settle();
  });
  it('consumes once before accepted callback UPDATE, verifies in same tx, and rolls back', async () => {
    const m = model(), proof = await createWriterRollbackDelegate(m.client, owner, vi.fn());
    const before = { ...m.row }; m.order.length = 0;
    expect(proof.arm()).toBe(true); expect(proof.arm()).toBe(false);
    await expect(proof.prisma.$transaction(async tx => {
      expect(tx).toBe(m.tx()); expect(proof.arm()).toBe(false); m.update();
      return { id: ROLLBACK_FIXTURE, status: 'PAUSED' };
    })).rejects.toThrow('ST-227b verified writer rollback');
    expect(m.order).toEqual(['begin', 'update', 'select', 'rollback']);
    expect(m.row).toEqual(before); expect(proof.verified).toBe(true); expect(proof.failed).toBe(false);
    await expect(proof.prisma.$transaction(async () => 29)).resolves.toBe(29); await proof.settle();
  });
  it.each([null, [], { id: 'other', status: 'PAUSED' }, { id: ROLLBACK_FIXTURE, status: 'ACTIVE' },
    { id: ROLLBACK_FIXTURE, status: 'PAUSED', extra: true }, { status: 'PAUSED' },
    Object.create({ id: ROLLBACK_FIXTURE, status: 'PAUSED' })])('denies armed noncandidate %j inside transaction', async result => {
    const m = model(), stop = vi.fn(), proof = await createWriterRollbackDelegate(m.client, owner, stop);
    const before = { ...m.row }; expect(proof.arm()).toBe(true);
    await expect(proof.prisma.$transaction(async () => { m.update(); return result; })).rejects.toThrow('ST-226 local proof denied');
    expect(m.row).toEqual(before); expect(m.order.at(-1)).toBe('rollback');
    expect(proof.verified).toBe(false); expect(proof.failed).toBe(true); expect(stop).toHaveBeenCalledOnce(); await proof.settle();
  });
  it.each(['no-update', 'pid', 'canonical', 'historical', 'owner', 'private', 'status'])(
    'denies candidate with invalid post-UPDATE %s', async field => {
      const m = model(), stop = vi.fn(), proof = await createWriterRollbackDelegate(m.client, owner, stop);
      expect(proof.arm()).toBe(true);
      await expect(proof.prisma.$transaction(async () => {
        if (field !== 'no-update') m.update();
        if (field === 'pid') m.row.pid = 8;
        if (field === 'canonical') m.row.canonical = 'other';
        if (field === 'historical') m.row.historical = 'other';
        if (field === 'owner') m.row.owner = 'other';
        if (field === 'private') m.row.private = false;
        if (field === 'status') m.row.status = 'ACTIVE';
        return { id: ROLLBACK_FIXTURE, status: 'PAUSED' };
      })).rejects.toThrow('ST-226 local proof denied');
      expect(proof.verified).toBe(false); expect(stop).toHaveBeenCalledOnce(); await proof.settle();
    });
  it('denies startup without strict owned ACTIVE old timestamp', async () => {
    for (const field of ['status', 'updated', 'private', 'owner', 'pid', 'canonical', 'historical'] as const) {
      const m = model();
      if (field === 'updated') m.row.updated = new Date(); else if (field === 'pid') m.row.pid = 0;
      else if (field === 'private') m.row.private = false; else m.row[field] = 'invalid';
      await expect(createWriterRollbackDelegate(m.client, owner, vi.fn())).rejects.toThrow('ST-226 local proof denied');
    }
  });
  it('waits for underlying writer settlement and refuses work after stop', async () => {
    const m = model(), proof = await createWriterRollbackDelegate(m.client, owner, vi.fn());
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writer = proof.prisma.$transaction(async () => { await gate; return 31; });
    expect(proof.arm()).toBe(false); let settled = false;
    const drain = proof.settle().then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false); release(); await writer; await drain;
    expect(() => proof.prisma.$transaction(async () => 0)).toThrow('ST-226 local proof denied'); expect(proof.arm()).toBe(false);
  });
  it('expires an unused arm and denies armed callback failure', async () => {
    vi.useFakeTimers();
    try {
      const m = model(), stop = vi.fn(), proof = await createWriterRollbackDelegate(m.client, owner, stop);
      proof.arm(); await vi.advanceTimersByTimeAsync(5_000); expect(proof.failed).toBe(true); expect(stop).toHaveBeenCalledOnce(); await proof.settle();
      const second = await createWriterRollbackDelegate(m.client, owner, stop); second.arm();
      await expect(second.prisma.$transaction(async () => { throw new Error('private'); })).rejects.toThrow('ST-226 local proof denied');
      expect(second.verified).toBe(false); await second.settle();
    } finally { vi.useRealTimers(); }
  });
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
  delete process.env['ST227B_ENABLED'];
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
  it('rejects invalid enabled values and legacy rollback controls without changing the graph', async () => {
    prepareMain(() => undefined); process.env['ST227B_ENABLED'] = 'other';
    await expect(main()).rejects.toThrow('ST-226 local proof denied'); expect(runtime.disconnects).toBe(0);
    prepareMain(message => {
      if (message.kind === 'ready') {
        process.emit('message', { kind: 'control', id: 1, action: 'arm-writer-rollback' });
        process.emit('SIGTERM');
      }
    });
    await main(); expect(runtime.transactions).toBe(0);
  });
  it('enabled private arm ignores arbitrary/replayed controls and fails wrong callback before disconnect', async () => {
    prepareMain(message => {
      if (message.kind === 'ready') {
        for (const command of [
          { kind: 'control', id: 1, action: 'arm-writer-rollback', handle: 'owner' },
          { kind: 'control', id: 2, action: 'arm-writer-rollback' },
          { kind: 'control', id: 1, action: 'writer-rollback-observe' },
        ]) process.emit('message', command);
        process.emit('message', { kind: 'control', id: 1, action: 'arm-writer-rollback' });
        process.emit('message', { kind: 'control', id: 1, action: 'arm-writer-rollback' });
      } else {
        expect(message).toMatchObject({ action: 'arm-writer-rollback', verified: false });
        void runtime.writer!().catch(() => undefined);
      }
    });
    process.env['ST227B_ENABLED'] = '1';
    await expect(main()).rejects.toThrow('ST-226 local proof denied');
    expect(runtime.order).toEqual(['close', 'disconnect']); expect(runtime.transactions).toBe(2);
  });
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
