import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { lstatSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BankIdSimulator } from '../auth/identity-provider/bankid-simulator.js';
import { DevelopmentSimulatorLoginProofProducer } from '../auth/proofs-v2/bankid-simulator-proof-producer.js';
import { InMemoryProofRepository, ProofStore } from '../auth/proofs-v2/proof-store.js';
import { SessionCsrfGuard, type VerifiedWebSessionAuthority } from '../auth/session-csrf/session-csrf.js';
import { V2AccessToken } from '../auth/sessions-v2/v2-access-token.js';
import { DevelopmentV2PrincipalResolver } from '../auth/sessions-v2/v2-principal-resolver.js';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository } from '../auth/sessions-v2/v2-session-issuer.js';
import { hashBrowserBindingCookie } from '../auth/sessions-v2/v2-web-session-binding.js';
import { createBrowserSubscriptionReadApp } from './browser-subscription-read.composition.js';

const DENIED = 'ST-222 local proof denied';
const IMAGE = 'mirror.gcr.io/library/postgres:16-alpine';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export interface Provenance { cid: string; label: string; created: string; runtimeUrl: string }

function privateFile(path: string | undefined, mode: number): Buffer {
  if (!path) throw new Error(DENIED);
  const file = lstatSync(path), dir = lstatSync(dirname(path));
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== mode ||
      !dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o777) !== 0o700 ||
      (process.getuid && (file.uid !== process.getuid() || dir.uid !== process.getuid()))) throw new Error(DENIED);
  return readFileSync(path);
}

export function assertOwnedFixture(record: Provenance, inspected: unknown, runtimeUrl: string | undefined): void {
  if (!record || !inspected || typeof inspected !== 'object' || !runtimeUrl || runtimeUrl !== record.runtimeUrl) throw new Error(DENIED);
  const item = inspected as Record<string, unknown>;
  const config = item.Config as Record<string, unknown> | undefined;
  const state = item.State as Record<string, unknown> | undefined;
  const host = item.HostConfig as Record<string, unknown> | undefined;
  const network = item.NetworkSettings as Record<string, unknown> | undefined;
  const labels = config?.Labels as Record<string, unknown> | undefined;
  const bindings = host?.PortBindings as Record<string, unknown> | undefined;
  const ports = network?.Ports as Record<string, unknown> | undefined;
  const binding = bindings?.['5432/tcp'];
  const actual = ports?.['5432/tcp'];
  const createdTime = Date.parse(record.created);
  if (!/^[a-f0-9]{64}$/.test(record.cid) || !/^ST-222:[a-f0-9]{32}$/.test(record.label) ||
      !Number.isFinite(createdTime) || item.Id !== record.cid || item.Created !== record.created ||
      createdTime > Date.now() + 60_000 || createdTime < Date.now() - 30 * 60_000 ||
      labels?.['subtrack.task'] !== record.label || config?.Image !== IMAGE || state?.Running !== true ||
      !Array.isArray(item.Mounts) || item.Mounts.length !== 1 || item.Mounts[0]?.Type !== 'tmpfs' ||
      item.Mounts[0]?.Destination !== '/var/lib/postgresql/data' ||
      !bindings || Object.keys(bindings).length !== 1 || !ports || Object.keys(ports).length !== 1 ||
      !Array.isArray(binding) || binding.length !== 1 || binding[0]?.HostIp !== '127.0.0.1' ||
      !Array.isArray(actual) || actual.length !== 1 || actual[0]?.HostIp !== '127.0.0.1' ||
      !/^[1-9][0-9]{0,4}$/.test(actual[0]?.HostPort ?? '') ||
      !['', '0', actual[0].HostPort].includes(binding[0]?.HostPort) ||
      Number(actual[0].HostPort) > 65535) throw new Error(DENIED);
  let url: URL;
  try { url = new URL(runtimeUrl); } catch { throw new Error(DENIED); }
  if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:[0-9]+\//.test(runtimeUrl) ||
      url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== actual[0].HostPort ||
      url.pathname !== '/browser_subscription_read_proof' || url.username !== 'st221_runtime' || !url.password ||
      !/^[a-f0-9]{48}$/.test(url.password) || url.hash || [...url.searchParams.keys()].length !== 1 ||
      url.searchParams.get('connection_limit') !== '1') throw new Error(DENIED);
}

export function inspectOwnedFixture(recordPath: string | undefined, runtimeUrl: string | undefined): void {
  const parsed: unknown = JSON.parse(privateFile(recordPath, 0o600).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(DENIED);
  const record = parsed as Provenance;
  if (Object.keys(record).sort().join(',') !== 'cid,created,label,runtimeUrl') throw new Error(DENIED);
  const raw = execFileSync('docker', ['inspect', record.cid, '--format', '{{json .}}'],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  assertOwnedFixture(record, JSON.parse(raw) as unknown, runtimeUrl);
}

type Case = 'owner' | 'peer';
type Control = { kind: 'control'; id: number; action: 'revoke' | 'expire'; handle: Case };
const send = (message: object): Promise<void> => new Promise((resolve, reject) => {
  if (!process.send || !process.connected) return reject(new Error(DENIED));
  const timer = setTimeout(() => reject(new Error(DENIED)), 5_000);
  process.send(message, error => { clearTimeout(timer); if (error) reject(new Error(DENIED)); else resolve(); });
});
async function bounded(operation: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try { await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(DENIED)), 10_000);
  })]); } finally { if (timer) clearTimeout(timer); }
}

export async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production' || process.env['ST222_ENABLED'] !== '1' ||
      process.env['ST222_HOST'] !== '127.0.0.1' || !process.send) throw new Error(DENIED);
  const port = Number(process.env['ST222_PORT']);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error(DENIED);
  const owner = process.env['ST222_OWNER_ID'], peer = process.env['ST222_PEER_ID'];
  if (!UUID.test(owner ?? '') || !UUID.test(peer ?? '') || owner === peer) throw new Error(DENIED);
  inspectOwnedFixture(process.env['ST222_PROVENANCE_FILE'], process.env['ST222_RUNTIME_URL']);
  const key = privateFile(process.env['ST222_TLS_KEY_FILE'], 0o600);
  const cert = privateFile(process.env['ST222_TLS_CERT_FILE'], 0o600);
  const prisma = new PrismaClient({ datasources: { db: { url: process.env['ST222_RUNTIME_URL']! } }, log: [] });
  let app: Awaited<ReturnType<typeof createBrowserSubscriptionReadApp>> | undefined;
  let stopRequested = false;
  let stopWaiting: (() => void) | undefined;
  const requestChannel = channel('http.server.request.start');
  const observations: { exactOrigin: boolean; originCount: number; accessCount: number; bindingCount: number; otherCount: number }[] = [];
  const observe = (message: unknown) => {
    const request = (message as { request?: IncomingMessage } | null)?.request;
    if (!request || request.socket.localPort !== port || request.socket.localAddress !== '127.0.0.1' ||
        request.method !== 'POST' || !/^\/v2\/subscriptions\/[^/]+\/read(?:\?.*)?$/.test(request.url ?? '') ||
        observations.length >= 32) return;
    const raw = request.rawHeaders;
    let originCount = 0, accessCount = 0, bindingCount = 0, otherCount = 0, exactOrigin = false;
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i]?.toLowerCase() === 'origin') { originCount++; exactOrigin = raw[i + 1] === `https://127.0.0.1:${port}`; }
      if (raw[i]?.toLowerCase() === 'cookie') for (const part of (raw[i + 1] ?? '').split(';')) {
        const name = part.trimStart().split('=')[0];
        if (name === 'st_v2_access') accessCount++;
        else if (name === 'st_v2_binding') bindingCount++;
        else otherCount++;
      }
    }
    observations.push({ exactOrigin, originCount, accessCount, bindingCount, otherCount });
  };
  const signal = () => { stopRequested = true; stopWaiting?.(); };
  process.once('SIGTERM', signal);
  process.once('SIGINT', signal);
  const active = () => { if (stopRequested) throw new Error(DENIED); };
  const shutdown = async () => {
    process.off('SIGTERM', signal); process.off('SIGINT', signal); requestChannel.unsubscribe(observe);
    try { if (app) await bounded(app.close()); }
    finally {
      try { await bounded(prisma.$disconnect()); }
      finally { key.fill(0); cert.fill(0); if (process.connected) process.disconnect?.(); }
    }
  };
  try {
    let offset = 0;
    const clock = () => Date.now() + offset;
    const origin = `https://127.0.0.1:${port}`;
    const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
    const sessions = new InMemoryV2SessionRepository([owner!, peer!], 10_000, clock);
    const keys = generateKeyPairSync('ed25519');
    const accessTokens = new V2AccessToken({ environment: 'development', enabled: true,
      privateKey: keys.privateKey, publicKey: keys.publicKey, clock });
    const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true,
      proofStore, accessTokens, repository: sessions, clock });
    const principal = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true,
      accessTokens, reader: sessions, clock });
    const csrf = new SessionCsrfGuard();
    const handles = new Map<Case, { identityId: string; sessionId: string }>();
    const credentials = [] as { handle: Case; access: string; binding: string; csrf: string }[];
    for (const [handle, identityId] of [['owner', owner!], ['peer', peer!]] as const) {
      const simulatorKey = randomBytes(32);
      const expected = (await new BankIdSimulator(simulatorKey.toString('hex')).verify('alice')).personnummerHmac;
      const producer = new DevelopmentSimulatorLoginProofProducer({ environment: 'development', enabled: true,
        simulatorHmacKey: simulatorKey, proofStore, clock,
        identityResolver: { resolveRegisteredIdentityId: value => value === expected ? identityId : null } });
      const browserChainId = randomBytes(32).toString('base64url');
      const transportContext = { transport: 'web', exactOrigin: origin, browserChainId } as const;
      const proof = await producer.issue(transportContext);
      const binding = randomBytes(32).toString('base64url');
      const session = await issuer.issueFromLoginProof({ loginProof: proof, transportContext,
        browserBindingCookieHash: hashBrowserBindingCookie(binding) });
      active();
      const authority = { identityId, sessionId: session.sessionId } as VerifiedWebSessionAuthority;
      handles.set(handle, { identityId, sessionId: session.sessionId });
      credentials.push({ handle, access: session.accessToken, binding, csrf: csrf.mint(authority) });
      simulatorKey.fill(0);
    }
    requestChannel.subscribe(observe);
    app = await createBrowserSubscriptionReadApp({ prisma, accessTokens, principal, repository: sessions, csrf,
      clock, bindingCookieName: 'st_v2_binding', developmentEnabled: true, host: '127.0.0.1', port,
      exactOrigin: origin, tls: { key, cert }, expectedDatabase: 'browser_subscription_read_proof', expectedRole: 'st221_runtime' });
    active();
    await app.listen();
    active();
    let nextId = 1;
    let controlling = false;
    process.on('message', (value: unknown) => {
      if (stopRequested || controlling) return;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const control = value as Control;
      if (Object.keys(control).sort().join(',') !== 'action,handle,id,kind' || control.kind !== 'control' ||
          control.id !== nextId || !['owner', 'peer'].includes(control.handle) ||
          !['revoke', 'expire'].includes(control.action)) return;
      const item = handles.get(control.handle);
      if (!item) return;
      nextId++; controlling = true;
      if (control.action === 'revoke') {
        const result = sessions.revokeForCurrentSession(item.sessionId, item.sessionId,
          { userId: item.identityId }, clock());
        if (result.kind !== 'revoked') { signal(); return; }
      }
      else offset += 901_000;
      void (async () => {
        const before = await prisma.$queryRaw<{ pid: number; canonical: string | null; historical: string | null }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.user_id',true) AS canonical,
            current_setting('app.current_user_id',true) AS historical`;
        const marker = new Error('rollback marker');
        try {
          await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT set_config('app.user_id', ${item.identityId}, true)`;
            await tx.$queryRaw`SELECT set_config('app.current_user_id', ${item.identityId}, true)`;
            throw marker;
          });
        } catch (error) { if (error !== marker) throw error; }
        const after = await prisma.$queryRaw<{ pid: number; canonical: string | null; historical: string | null }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.user_id',true) AS canonical,
            current_setting('app.current_user_id',true) AS historical`;
        const poolClean = before.length === 1 && after.length === 1 && before[0]?.pid === after[0]?.pid &&
          !before[0]?.canonical && !before[0]?.historical && !after[0]?.canonical && !after[0]?.historical;
        await send({ kind: 'controlled', id: control.id, action: control.action, handle: control.handle, poolClean,
          observations: observations.slice() });
        controlling = false;
      })().catch(() => { signal(); });
    });
    await send({ kind: 'ready', id: 0, credentials });
    credentials.length = 0;
    await new Promise<void>(resolve => { stopWaiting = resolve; process.once('disconnect', resolve); if (stopRequested) resolve(); });
  } finally { await shutdown(); }
}

if (require.main === module) main().catch(() => {
  process.stderr.write('ST-222 local proof failed\n');
  process.exitCode = 1;
});
