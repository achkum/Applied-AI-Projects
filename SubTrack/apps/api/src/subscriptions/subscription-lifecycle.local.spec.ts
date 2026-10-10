import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicKeyJwtVerifier } from '../auth/sessions/jwt.service';
import { createSubscriptionLifecycleApp } from './subscription-lifecycle.http-composition';
import { assertOwnedFixture, listenWithDeadline, main, type Provenance } from './subscription-lifecycle.local';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ lstatSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn() }));
vi.mock('../auth/sessions/jwt.service', () => ({ publicKeyJwtVerifier: vi.fn() }));
vi.mock('./subscription-lifecycle.http-composition', () => ({ createSubscriptionLifecycleApp: vi.fn() }));

const cid = 'a'.repeat(64);
const label = `ST-216:${'b'.repeat(32)}`;
const created = new Date().toISOString();
const runtimeUrl = 'postgresql://st216_runtime:private@127.0.0.1:54321/subscription_lifecycle_proof?connection_limit=1';
const record: Provenance = { cid, label, created, runtimeUrl };
const inspected = {
  Id: cid, Created: created,
  Config: { Image: 'mirror.gcr.io/library/postgres:16-alpine', Labels: { 'subtrack.task': label } },
  State: { Running: true },
  HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '0' }] } },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }] } },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
};

describe('private lifecycle fixture provenance', () => {
  it('accepts exact fresh Docker identity and the full wrapper URL', () => {
    expect(() => assertOwnedFixture(record, inspected, runtimeUrl)).not.toThrow();
  });

  it.each([
    ['credential mismatch', record, inspected, runtimeUrl.replace('private', 'other')],
    ['container mismatch', record, { ...inspected, Id: 'c'.repeat(64) }, runtimeUrl],
    ['label mismatch', record, { ...inspected, Config: { ...inspected.Config, Labels: { 'subtrack.task': 'ST-216:other' } } }, runtimeUrl],
    ['image mismatch', record, { ...inspected, Config: { ...inspected.Config, Image: 'postgres:latest' } }, runtimeUrl],
    ['stopped container', record, { ...inspected, State: { Running: false } }, runtimeUrl],
    ['persistent data', record, { ...inspected, Mounts: [{ Type: 'volume', Destination: '/var/lib/postgresql/data' }] }, runtimeUrl],
    ['additional mount', record, { ...inspected, Mounts: [...inspected.Mounts, { Type: 'bind', Destination: '/other' }] }, runtimeUrl],
    ['wrong mount target', record, { ...inspected, Mounts: [{ Type: 'tmpfs', Destination: '/other' }] }, runtimeUrl],
    ['public host', record, { ...inspected, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '54321' }] } } }, runtimeUrl],
    ['public binding', record, { ...inspected, HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '0' }] } } }, runtimeUrl],
    ['extra published port', record, { ...inspected, NetworkSettings: { Ports: { ...inspected.NetworkSettings.Ports, '80/tcp': [] } } }, runtimeUrl],
    ['extra configured port', record, { ...inspected, HostConfig: { PortBindings: { ...inspected.HostConfig.PortBindings, '80/tcp': [] } } }, runtimeUrl],
    ['binding port mismatch', record, { ...inspected, HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54322' }] } } }, runtimeUrl],
    ['invalid published port', record, { ...inspected, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '65536' }] } } }, runtimeUrl],
    ['stale creation', { ...record, created: '2020-01-01T00:00:00.000Z' }, { ...inspected, Created: '2020-01-01T00:00:00.000Z' }, runtimeUrl],
    ['wrong database', { ...record, runtimeUrl: runtimeUrl.replace('subscription_lifecycle_proof', 'other') }, inspected, runtimeUrl.replace('subscription_lifecycle_proof', 'other')],
    ['wrong role', { ...record, runtimeUrl: runtimeUrl.replace('st216_runtime', 'other') }, inspected, runtimeUrl.replace('st216_runtime', 'other')],
    ['URL port mismatch', { ...record, runtimeUrl: runtimeUrl.replace('54321', '54322') }, inspected, runtimeUrl.replace('54321', '54322')],
    ['extra URL parameter', { ...record, runtimeUrl: runtimeUrl + '&schema=public' }, inspected, runtimeUrl + '&schema=public'],
  ])('rejects %s before database access', (_name, provenance, actual, url) => {
    expect(() => assertOwnedFixture(provenance, actual, url)).toThrow('Subscription lifecycle local startup denied');
  });
});

describe('bounded listener startup', () => {
  it('closes a listener that binds after startup timed out', async () => {
    vi.useFakeTimers();
    try {
      let resolveListen!: () => void;
      const listening = new Promise<void>(resolve => { resolveListen = resolve; });
      const close = vi.fn(async () => undefined);
      const result = listenWithDeadline(() => listening, close, 10);
      const rejection = expect(result).rejects.toThrow('Subscription lifecycle local startup denied');
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
      expect(close).not.toHaveBeenCalled();
      resolveListen();
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    } finally { vi.useRealTimers(); }
  });
});

describe('direct local launch ordering and cleanup', () => {
  const close = vi.fn(async () => undefined);
  const disconnect = vi.fn(async () => undefined);
  const listen = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ST216_DEVELOPMENT_ENABLED', '1');
    vi.stubEnv('ST216_BIND_HOST', '127.0.0.1');
    vi.stubEnv('ST216_BIND_PORT', '34567');
    vi.stubEnv('ST216_PROVENANCE_FILE', '/private/provenance.json');
    vi.stubEnv('ST216_RUNTIME_URL', runtimeUrl);
    vi.stubEnv('ST216_TRUSTED_PUBLIC_KEY_FILE', '/private/public.pem');
    vi.mocked(lstatSync).mockImplementation(path => ({
      isFile: () => String(path).endsWith('.json'), isDirectory: () => !String(path).endsWith('.json'),
      isSymbolicLink: () => false, mode: 0o600, uid: process.getuid?.(),
    }) as ReturnType<typeof lstatSync>);
    vi.mocked(readFileSync).mockImplementation(path => String(path).endsWith('.json') ? JSON.stringify(record) : 'public-key');
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify(inspected));
    vi.mocked(publicKeyJwtVerifier).mockReturnValue({ verify: vi.fn() } as ReturnType<typeof publicKeyJwtVerifier>);
    vi.mocked(PrismaClient).mockImplementation(function MockPrismaClient() {
      return { $disconnect: disconnect } as unknown as PrismaClient;
    });
    vi.mocked(createSubscriptionLifecycleApp).mockResolvedValue({ listen, close } as unknown as Awaited<ReturnType<typeof createSubscriptionLifecycleApp>>);
  });

  it('rejects production and non-loopback before Docker or Prisma', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    expect(execFileSync).not.toHaveBeenCalled();
    expect(PrismaClient).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ST216_BIND_HOST', '0.0.0.0');
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('rejects invalid port and missing enablement before Docker', async () => {
    vi.stubEnv('ST216_BIND_PORT', '0');
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    vi.stubEnv('ST216_BIND_PORT', '34567');
    vi.stubEnv('ST216_DEVELOPMENT_ENABLED', '0');
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('rejects missing or forged private provenance before Prisma', async () => {
    vi.stubEnv('ST216_PROVENANCE_FILE', '');
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    vi.stubEnv('ST216_PROVENANCE_FILE', '/private/provenance.json');
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ ...inspected, Id: 'c'.repeat(64) }));
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('rejects unsafe provenance file before Docker or Prisma', async () => {
    vi.mocked(lstatSync).mockImplementation(() => ({
      isFile: () => true, isDirectory: () => true, isSymbolicLink: () => true,
      mode: 0o777, uid: process.getuid?.(),
    }) as ReturnType<typeof lstatSync>);
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    expect(execFileSync).not.toHaveBeenCalled();
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('requires the trusted key after fixture provenance and before Prisma', async () => {
    vi.stubEnv('ST216_TRUSTED_PUBLIC_KEY_FILE', '');
    await expect(main()).rejects.toThrow('Subscription lifecycle local startup denied');
    expect(execFileSync).toHaveBeenCalledOnce();
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('disconnects its ordinary pool when composition rejects', async () => {
    vi.mocked(createSubscriptionLifecycleApp).mockRejectedValueOnce(new Error('preflight denied'));
    await expect(main()).rejects.toThrow('preflight denied');
    expect(PrismaClient).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('closes the app and disconnects after a listen failure', async () => {
    listen.mockRejectedValueOnce(new Error('bind failed'));
    await expect(main()).rejects.toThrow('bind failed');
    expect(close).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('closes the listener and disconnects on SIGTERM', async () => {
    const running = main();
    await vi.waitFor(() => expect(listen).toHaveBeenCalledOnce());
    process.emit('SIGTERM');
    await running;
    expect(close).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
