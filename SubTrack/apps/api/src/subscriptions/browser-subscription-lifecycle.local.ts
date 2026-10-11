import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { BankIdSimulator } from '../auth/identity-provider/bankid-simulator.js';
import { DevelopmentSimulatorLoginProofProducer } from '../auth/proofs-v2/bankid-simulator-proof-producer.js';
import { InMemoryProofRepository, ProofStore } from '../auth/proofs-v2/proof-store.js';
import { SessionCsrfGuard, type VerifiedWebSessionAuthority } from '../auth/session-csrf/session-csrf.js';
import { V2AccessToken } from '../auth/sessions-v2/v2-access-token.js';
import { DevelopmentV2PrincipalResolver } from '../auth/sessions-v2/v2-principal-resolver.js';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository } from '../auth/sessions-v2/v2-session-issuer.js';
import { hashBrowserBindingCookie } from '../auth/sessions-v2/v2-web-session-binding.js';
import { createBrowserSubscriptionLifecycleApp } from './browser-subscription-lifecycle.composition.js';

const DENIED = 'ST-226 local proof denied';
const IMAGE = 'mirror.gcr.io/library/postgres:16-alpine';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const ROLLBACK_FIXTURE = '00000000-0000-4000-8000-000000000227';
export const ROLLBACK_BASELINE = '2000-01-01T00:00:00.000Z';
const ROLLBACK_FAULT = 'ST-227b verified writer rollback';
type WriterRow = { id: string; owner: string; status: string; private: boolean; updated: Date;
  pid: number; canonical: string | null; historical: string | null };
const writerRow = (tx: Prisma.TransactionClient, owner: string) => tx.$queryRaw<WriterRow[]>`
  SELECT id::text, identity_id::text AS owner, status::text, always_private AS private,
    updated_at AS updated, pg_backend_pid() AS pid, current_setting('app.user_id',true) AS canonical,
    current_setting('app.current_user_id',true) AS historical
  FROM subscription WHERE id=${ROLLBACK_FIXTURE}::uuid AND identity_id=${owner}::uuid`;

/** Private local proof seam; the callback and transaction are the accepted repository's own. */
export async function createWriterRollbackDelegate(original: PrismaClient, owner: string, stop: () => void) {
  const baseline = await original.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.user_id',${owner},true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id',${owner},true)`;
    const rows = await writerRow(tx, owner), row = rows[0];
    if (rows.length !== 1 || !row || row.id !== ROLLBACK_FIXTURE || row.owner !== owner || !row.private ||
        row.status !== 'ACTIVE' || !(row.updated instanceof Date) || row.updated.toISOString() !== ROLLBACK_BASELINE ||
        !Number.isSafeInteger(row.pid) || row.pid < 1 || row.pid > 2147483647 || row.canonical !== owner || row.historical !== owner)
      throw new Error(DENIED);
    return row;
  }, { maxWait: 5_000, timeout: 5_000 });
  let armed = false, spent = false, verified = false, failed = false, stopping = false;
  let expiry: NodeJS.Timeout | undefined;
  const pending = new Set<Promise<unknown>>();
  const deny = (): never => { failed = true; verified = false; stop(); throw new Error(DENIED); };
  const transaction = (operation: unknown, ...options: unknown[]): unknown => {
    if (stopping) throw new Error(DENIED);
    const consume = armed; armed = false;
    if (consume) { clearTimeout(expiry); expiry = undefined; }
    const callback = consume ? async (tx: Prisma.TransactionClient) => {
      if (typeof operation !== 'function') return deny();
      let result: unknown;
      try { result = await operation(tx); } catch { return deny(); }
      if (!result || typeof result !== 'object' || Array.isArray(result) ||
          Reflect.ownKeys(result).length !== 2 || Object.keys(result).sort().join(',') !== 'id,status' ||
          !Object.prototype.hasOwnProperty.call(result, 'id') || !Object.prototype.hasOwnProperty.call(result, 'status') ||
          (result as { id: unknown }).id !== ROLLBACK_FIXTURE || (result as { status: unknown }).status !== 'PAUSED') return deny();
      const rows = await writerRow(tx, owner).catch(() => deny()), row = rows[0];
      if (rows.length !== 1 || !row || row.id !== ROLLBACK_FIXTURE || row.owner !== owner || !row.private ||
          row.status !== 'PAUSED' || !(row.updated instanceof Date) || row.updated.getTime() === baseline.updated.getTime() ||
          row.pid !== baseline.pid || row.canonical !== owner || row.historical !== owner) return deny();
      verified = true;
      throw new Error(ROLLBACK_FAULT);
    } : operation;
    const underlying = Reflect.apply(original.$transaction, original, [callback, ...options]) as Promise<unknown>;
    pending.add(underlying);
    void underlying.then(() => pending.delete(underlying), () => pending.delete(underlying));
    return underlying;
  };
  const prisma = new Proxy(original, { get(target, property) {
    if (property === '$transaction') return transaction;
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { prisma, get verified() { return verified; }, get failed() { return failed; },
    arm(): boolean {
      if (stopping || spent || pending.size) return false;
      spent = true; armed = true;
      expiry = setTimeout(() => { armed = false; failed = true; stop(); }, 5_000);
      return true;
    },
    async settle(): Promise<void> {
      stopping = true; clearTimeout(expiry); expiry = undefined;
      if (armed) { armed = false; failed = true; }
      await Promise.allSettled([...pending]);
    },
  };
}
export interface Provenance { cid: string; label: string; created: string; runtimeUrl: string; name: string }

export function privateFile(path: string | undefined, mode: number): Buffer {
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
  if (!/^[a-f0-9]{64}$/.test(record.cid) || !/^ST-226:[a-f0-9]{32}$/.test(record.label) ||
      !/^st226-[0-9]+-[0-9]+-[a-f0-9]{32}$/.test(record.name) ||
      !record.name.endsWith(record.label.slice(7)) || item.Name !== `/${record.name}` ||
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
      url.pathname !== '/browser_subscription_lifecycle_proof' || url.username !== 'st_browser_lifecycle_runtime' || !url.password ||
      !/^[a-f0-9]{48}$/.test(url.password) || url.hash || [...url.searchParams.keys()].length !== 1 ||
      url.searchParams.get('connection_limit') !== '1') throw new Error(DENIED);
}

export function inspectOwnedFixture(recordPath: string | undefined, runtimeUrl: string | undefined): void {
  const parsed: unknown = JSON.parse(privateFile(recordPath, 0o600).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(DENIED);
  const record = parsed as Provenance;
  if (Object.keys(record).sort().join(',') !== 'cid,created,label,name,runtimeUrl') throw new Error(DENIED);
  const raw = execFileSync('docker', ['inspect', record.cid, '--format', '{{json .}}'],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  assertOwnedFixture(record, JSON.parse(raw) as unknown, runtimeUrl);
}

type Case = 'owner' | 'peer';
type Control = { kind: 'control'; id: number; action: string; handle?: Case };
const send = (message: object): Promise<void> => new Promise((resolve, reject) => {
  if (!process.send || !process.connected) return reject(new Error(DENIED));
  const timer = setTimeout(() => reject(new Error(DENIED)), 5_000);
  try { process.send(message, error => { clearTimeout(timer); if (error) reject(new Error(DENIED)); else resolve(); }); }
  catch { clearTimeout(timer); reject(new Error(DENIED)); }
});
async function bounded(operation: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try { await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(DENIED)), 10_000);
  })]); } finally { if (timer) clearTimeout(timer); }
}

export async function main(): Promise<void> {
  const rollbackEnabled = process.env['ST227B_ENABLED'];
  if (rollbackEnabled && rollbackEnabled !== '1') throw new Error(DENIED);
  if (process.env['NODE_ENV'] !== 'development' || Boolean(process.env['DATABASE_URL']) || process.env['ST226_ENABLED'] !== '1' ||
      process.env['ST226_HOST'] !== '127.0.0.1' || (!process.send || !process.connected)) throw new Error(DENIED);
  const port = Number(process.env['ST226_PORT']);
  if (process.env['ST226_PORT'] !== '35426' || port !== 35426) throw new Error(DENIED);
  const owner = process.env['ST226_OWNER_ID'], peer = process.env['ST226_PEER_ID'];
  if (!UUID.test(owner ?? '') || !UUID.test(peer ?? '') || owner === peer) throw new Error(DENIED);
  inspectOwnedFixture(process.env['ST226_PROVENANCE_FILE'], process.env['ST226_RUNTIME_URL']);
  const key = privateFile(process.env['ST226_TLS_KEY_FILE'], 0o600);
  let cert: Buffer | undefined;
  let prisma: PrismaClient;
  try {
    cert = privateFile(process.env['ST226_TLS_CERT_FILE'], 0o600);
    prisma = new PrismaClient({ datasources: { db: { url: process.env['ST226_RUNTIME_URL']! } }, log: [] });
  } catch (error) { key.fill(0); cert?.fill(0); throw error; }
  let app: Awaited<ReturnType<typeof createBrowserSubscriptionLifecycleApp>> | undefined;
  let stopRequested = false;
  let stopWaiting: (() => void) | undefined;
  let controlling: Promise<void> | undefined;
  let controlFailed = false;
  let rollback: Awaited<ReturnType<typeof createWriterRollbackDelegate>> | undefined;
  const credentials = [] as { handle: Case; access: string; binding: string; csrf: string }[];
  const signal = () => { stopRequested = true; stopWaiting?.(); };
  process.once('SIGTERM', signal);
  process.once('SIGINT', signal);
  process.once('disconnect', signal);
  const active = () => { if (stopRequested) throw new Error(DENIED); };
  const shutdown = async () => {
    process.off('SIGTERM', signal); process.off('SIGINT', signal); process.off('disconnect', signal);
    process.off('message', control);
    // A timeout cannot certify settlement or permit pool disconnect to race a writer.
    if (rollback) await bounded(rollback.settle());
    try {
      if (controlling) await controlling;
      if (app) await bounded(app.close());
    }
    finally {
      try { await bounded(prisma.$disconnect()); }
      finally { key.fill(0); cert?.fill(0); credentials.length = 0; if (process.connected) process.disconnect?.(); }
    }
    if (controlFailed || rollback?.failed) throw new Error(DENIED);
  };
  let nextId = 1;
  const control = (value: unknown) => {
    if (stopRequested || controlling || !value || typeof value !== 'object' || Array.isArray(value)) return;
    const command = value as Control;
    if (command.kind !== 'control' || command.id !== nextId || !Number.isSafeInteger(command.id)) return;
    const arm = command.action === 'arm-writer-rollback';
    const evidence = command.action === 'writer-rollback-observe';
    if (arm || evidence) {
      if (Object.keys(command).sort().join(',') !== 'action,id,kind' || !rollback ||
          (arm ? !rollback.arm() : !rollback.verified)) return;
    } else if (Object.keys(command).sort().join(',') !== 'action,handle,id,kind' ||
        !['owner', 'peer'].includes(command.handle ?? '') || command.action !== 'pool-observe') return;
    nextId++;
    controlling = (async () => {
      if (arm || evidence) {
        await send({ kind: 'controlled', id: command.id, action: command.action, verified: rollback!.verified });
        return;
      }
      const rows = await prisma.$transaction(tx => tx.$queryRaw<{
        pid: number; canonical: string | null; historical: string | null
      }[]>`SELECT pg_backend_pid() AS pid, current_setting('app.user_id',true) AS canonical,
          current_setting('app.current_user_id',true) AS historical`, { maxWait: 5_000, timeout: 5_000 });
      const row = rows[0];
      if (rows.length !== 1 || !row || !Number.isSafeInteger(row.pid) || row.pid < 1 || row.pid > 2147483647)
        throw new Error(DENIED);
      if (!stopRequested) await send({ kind: 'controlled', id: command.id, action: command.action,
        handle: command.handle, pid: row.pid, canonicalClean: !row.canonical, historicalClean: !row.historical });
    })().catch(() => { controlFailed = true; signal(); }).finally(() => { controlling = undefined; });
  };
  try {
    const clock = () => Date.now();
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
      credentials.push({ handle, access: session.accessToken, binding, csrf: csrf.mint(authority) });
      simulatorKey.fill(0);
    }
    inspectOwnedFixture(process.env['ST226_PROVENANCE_FILE'], process.env['ST226_RUNTIME_URL']);
    if (rollbackEnabled === '1') rollback = await createWriterRollbackDelegate(prisma, owner!, signal);
    app = await createBrowserSubscriptionLifecycleApp({ prisma: rollback?.prisma ?? prisma, accessTokens, principal, repository: sessions, csrf,
      clock, bindingCookieName: 'st_v2_binding', developmentEnabled: true, host: '127.0.0.1', port,
      exactOrigin: origin, tls: { key, cert: cert! }, expectedDatabase: 'browser_subscription_lifecycle_proof', expectedRole: 'st_browser_lifecycle_runtime' });
    active();
    inspectOwnedFixture(process.env['ST226_PROVENANCE_FILE'], process.env['ST226_RUNTIME_URL']);
    await app.listen();
    active();
    process.on('message', control);
    await send({ kind: 'ready', id: 0, credentials });
    credentials.length = 0;
    await new Promise<void>(resolve => { stopWaiting = resolve; if (stopRequested) resolve(); });
    if (controlFailed) throw new Error(DENIED);
  } finally { await shutdown(); }
}

if (require.main === module) main().catch(() => {
  process.stderr.write('ST-226 local proof failed\n');
  process.exitCode = 1;
});
