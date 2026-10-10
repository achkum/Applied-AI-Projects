import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { publicKeyJwtVerifier } from '../auth/sessions/jwt.service';
import { createSubscriptionLifecycleApp } from './subscription-lifecycle.http-composition';

const DENIED = 'Subscription lifecycle local startup denied';
const IMAGE = 'mirror.gcr.io/library/postgres:16-alpine';
export interface Provenance { cid: string; label: string; created: string; runtimeUrl: string }

function privateRecord(path: string | undefined): Provenance {
  if (!path) throw new Error(DENIED);
  const file = lstatSync(path);
  const dir = lstatSync(dirname(path));
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0 ||
      !dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) !== 0 ||
      (process.getuid && (file.uid !== process.getuid() || dir.uid !== process.getuid()))) throw new Error(DENIED);
  const record: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record || typeof record !== 'object') throw new Error(DENIED);
  const value = record as Record<string, unknown>;
  if (typeof value.cid !== 'string' || !/^[a-f0-9]{64}$/.test(value.cid) ||
      typeof value.label !== 'string' || !/^ST-216:[a-f0-9]{32}$/.test(value.label) ||
      typeof value.created !== 'string' || !Number.isFinite(Date.parse(value.created)) ||
      typeof value.runtimeUrl !== 'string' || value.runtimeUrl.length > 1024) throw new Error(DENIED);
  return { cid: value.cid, label: value.label, created: value.created, runtimeUrl: value.runtimeUrl };
}

/** Inspect exact wrapper-created identity before a database client exists. */
export function assertOwnedFixture(record: Provenance, inspected: unknown, runtimeUrl: string | undefined): void {
  if (!inspected || typeof inspected !== 'object' || !runtimeUrl || runtimeUrl !== record.runtimeUrl) throw new Error(DENIED);
  const item = inspected as Record<string, unknown>;
  const config = item.Config as Record<string, unknown> | undefined;
  const state = item.State as Record<string, unknown> | undefined;
  const host = item.HostConfig as Record<string, unknown> | undefined;
  const network = item.NetworkSettings as Record<string, unknown> | undefined;
  const labels = config?.Labels as Record<string, unknown> | undefined;
  const bindings = host?.PortBindings as Record<string, unknown> | undefined;
  const ports = network?.Ports as Record<string, unknown> | undefined;
  const mounts = item.Mounts;
  const binding = bindings?.['5432/tcp'];
  const actual = ports?.['5432/tcp'];
  const createdTime = Date.parse(record.created);
  if (!/^[a-f0-9]{64}$/.test(record.cid) || !/^ST-216:[a-f0-9]{32}$/.test(record.label) ||
      !Number.isFinite(createdTime) || item.Id !== record.cid || item.Created !== record.created ||
      createdTime > Date.now() + 60_000 || createdTime < Date.now() - 30 * 60_000 ||
      labels?.['subtrack.task'] !== record.label || config?.Image !== IMAGE ||
      state?.Running !== true || !Array.isArray(mounts) || mounts.length !== 1 ||
      mounts[0]?.Type !== 'tmpfs' || mounts[0]?.Destination !== '/var/lib/postgresql/data' ||
      !bindings || Object.keys(bindings).length !== 1 || !ports || Object.keys(ports).length !== 1 ||
      !Array.isArray(binding) || binding.length !== 1 || binding[0]?.HostIp !== '127.0.0.1' ||
      !Array.isArray(actual) || actual.length !== 1 || actual[0]?.HostIp !== '127.0.0.1' ||
      !/^[1-9][0-9]{0,4}$/.test(actual[0]?.HostPort ?? '') ||
      !['', '0', actual[0].HostPort].includes(binding[0]?.HostPort) ||
      Number(actual[0].HostPort) > 65535) throw new Error(DENIED);
  let url: URL;
  try { url = new URL(runtimeUrl); } catch { throw new Error(DENIED); }
  if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:[0-9]+\//.test(runtimeUrl) ||
      url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      url.port !== actual[0].HostPort || url.pathname !== '/subscription_lifecycle_proof' ||
      url.username !== 'st216_runtime' || !url.password || url.hash ||
      [...url.searchParams.keys()].some(key => key !== 'connection_limit') ||
      url.searchParams.get('connection_limit') !== '1' ||
      [...url.searchParams.keys()].length !== 1) throw new Error(DENIED);
}

export function inspectOwnedFixture(recordPath: string | undefined, runtimeUrl: string | undefined): void {
  const record = privateRecord(recordPath);
  const raw = execFileSync('docker', ['inspect', record.cid, '--format', '{{json .}}'],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  assertOwnedFixture(record, JSON.parse(raw) as unknown, runtimeUrl);
}

async function deadline<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(DENIED)), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** A timed-out listen can still bind; close it again if it settles late. */
export async function listenWithDeadline(
  listen: () => Promise<void>, close: () => Promise<void>, ms = 10_000,
): Promise<void> {
  const listening = listen();
  try { await deadline(listening, ms); }
  catch (error) {
    void listening.then(() => deadline(close(), ms).catch(() => undefined), () => undefined);
    throw error;
  }
}

export async function main(): Promise<void> {
  if (process.env['ST216_DEVELOPMENT_ENABLED'] !== '1' || process.env['NODE_ENV'] === 'production' ||
      process.env['ST216_BIND_HOST'] !== '127.0.0.1') throw new Error(DENIED);
  const port = Number(process.env['ST216_BIND_PORT']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(DENIED);
  inspectOwnedFixture(process.env['ST216_PROVENANCE_FILE'], process.env['ST216_RUNTIME_URL']);
  const keyPath = process.env['ST216_TRUSTED_PUBLIC_KEY_FILE'];
  if (!keyPath) throw new Error(DENIED);
  const verifier = publicKeyJwtVerifier(readFileSync(keyPath, 'utf8'));
  const prisma = new PrismaClient({ datasources: { db: { url: process.env['ST216_RUNTIME_URL']! } }, log: [] });
  try {
    const composition = await createSubscriptionLifecycleApp({ prisma, verifier, developmentEnabled: true,
      host: '127.0.0.1', expectedDatabase: 'subscription_lifecycle_proof', expectedRole: 'st216_runtime' });
    try {
      await listenWithDeadline(() => composition.listen(port), () => composition.close());
      await new Promise<void>(resolve => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
    } finally { await deadline(composition.close(), 10_000); }
  } finally { await deadline(prisma.$disconnect(), 10_000); }
}

if (require.main === module) {
  main().catch(() => { process.stderr.write('Subscription lifecycle local startup failed\n'); process.exitCode = 1; });
}
