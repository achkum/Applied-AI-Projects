import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOwnedFixture, inspectOwnedFixture, main, type Provenance } from './subscription-read.local';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(), verify: vi.fn(), create: vi.fn(), disconnect: vi.fn(),
  listen: vi.fn(), close: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFileSync: mocks.inspect }));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, lstatSync: (path: string) => {
    const stat = fs.lstatSync(path);
    // Windows does not report POSIX private mode/uid; model that Linux precondition here.
    return path.includes('st213-owned-')
      ? Object.assign(Object.create(stat) as typeof stat, { mode: stat.mode & ~0o077,
        uid: process.getuid?.() ?? stat.uid }) : stat;
  } };
});
vi.mock('@prisma/client', () => ({ PrismaClient: class {
  $disconnect = mocks.disconnect;
} }));
vi.mock('../auth/sessions/jwt.service', () => ({ publicKeyJwtVerifier: mocks.verify }));
vi.mock('./subscription-read.composition', () => ({ createSubscriptionReadApp: mocks.create }));

const cid = 'a'.repeat(64);
const label = `ST-213:${'b'.repeat(32)}`;
const created = new Date().toISOString();
const record: Provenance = { cid, label, created };
const url = 'postgresql://st212_runtime:fixture@127.0.0.1:49152/subscription_read_proof?connection_limit=1';
function inspected() {
  return {
    Id: cid, Created: created,
    Config: { Image: 'mirror.gcr.io/library/postgres:16-alpine', Labels: { 'subtrack.task': label } },
    State: { Running: true },
    Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
    HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] } },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '49152' }] } },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('owned local fixture provenance', () => {
  it('accepts only the exact fresh container and matching ordinary-role URL', () => {
    expect(() => assertOwnedFixture(record, inspected(), url)).not.toThrow();
    for (const requested of ['0', '49152']) {
      const item = inspected();
      item.HostConfig.PortBindings['5432/tcp'][0]!.HostPort = requested;
      expect(() => assertOwnedFixture(record, item, url)).not.toThrow();
    }
  });
  it.each([
    ['different container', { Id: 'c'.repeat(64) }],
    ['wrong image', { Config: { ...inspected().Config, Image: 'postgres:16-alpine' } }],
    ['wrong label', { Config: { ...inspected().Config, Labels: { 'subtrack.task': 'ST-213:other' } } }],
    ['stopped container', { State: { Running: false } }],
    ['persistent mount', { Mounts: [{ Type: 'volume', Destination: '/var/lib/postgresql/data' }] }],
    ['extra mount', { Mounts: [...inspected().Mounts, { Type: 'bind', Destination: '/tmp' }] }],
    ['public binding', { HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '49152' }] } } }],
    ['different explicit port', { HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '49153' }] } } }],
    ['second port', { NetworkSettings: { Ports: { ...inspected().NetworkSettings.Ports, '80/tcp': [] } } }],
  ])('rejects %s', (_name, change) => {
    expect(() => assertOwnedFixture(record, { ...inspected(), ...change }, url)).toThrow('Subscription read local startup denied');
  });
  it.each([
    url.replace('127.0.0.1', 'localhost'),
    url.replace('127.0.0.1', '2130706433'),
    url.replace('49152', '49153'),
    url.replace('st212_runtime', 'fixture_owner'),
    url.replace('subscription_read_proof', 'persistent'),
    url.replace('connection_limit=1', 'sslmode=disable'),
  ])('rejects a mismatched reader URL', candidate => {
    expect(() => assertOwnedFixture(record, inspected(), candidate)).toThrow('Subscription read local startup denied');
  });
  it('rejects stale creation and a forged private record before Docker inspection', () => {
    const stale = new Date(Date.now() - 31 * 60_000).toISOString();
    expect(() => assertOwnedFixture({ ...record, created: stale }, { ...inspected(), Created: stale }, url)).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'st213-provenance-'));
    try {
      const path = join(dir, 'record.json');
      writeFileSync(path, JSON.stringify({ ...record, cid: 'short' }), { mode: 0o600 });
      expect(() => inspectOwnedFixture(path, url)).toThrow('Subscription read local startup denied');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('rejects direct entry before opening Prisma when private provenance is absent', async () => {
    vi.stubEnv('ST213_DEVELOPMENT_ENABLED', '1');
    vi.stubEnv('ST213_BIND_HOST', '127.0.0.1');
    vi.stubEnv('ST213_BIND_PORT', '4300');
    vi.stubEnv('ST213_READER_URL', url);
    vi.stubEnv('ST213_PROVENANCE_FILE', undefined);
    await expect(main()).rejects.toThrow('Subscription read local startup denied');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  function privateFixture() {
    const dir = mkdtempSync(join(tmpdir(), 'st213-owned-'));
    const path = join(dir, 'record.json');
    const key = join(dir, 'trusted.pem');
    writeFileSync(path, JSON.stringify(record), { mode: 0o600 });
    writeFileSync(key, 'fixture public key', { mode: 0o600 });
    return { dir, path, key };
  }
  function allowedEnvironment(path: string, key: string) {
    vi.stubEnv('ST213_DEVELOPMENT_ENABLED', '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ST213_BIND_HOST', '127.0.0.1');
    vi.stubEnv('ST213_BIND_PORT', '4300');
    vi.stubEnv('ST213_READER_URL', url);
    vi.stubEnv('ST213_PROVENANCE_FILE', path);
    vi.stubEnv('ST213_TRUSTED_PUBLIC_KEY_FILE', key);
    mocks.inspect.mockReturnValue(JSON.stringify(inspected()));
    mocks.verify.mockReturnValue({ verify: vi.fn() });
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.listen.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ listen: mocks.listen, close: mocks.close });
  }
  it.each([
    ['missing switch', { ST213_DEVELOPMENT_ENABLED: '0' }],
    ['production', { NODE_ENV: 'production' }],
    ['non-loopback host', { ST213_BIND_HOST: 'localhost' }],
    ['invalid port', { ST213_BIND_PORT: '0' }],
  ])('denies %s before fixture inspection and Prisma', async (_name, change) => {
    const { dir, path, key } = privateFixture();
    try {
      allowedEnvironment(path, key);
      for (const [name, value] of Object.entries(change)) vi.stubEnv(name, value);
      await expect(main()).rejects.toThrow('Subscription read local startup denied');
      expect(mocks.inspect).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('inspects the private record, starts on loopback, and closes before disconnect on shutdown', async () => {
    const { dir, path, key } = privateFixture();
    let stop!: () => void;
    const once = vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'SIGTERM') stop = listener as () => void;
      return process;
    });
    try {
      allowedEnvironment(path, key);
      const running = main();
      await vi.waitFor(() => expect(mocks.listen).toHaveBeenCalledWith(4300));
      expect(mocks.inspect).toHaveBeenCalledWith('docker',
        ['inspect', cid, '--format', '{{json .}}'], expect.objectContaining({ timeout: 5_000 }));
      expect(mocks.verify).toHaveBeenCalledWith('fixture public key');
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        developmentEnabled: true, host: '127.0.0.1', expectedDatabase: 'subscription_read_proof',
        expectedRole: 'st212_runtime',
      }));
      stop();
      await expect(running).resolves.toBeUndefined();
      expect(mocks.close).toHaveBeenCalledOnce();
      expect(mocks.disconnect).toHaveBeenCalledOnce();
      expect(mocks.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.disconnect.mock.invocationCallOrder[0]!);
    } finally { once.mockRestore(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('closes the composition and disconnects when listen fails', async () => {
    const { dir, path, key } = privateFixture();
    try {
      allowedEnvironment(path, key);
      mocks.listen.mockRejectedValue(new Error('bind failed'));
      await expect(main()).rejects.toThrow('bind failed');
      expect(mocks.close).toHaveBeenCalledOnce();
      expect(mocks.disconnect).toHaveBeenCalledOnce();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('rejects a forged Docker inspection before creating the app', async () => {
    const { dir, path, key } = privateFixture();
    try {
      allowedEnvironment(path, key);
      mocks.inspect.mockReturnValue(JSON.stringify({ ...inspected(), Id: 'c'.repeat(64) }));
      await expect(main()).rejects.toThrow('Subscription read local startup denied');
      expect(mocks.create).not.toHaveBeenCalled();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
